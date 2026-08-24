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
