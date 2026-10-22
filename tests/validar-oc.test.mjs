// tests/validar-oc.test.mjs — v8.59.3 · Validación de la OC firmada.
// Casos sobre la OC real 4500142510 (El Almirante, 12-ago-2026).
// Ejecutar desde la raíz:  node tests/validar-oc.test.mjs

import assert from 'node:assert/strict';
import { validarOC, parsearRespuestaIA, cuadrarMontoOC, codigoCoincide, esObraDelSitio, nombreSitioCoincide } from '../lib/helpers/validarOC.js';

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
caso('OC mayor que la cotización (partidas adicionales) es aviso, no error', () => {
  const r = validarOC(ocAlmirante(), { ...almirante, cotizacionMonto: 435683.84 });
  assert.equal(r.ok, true);
  assert.match(r.avisos.join(' '), /no cuadra/);
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

// ── v8.72.2: OC con techo + pintura y códigos cortados por el SAP (ticket Miguel) ──
const sanGeronimo = {
  nombre: 'SAN GERÓNIMO UASD', codigoUt: 'DO-01-DN-00198-12', cotizacionRef: 'ST-C5759', cotizacionMonto: 411992.28,
  obra: { referenciaOdoo: 'ST-C5759', valorCotizacion: 411992.28 },
  cotizacionesSitio: [{ ref: 'ST-C5784', monto: 45265.41 }],
};
const ocSanGeronimo = (extra = {}) => ({
  es_orden_compra: true, numero_oc: '4500150000', proveedor_rnc: '130774331', moneda: 'DOP',
  sitios: [{ nombre: 'SITIO SAN GERONIMO UASD', codigo: 'DO-01-DN-00198-12' }],
  partidas: [{ descripcion: 'Impermeabilización techo', monto: 411992.28 }, { descripcion: 'Pintura', monto: 45265.41 }],
  subtotal: 457257.69, impuestos: 82306.38, total: 539564.07, ...extra,
});
caso('OC techo + pintura que suma las dos cotizaciones → acepta', () => {
  const r = validarOC(ocSanGeronimo(), sanGeronimo, { sinFirma: true });
  assert.equal(r.ok, true, r.errores.join(' | '));
  assert.match(r.avisos.join(' '), /ST-C5759 \+ ST-C5784/);
});
caso('OC techo + pintura sin conocer la cotización de pintura: la partida del techo cuadra → acepta', () => {
  const r = validarOC(ocSanGeronimo(), { ...sanGeronimo, cotizacionesSitio: [] }, { sinFirma: true });
  assert.equal(r.ok, true, r.errores.join(' | '));
  assert.match(r.avisos.join(' '), /partida/);
});
caso('OC menor que lo cotizado → rechaza con lo esperado y lo leído', () => {
  const r = validarOC(ocSanGeronimo({ subtotal: 300000, partidas: [{ descripcion: 'Techo', monto: 300000 }] }), sanGeronimo, { sinFirma: true });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /menor que lo cotizado/);
  assert.match(r.errores.join(' '), /300,000\.00/);
  assert.match(r.errores.join(' '), /411,992\.28/);
});
caso('cuadrarMontoOC: sin cotizaciones no opina; el monto exacto de una sola pasa', () => {
  assert.equal(cuadrarMontoOC({ subtotal: 1000 }, []).ok, null);
  assert.equal(cuadrarMontoOC({ subtotal: 261765 }, [{ ref: 'ST-C5775', montos: [261765, 308882.7] }]).ok, true);
});
caso('código cortado por el SAP → acepta (con aviso)', () => {
  const sanCarlos = { nombre: 'SAN CARLOS', codigoUt: 'DO-01-DN-00097-08', cotizacionMonto: 261765 };
  const oc = { ...ocSanGeronimo(), sitios: [{ nombre: 'SITIO SAN CARLOS CELDA-DO-01-DN-0009', codigo: 'DO-01-DN-00097-0' }], subtotal: 261765, partidas: [] };
  const r = validarOC(oc, sanCarlos, { sinFirma: true });
  assert.equal(r.ok, true, r.errores.join(' | '));
  assert.match(r.avisos.join(' '), /cortado/);
  // código nulo pero viene dentro del nombre cortado
  const oc2 = { ...oc, sitios: [{ nombre: 'SITIO SAN CARLOS CELDA-DO-01-DN-00097', codigo: null }] };
  assert.equal(validarOC(oc2, sanCarlos, { sinFirma: true }).ok, true);
  assert.equal(codigoCoincide('DO01DN00097', 'DO-01-DN-00097-08'), true);
  assert.equal(codigoCoincide('DO-01-DN-0009', 'DO-01-DN-00097-08'), false, 'muy corto: ambiguo');
});
caso('código de otra antena → rechaza', () => {
  const r = validarOC({ ...ocSanGeronimo(), sitios: [{ nombre: 'SITIO SAN CARLOS', codigo: 'DO-01-DN-00097-08' }] }, sanGeronimo, { sinFirma: true });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /otro sitio/);
  assert.equal(codigoCoincide('DO-01-DN-00099-08', 'DO-01-DN-00097-08'), false);
  assert.equal(codigoCoincide('DO-01-DN-00097-09', 'DO-01-DN-00097-08'), false);
});
caso('nombre del sitio cortado coincide por prefijo', () => {
  assert.equal(nombreSitioCoincide('SITIO RESIDENCIAL PRIMAVERA STO', 'RESIDENCIAL PRIMAVERA STO DGO ESTE'), true);
  assert.equal(nombreSitioCoincide('SITIO LOS PRADITOS', 'SAN CARLOS'), false);
});
caso('esObraDelSitio: la obra de pintura del mismo sitio, por nombre o por código', () => {
  assert.equal(esObraDelSitio({ nombre: 'Servicio de Pintura San Geronimo' }, sanGeronimo), true);
  assert.equal(esObraDelSitio({ nombre: 'Antena Urbanización Fernández DO-01-DN-00135-09' }, { nombre: 'URB. FERNANDEZ (STO. DGO.)', codigoUt: 'DO-01-DN-00135-09' }), true);
  assert.equal(esObraDelSitio({ nombre: 'Antena Los Praditos DO-01-DN-00170-11' }, sanGeronimo), false);
});

// v8.72.4: La Fuente — el SAP cortó el código a 10 caracteres (DO-03-SG-0099).
const laFuente = { nombre: 'LA FUENTE ZONA NORTE', codigoUt: 'DO-03-SG-00995-13', cotizacionMonto: 434613.78 };
const ocFuente = (sitio) => ({ ...ocAlmirante(), numero_oc: '4500153193', subtotal: 434613.78, total: 512844.26,
  sitios: [{ nombre: sitio, codigo: 'DO-03-SG-0099' }] });
caso('código cortado a 10 + nombre del sitio igual → pasa', () => {
  const r = validarOC(ocFuente('SITIO LA FUENTE ZONA NORTE'), laFuente, { sinFirma: true });
  assert.equal(r.ok, true, r.errores.join(' | '));
});
caso('código cortado a 10 pero nombre de otro sitio → no pasa', () => {
  const r = validarOC(ocFuente('SITIO LOS ALCARRIZOS'), laFuente, { sinFirma: true });
  assert.equal(r.ok, false);
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
