// app/api/cron/torre-control-diario/route.js
// v8.52.2: Cron diario 7:00 AM RD — resumen de la Torre de Control de Levantamientos.
// A Edwin (comercial), CC Miguel Martínez y Leonardo. HTML en lib/helpers/torreControlEmail.
// Protegido por Authorization: Bearer <CRON_SECRET>. ?dry=1 devuelve el resumen sin enviar.

import { createClient } from '@supabase/supabase-js';
import { evaluarSlaLevantamiento } from '../../../../lib/helpers/slaLevantamiento';
import { construirCorreoTorre } from '../../../../lib/helpers/torreControlEmail';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_KEY);
const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const addDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, motivo: 'no autorizado' }, { status: 401 });
  }
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
  if (!RESEND_API_KEY || !RESEND_FROM) return Response.json({ ok: false, motivo: 'faltan RESEND_API_KEY / RESEND_FROM_EMAIL' }, { status: 500 });

  const hoy = hoyRD();
  const ayer = addDias(hoy, -1);
  const iniAyer = ayer + 'T04:00:00.000Z', finAyer = hoy + 'T04:00:00.000Z';       // RD = UTC-4
  const iniMes = `${hoy.slice(0, 7)}-01T04:00:00.000Z`;
  const iniAnio = `${hoy.slice(0, 4)}-01-01T04:00:00.000Z`;

  const [{ data: proys }, { data: sols }, { data: movs }, { data: edwinRows }, mesRes, anioRes] = await Promise.all([
    supabase.schema('surveys').from('projects').select('id, client_name, odoo_stage, status, created_at, stage_changed_at, realizado_at, cotizado_at, fecha_visita_programada, visita_por_cliente, requiere_consulta_tecnica, consulta_tecnica_at, asignado_a_nombre'),
    supabase.from('solicitudes_levantamiento').select('levantamiento_id, created_at, ticket, cliente_nombre, tipo_servicio, tipo_inmueble, area_aprox, urgencia, locacion_nombre, direccion, punto_referencia, contacto_telefono, estado'),
    supabase.schema('surveys').from('stage_history').select('project_id, etapa_anterior, etapa_nueva, created_at').gte('created_at', iniAyer).lt('created_at', finAyer),
    supabase.from('personal').select('email').ilike('nombre', '%edwin%parra%').limit(1),
    supabase.from('solicitudes_levantamiento').select('id', { count: 'exact', head: true }).gte('created_at', iniMes),
    supabase.from('solicitudes_levantamiento').select('id', { count: 'exact', head: true }).gte('created_at', iniAnio),
  ]);

  const solPorLev = {};
  (sols || []).forEach((s) => { if (s.levantamiento_id) solPorLev[s.levantamiento_id] = s; });
  const nombreProy = (id) => (proys || []).find((p) => p.id === id)?.client_name || 'Sin cliente';

  const ahora = new Date();
  const items = (proys || []).map((p) => ({ ...p, sol: solPorLev[p.id] || null, recepcionAt: solPorLev[p.id]?.created_at || p.created_at }));
  const evaluados = items.map((it) => ({ it, sla: evaluarSlaLevantamiento(it, ahora) }));
  const activos = evaluados.filter((e) => !e.sla.terminal);

  const orden = { rojo: 0, amarillo: 1 };
  const atascados = activos.filter((e) => e.sla.atascado).sort((a, b) => (orden[a.sla.semaforo] ?? 9) - (orden[b.sla.semaforo] ?? 9) || b.sla.horasEnEtapa - a.sla.horasEnEtapa);
  const enSla = activos.length - atascados.length;
  const porEtapa = {}; atascados.forEach((e) => { porEtapa[e.sla.etapa] = (porEtapa[e.sla.etapa] || 0) + 1; });
  const cuello = Object.entries(porEtapa).sort((a, b) => b[1] - a[1])[0];

  const nuevos = (sols || []).filter((s) => s.created_at >= iniAyer && s.created_at < finAyer);
  const enviados = (proys || []).filter((p) => p.cotizado_at && p.cotizado_at >= iniAyer && p.cotizado_at < finAyer);
  const movidos = movs || [];

  const { asunto, html } = construirCorreoTorre({
    ayer, activos: activos.length, atascados, enSla, cuello, nuevos, movidos, enviados, nombreProy,
    totalMes: mesRes?.count || 0, totalAnio: anioRes?.count || 0,
  });

  const envList = String(process.env.TORRE_CONTROL_EMAILS || '').split(/[,;\s]+/).filter(Boolean);
  const to = envList.length ? envList : [edwinRows?.[0]?.email || 'eparra@supertechos.com.do'];
  const cc = ['mmartinez@supertechos.com.do', 'lhenriquez@supertechos.com.do'];

  const dry = new URL(request.url).searchParams.get('dry');
  if (dry) return Response.json({ ok: true, dry: true, dia: ayer, asunto, activos: activos.length, atascados: atascados.length, nuevos: nuevos.length, movidos: movidos.length, enviados: enviados.length, totalMes: mesRes?.count || 0, totalAnio: anioRes?.count || 0, to, cc, html });

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, cc, subject: asunto, html }),
  });
  const data = await resp.json();
  return Response.json({ ok: resp.ok, dia: ayer, activos: activos.length, atascados: atascados.length, nuevos: nuevos.length, enviados: enviados.length, to, cc, resendId: data?.id || null, ...(resp.ok ? {} : { motivo: data?.message || `Resend HTTP ${resp.status}` }) }, { status: resp.ok ? 200 : 502 });
}
