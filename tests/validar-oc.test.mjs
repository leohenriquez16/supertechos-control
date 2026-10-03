// tests/validar-oc.test.mjs — v8.59.3 · Validación de la OC firmada.
// Casos sobre la OC real 4500142510 (El Almirante, 12-ago-2026).
// Ejecutar desde la raíz:  node tests/validar-oc.test.mjs

import assert from 'node:assert/strict';
import { validarOC, parsearRespuestaIA } from '../lib/helpers/validarOC.js';

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

const ocAlmirante = () => ({
  es_orden_compra: true, numero_oc: '4500142510', cliente_rnc: '132471075',
  proveedor_nombre: 'LH SUPER TECHOS SRL', proveedor_rnc: '130-77433-1', fecha: '2026-08-12', moneda: 'DOP',
  sitios: [{ nombre: 'SITIO EL ALMIRANTE', codigo: 'DO-01-SD-00157-10' }],
  subtotal: 552786.20, impuestos: 99501.52, total: 652287.72,
  firmada_proveedor: true, firma_detalle: 'firma manuscrita en azul',
});
const almirante = { nombre: 'EL ALMIRANTE', codigoUt: 'DO-01-SD-00157-10', cotizacionMonto: 552786.20 };

caso('la OC correcta y firmada pasa', () => {
  const r = validarOC(ocAlmirante(), almirante);
  assert.equal(r.ok, true, r.errores.join(' | '));
  assert.equal(r.numeroOc, '4500142510');
});
caso('sin firma del proveedor NO pasa', () => {
  const oc = { ...ocAlmirante(), firmada_proveedor: false, firma_detalle: 'recuadro vacío' };
  const r = validarOC(oc, almirante);
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /no está firmada/);
});
caso('la OC de otro sitio NO pasa', () => {
  const r = validarOC(ocAlmirante(), { nombre: 'ISABELITA', codigoUt: 'DO-01-SD-00119-08' });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /otro sitio/);
});
caso('una OC a nombre de otro proveedor NO pasa', () => {
  const r = validarOC({ ...ocAlmirante(), proveedor_rnc: '101010101', proveedor_nombre: 'Otra SRL' }, almirante);
  assert.equal(r.ok, false);
});
caso('una OC ya usada en otra sucursal NO pasa', () => {
  const r = validarOC(ocAlmirante(), almirante, { yaUsadas: ['4500142510'] });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /ya está cargada/);
});
caso('un archivo que no es OC NO pasa', () => {
  assert.equal(validarOC({ es_orden_compra: false }, almirante).ok, false);
  assert.equal(validarOC(null, almirante).ok, false);
});
caso('monto distinto a la cotización es aviso, no error', () => {
  const r = validarOC(ocAlmirante(), { ...almirante, cotizacionMonto: 435683.84 });
  assert.equal(r.ok, true);
  assert.match(r.avisos.join(' '), /difiere/);
});
caso('Prouco también es proveedor válido', () => {
  assert.equal(validarOC({ ...ocAlmirante(), proveedor_rnc: '131515541' }, almirante).ok, true);
});
caso('lee el JSON aunque venga envuelto en markdown', () => {
  const j = parsearRespuestaIA('Aquí está:\n```json\n{"numero_oc":"4500142510","es_orden_compra":true}\n```');
  assert.equal(j.numero_oc, '4500142510');
  assert.equal(parsearRespuestaIA('sin json'), null);
});

caso('OC cruda (sin firmar) pasa cuando la firma la pone el ERP', () => {
  const r = validarOC({ ...ocAlmirante(), firmada_proveedor: false }, almirante, { sinFirma: true });
  assert.equal(r.ok, true, r.errores.join(' | '));
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
