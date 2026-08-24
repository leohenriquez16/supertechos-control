// app/api/cron/sync-facturas-odoo/route.js
// v8.17.67: cron diario que sincroniza facturas Odoo de proyectos activos.
// Recorre proyectos en estados intermedios (no archivados, no facturados ya,
// con referencia_odoo cargada) y para cada uno consulta Odoo. Si encuentra
// factura posted, marca el proyecto como facturado.
//
// Protegido por header `Authorization: Bearer <CRON_SECRET>`. Vercel Cron
// envía ese header automáticamente cuando la env var CRON_SECRET está seteada.

import { createClient } from '@supabase/supabase-js';
import { buscarFacturasDeSO } from '../../../../lib/odoo';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

// Estados que aún pueden recibir factura. 'facturado' se excluye (ya está).
const ESTADOS_PENDIENTES_FACTURACION = [
  'aprobado',
  'planificado',
  'en_ejecucion',
  'parado',
  'finalizado_no_entregado',
  'finalizado_recibido_conforme',
];

export async function GET(request) {
  // Verificación del secret. Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`.
  const auth = request.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET) {
    return Response.json({ ok: false, error: 'CRON_SECRET no configurado en env vars' }, { status: 500 });
  }
  if (auth !== expected) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data: proyectos, error } = await supabase
    .from('proyectos')
    .select('id, referencia_odoo, estado, archivado')
    .in('estado', ESTADOS_PENDIENTES_FACTURACION)
    .neq('archivado', true)
    .not('referencia_odoo', 'is', null);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const resultados = {
    total_proyectos: (proyectos || []).length,
    actualizados: 0,
    sin_cambios: 0,
    errores: [],
    detalles: [],
  };

  for (const p of (proyectos || [])) {
    try {
      const facturas = await buscarFacturasDeSO(p.referencia_odoo);
      if (facturas.length === 0) {
        resultados.sin_cambios++;
        continue;
      }
      const principal = facturas[0];
      const montoTotalSumado = facturas.reduce((s, f) => s + (f.monto_total || 0), 0);
      const updates = {
        estado: 'facturado',
        numero_factura: facturas.length === 1 ? principal.numero : `${principal.numero} +${facturas.length - 1}`,
        fecha_facturacion: principal.fecha,
        monto_final_cubicado: montoTotalSumado,
        updated_at: new Date().toISOString(),
      };
      const { error: updErr } = await supabase.from('proyectos').update(updates).eq('id', p.id);
      if (updErr) {
        resultados.errores.push({ proyectoId: p.id, ref: p.referencia_odoo, error: updErr.message });
      } else {
        resultados.actualizados++;
        resultados.detalles.push({ proyectoId: p.id, ref: p.referencia_odoo, factura: principal.numero, fecha: principal.fecha });
      }
    } catch (e) {
      resultados.errores.push({ proyectoId: p.id, ref: p.referencia_odoo, error: e.message || String(e) });
    }
  }

  // v8.31.0: además, cerrar levantamientos cuya cotización ya salió enviada en Odoo
  resultados.levantamientos = await sincronizarLevantamientosOdoo();

  // v8.32.0: vincular analíticas + detectar sub-cotizaciones + avisar descuadres
  resultados.analiticas = await sincronizarAnaliticasProyectos();

  return Response.json({ ok: true, ...resultados });
}

// ============================================================
// v8.31.0: Sincronización de LEVANTAMIENTOS con Odoo.
// Si la cotización de un levantamiento "Realizado" ya salió ENVIADA (sent) o
// confirmada (sale) en Odoo → el proceso se cierra: pasa a "Cotización Realizada"
// (cotizado_at) y nace la tarea de CONFIRMAR recepción con el cliente (≤24h)
// asignada al comercial (Edwin). Se ejecuta dentro del mismo cron diario.
// ============================================================
export async function sincronizarLevantamientosOdoo() {
  const { estadoCotizacionesOdoo } = await import('../../../../lib/odoo');
  const res = { revisados: 0, cerrados: 0, tareas: 0, errores: [] };
  try {
    const { data: pendientes } = await supabase.schema('surveys').from('projects')
      .select('id, client_name, status').eq('status', 'survey_completed');
    if (!pendientes?.length) return res;
    const ids = pendientes.map(p => p.id);
    const { data: sites } = await supabase.schema('surveys').from('sites')
      .select('project_id, referencia_odoo').in('project_id', ids).not('referencia_odoo', 'is', null);
    const refsPorProyecto = {};
    (sites || []).forEach(s => {
      const ref = (s.referencia_odoo || '').trim();
      if (ref) (refsPorProyecto[s.project_id] = refsPorProyecto[s.project_id] || []).push(ref);
    });
    const todasRefs = [...new Set(Object.values(refsPorProyecto).flat())];
    if (!todasRefs.length) return res;
    const estados = await estadoCotizacionesOdoo(todasRefs);
    for (const p of pendientes) {
      const refs = refsPorProyecto[p.id] || [];
      if (!refs.length) continue;
      res.revisados++;
      const enviada = refs.some(r => ['sent', 'sale'].includes(estados[r]));
      if (!enviada) continue;
      const ahora = new Date().toISOString();
      const { error } = await supabase.schema('surveys').from('projects')
        .update({ status: 'quoted', odoo_stage: 'Cotizacion Realizada', stage_changed_at: ahora, cotizado_at: ahora })
        .eq('id', p.id).eq('status', 'survey_completed');
      if (error) { res.errores.push({ id: p.id, error: error.message }); continue; }
      res.cerrados++;
      // Tarea de confirmación (si no existe)
      const { data: ya } = await supabase.from('tareas').select('id')
        .eq('tipo', 'confirmar_recepcion_cotizacion').ilike('descripcion', `%[lev:${p.id}]%`).limit(1);
      if (!ya?.length) {
        const { data: edwin } = await supabase.from('personal').select('id, nombre').ilike('nombre', '%edwin%parra%').limit(1);
        await supabase.from('tareas').insert({
          id: 't_' + Date.now() + Math.random(),
          tipo: 'confirmar_recepcion_cotizacion',
          titulo: `Confirmar que ${p.client_name || 'el cliente'} recibió la cotización`,
          descripcion: `La cotización salió enviada en Odoo. Confirmar con el cliente que le llegó (antes de 24h). [lev:${p.id}]`,
          asignada_a_id: edwin?.[0]?.id || null, asignada_a_nombre: edwin?.[0]?.nombre || null,
          fecha_limite: new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10),
        });
        res.tareas++;
      }
    }
  } catch (e) { res.errores.push({ error: e?.message || String(e) }); }
  return res;
}

// ============================================================
// v8.32.0: Sincronización PROYECTO ↔ CUENTA ANALÍTICA de Odoo.
// Convención: el nombre de la analítica comienza con la referencia de la
// cotización ORIGINAL (ST-C1234…). Las cotizaciones nuevas del proyecto
// (ampliaciones/etapas/órdenes de cambio) llevan otro número pero en Odoo
// se les elige LA MISMA analítica → aquí se detectan y registran solas
// como SUB-COTIZACIONES. Si hay descuadre de presupuesto (valor ERP vs
// suma de cotizaciones de la analítica) o proyecto sin analítica → correo
// a Miguel y Felvison (dueños de que esto esté 100% al día).
// ============================================================
export async function sincronizarAnaliticasProyectos() {
  const { matchAnaliticasProyectos } = await import('../../../../lib/odoo');
  const res = { revisados: 0, vinculados: 0, subCotsDetectadas: 0, sinAnalitica: [], descuadres: [], errores: [] };
  try {
    const { data: proyectos } = await supabase.from('proyectos')
      .select('id, cliente, nombre, referencia_odoo, valor_cotizacion, analitica_odoo_id, sub_cotizaciones')
      .eq('archivado', false)
      .in('estado', ['aprobado', 'planificado', 'en_ejecucion', 'parado', 'finalizado_no_entregado', 'finalizado_recibido_conforme'])
      .not('referencia_odoo', 'is', null);
    const conRef = (proyectos || []).filter(p => (p.referencia_odoo || '').trim());
    if (!conRef.length) return res;
    const mapa = await matchAnaliticasProyectos(conRef.map(p => p.referencia_odoo.trim()));

    for (const p of conRef) {
      res.revisados++;
      const m = mapa[p.referencia_odoo.trim()];
      const etiqueta = [p.referencia_odoo, p.cliente || p.nombre].filter(Boolean).join(' · ');
      if (!m?.analiticaId) { res.sinAnalitica.push(etiqueta); continue; }

      // Sub-cotizaciones: toda cot de la analítica cuyo número ≠ la referencia original.
      const subs = (m.cotizaciones || []).filter(c => (c.ref || '').trim().toUpperCase() !== p.referencia_odoo.trim().toUpperCase())
        .map(c => ({ ref: c.ref, monto: c.monto, estado: c.estado, detectada_at: new Date().toISOString() }));
      const subsPrevias = new Set((p.sub_cotizaciones || []).map(s => s.ref));
      const nuevasSubs = subs.filter(s => !subsPrevias.has(s.ref));
      res.subCotsDetectadas += nuevasSubs.length;

      const upd = {};
      if (p.analitica_odoo_id !== m.analiticaId) { upd.analitica_odoo_id = m.analiticaId; upd.analitica_odoo_nombre = m.analiticaNombre; }
      if (nuevasSubs.length || subs.length !== (p.sub_cotizaciones || []).length) upd.sub_cotizaciones = subs;
      if (Object.keys(upd).length) {
        const { error } = await supabase.from('proyectos').update(upd).eq('id', p.id);
        if (error) res.errores.push({ id: p.id, error: error.message });
        else res.vinculados++;
      }

      // Presupuesto al día: valor del ERP vs suma de las cotizaciones de la analítica.
      const sumaOdoo = (m.cotizaciones || []).reduce((s, c) => s + (Number(c.monto) || 0), 0);
      const valorErp = Number(p.valor_cotizacion) || 0;
      if (sumaOdoo > 0 && Math.abs(sumaOdoo - valorErp) / sumaOdoo > 0.01) {
        res.descuadres.push({ etiqueta, valorErp, sumaOdoo, cots: (m.cotizaciones || []).map(c => c.ref).join(', ') });
      }
    }

    // Correo a Miguel + Felvison si hay algo que cuadrar
    if ((res.sinAnalitica.length || res.descuadres.length) && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const fmt = (n) => 'RD$ ' + Math.round(n).toLocaleString('es-DO');
      const html = `<div style="font-family:Arial,sans-serif;max-width:680px">
        <h2 style="color:#D71920">📊 Presupuestos ERP ↔ Analíticas de Odoo — hay que cuadrar</h2>
        ${res.sinAnalitica.length ? `<h3 style="font-size:15px">Proyectos SIN cuenta analítica que matchee (${res.sinAnalitica.length})</h3>
          <p style="font-size:12px;color:#666">Regla: el nombre de la analítica debe COMENZAR con la referencia de la cot original (ej. "ST-C1234 - Cliente").</p>
          <ul style="font-size:13px">${res.sinAnalitica.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
        ${res.descuadres.length ? `<h3 style="font-size:15px">Presupuesto descuadrado ERP vs Odoo (${res.descuadres.length})</h3>
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <tr style="background:#f3f3f3"><th style="border:1px solid #ddd;padding:6px;text-align:left">Proyecto</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Valor ERP</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Cots Odoo (sin ITBIS)</th><th style="border:1px solid #ddd;padding:6px;text-align:left">Cotizaciones</th></tr>
            ${res.descuadres.map(d => `<tr><td style="border:1px solid #ddd;padding:6px">${d.etiqueta}</td><td style="border:1px solid #ddd;padding:6px;text-align:right">${fmt(d.valorErp)}</td><td style="border:1px solid #ddd;padding:6px;text-align:right"><b>${fmt(d.sumaOdoo)}</b></td><td style="border:1px solid #ddd;padding:6px">${d.cots}</td></tr>`).join('')}
          </table>
          <p style="font-size:12px;color:#666">Si la diferencia es una sub-cotización nueva (ampliación/etapa/orden de cambio), actualicen el valor del proyecto en el ERP (o apliquen la OC de cambio). Las sub-cots ya quedaron registradas solas en el proyecto.</p>` : ''}
        <p style="font-size:12px;color:#666">— ERP Super Techos (sincronización diaria)</p></div>`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL,
          to: ['mmartinez@supertechos.com.do', 'fcalcano@supertechos.com.do'],
          subject: `📊 ${res.sinAnalitica.length + res.descuadres.length} proyecto(s) por cuadrar ERP ↔ Odoo`,
          html,
        }),
      }).catch(() => {});
    }
  } catch (e) { res.errores.push({ error: e?.message || String(e) }); }
  return res;
}
