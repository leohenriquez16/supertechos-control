// tests/garantia-tipo-sistema.test.mjs — v8.72.0 · El tipo de garantía sale del sistema.
// El modal de entrega (v8.71.0) le pasaba a tipoSugeridoParaSistema el NOMBRE del sistema en
// vez del objeto. Como la función lee sistema.data.nombre / sistema.nombre / sistema.id, con un
// string no resolvía nada, el nombre quedaba vacío y caía en el default: 'imper_liquida'. Una
// carta de silicona sobre lona, de piso epóxico o de un lavado de techo salía garantizando
// estanqueidad de impermeabilización líquida.
// Ejecutar desde la raíz:  node tests/garantia-tipo-sistema.test.mjs

import assert from 'node:assert/strict';
import { tipoSugeridoParaSistema, SISTEMA_SILICONA_SOBRE_LONA } from '../lib/garantiasCatalogo.js';

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

// --- la forma en que el modal lo llama ahora: el objeto completo ---------------------
caso('silicona sobre lona por id', () => {
  assert.equal(tipoSugeridoParaSistema({ id: SISTEMA_SILICONA_SOBRE_LONA, nombre: 'Silicona Sobre Lona Asfaltica' }), 'silicona_sobre_lona');
});
caso('silicona sobre lona por nombre, sin id', () => {
  // s_1778765186869_1_dizq0, el otro sistema de silicona sobre lona del catálogo
  assert.equal(tipoSugeridoParaSistema({ nombre: 'Ever Silic HS (Silicona Sobre Lona Asfáltica)' }), 'silicona_sobre_lona');
});
caso('silicona sobre CONCRETO no es el de lona', () => {
  assert.notEqual(tipoSugeridoParaSistema({ nombre: 'Ever Silic HS - Sobre Concreto' }), 'silicona_sobre_lona');
});
caso('el sistema que viene envuelto en data', () => {
  assert.equal(tipoSugeridoParaSistema({ data: { nombre: 'Lona Asfáltica 4KG Mineral Gris' } }), 'imper_membrana');
});
caso('lavado de techo es servicio de limpieza, no impermeabilización', () => {
  assert.equal(tipoSugeridoParaSistema({ nombre: 'Lavado a Presion' }), 'servicio_limpieza');
});
caso('piso epóxico', () => {
  assert.equal(tipoSugeridoParaSistema({ nombre: 'Ever Thane HS Plus FR (Sistema Base Epoxico)' }), 'pisos_industriales');
});
caso('cementicio', () => {
  assert.equal(tipoSugeridoParaSistema({ nombre: 'Sika Mortero 101 Cementicio' }), 'imper_cementicio');
});
caso('acrílico sí es impermeabilización líquida', () => {
  assert.equal(tipoSugeridoParaSistema({ nombre: 'Sistema Acrílico Polybrite 44' }), 'imper_liquida');
});

// --- la regresión: pasarle el nombre suelto daba siempre 'imper_liquida' -------------
caso('el nombre suelto NO debe decidir el tipo (era el bug)', () => {
  // Así lo llamaba ModalEntregaGarantia.jsx antes de la v8.72.0.
  const comoLoLlamabaElModal = tipoSugeridoParaSistema('Silicona Sobre Lona Asfaltica');
  assert.equal(comoLoLlamabaElModal, 'imper_liquida'); // el bug, documentado
  // Y con el objeto, que es como se llama ahora, sale lo correcto:
  assert.notEqual(tipoSugeridoParaSistema({ nombre: 'Silicona Sobre Lona Asfaltica' }), comoLoLlamabaElModal);
});

// --- bordes --------------------------------------------------------------------------
caso('sin sistema cae en el default sin romperse', () => {
  assert.equal(tipoSugeridoParaSistema(null), 'imper_liquida');
  assert.equal(tipoSugeridoParaSistema({}), 'imper_liquida');
});

console.log(`\ngarantia-tipo-sistema: ${ok} ok, ${fallos.length} fallas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
