// Bandeja de solicitudes de levantamiento (admin). service_role: la tabla tiene RLS ON.
//   GET  /api/solicitudes?estado=nueva  → lista + resolución de cliente por RNC
//   POST /api/solicitudes  { id, accion:'aprobar'|'descartar', ...datos }
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });
}
const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function GET(request) {
  const db = sb();
  const estado = new URL(request.url).searchParams.get('estado') || 'nueva';
  const { data: sols, error } = await db.from('solicitudes_levantamiento')
    .select('*').eq('estado', estado).order('created_at', { ascending: false }).limit(200);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Resolver cliente por RNC (para mostrar "ya es cliente X" / "nuevo")
  const rncs = [...new Set((sols || []).map((s) => s.rnc).filter(Boolean))];
  let porRnc = {};
  if (rncs.length) {
    const { data: cli } = await db.from('clientes').select('id, nombre, rnc').in('rnc', rncs);
    (cli || []).forEach((c) => { porRnc[c.rnc] = { id: c.id, nombre: c.nombre }; });
  }
  const items = (sols || []).map((s) => ({ ...s, cliente_existente: porRnc[s.rnc] || null }));
  return Response.json({ ok: true, items });
}

export async function POST(request) {
  const db = sb();
  let b;
  try { b = await request.json(); } catch { return Response.json({ ok: false, error: 'Inválido' }, { status: 400 }); }
  const { id, accion } = b;
  if (!id || !accion) return Response.json({ ok: false, error: 'Faltan id/acción' }, { status: 400 });

  const { data: sol } = await db.from('solicitudes_levantamiento').select('*').eq('id', id).maybeSingle();
  if (!sol) return Response.json({ ok: false, error: 'Solicitud no encontrada' }, { status: 404 });
  if (sol.estado !== 'nueva') return Response.json({ ok: false, error: 'Esta solicitud ya fue procesada.' }, { status: 409 });

  if (accion === 'descartar') {
    await db.from('solicitudes_levantamiento').update({
      estado: 'descartada', motivo_descarte: (b.motivo || '').trim() || null,
      resuelto_por_id: b.usuarioId || null, resuelto_at: new Date().toISOString(),
    }).eq('id', id);
    return Response.json({ ok: true });
  }

  if (accion !== 'aprobar') return Response.json({ ok: false, error: 'Acción inválida' }, { status: 400 });

  try {
    // 1) Resolver / crear CLIENTE
    let clienteId = b.clienteId || null;
    if (!clienteId && sol.rnc) {
      const { data: c } = await db.from('clientes').select('id').eq('rnc', sol.rnc).maybeSingle();
      if (c) clienteId = c.id;
    }
    if (!clienteId) {
      clienteId = rid('cli_');
      const { error: ec } = await db.from('clientes').insert({
        id: clienteId, nombre: sol.cliente_nombre, rnc: sol.rnc || null,
        tipo: sol.tipo_id === 'Cedula' ? 'persona' : 'empresa',
        telefono_principal: sol.contacto_telefono || null, email_principal: sol.contacto_email || null,
        nota: 'Creado desde solicitud pública ' + sol.ticket,
      });
      if (ec) throw new Error('cliente: ' + ec.message);
    }

    // 2) Crear LOCACIÓN (cliente_ubicaciones)
    const ubicacionId = b.ubicacionId || rid('ub_');
    if (!b.ubicacionId) {
      const notas = [sol.punto_referencia && ('Ref: ' + sol.punto_referencia),
        sol.acceso_techo && ('Acceso: ' + sol.acceso_techo)].filter(Boolean).join(' · ') || null;
      const { error: eu } = await db.from('cliente_ubicaciones').insert({
        id: ubicacionId, cliente_id: clienteId,
        nombre: sol.locacion_nombre || sol.cliente_nombre, direccion: sol.direccion || null,
        latitud: sol.lat, longitud: sol.lng,
        contacto_nombre: sol.recibe_nombre || sol.cliente_nombre,
        contacto_telefono: sol.recibe_telefono || sol.contacto_telefono, notas,
      });
      if (eu) throw new Error('ubicacion: ' + eu.message);
    }

    // 3) Crear LEVANTAMIENTO (surveys.projects + sites)
    const { data: tpls } = await db.schema('surveys').from('templates')
      .select('id').eq('service_line', 'waterproofing').limit(1);
    const tpl = (tpls && tpls[0]) || null;
    const slug = (sol.cliente_nombre || 'solicitud').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const projectId = `proj-${slug}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6)}`;
    const { error: ep } = await db.schema('surveys').from('projects').insert({
      id: projectId, name: sol.locacion_nombre || sol.cliente_nombre, client_name: sol.cliente_nombre,
      service_line: 'waterproofing', company: 'super_techos', template_id: tpl?.id || null,
      description: sol.descripcion || null, status: 'planning', odoo_stage: 'New', stage_changed_at: new Date().toISOString(),
    });
    if (ep) throw new Error('proyecto: ' + ep.message);

    const { error: es } = await db.schema('surveys').from('sites').insert({
      project_id: projectId, external_code: sol.ticket, referencia_odoo: sol.referencia_previa || null,
      name: sol.locacion_nombre || sol.cliente_nombre, address: sol.direccion || null,
      latitude: sol.lat, longitude: sol.lng,
      contact_name: sol.recibe_nombre || sol.cliente_nombre, contact_role: sol.recibe_cargo || null,
      mobile_phone: sol.recibe_telefono || sol.contacto_telefono,
      notes: [sol.punto_referencia && ('Ref: ' + sol.punto_referencia), sol.acceso_techo && ('Acceso: ' + sol.acceso_techo), sol.urgencia && ('Urgencia: ' + sol.urgencia), sol.descripcion].filter(Boolean).join(' · ') || null,
      survey_status: 'pending', cliente_id: clienteId, ubicacion_id: ubicacionId,
    });
    if (es) throw new Error('site: ' + es.message);

    // 4) Marcar la solicitud como aprobada + enlazar
    await db.from('solicitudes_levantamiento').update({
      estado: 'aprobada', cliente_id: clienteId, ubicacion_id: ubicacionId, levantamiento_id: projectId,
      resuelto_por_id: b.usuarioId || null, resuelto_at: new Date().toISOString(),
    }).eq('id', id);

    return Response.json({ ok: true, levantamiento_id: projectId, cliente_id: clienteId, ubicacion_id: ubicacionId });
  } catch (e) {
    console.error('aprobar solicitud:', e?.message);
    return Response.json({ ok: false, error: e?.message || 'Error al aprobar' }, { status: 500 });
  }
}
