// app/api/programa/[codigo]/route.js
// v8.59.0 — API PÚBLICA del portal del cliente de un programa multi-sitio.
//   GET   (header x-clave) → programa, resumen, pendientes del cliente y locaciones.
//   POST  (header x-clave) → { accion, locacionId, quien, datos } — luz verde, supervisor,
//         aprobar o pedir cambios a una cotización, comentario. Avisa por correo a operaciones.
// Sin login: se entra con la clave del programa. Lee con service_role y solo devuelve lo
// que lib/server/portalPrograma.js decide mostrar (sin costos, notas internas ni nómina).

import { armarPortal, aplicarAccionCliente } from '../../../../lib/server/portalPrograma';
import { autenticarPortal as autenticar } from '../../../../lib/server/portalAuth';
import { amarrarLocaciones } from '../../../../lib/helpers/programaSites';

export const dynamic = 'force-dynamic';

// El portal también amarra: si Edwin levantó o Odoo aprobó, el cliente lo ve sin esperar
// a que alguien abra el programa en el ERP.
async function sincronizar(db, programa, filas) {
  try {
    const cliente = programa.cliente_nombre;
    if (!cliente) return false;
    const { data: proysSurvey } = await db.schema('surveys').from('projects')
      .select('id, realizado_at, cotizado_at, fecha_visita_programada, hora_visita').ilike('client_name', `%${cliente}%`);
    const ids = (proysSurvey || []).map(p => p.id);
    let levantamientos = [];
    if (ids.length) {
      const { data: sites } = await db.schema('surveys').from('sites')
        .select('project_id, name, latitude, longitude, referencia_odoo').in('project_id', ids);
      const porId = new Map((proysSurvey || []).map(p => [p.id, p]));
      levantamientos = (sites || []).map(s => ({
        id: s.project_id, siteNombre: s.name, lat: s.latitude, lng: s.longitude, referenciaOdoo: s.referencia_odoo,
        realizadoAt: porId.get(s.project_id)?.realizado_at, cotizadoAt: porId.get(s.project_id)?.cotizado_at,
      fechaVisita: porId.get(s.project_id)?.fecha_visita_programada, horaVisita: porId.get(s.project_id)?.hora_visita,
      }));
    }
    const { data: obrasRaw } = await db.from('proyectos')
      .select('id, nombre, referencia_odoo, valor_cotizacion').eq('archivado', false)
      .or(`cliente.ilike.%${cliente.split(' ')[0]}%,nombre.ilike.%antena%`);
    const obras = (obrasRaw || []).map(o => ({ id: o.id, nombre: o.nombre, referenciaOdoo: o.referencia_odoo, valorCotizacion: o.valor_cotizacion }));
    const locs = filas.map(l => ({
      id: l.id, codigoUt: l.codigo_ut, nombre: l.nombre, lat: l.lat, lng: l.lng,
      levantamientoId: l.levantamiento_id, levantadoAt: l.levantado_at, proyectoId: l.proyecto_id,
      cotizacionRef: l.cotizacion_ref, cotizacionMonto: l.cotizacion_monto, cotizacionAprobada: l.cotizacion_aprobada, luzVerde: l.luz_verde,
      fechaVisita: l.fecha_visita, cotizadoAt: l.cotizado_at,
    }));
    const cambios = amarrarLocaciones(locs, levantamientos, obras);
    const mapa = {
      levantamientoId: 'levantamiento_id', levantadoAt: 'levantado_at', cotizacionRef: 'cotizacion_ref',
      cotizacionMonto: 'cotizacion_monto', cotizacionAprobada: 'cotizacion_aprobada', proyectoId: 'proyecto_id',
      luzVerde: 'luz_verde', luzVerdePor: 'luz_verde_por', fechaVisita: 'fecha_visita', horaVisita: 'hora_visita',
      cotizadoAt: 'cotizado_at',
    };
    for (const { id, campos } of cambios) {
      const u = { updated_at: new Date().toISOString() };
      Object.entries(campos).forEach(([k, v]) => { if (mapa[k] && v !== undefined) u[mapa[k]] = v; });
      if (campos.luzVerde) u.luz_verde_at = new Date().toISOString();
      await db.from('programa_locaciones').update(u).eq('id', id);
    }
    return cambios.length > 0;
  } catch (e) { console.warn('portal sincronizar:', e?.message); return false; }
}

async function cargar(db, programa) {
  const leer = () => db.from('programa_locaciones').select('*').eq('programa_id', programa.id);
  let { data: filas } = await leer();
  if (await sincronizar(db, programa, filas || [])) ({ data: filas } = await leer());
  const idsObra = [...new Set((filas || []).map(f => f.proyecto_id).filter(Boolean))];
  let obras = new Map();
  const historial = new Map();
  if (idsObra.length) {
    const [{ data }, { data: hist }] = await Promise.all([
      db.from('proyectos').select('id, estado, fecha_inicio').in('id', idsObra),
      db.from('historial_estados').select('proyecto_id, estado_nuevo, created_at').in('proyecto_id', idsObra),
    ]);
    obras = new Map((data || []).map(o => [o.id, o]));
    (hist || []).forEach(h => { (historial.get(h.proyecto_id) || historial.set(h.proyecto_id, []).get(h.proyecto_id)).push(h); });
  }
  return armarPortal(programa, filas || [], obras, historial);
}

export async function GET(request, { params }) {
  const { db, programa, error } = await autenticar(request, params?.codigo);
  if (error) return error;
  return Response.json({ ok: true, ...(await cargar(db, programa)) });
}

export async function POST(request, { params }) {
  const { db, programa, error } = await autenticar(request, params?.codigo);
  if (error) return error;
  let body = {};
  try { body = await request.json(); } catch { /* noop */ }
  const { accion, locacionId, quien, datos } = body || {};

  const { data: loc } = await db.from('programa_locaciones').select('*')
    .eq('id', locacionId).eq('programa_id', programa.id).maybeSingle();
  if (!loc) return Response.json({ ok: false, error: 'Locación no encontrada.' }, { status: 404 });

  const r = aplicarAccionCliente(accion, datos || {}, loc, quien);
  if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 400 });

  const { error: errUpd } = await db.from('programa_locaciones').update(r.cambios).eq('id', loc.id);
  if (errUpd) return Response.json({ ok: false, error: 'No se pudo guardar. Intenta de nuevo.' }, { status: 500 });

  // Aviso a operaciones: lo que el cliente hace en el portal tiene que llegarle a Miguel.
  try {
    const KEY = process.env.RESEND_API_KEY, FROM = process.env.RESEND_FROM_EMAIL;
    if (KEY && FROM) {
      const autor = (quien || 'Cliente').toString().slice(0, 80);
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: ['mmartinez@supertechos.com.do', 'eperez@supertechos.com.do'],
          cc: ['lhenriquez@supertechos.com.do'],
          subject: `${programa.nombre} · ${loc.nombre}: ${autor} ${r.resumen.split(':')[0]}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px">
            <p><b>${autor}</b> ${r.resumen} en <b>${loc.nombre}</b>${loc.codigo_ut ? ` (${loc.codigo_ut})` : ''}.</p>
            <p style="color:#666">Desde el portal del cliente · ${programa.nombre}.<br>Míralo en el ERP: Comercial → Programas.</p></div>`,
        }),
      });
    }
  } catch (e) { console.warn('portal aviso:', e?.message); }

  return Response.json({ ok: true, mensaje: r.resumen, ...(await cargar(db, programa)) });
}
