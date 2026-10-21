// lib/helpers/entregaObra.js — v8.71.0
//
// ENTREGA DE OBRA: cuándo se entregó, si ya se cobró, y qué carta de garantía toca.
//
// Decisión de Leonardo (21-oct-2026), después del ticket de Miguel sobre la ST-C5759:
//
//   · La carta se puede sacar como BORRADOR en cualquier momento, para enseñarle al
//     cliente qué va a recibir. El borrador no crea la garantía ni toca el estado de
//     la obra.
//   · La carta ORIGINAL se emite contra el saldo: cuando la factura está pagada.
//   · Pero la garantía corre desde la FECHA DE ENTREGA, no desde el pago. El cliente
//     tiene cobertura desde que recibió el trabajo.
//
// Por qué hizo falta: la garantía solo nacía cuando la obra tocaba
// 'finalizado_recibido_conforme', así que para sacar una carta había que forzar el
// estado y devolverlo. El 21-oct Miguel hizo eso con tres obras en veinte minutos, y
// las tres garantías quedaron arrancando el día del clic aunque las obras habían
// terminado 10, 12 y 14 días antes.
//
// Y el cobro no se puede leer del ERP: 0 de 188 obras tienen `fecha_cobro` y ninguna
// llega al estado 'cobrado'. El cobro vive en Odoo. Por eso el disparador de la carta
// original es el saldo de la factura en Odoo, no un estado que alguien deba mover.

/** Estados en los que la obra ya está terminada y se puede entregar. */
export const ESTADOS_TERMINADA = [
  'finalizado_no_entregado',
  'finalizado_recibido_conforme',
  'facturado',
  'cobrado',
];

/**
 * Fecha en que la obra se terminó, que es desde cuándo corre la garantía.
 * Sale del historial: la PRIMERA vez que pasó a un estado de terminada. Si el historial
 * no la tiene, cae a la fecha que traiga la obra, y de último a hoy.
 *
 * @param {array} historial  [{ estadoNuevo, fecha }] de esa obra, en cualquier orden
 * @param {object} proyecto  por si el historial viene vacío
 * @returns {string|null} 'YYYY-MM-DD'
 */
export function fechaEntregaObra(historial = [], proyecto = null) {
  const pasos = (historial || [])
    .filter(h => ESTADOS_TERMINADA.includes(h?.estadoNuevo || h?.estado_nuevo))
    .map(h => String(h.fecha || h.created_at || '').slice(0, 10))
    .filter(Boolean)
    .sort();
  if (pasos.length) return pasos[0];
  const delProyecto = proyecto?.fechaEntrega || proyecto?.fecha_entrega
    || proyecto?.fechaFacturacion || proyecto?.fecha_facturacion;
  if (delProyecto) return String(delProyecto).slice(0, 10);
  return null;
}

/**
 * ¿Está saldada la factura de la obra?
 * `facturas` es lo que devuelve buscarFacturasDeSO (lib/odoo.js): trae monto_total y
 * monto_pagado por factura. Se considera saldada cuando lo pagado cubre el total de
 * todas; las notas de crédito (out_refund) restan.
 *
 * @returns {{ saldada: boolean, total: number, pagado: number, pendiente: number, hayFactura: boolean }}
 */
export function estadoPagoObra(facturas = []) {
  const fs = (facturas || []).filter(f => f && f.tipo !== 'out_refund');
  const notas = (facturas || []).filter(f => f && f.tipo === 'out_refund');
  const total = fs.reduce((s, f) => s + (Number(f.monto_total) || 0), 0)
    - notas.reduce((s, f) => s + (Number(f.monto_total) || 0), 0);
  const pagado = fs.reduce((s, f) => s + (Number(f.monto_pagado) || 0), 0)
    - notas.reduce((s, f) => s + (Number(f.monto_pagado) || 0), 0);
  const pendiente = Math.round((total - pagado) * 100) / 100;
  return {
    hayFactura: fs.length > 0,
    total: Math.round(total * 100) / 100,
    pagado: Math.round(pagado * 100) / 100,
    pendiente,
    // Un peso de diferencia por redondeo no deja de ser una factura saldada.
    saldada: fs.length > 0 && pendiente <= 1,
  };
}

/**
 * Qué carta toca emitir para esta obra, y por qué.
 * @returns {{ puede: boolean, modo: 'borrador'|'original', motivo: string }}
 */
export function cartaQueToca({ proyecto, facturas = [], garantiaExistente = null } = {}) {
  const estado = proyecto?.estado;
  if (!ESTADOS_TERMINADA.includes(estado)) {
    return { puede: false, modo: 'borrador', motivo: 'La obra todavía no está terminada.' };
  }
  if (garantiaExistente) {
    return { puede: true, modo: 'original', motivo: 'La garantía ya está emitida.' };
  }
  const pago = estadoPagoObra(facturas);
  if (pago.saldada) {
    return { puede: true, modo: 'original', motivo: 'La factura está saldada: se puede emitir la carta original.' };
  }
  if (!pago.hayFactura) {
    return { puede: true, modo: 'borrador', motivo: 'Todavía no hay factura emitida en Odoo.' };
  }
  return {
    puede: true,
    modo: 'borrador',
    motivo: `Falta cobrar ${new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(pago.pendiente)} de la factura.`,
  };
}
