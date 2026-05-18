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

  return Response.json({ ok: true, ...resultados });
}
