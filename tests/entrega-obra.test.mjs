// tests/entrega-obra.test.mjs — v8.71.0 · Entrega de obra: borrador vs carta original.
// Ejecutar desde la raíz:  node tests/entrega-obra.test.mjs

import assert from 'node:assert/strict';
import { fechaEntregaObra, estadoPagoObra, cartaQueToca, ESTADOS_TERMINADA } from '../lib/helpers/entregaObra.js';

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

// --- fecha de entrega ----------------------------------------------------------------
// Caso real: las 3 obras que Miguel forzó el 21-oct. La garantía quedó arrancando ese
// día aunque habían terminado el 7, 9 y 11 de octubre.
caso('la fecha de entrega es el primer paso a terminada, no el último', () => {
  const historial = [
    { estadoNuevo: 'en_ejecucion', fecha: '2026-09-20T10:00:00Z' },
    { estadoNuevo: 'finalizado_no_entregado', fecha: '2026-10-11T08:30:00Z' },
    { estadoNuevo: 'finalizado_recibido_conforme', fecha: '2026-10-21T13:56:00Z' },
    { estadoNuevo: 'finalizado_no_entregado', fecha: '2026-10-21T14:11:00Z' },
    { estadoNuevo: 'finalizado_recibido_conforme', fecha: '2026-10-21T14:11:30Z' },
  ];
  assert.equal(fechaEntregaObra(historial), '2026-10-11');
});
caso('el ir y venir de estados no mueve la fecha', () => {
  const ida = [
    { estadoNuevo: 'finalizado_no_entregado', fecha: '2026-10-07T09:00:00Z' },
    { estadoNuevo: 'parado', fecha: '2026-10-08T09:00:00Z' },
    { estadoNuevo: 'finalizado_recibido_conforme', fecha: '2026-10-21T13:51:00Z' },
  ];
  assert.equal(fechaEntregaObra(ida), '2026-10-07');
});
caso('acepta el historial en snake_case y desordenado', () => {
  assert.equal(fechaEntregaObra([
    { estado_nuevo: 'facturado', created_at: '2026-10-15T00:00:00Z' },
    { estado_nuevo: 'finalizado_no_entregado', created_at: '2026-10-09T00:00:00Z' },
  ]), '2026-10-09');
});
caso('sin historial cae a la fecha de la obra', () => {
  assert.equal(fechaEntregaObra([], { fechaFacturacion: '2026-09-30' }), '2026-09-30');
  assert.equal(fechaEntregaObra([], {}), null);
  assert.equal(fechaEntregaObra(), null);
});

// --- estado de pago ------------------------------------------------------------------
caso('factura saldada', () => {
  const r = estadoPagoObra([{ monto_total: 411992.28, monto_pagado: 411992.28, tipo: 'out_invoice' }]);
  assert.equal(r.saldada, true);
  assert.equal(r.pendiente, 0);
});
caso('factura a medias no está saldada', () => {
  const r = estadoPagoObra([{ monto_total: 100000, monto_pagado: 60000, tipo: 'out_invoice' }]);
  assert.equal(r.saldada, false);
  assert.equal(r.pendiente, 40000);
});
caso('varias facturas suman', () => {
  const r = estadoPagoObra([
    { monto_total: 50000, monto_pagado: 50000, tipo: 'out_invoice' },
    { monto_total: 30000, monto_pagado: 30000, tipo: 'out_invoice' },
  ]);
  assert.equal(r.saldada, true);
  assert.equal(r.total, 80000);
});
caso('una nota de crédito resta del total', () => {
  const r = estadoPagoObra([
    { monto_total: 100000, monto_pagado: 70000, tipo: 'out_invoice' },
    { monto_total: 30000, monto_pagado: 30000, tipo: 'out_refund' },
  ]);
  assert.equal(r.total, 70000);
  assert.equal(r.pagado, 40000);
});
caso('un peso de diferencia por redondeo sigue siendo saldada', () => {
  assert.equal(estadoPagoObra([{ monto_total: 10000, monto_pagado: 9999.5, tipo: 'out_invoice' }]).saldada, true);
  assert.equal(estadoPagoObra([{ monto_total: 10000, monto_pagado: 9990, tipo: 'out_invoice' }]).saldada, false);
});
caso('sin facturas no está saldada', () => {
  const r = estadoPagoObra([]);
  assert.equal(r.saldada, false);
  assert.equal(r.hayFactura, false);
});

// --- qué carta toca ------------------------------------------------------------------
const obraLista = { estado: 'finalizado_no_entregado' };
caso('obra sin terminar: no se emite nada', () => {
  const r = cartaQueToca({ proyecto: { estado: 'en_ejecucion' } });
  assert.equal(r.puede, false);
});
caso('terminada y sin factura: borrador', () => {
  const r = cartaQueToca({ proyecto: obraLista, facturas: [] });
  assert.equal(r.modo, 'borrador');
  assert.equal(r.puede, true);
  assert.match(r.motivo, /factura/i);
});
caso('terminada con factura a medias: borrador y dice cuánto falta', () => {
  const r = cartaQueToca({ proyecto: obraLista, facturas: [{ monto_total: 100000, monto_pagado: 40000, tipo: 'out_invoice' }] });
  assert.equal(r.modo, 'borrador');
  assert.match(r.motivo, /60,000/);
});
caso('terminada y saldada: carta original', () => {
  const r = cartaQueToca({ proyecto: obraLista, facturas: [{ monto_total: 100000, monto_pagado: 100000, tipo: 'out_invoice' }] });
  assert.equal(r.modo, 'original');
});
caso('si la garantía ya existe, la carta es original aunque falte cobrar', () => {
  const r = cartaQueToca({ proyecto: obraLista, facturas: [], garantiaExistente: { id: 'gar_1' } });
  assert.equal(r.modo, 'original');
});
caso('facturado y cobrado cuentan como obra terminada', () => {
  assert.ok(ESTADOS_TERMINADA.includes('facturado'));
  assert.ok(ESTADOS_TERMINADA.includes('cobrado'));
  assert.equal(cartaQueToca({ proyecto: { estado: 'facturado' }, facturas: [] }).puede, true);
});

console.log(`\nentrega-obra: ${ok} ok, ${fallos.length} fallas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
