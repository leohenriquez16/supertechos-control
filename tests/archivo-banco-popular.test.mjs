// tests/archivo-banco-popular.test.mjs — v8.57.0 · Archivo de pago del Banco Popular.
// La prueba fuerte: reconstruir el archivo REAL del 2-oct-2026 (Prouco, 16 pagos,
// RD$544,222.50) carácter por carácter a partir de los datos de cada persona.
// Ejecutar desde la raíz:  node tests/archivo-banco-popular.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generarArchivoPopular, faltantesParaPago } from '../lib/helpers/archivoBancoPopular.js';

const real = fs.readFileSync(new URL('./fixtures/banco-popular-ejemplo.txt', import.meta.url), 'latin1')
  .split('\n').filter(l => l.trim());

// Los 16 pagos tal como habría que tenerlos en la ficha de cada persona.
const P = (cuenta, tipoCuenta, codigoBanco, tipoDocumento, documento, titular, monto) =>
  ({ cuenta, tipoCuenta, codigoBanco, tipoDocumento, documento, titular, monto });
const pagos = [
  P('1620707866', 'ahorro', '21410101010L', 'cedula', '00110839958', 'Gerbacio de Leon', 10000),
  P('830986766', 'ahorro', '214101010708', 'cedula', '40214760551', 'josue A.Marten', 11000),
  P('830977062', 'ahorro', '214101010708', 'cedula', '40231429438', 'Adonis P.Heredia Jimenez', 22412.5),
  P('780477980', 'ahorro', '214101010708', 'cedula', '01201143086', 'Adrian Reeyes de los Santos', 28750),
  P('0855258059', 'corriente', '214101010708', 'pasaporte', 'R12553363', 'Rochenel Debreus', 32450),
  P('837921931', 'ahorro', '214101010708', 'cedula', '40255503811', 'Juan C.Cabrera', 115360),
  P('822449674', 'ahorro', '214101010708', 'cedula', '00118458587', 'Salvador S.Nivar Montero', 26250),
  P('825183395', 'ahorro', '214101010708', 'cedula', '00112522958', 'Juan de Leon', 17000),
  P('832724546', 'ahorro', '214101010708', 'pasaporte', '174843427', 'Osman P.Linares', 62750),
  P('836032490', 'ahorro', '214101010708', 'cedula', '40250122153', 'Mauricio Guaman', 10450),
  P('9608945282', 'ahorro', '21410101010L', 'cedula', '40201194095', 'Darlin Basora', 3000),
  P('9609537288', 'ahorro', '21410101010L', 'cedula', '00110166790', 'Jose Alberto Diaz', 3000),
  P('0855247474', 'ahorro', '214101010708', 'cedula', '40229606765', 'Letelcy De Aza', 74900),
  P('784662520', 'ahorro', '214101010708', 'cedula', '22400123547', 'Cristian De Los Santos', 60100),
  P('1007178804', 'ahorro', '21413249841L', 'cedula', '00119442002', 'Isael Pimentel', 19200),
  P('0840448633', 'ahorro', '214101010708', 'cedula', '00111504411', 'Melyn Marrero', 47600),
];

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

const salida = generarArchivoPopular({
  rnc: '131515541', empresa: 'PROUCO GROUP DOMINICANA', fecha: '2026-10-02',
  lote: '000001', secuencia: '001', concepto: 'MDO',
  correoNotificacion: 'yharris@supertechos.com.do', pagos,
});
const generado = salida.contenido.split('\n').filter(l => l.trim());

caso('mismo número de líneas que el archivo del banco', () => {
  assert.equal(generado.length, real.length);
});
caso('todas las líneas miden 320', () => {
  generado.forEach((l, i) => assert.equal(l.length, 320, `línea ${i + 1} mide ${l.length}`));
});
caso('el encabezado sale idéntico', () => {
  assert.equal(generado[0], real[0]);
});
real.slice(1).forEach((l, i) => {
  caso(`el pago ${i + 1} (${pagos[i].titular}) sale idéntico`, () => {
    assert.equal(generado[i + 1], l);
  });
});
caso('los totales cuadran con el archivo real', () => {
  assert.equal(salida.totales.cantidad, 16);
  assert.equal(salida.totales.monto, 544222.5);
});
caso('quien no tiene cuenta queda fuera, con el motivo', () => {
  const r = generarArchivoPopular({
    rnc: '131515541', empresa: 'PROUCO GROUP DOMINICANA', fecha: '2026-10-02',
    pagos: [pagos[0], { titular: 'Sin Banco', monto: 5000 }],
  });
  assert.equal(r.totales.cantidad, 1);
  assert.equal(r.excluidos.length, 1);
  assert.ok(r.excluidos[0].faltan.includes('número de cuenta'));
});
caso('faltantesParaPago nombra cada dato que falta', () => {
  const f = faltantesParaPago({});
  ['número de cuenta', 'tipo de cuenta (corriente o ahorro)', 'código del banco', 'monto']
    .forEach(x => assert.ok(f.includes(x), `falta avisar: ${x}`));
});
caso('una persona completa no tiene faltantes', () => {
  assert.deepEqual(faltantesParaPago({ ...pagos[0] }), []);
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.slice(0, 8).forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
