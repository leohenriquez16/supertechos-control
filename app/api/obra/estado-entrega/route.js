// app/api/obra/estado-entrega/route.js — v8.71.0
//
// Para una obra: cuándo se entregó, si su factura está saldada en Odoo, y si toca
// emitir la carta de garantía en BORRADOR o la ORIGINAL.
//
// Solo lectura: no escribe en Odoo ni cambia el estado de la obra. La carta original
// se emite desde el ERP y ahí sí se crea la garantía, pero con la fecha de ENTREGA,
// no con la del pago ni con la del clic.
//
// Body: { proyectoId }
// Devuelve: { ok, fechaEntrega, pago: {...}, carta: { puede, modo, motivo }, garantiaId }

import { createClient } from '@supabase/supabase-js';
import { buscarFacturasDeSO } from '../../../../lib/odoo';
import { fechaEntregaObra, estadoPagoObra, cartaQueToca } from '../../../../lib/helpers/entregaObra';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

export async function POST(request) {
  try {
    const { proyectoId } = await request.json();
    if (!proyectoId) return Response.json({ ok: false, error: 'proyectoId requerido' }, { status: 400 });

    const { data: proy } = await supabase.from('proyectos')
      .select('id, estado, referencia_odoo, nombre, fecha_facturacion')
      .eq('id', proyectoId).single();
    if (!proy) return Response.json({ ok: false, error: 'la obra no existe' }, { status: 404 });

    const [{ data: hist }, { data: gar }] = await Promise.all([
      supabase.from('historial_estados').select('estado_nuevo, created_at').eq('proyecto_id', proyectoId),
      supabase.from('garantias').select('id, fecha_inicio, m2').eq('proyecto_id', proyectoId).limit(1),
    ]);

    const fechaEntrega = fechaEntregaObra(
      (hist || []).map(h => ({ estadoNuevo: h.estado_nuevo, fecha: h.created_at })),
      { fechaFacturacion: proy.fecha_facturacion },
    );

    // Las facturas viven en Odoo: el ERP no tiene el cobro (0 de 188 obras llegan a
    // 'cobrado'). Si Odoo no responde, se devuelve borrador y se dice por qué.
    let facturas = [];
    let avisoOdoo = null;
    if (proy.referencia_odoo) {
      try {
        facturas = await buscarFacturasDeSO(proy.referencia_odoo);
      } catch (e) {
        avisoOdoo = `No se pudo consultar Odoo: ${e?.message || 'error desconocido'}`;
      }
    } else {
      avisoOdoo = 'La obra no tiene referencia de cotización en Odoo.';
    }

    const garantiaExistente = (gar && gar[0]) || null;
    const carta = cartaQueToca({ proyecto: proy, facturas, garantiaExistente });

    return Response.json({
      ok: true,
      obra: { id: proy.id, nombre: proy.nombre, estado: proy.estado, referenciaOdoo: proy.referencia_odoo },
      fechaEntrega,
      pago: estadoPagoObra(facturas),
      facturas,
      carta: avisoOdoo && !garantiaExistente ? { ...carta, modo: 'borrador', motivo: avisoOdoo } : carta,
      garantiaId: garantiaExistente?.id || null,
      avisoOdoo,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
