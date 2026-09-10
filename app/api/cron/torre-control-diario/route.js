// app/api/cron/torre-control-diario/route.js
// v8.52.1: Cron diario 7:00 AM RD — resumen de la Torre de Control de Levantamientos.
// Va a Edwin (comercial), con copia a Miguel Martínez y Leonardo. Incluye:
//   - ATASCADOS (semáforo 🟡/🔴) con etapa, antigüedad y responsable.
//   - Nuevos de ayer (formularios recibidos), movidos de ayer, cotizaciones enviadas ayer.
//   - Cuello de botella del día (etapa con más atascados).
// Protegido por Authorization: Bearer <CRON_SECRET>.

import { createClient } from '@supabase/supabase-js';
import { evaluarSlaLevantamiento, formatHoras } from '../../../../lib/helpers/slaLevantamiento';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_KEY);
const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const addDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
const td = (x, extra = '') => `<td style="border:1px solid #ddd;padding:6px;${extra}">${x}</td>`;

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

  const hoy = hoyRD();
  const ayer = addDias(hoy, -1);
  const iniAyer = ayer + 'T04:00:00.000Z'; // RD = UTC-4 (sin DST)
  const finAyer = hoy + 'T04:00:00.000Z';

  const [{ data: proys }, { data: sols }, { data: movs }, { data: edwinRows }] = await Promise.all([
    supabase.schema('surveys').from('projects').select('id, client_name, odoo_stage, status, created_at, stage_changed_at, realizado_at, cotizado_at, fecha_visita_programada, visita_por_cliente, requiere_consulta_tecnica, consulta_tecnica_at, asignado_a_nombre'),
    supabase.from('solicitudes_levantamiento').select('levantamiento_id, created_at, ticket, cliente_nombre, urgencia').not('levantamiento_id', 'is', null),
    supabase.schema('surveys').from('stage_history').select('project_id, etapa_anterior, etapa_nueva, created_at').gte('created_at', iniAyer).lt('created_at', finAyer),
    supabase.from('personal').select('email').ilike('nombre', '%edwin%parra%').limit(1),
  ]);

  const solPorLev = {};
  (sols || []).forEach((s) => { if (s.levantamiento_id) solPorLev[s.levantamiento_id] = s; });
  const nombreProy = (id, fallback) => (proys || []).find((p) => p.id === id)?.client_name || fallback || 'Sin cliente';

  const ahora = new Date();
  const items = (proys || []).map((p) => ({ ...p, recepcionAt: solPorLev[p.id]?.created_at || p.created_at, ticket: solPorLev[p.id]?.ticket || null }));
  const evaluados = items.map((it) => ({ it, sla: evaluarSlaLevantamiento(it, ahora) }));
  const activos = evaluados.filter((e) => !e.sla.terminal);

  // ATASCADOS (🟡/🔴), ordenados peor→mejor
  const orden = { rojo: 0, amarillo: 1 };
  const atascados = activos.filter((e) => e.sla.atascado).sort((a, b) => (orden[a.sla.semaforo] ?? 9) - (orden[b.sla.semaforo] ?? 9) || b.sla.horasEnEtapa - a.sla.horasEnEtapa);

  // Cuello de botella = etapa con más atascados
  const porEtapa = {};
  atascados.forEach((e) => { porEtapa[e.sla.etapa] = (porEtapa[e.sla.etapa] || 0) + 1; });
  const cuello = Object.entries(porEtapa).sort((a, b) => b[1] - a[1])[0];

  // Nuevos ayer (formularios recibidos) y enviados ayer (cotizado_at ayer)
  const nuevos = (sols || []).filter((s) => s.created_at >= iniAyer && s.created_at < finAyer);
  const enviados = (proys || []).filter((p) => p.cotizado_at && p.cotizado_at >= iniAyer && p.cotizado_at < finAyer);
  const movidos = movs || [];

  const semColor = { rojo: '#dc2626', amarillo: '#d97706' };
  const filasAtasc = atascados.map(({ it, sla }) => `
    <tr>
      ${td(`<b>${it.client_name || 'Sin cliente'}</b>${it.ticket ? `<br><span style="color:#888;font-size:11px">${it.ticket}</span>` : ''}`)}
      ${td(sla.etapa)}
      ${td(`<b style="color:${semColor[sla.semaforo]}">${formatHoras(sla.horasEnEtapa)}</b>${sla.slaEtapa != null ? ` / ${formatHoras(sla.slaEtapa)}` : ''}`)}
      ${td(it.asignado_a_nombre || '<span style="color:#d97706">Sin asignar</span>')}
      ${td([sla.esComplejo ? '🔧 técnica' : '', sla.esperandoCliente ? '🔵 cliente' : ''].filter(Boolean).join(' ') || '—', 'text-align:center')}
    </tr>`).join('');

  const seccionAtasc = atascados.length === 0 ? `<p style="color:#15803d;font-weight:bold">✅ Nada atascado — todos los levantamientos activos dentro de SLA.</p>` : `
    <h3 style="color:#D71920;margin:18px 0 6px">🔴 Atascados (${atascados.length})</h3>
    ${cuello ? `<p style="font-size:13px;margin:0 0 8px">🔻 <b>Cuello de botella:</b> ${cuello[1]} en <b>${cuello[0]}</b>.</p>` : ''}
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f3f3f3">
        <th style="border:1px solid #ddd;padding:6px;text-align:left">Cliente</th>
        <th style="border:1px solid #ddd;padding:6px;text-align:left">Etapa</th>
        <th style="border:1px solid #ddd;padding:6px;text-align:left">En etapa / SLA</th>
        <th style="border:1px solid #ddd;padding:6px;text-align:left">Responsable</th>
        <th style="border:1px solid #ddd;padding:6px">Marcas</th>
      </tr>${filasAtasc}
    </table>`;

  const li = (t) => `<li style="margin:2px 0">${t}</li>`;
  const seccionMov = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:18px">
      <div><h4 style="margin:0 0 4px;color:#0369a1">🆕 Nuevos ayer (${nuevos.length})</h4><ul style="margin:0;padding-left:18px;font-size:12px;color:#444">${nuevos.slice(0, 10).map((s) => li(`${s.cliente_nombre || 'Sin nombre'}${s.urgencia ? ` · ${s.urgencia}` : ''}`)).join('') || '<li style="color:#888">—</li>'}</ul></div>
      <div><h4 style="margin:0 0 4px;color:#7c3aed">↔ Movidos ayer (${movidos.length})</h4><ul style="margin:0;padding-left:18px;font-size:12px;color:#444">${movidos.slice(0, 10).map((m) => li(`${nombreProy(m.project_id)}: ${m.etapa_anterior || '—'} → <b>${m.etapa_nueva}</b>`)).join('') || '<li style="color:#888">—</li>'}</ul></div>
      <div><h4 style="margin:0 0 4px;color:#15803d">📤 Cotizaciones enviadas ayer (${enviados.length})</h4><ul style="margin:0;padding-left:18px;font-size:12px;color:#444">${enviados.slice(0, 10).map((p) => li(`${p.client_name || 'Sin cliente'}`)).join('') || '<li style="color:#888">—</li>'}</ul></div>
    </div>`;

  const asunto = atascados.length
    ? `🗼 Torre de Control — ${atascados.length} atascado${atascados.length !== 1 ? 's' : ''} · ${nuevos.length} nuevos · ${enviados.length} enviados`
    : `🗼 Torre de Control — ✅ al día · ${nuevos.length} nuevos · ${enviados.length} enviados`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:720px">
    <h2 style="color:#D71920;margin-bottom:2px">🗼 Torre de Control de Levantamientos</h2>
    <p style="font-size:12px;color:#666;margin-top:0">Resumen del ${fmt(ayer)} · ${activos.length} levantamientos activos · meta 72h del formulario a la cotización</p>
    ${seccionAtasc}
    ${seccionMov}
    <p style="font-size:11px;color:#888;margin-top:16px">🟡 pasó el SLA de la etapa · 🔴 el doble o más · 🔵 en pausa por fecha del cliente · 🔧 en consulta técnica. — ERP Super Techos</p>
  </div>`;

  const envList = String(process.env.TORRE_CONTROL_EMAILS || '').split(/[,;\s]+/).filter(Boolean);
  const to = envList.length ? envList : [edwinRows?.[0]?.email || 'eparra@supertechos.com.do'];
  const cc = ['mmartinez@supertechos.com.do', 'lhenriquez@supertechos.com.do'];

  // Modo prueba: ?dry=1 devuelve el resumen SIN enviar el correo.
  const dry = new URL(request.url).searchParams.get('dry');
  if (dry) {
    return Response.json({ ok: true, dry: true, dia: ayer, asunto, activos: activos.length, atascados: atascados.length, nuevos: nuevos.length, movidos: movidos.length, enviados: enviados.length, cuello: cuello ? { etapa: cuello[0], n: cuello[1] } : null, to, cc, html });
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, cc, subject: asunto, html }),
  });
  const data = await resp.json();
  return Response.json({
    ok: resp.ok, dia: ayer, activos: activos.length, atascados: atascados.length,
    nuevos: nuevos.length, movidos: movidos.length, enviados: enviados.length, to, cc,
    resendId: data?.id || null, ...(resp.ok ? {} : { motivo: data?.message || `Resend HTTP ${resp.status}` }),
  }, { status: resp.ok ? 200 : 502 });
}
