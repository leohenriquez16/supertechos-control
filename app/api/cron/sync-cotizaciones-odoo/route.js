// app/api/cron/sync-cotizaciones-odoo/route.js
// v8.62.0 — Cada mañana compara cada obra abierta con su cotización en Odoo (solo lectura de Odoo).
// Aplica lo seguro (valor, ITBIS, precio y m² de áreas sin riesgo para el avance) y deja en
// proyectos.sync_odoo.revisar lo que necesita una persona. Todo cambio aplicado va al historial.
// Protegido con CRON_SECRET (Vercel Cron). ?dry=1 devuelve lo que haría sin escribir.

import { createClient } from '@supabase/supabase-js';
import { cotizacionesParaSync } from '../../../../lib/odoo';
import { compararConOdoo, textoCambio, claveRevisar } from '../../../../lib/helpers/syncOdoo';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
const ESTADOS = ['aprobado', 'planificado', 'en_ejecucion', 'parado', 'finalizado_no_entregado'];

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get('dry') === '1';
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY);

  const { data: obras, error } = await db.from('proyectos')
    .select('id, referencia_odoo, cliente, nombre, estado, sistema_id, areas, valor_cotizacion, itbis_factor, moneda_origen, tasa_usd, sync_odoo, sync_odoo_excluido')
    .eq('archivado', false).in('estado', ESTADOS).like('referencia_odoo', '%-C%');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const refs = [...new Set((obras || []).map(o => o.referencia_odoo).filter(r => /^(ST|PG)-C\d+$/.test(r)))];

  const [{ cotizaciones, tasaUsd }, { data: sis }, { data: reps }] = await Promise.all([
    cotizacionesParaSync(refs),
    db.from('sistemas').select('id, data'),
    db.from('reportes').select('proyecto_id, area_id, tarea_id, m2').in('proyecto_id', (obras || []).map(o => o.id)),
  ]);
  const sistemas = Object.fromEntries((sis || []).map(s => [s.id, { nombre: s.data?.nombre }]));
  // m² máximo reportado en una sola tarea de cada área (lo que el área ya "tiene")
  const porAreaTarea = {};
  (reps || []).forEach(r => { const k = `${r.proyecto_id}|${r.area_id}|${r.tarea_id}`; porAreaTarea[k] = (porAreaTarea[k] || 0) + (Number(r.m2) || 0); });
  const reportadoPorObra = {};
  Object.entries(porAreaTarea).forEach(([k, v]) => { const [pid, aid] = k.split('|'); const o = (reportadoPorObra[pid] = reportadoPorObra[pid] || {}); o[aid] = Math.max(o[aid] || 0, v); });

  const ahora = new Date().toISOString();
  const resumen = { obras: 0, conCambios: 0, aplicados: 0, revisar: 0, detalle: [] };
  for (const o of obras || []) {
    if (!/^(ST|PG)-C\d+$/.test(o.referencia_odoo || '') || o.sync_odoo_excluido) continue;
    resumen.obras++;
    const cot = cotizaciones[o.referencia_odoo];
    const r = compararConOdoo({
      areas: o.areas || [], sistema: o.sistema_id, valorCotizacion: o.valor_cotizacion, itbisFactor: o.itbis_factor,
    }, cot ? { ...cot, tasa: Number(o.tasa_usd) || tasaUsd } : null,
      { sistemas, reportadoPorArea: reportadoPorObra[o.id] || {}, obraArrancada: !['aprobado', 'planificado'].includes(o.estado) });
    // lo que alguien ya marcó como revisado no vuelve a salir (mientras Odoo no cambie ese dato)
    const descartados = o.sync_odoo?.descartados || [];
    r.revisar = r.revisar.filter(c => !descartados.includes(claveRevisar(c)));
    if (!r.seguros.length && !r.revisar.length) {
      if (o.sync_odoo?.revisar?.length && !dry) await db.from('proyectos').update({ sync_odoo: { fecha: ahora, aplicados: [], revisar: [], descartados }, sync_odoo_at: ahora }).eq('id', o.id);
      continue;
    }
    resumen.conCambios++; resumen.aplicados += r.seguros.length; resumen.revisar += r.revisar.length;
    resumen.detalle.push({ ref: o.referencia_odoo, aplicados: r.seguros.map(textoCambio), revisar: r.revisar.map(textoCambio) });
    if (dry) continue;
    const upd = { sync_odoo: { fecha: ahora, aplicados: r.seguros, revisar: r.revisar, descartados }, sync_odoo_at: ahora, updated_at: ahora };
    if (r.seguros.some(c => c.tipo === 'precio' || c.tipo === 'm2')) upd.areas = r.areas;
    const cv = r.seguros.find(c => c.tipo === 'valor'); if (cv) upd.valor_cotizacion = cv.a;
    const ci = r.seguros.find(c => c.tipo === 'itbis'); if (ci) upd.itbis_factor = ci.a;
    const { error: e } = await db.from('proyectos').update(upd).eq('id', o.id);
    if (e) { resumen.detalle[resumen.detalle.length - 1].error = e.message; continue; }
    if (r.seguros.length) {
      await db.from('audit_logs').insert({
        id: 'al_' + Date.now() + Math.random().toString(36).slice(2, 7), timestamp: ahora,
        usuario_id: null, usuario_nombre: 'Sincronización Odoo', accion: 'proyecto.sync_odoo',
        recurso_tipo: 'proyecto', recurso_id: o.id, recurso_nombre: `${o.referencia_odoo} ${o.cliente || o.nombre || ''}`.trim(),
        datos_antes: { valor_cotizacion: o.valor_cotizacion, itbis_factor: o.itbis_factor, areas: o.areas },
        datos_despues: { cambios: r.seguros }, metadata: { cambios: r.seguros.map(textoCambio).join(' · ') }, severidad: 'info',
      });
    }
  }
  return Response.json({ ok: true, dry, ...resumen });
}
