// app/api/odoo/sincronizar-factura/route.js
// v8.17.67: para un proyecto dado, busca facturas en Odoo (account.move
// ligadas al sale.order del proyecto) y si encuentra alguna POSTED, marca
// el proyecto como 'facturado' con número de factura + fecha + monto.
//
// Body: { proyectoId: string }
// Devuelve: { actualizado: bool, facturas: [...], cambios: {...} }

import { createClient } from '@supabase/supabase-js';
import { buscarFacturasDeSO } from '../../../../lib/odoo';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

export async function POST(request) {
  try {
    const { proyectoId } = await request.json();
    if (!proyectoId) {
      return Response.json({ ok: false, error: 'proyectoId requerido' }, { status: 400 });
    }

    const { data: proy } = await supabase.from('proyectos')
      .select('id, estado, referencia_odoo, numero_factura, fecha_facturacion, monto_final_cubicado')
      .eq('id', proyectoId).single();
    if (!proy) {
      return Response.json({ ok: false, error: 'proyecto no existe' }, { status: 404 });
    }
    if (!proy.referencia_odoo) {
      return Response.json({ ok: false, error: 'proyecto sin referencia_odoo — no se puede buscar en Odoo' }, { status: 400 });
    }

    const facturas = await buscarFacturasDeSO(proy.referencia_odoo);
    if (facturas.length === 0) {
      return Response.json({ ok: true, actualizado: false, facturas: [], mensaje: 'No se encontraron facturas posted ligadas a este SO en Odoo.' });
    }

    // Tomar la más reciente como referencia para los campos "principales".
    // Si hay varias (cubicaciones mensuales), las cubrimos en PR K5.
    const principal = facturas[0]; // ya viene ordenado por fecha desc
    const montoTotalSumado = facturas.reduce((s, f) => s + (f.monto_total || 0), 0);

    const updates = {
      estado: 'facturado',
      numero_factura: facturas.length === 1 ? principal.numero : `${principal.numero} +${facturas.length - 1}`,
      fecha_facturacion: principal.fecha,
      monto_final_cubicado: montoTotalSumado, // suma de todas las facturas posted
      updated_at: new Date().toISOString(),
    };

    // Solo aplicar si hubo cambios reales (idempotencia)
    const cambios = {};
    Object.keys(updates).forEach(k => {
      if (k === 'updated_at') return;
      if (String(proy[k]) !== String(updates[k])) cambios[k] = { antes: proy[k], despues: updates[k] };
    });

    if (Object.keys(cambios).length === 0) {
      return Response.json({ ok: true, actualizado: false, facturas, mensaje: 'Proyecto ya está sincronizado con la información de Odoo.' });
    }

    const { error } = await supabase.from('proyectos').update(updates).eq('id', proyectoId);
    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, actualizado: true, facturas, cambios });
  } catch (e) {
    console.error('[sincronizar-factura] error:', e);
    return Response.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
