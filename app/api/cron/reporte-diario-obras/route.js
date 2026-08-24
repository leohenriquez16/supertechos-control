// app/api/cron/reporte-diario-obras/route.js
// v8.30.3: Cron diario 10:30 AM RD — reporta a la gerencia cuáles obras EN
// EJECUCIÓN no tienen reporte de avance del día anterior (fecha tope: 10:30 am
// del día siguiente). Si ayer fue domingo, se evalúa el sábado.
//
// Destinatarios: env ALERTA_REPORTES_EMAILS (coma-separados) o por defecto
// Leonardo + Miguel; además incluye automáticamente el email de la ficha de
// Erisdania (o de quien se agregue a la lista) cuando esté lleno en Personal.
// Protegido por `Authorization: Bearer <CRON_SECRET>` (Vercel lo envía solo).

import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const addDias = (fecha, n) => { const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, motivo: 'no autorizado' }, { status: 401 });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return Response.json({ ok: false, motivo: 'faltan RESEND_API_KEY / RESEND_FROM_EMAIL' }, { status: 500 });
  }

  // Día evaluado: ayer; si ayer fue domingo → sábado.
  const hoy = hoyRD();
  let diaEval = addDias(hoy, -1);
  if (new Date(diaEval + 'T12:00:00').getDay() === 0) diaEval = addDias(diaEval, -1);

  // Obras en ejecución + reportes y jornadas del día evaluado + personal (nombres/emails)
  const [{ data: obras }, { data: reps }, { data: jors }, { data: personal }] = await Promise.all([
    supabase.from('proyectos').select('id, cliente, nombre, referencia_odoo, supervisor_id, maestro_id').eq('estado', 'en_ejecucion').eq('archivado', false),
    supabase.from('reportes').select('proyecto_id').eq('fecha', diaEval),
    supabase.from('jornadas').select('proyecto_id').eq('fecha', diaEval),
    supabase.from('personal').select('id, nombre, email'),
  ]);
  const nombreDe = (id) => (personal || []).find(p => p.id === id)?.nombre || '—';
  const conReporte = new Set((reps || []).map(r => r.proyecto_id));
  const conJornada = new Set((jors || []).map(j => j.proyecto_id));

  const faltantes = (obras || []).filter(o => !conReporte.has(o.id));

  // Último reporte de cada obra faltante (ventana 21 días)
  let ultimoRep = {};
  if (faltantes.length) {
    const { data: ult } = await supabase.from('reportes')
      .select('proyecto_id, fecha')
      .in('proyecto_id', faltantes.map(o => o.id))
      .gte('fecha', addDias(diaEval, -21));
    (ult || []).forEach(r => { if (!ultimoRep[r.proyecto_id] || r.fecha > ultimoRep[r.proyecto_id]) ultimoRep[r.proyecto_id] = r.fecha; });
  }

  // Destinatarios: env o defaults + email de Erisdania si su ficha lo tiene
  const envList = String(process.env.ALERTA_REPORTES_EMAILS || '').split(/[,;\s]+/).filter(Boolean);
  const destinatarios = envList.length ? envList : ['lhenriquez@supertechos.com.do', 'mmartinez@supertechos.com.do', 'eperez@supertechos.com.do'];
  (personal || []).filter(p => /erisdania/i.test(p.nombre || '') && p.email && p.email.includes('@'))
    .forEach(p => { if (!destinatarios.includes(p.email)) destinatarios.push(p.email); });

  const etiqueta = (o) => [o.referencia_odoo, o.cliente || o.nombre].filter(Boolean).join(' · ');
  const filas = faltantes.map(o => `
    <tr>
      <td style="border:1px solid #ddd;padding:6px">${etiqueta(o)}</td>
      <td style="border:1px solid #ddd;padding:6px">${nombreDe(o.supervisor_id)}</td>
      <td style="border:1px solid #ddd;padding:6px">${nombreDe(o.maestro_id)}</td>
      <td style="border:1px solid #ddd;padding:6px;text-align:center">${conJornada.has(o.id) ? '✅ Sí' : '❌ No'}</td>
      <td style="border:1px solid #ddd;padding:6px;text-align:center">${ultimoRep[o.id] || 'sin reportes (21d)'}</td>
    </tr>`).join('');

  // v8.31.1: proyectos APROBADOS con información incompleta (regla: un proyecto
  // aprobado en Odoo queda completo en el ERP el mismo día — KPI de Miguel/Erisdania).
  const { data: aprob } = await supabase.from('proyectos')
    .select('id, cliente, nombre, referencia_odoo, ubicacion_lat, ubicacion_lng, contacto_principal_id, contacto_cliente_nombre, contacto_cliente_telefono, contacto_cliente_email, areas, sistema_id, valor_cotizacion, supervisor_id, maestro_id')
    .eq('estado', 'aprobado').eq('archivado', false);
  const sidsAll = [...new Set((aprob || []).flatMap(p => [p.sistema_id, ...((p.areas || []).map(a => a.sistemaId))]).filter(Boolean))];
  let sistemasMap = {};
  if (sidsAll.length) {
    const { data: ss } = await supabase.from('sistemas').select('id, data').in('id', sidsAll);
    (ss || []).forEach(s => { sistemasMap[s.id] = s; });
  }
  const faltasDe = (p) => {
    const f = [];
    if (!((p.cliente || p.nombre || '').trim())) f.push('cliente');
    const legacy = `${p.contacto_cliente_nombre || ''}${p.contacto_cliente_telefono || ''}${p.contacto_cliente_email || ''}`.trim();
    if (!p.contacto_principal_id && !legacy) f.push('contacto');
    if (p.ubicacion_lat == null || p.ubicacion_lng == null) f.push('ubicación');
    const areas = p.areas || [];
    if (areas.length === 0) f.push('áreas');
    else if (areas.some(a => !(Number(a.m2) > 0))) f.push('m² por área');
    const sids = [...new Set([p.sistema_id, ...areas.map(a => a.sistemaId)].filter(Boolean))];
    if (!sids.length) f.push('sistema');
    else if (sids.some(sid => !(sistemasMap[sid]?.data?.tareas?.length > 0))) f.push('tareas del sistema');
    if (!(Number(p.valor_cotizacion) > 0)) f.push('valor cotización');
    if (!p.supervisor_id) f.push('supervisor');
    if (!p.maestro_id) f.push('maestro');
    return f;
  };
  const incompletos = (aprob || []).map(p => ({ p, faltas: faltasDe(p) })).filter(x => x.faltas.length);
  const seccionProyectos = incompletos.length === 0 ? '' : `
    <h3 style="color:#D71920;margin-top:20px">🧩 Proyectos aprobados con información incompleta (${incompletos.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f3f3f3"><th style="border:1px solid #ddd;padding:6px;text-align:left">Proyecto</th><th style="border:1px solid #ddd;padding:6px;text-align:left">Le falta</th></tr>
      ${incompletos.map(({ p, faltas }) => `<tr><td style="border:1px solid #ddd;padding:6px">${[p.referencia_odoo, p.cliente || p.nombre].filter(Boolean).join(' · ')}</td><td style="border:1px solid #ddd;padding:6px">${faltas.join(', ')}</td></tr>`).join('')}
    </table>
    <p style="font-size:12px;color:#666">Regla: aprobado en Odoo = completo en el ERP el mismo día. Cuenta para el KPI "Proyectos creados completos".</p>`;

  const todoBien = faltantes.length === 0;
  const asunto = todoBien
    ? `✅ Reportes de obra al día — ${fmt(diaEval)}`
    : `⚠️ ${faltantes.length} obra${faltantes.length !== 1 ? 's' : ''} sin reporte del ${fmt(diaEval)}`;
  const html = todoBien
    ? `<div style="font-family:Arial,sans-serif"><h2 style="color:#15803d">✅ Todas las obras en ejecución reportaron el ${fmt(diaEval)}</h2><p style="font-size:13px;color:#666">${(obras || []).length} obras en ejecución, todas con reporte. — ERP Super Techos</p>${seccionProyectos}</div>`
    : `<div style="font-family:Arial,sans-serif;max-width:680px">
        <h2 style="color:#D71920">⚠️ Obras sin reporte del ${fmt(diaEval)}</h2>
        <p style="font-size:13px">Fecha tope: 10:30 am del día siguiente. Estas obras en ejecución no tienen reporte de avance:</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <tr style="background:#f3f3f3">
            <th style="border:1px solid #ddd;padding:6px;text-align:left">Obra</th>
            <th style="border:1px solid #ddd;padding:6px;text-align:left">Supervisor</th>
            <th style="border:1px solid #ddd;padding:6px;text-align:left">Maestro</th>
            <th style="border:1px solid #ddd;padding:6px">¿Hubo jornada?</th>
            <th style="border:1px solid #ddd;padding:6px">Último reporte</th>
          </tr>${filas}
        </table>
        <p style="font-size:12px;color:#666;margin-top:12px">✅ jornada sin reporte = trabajaron y no reportaron (llamar al supervisor) · ❌ sin jornada = ¿no se trabajó o no se registró? Si la obra no puede avanzar, márquenla "parado" con su razón.<br>— ERP Super Techos · ${(obras || []).length - faltantes.length}/${(obras || []).length} obras sí reportaron</p>
        ${seccionProyectos}
      </div>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: destinatarios, subject: asunto, html }),
  });
  const data = await resp.json();

  return Response.json({
    ok: resp.ok, diaEvaluado: diaEval, obrasEnEjecucion: (obras || []).length,
    sinReporte: faltantes.length, destinatarios, resendId: data?.id || null,
    ...(resp.ok ? {} : { motivo: data?.message || `Resend HTTP ${resp.status}` }),
  }, { status: resp.ok ? 200 : 502 });
}
