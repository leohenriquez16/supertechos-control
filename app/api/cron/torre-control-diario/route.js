// app/api/cron/torre-control-diario/route.js
// v8.52.2: Cron diario 7:00 AM RD — resumen de la Torre de Control de Levantamientos.
// A Edwin (comercial), CC Miguel Martínez y Leonardo. HTML en lib/helpers/torreControlEmail.
// Protegido por Authorization: Bearer <CRON_SECRET>. ?dry=1 devuelve el resumen sin enviar.

import { createClient } from '@supabase/supabase-js';
import { evaluarSlaLevantamiento, metricasCiclo } from '../../../../lib/helpers/slaLevantamiento';
import { evaluarSlaReclamacion, metricasCicloReclam } from '../../../../lib/helpers/slaReclamaciones';
import { construirCorreoTorre } from '../../../../lib/helpers/torreControlEmail';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// v8.52.3: service_role — solicitudes_levantamiento tiene RLS (solo service_role la lee).
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY);
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

  // v8.53.0 (Fase 3A): verdad de Odoo. Trae el estado real de la cotización (draft|sent|sale)
  // por referencia_odoo de los sites, para cerrar el embudo con la realidad y detectar fugas
  // (marcada cotizada pero en borrador → nunca enviada). Best-effort: si Odoo falla, sigue igual.
  try {
    const ids = items.map((it) => it.id);
    const { data: sites } = await supabase.schema('surveys').from('sites')
      .select('project_id, referencia_odoo').in('project_id', ids).not('referencia_odoo', 'is', null);
    const refsPorProy = {};
    (sites || []).forEach((s) => { const r = (s.referencia_odoo || '').trim(); if (r) (refsPorProy[s.project_id] = refsPorProy[s.project_id] || []).push(r); });
    const todasRefs = [...new Set(Object.values(refsPorProy).flat())];
    if (todasRefs.length) {
      const { estadoCotizacionesOdoo } = await import('../../../../lib/odoo');
      const estados = await estadoCotizacionesOdoo(todasRefs);
      const rank = { sale: 3, sent: 2, draft: 1, cancel: 0 }; // el mejor estado entre sus refs
      items.forEach((it) => {
        const refs = refsPorProy[it.id] || [];
        let best = null;
        refs.forEach((r) => { const e = estados[r]; if (e && (best === null || (rank[e] ?? -1) > (rank[best] ?? -1))) best = e; });
        it.odooCotState = best;
      });
    }
  } catch (e) { console.warn('torre odoo estado:', e?.message); }

  const evaluados = items.map((it) => ({ it, sla: evaluarSlaLevantamiento(it, ahora) }));
  const activos = evaluados.filter((e) => !e.sla.terminal);
  const ciclo = metricasCiclo(evaluados, iniMes);                              // tiempos del mes
  const sinEnviar = evaluados.filter((e) => e.sla.cotizadaSinEnviar);          // fuga: en borrador

  const orden = { rojo: 0, amarillo: 1 };
  const atascados = activos.filter((e) => e.sla.atascado).sort((a, b) => (orden[a.sla.semaforo] ?? 9) - (orden[b.sla.semaforo] ?? 9) || b.sla.horasEnEtapa - a.sla.horasEnEtapa);
  const enSla = activos.length - atascados.length;
  const porEtapa = {}; atascados.forEach((e) => { porEtapa[e.sla.etapa] = (porEtapa[e.sla.etapa] || 0) + 1; });
  const cuello = Object.entries(porEtapa).sort((a, b) => b[1] - a[1])[0];

  const nuevos = (sols || []).filter((s) => s.created_at >= iniAyer && s.created_at < finAyer);
  const enviados = (proys || []).filter((p) => p.cotizado_at && p.cotizado_at >= iniAyer && p.cotizado_at < finAyer);
  const movidos = movs || [];

  // v8.53.2 (Fase 3B-2): sección RECLAMACIONES del correo (de creada → informe entregado).
  let reclam = null;
  try {
    const { data: recs } = await supabase.from('reclamaciones')
      .select('id, codigo, cliente_id, cliente_nombre, ubicacion_id, proyecto_id, severidad, estado, fecha_apertura, fecha_resuelta, informe_entregado_at, created_at, archivado')
      .eq('archivado', false);
    // v8.53.3: el nombre vive en clientes (cliente_nombre casi siempre vacío) y la reclamación
    // va amarrada a la UBICACIÓN del cliente (cliente_ubicaciones) — resolvemos ambos.
    const [{ data: clis }, { data: ubis }, { data: prys }] = await Promise.all([
      supabase.from('clientes').select('id, nombre, telefono_principal, email_principal'),
      supabase.from('cliente_ubicaciones').select('id, nombre, contacto_nombre, contacto_telefono'),
      supabase.from('proyectos').select('id, cliente'),
    ]);
    const cliMap = Object.fromEntries((clis || []).map((c) => [c.id, c]));
    const ubiMap = Object.fromEntries((ubis || []).map((u) => [u.id, u]));
    const pryMap = Object.fromEntries((prys || []).map((p) => [p.id, p.cliente]));
    (recs || []).forEach((r) => {
      const c = cliMap[r.cliente_id]; const u = ubiMap[r.ubicacion_id];
      r.cliente_nombre = c?.nombre || pryMap[r.proyecto_id] || r.cliente_nombre || null;
      r.ubic_nombre = u?.nombre || null;
      // Contacto localizable (WhatsApp o correo): ubicación → cliente.
      r.contacto_nombre = u?.contacto_nombre || '';
      r.contacto_tel = (u?.contacto_telefono || c?.telefono_principal || '').trim();
      r.contacto_email = (c?.email_principal || '').trim();
      r.sin_contacto = !(r.contacto_tel || r.contacto_email);
    });
    const evR = (recs || []).map((r) => ({ r, sla: evaluarSlaReclamacion({ ...r, clienteNombre: r.cliente_nombre }, ahora) }));
    const activasR = evR.filter((e) => !e.sla.terminal);
    const sinContacto = activasR.filter((e) => e.r.sin_contacto);
    const ordenR = { rojo: 0, amarillo: 1, verde: 2 };
    const atascadasR = activasR.filter((e) => e.sla.atascado).sort((a, b) => (ordenR[a.sla.semaforo] ?? 9) - (ordenR[b.sla.semaforo] ?? 9) || b.sla.horasTotales - a.sla.horasTotales);
    const sinInforme = evR.filter((e) => e.sla.resueltaSinInforme);
    const nuevasR = (recs || []).filter((r) => { const f = r.fecha_apertura || r.created_at; return f && f >= iniAyer && f < finAyer; });
    const informesAyer = (recs || []).filter((r) => r.informe_entregado_at && r.informe_entregado_at >= iniAyer && r.informe_entregado_at < finAyer);
    reclam = {
      activas: activasR.length, atascadas: atascadasR, enSla: activasR.length - atascadasR.length,
      sinInforme, sinContacto, nuevas: nuevasR, informesAyer, cicloR: metricasCicloReclam(evR, iniMes),
    };
  } catch (e) { console.warn('torre reclamaciones:', e?.message); }

  const { asunto, html } = construirCorreoTorre({
    ayer, activos: activos.length, atascados, enSla, cuello, nuevos, movidos, enviados, nombreProy,
    totalMes: mesRes?.count || 0, totalAnio: anioRes?.count || 0, ciclo, sinEnviar, reclam,
  });

  const envList = String(process.env.TORRE_CONTROL_EMAILS || '').split(/[,;\s]+/).filter(Boolean);
  const to = envList.length ? envList : [edwinRows?.[0]?.email || 'eparra@supertechos.com.do'];
  const cc = ['mmartinez@supertechos.com.do', 'lhenriquez@supertechos.com.do'];

  const dry = new URL(request.url).searchParams.get('dry');
  if (dry) return Response.json({ ok: true, dry: true, dia: ayer, asunto, activos: activos.length, atascados: atascados.length, nuevos: nuevos.length, movidos: movidos.length, enviados: enviados.length, totalMes: mesRes?.count || 0, totalAnio: anioRes?.count || 0, ciclo, sinEnviar: sinEnviar.length, reclam: reclam ? { activas: reclam.activas, atascadas: reclam.atascadas.length, sinInforme: reclam.sinInforme.length, sinContacto: reclam.sinContacto.length, nuevas: reclam.nuevas.length, informesAyer: reclam.informesAyer.length, cicloR: reclam.cicloR } : null, to, cc, html });

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, cc, subject: asunto, html }),
  });
  const data = await resp.json();
  return Response.json({ ok: resp.ok, dia: ayer, activos: activos.length, atascados: atascados.length, nuevos: nuevos.length, enviados: enviados.length, to, cc, resendId: data?.id || null, ...(resp.ok ? {} : { motivo: data?.message || `Resend HTTP ${resp.status}` }) }, { status: resp.ok ? 200 : 502 });
}
