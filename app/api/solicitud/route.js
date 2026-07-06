// POST /api/solicitud — recepción del formulario público de solicitud de levantamiento.
// Corre SOLO en el servidor con service_role: la tabla solicitudes_levantamiento tiene
// RLS ON (no accesible por el rol anon), así el PII enviado por público no queda expuesto.
import { createClient } from '@supabase/supabase-js';
import { validarRNC } from '../../../lib/validacionFiscal';

export const dynamic = 'force-dynamic';

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

const s = (v) => (typeof v === 'string' ? v.trim() : v ? String(v) : '');

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: 'Solicitud inválida.' }, { status: 400 }); }

  // 1) Honeypot: campo oculto 'website'. Si viene lleno → bot. Fingimos éxito.
  if (s(body.website)) return Response.json({ ok: true, ticket: null });

  // 2) Validación de requeridos
  const rncVal = validarRNC(body.rnc);
  const req = {
    rnc: rncVal.ok, cliente_nombre: !!s(body.cliente_nombre),
    contacto_telefono: !!s(body.contacto_telefono),
    ubicacion: !!(s(body.direccion) || (body.lat != null && body.lng != null)),
    tipo_servicio: !!s(body.tipo_servicio), descripcion: !!s(body.descripcion),
  };
  const faltan = Object.entries(req).filter(([, v]) => !v).map(([k]) => k);
  if (faltan.length) {
    return Response.json({ ok: false, error: 'Faltan datos obligatorios.', campos: faltan }, { status: 422 });
  }

  const db = sb();
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const ua = request.headers.get('user-agent') || null;

  // 3) Rate-limit best-effort: máx 5 solicitudes por IP en 10 min.
  if (ip) {
    try {
      const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await db.from('solicitudes_levantamiento')
        .select('id', { count: 'exact', head: true })
        .eq('ip', ip).gte('created_at', desde);
      if ((count || 0) >= 5) {
        return Response.json({ ok: false, error: 'Recibimos varias solicitudes desde tu conexión. Intenta más tarde o llámanos al 809-535-9293.' }, { status: 429 });
      }
    } catch { /* no bloquea */ }
  }

  const id = 'sol_' + Date.now() + Math.random().toString(36).slice(2, 7);

  // 4) Ticket interno LEV-AAAA-MM-### (RPC atómico). Fallback si falla.
  let ticket = null;
  try {
    const { data } = await db.rpc('siguiente_codigo_levantamiento');
    ticket = data || null;
  } catch { /* fallback abajo */ }
  if (!ticket) {
    const d = new Date();
    ticket = `LEV-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-4)}`;
  }

  // 5) Fotos (base64 data URLs, ya comprimidas en el cliente) → bucket 'solicitudes'.
  const fotos = [];
  const arr = Array.isArray(body.fotos) ? body.fotos.slice(0, 8) : [];
  for (let i = 0; i < arr.length; i++) {
    try {
      const m = /^data:(image\/\w+);base64,(.+)$/.exec(arr[i]);
      if (!m) continue;
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 6 * 1024 * 1024) continue; // guardarraíl 6MB
      const path = `${id}/${i}-${Date.now()}.jpg`;
      const { error } = await db.storage.from('solicitudes').upload(path, buf, { contentType: m[1], upsert: false });
      if (!error) {
        const { data: pub } = db.storage.from('solicitudes').getPublicUrl(path);
        fotos.push({ path, url: pub?.publicUrl || null });
      }
    } catch { /* omite la foto que falle */ }
  }

  // 6) Insert de la solicitud
  const row = {
    id, ticket, estado: 'nueva',
    rnc: rncVal.limpio, tipo_id: rncVal.tipo === 'cedula' ? 'Cedula' : 'RNC',
    cliente_nombre: s(body.cliente_nombre), contacto_telefono: s(body.contacto_telefono),
    contacto_email: s(body.contacto_email) || null,
    direccion: s(body.direccion) || null, punto_referencia: s(body.punto_referencia) || null,
    locacion_nombre: s(body.locacion_nombre) || null,
    lat: body.lat != null && body.lat !== '' ? Number(body.lat) : null,
    lng: body.lng != null && body.lng !== '' ? Number(body.lng) : null,
    recibe_nombre: s(body.recibe_nombre) || null, recibe_telefono: s(body.recibe_telefono) || null,
    recibe_cargo: s(body.recibe_cargo) || null,
    tipo_servicio: s(body.tipo_servicio), tipo_inmueble: s(body.tipo_inmueble) || null,
    area_aprox: s(body.area_aprox) || null, acceso_techo: s(body.acceso_techo) || null,
    descripcion: s(body.descripcion), urgencia: s(body.urgencia) || null,
    preferencia_visita: s(body.preferencia_visita) || null, como_conocio: s(body.como_conocio) || null,
    referencia_previa: s(body.referencia_previa) || null, consentimiento: !!body.consentimiento,
    fotos, ip, user_agent: ua,
  };
  const { error } = await db.from('solicitudes_levantamiento').insert(row);
  if (error) {
    console.error('solicitud insert:', error.message);
    return Response.json({ ok: false, error: 'No pudimos guardar tu solicitud. Intenta de nuevo o llámanos al 809-535-9293.' }, { status: 500 });
  }

  // 7) Aviso al equipo (best-effort, no bloquea)
  try {
    const { data: personas } = await db.from('personal').select('email, roles').not('email', 'is', null);
    const esAdmin = (r) => Array.isArray(r) ? r.includes('admin') : (typeof r === 'string' && r.includes('admin'));
    const destinatarios = (personas || []).filter((p) => esAdmin(p.roles)).map((p) => p.email).filter(Boolean);
    if (destinatarios.length) {
      const origin = new URL(request.url).origin;
      const html = `<h2>Nueva solicitud de levantamiento</h2>
        <p><b>Ticket:</b> ${ticket}</p>
        <p><b>Cliente:</b> ${row.cliente_nombre} (RNC/Cédula ${row.rnc})<br>
        <b>Tel:</b> ${row.contacto_telefono}${row.contacto_email ? ' · ' + row.contacto_email : ''}<br>
        <b>Servicio:</b> ${row.tipo_servicio}${row.urgencia ? ' · ' + row.urgencia : ''}<br>
        <b>Ubicación:</b> ${row.direccion || '(pin en mapa)'}${row.punto_referencia ? ' — ref: ' + row.punto_referencia : ''}<br>
        <b>Descripción:</b> ${row.descripcion}</p>
        <p>Revísala en la <b>Bandeja de Solicitudes</b> del ERP para aprobarla.</p>`;
      await fetch(`${origin}/api/enviar-reporte`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinatarios, asunto: `Nueva solicitud ${ticket} — ${row.cliente_nombre}`, html }),
      });
    }
  } catch (e) { console.warn('aviso solicitud:', e?.message); }

  return Response.json({ ok: true, ticket });
}
