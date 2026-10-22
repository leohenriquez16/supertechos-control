// tests/superficie-obra.test.mjs — v8.70.0 · Superficie real de la obra.
// Ticket de Miguel (21-oct-2026): "el informe y la carta de garantía ST5759 duplica el
// metraje. Entiendo que está sumando la tarea de lavado y de ejecución de silicona".
// Ejecutar desde la raíz:  node tests/superficie-obra.test.mjs

import assert from 'node:assert/strict';
import { superficieRealObra, esSistemaAuxiliar, m2SistemaGarantizado } from '../lib/helpers/calculos.js';

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

// --- el caso que reportó Miguel ------------------------------------------------------
// ST-C5759 (Antena San Gerónimo UASD): un techo de 249.6 m² cargado dos veces, una por
// cada sistema que lleva. La carta decía 499.2 m².
const C5759 = [
  { id: 'a_p_1790725806450_0', nombre: 'Techo', m2: 249.6, sistemaId: 's_1776642312281', precioVentaM2: 1300 },
  { id: 'a_1791208316028fyar', nombre: 'Techo', m2: 249.6, sistemaId: 's_1776801452956', precioVentaM2: 50 },
];

caso('ST-C5759: el techo mide 249.6, no 499.2', () => {
  assert.equal(superficieRealObra(C5759), 249.6);
  const sumaCruda = C5759.reduce((s, a) => s + a.m2, 0);
  assert.equal(sumaCruda, 499.2); // lo que decía antes del fix
});

// --- áreas distintas SÍ suman --------------------------------------------------------
caso('dos superficies distintas suman normal', () => {
  assert.equal(superficieRealObra([
    { nombre: 'Techo principal', m2: 100 },
    { nombre: 'Techo anexo', m2: 50 },
  ]), 150);
});
caso('mismo nombre pero metraje distinto son superficies distintas', () => {
  assert.equal(superficieRealObra([
    { nombre: 'Bloque', m2: 100 },
    { nombre: 'Bloque', m2: 80 },
  ]), 180);
});
caso('tres sistemas sobre la misma superficie cuentan una vez', () => {
  assert.equal(superficieRealObra([
    { nombre: 'Techo', m2: 300, sistemaId: 'a' },
    { nombre: 'Techo', m2: 300, sistemaId: 'b' },
    { nombre: 'Techo', m2: 300, sistemaId: 'c' },
  ]), 300);
});

// --- el caso grande: Hotel Boutique Dalan (ST-C5716), 5 bloques duplicados -----------
caso('ST-C5716: 5 bloques por dos sistemas → 5,523.46 y no 8,899.61', () => {
  const bloques = [1434.6, 124.08, 654.72, 838.75, 324.0];
  const areas = [];
  bloques.forEach((m2, i) => {
    areas.push({ nombre: `Bloque ${i + 1}`, m2, sistemaId: 's_1781705546404_1_wsnq' });
    areas.push({ nombre: `Bloque ${i + 1}`, m2, sistemaId: 's_1776800941711' });
  });
  const real = bloques.reduce((a, b) => a + b, 0);
  assert.equal(Math.round(superficieRealObra(areas) * 100) / 100, Math.round(real * 100) / 100);
  assert.equal(Math.round(areas.reduce((s, a) => s + a.m2, 0) * 100) / 100, Math.round(real * 2 * 100) / 100);
});

// --- el nombre se compara sin distinguir espacios ni mayúsculas ----------------------
caso('ignora mayúsculas y espacios al comparar el nombre', () => {
  assert.equal(superficieRealObra([
    { nombre: 'Techo Principal', m2: 200 },
    { nombre: '  techo principal ', m2: 200 },
  ]), 200);
});

// --- bordes --------------------------------------------------------------------------
caso('lista vacía, nula o sin m² da 0', () => {
  assert.equal(superficieRealObra([]), 0);
  assert.equal(superficieRealObra(), 0);
  assert.equal(superficieRealObra(null), 0);
  assert.equal(superficieRealObra([{ nombre: 'X' }]), 0);
  assert.equal(superficieRealObra([{ nombre: 'X', m2: 0 }]), 0);
});
caso('un área sin nombre no se come a otra sin nombre de otro metraje', () => {
  assert.equal(superficieRealObra([{ m2: 10 }, { m2: 20 }]), 30);
});
caso('m² en texto se interpreta como número', () => {
  assert.equal(superficieRealObra([{ nombre: 'A', m2: '120.5' }]), 120.5);
});
caso('no se rompe con áreas nulas en la lista', () => {
  assert.equal(superficieRealObra([null, { nombre: 'A', m2: 10 }, undefined]), 10);
});

// --- v8.72.2: sistemas auxiliares y m² del sistema garantizado --------------------------
const SIS = {
  s_1776642312281: { nombre: 'Silicona Sobre Lona Asfaltica', tareas: [{ nombre: 'Reparaciones Lona Asfáltica' }, { nombre: 'Sellado Puntos Singulares' }, { nombre: 'Aplicacion de Bleed Blocker' }, { nombre: 'Aplicar Silicona' }] },
  s_1776801452956: { nombre: 'Lavado a Presion', tareas: [{ nombre: 'Lavado ' }] },
};
caso('esSistemaAuxiliar: lavado sí, silicona no', () => {
  assert.equal(esSistemaAuxiliar(SIS.s_1776801452956), true);
  assert.equal(esSistemaAuxiliar(SIS.s_1776642312281), false);
  assert.equal(esSistemaAuxiliar({ nombre: 'Prep. techo', tareas: [{ nombre: 'Limpieza de superficie' }] }), true, 'una sola tarea de limpieza');
  assert.equal(esSistemaAuxiliar({ nombre: 'Poliuretano', tareas: [{ nombre: 'Limpieza' }, { nombre: 'Aplicar PU' }] }), false, 'varias tareas: sistema real');
  assert.equal(esSistemaAuxiliar({ data: { nombre: 'Lavado a Presion' } }), true, 'fila cruda con data');
  assert.equal(esSistemaAuxiliar({ nombre: 'Limpieza y Sellado de juntas.' }), false, 'sellado es trabajo real');
  assert.equal(esSistemaAuxiliar({ nombre: 'Limpieza y Bote' }), true);
  assert.equal(esSistemaAuxiliar(null), false);
});
caso('superficieRealObra con sistemas: el lavado no suma aunque el área se llame distinto', () => {
  const areas = [{ nombre: 'Techo', m2: 249.6, sistemaId: 's_1776642312281' }, { nombre: 'Techo (lavado)', m2: 249.6, sistemaId: 's_1776801452956' }];
  assert.equal(superficieRealObra(areas), 499.2, 'sin sistemas no sabe');
  assert.equal(superficieRealObra(areas, SIS), 249.6);
  assert.equal(superficieRealObra([{ nombre: 'Techo', m2: 80, sistemaId: 's_1776801452956' }], SIS), 80, 'obra que solo es lavado');
});
caso('m2SistemaGarantizado: ST-C5759 silicona = 249.6', () => {
  assert.equal(m2SistemaGarantizado(C5759, 's_1776642312281'), 249.6);
  assert.equal(m2SistemaGarantizado(C5759, 's_otro', SIS), 249.6, 'sin áreas del sistema: superficie real');
  assert.equal(m2SistemaGarantizado([{ nombre: 'A', m2: 100, sistemaId: 'x' }, { nombre: 'B', m2: 40, sistemaId: 'y' }], 'x'), 100);
});

console.log(`\nsuperficie-obra: ${ok} ok, ${fallos.length} fallas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
