// tests/estampar-oc.test.mjs — v8.59.3 · Geometría de la firma y el sello en la OC.
// Coordenadas reales de la OC 4500142510 (A4, 842 pt de alto; pdftotext -bbox, pasadas a PDF):
//   "RECIBO PEDIDO"     base y = 842 - 792.5 = 49.5
//   "PROVEEDOR/VENDOR"  x = 131.6, w = 65.6, base y = 842 - 828.5 = 13.5, h = 5.5
//   "AUTORIZO"          x = 300.5 (no se puede invadir)
import assert from 'node:assert/strict';
import { posicionFirma } from '../lib/helpers/estamparOC.js';

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

const etiqueta = { x: 131.6, y: 13.5, w: 65.6, h: 5.5 };
const titulo = { y: 49.5 };
const firma = { w: 330, h: 110 };

caso('la firma queda entre el título y la línea del proveedor', () => {
  const p = posicionFirma({ etiqueta, titulo, firma });
  assert.ok(p.firma.y >= etiqueta.y + etiqueta.h, 'pisa la etiqueta');
  assert.ok(p.firma.y + p.firma.h <= titulo.y, 'pisa el título');
});
caso('la firma queda centrada sobre "PROVEEDOR/VENDOR"', () => {
  const p = posicionFirma({ etiqueta, titulo, firma });
  const centro = p.firma.x + p.firma.w / 2;
  assert.ok(Math.abs(centro - (etiqueta.x + etiqueta.w / 2)) < 0.5);
});
caso('ni la firma ni el sello invaden el recuadro del gerente (AUTORIZO)', () => {
  const p = posicionFirma({ etiqueta, titulo, firma });
  assert.ok(p.firma.x + p.firma.w < 300.5);
  assert.ok(p.sello.x + p.sello.w < 300.5);
});
caso('nada se sale de la página por abajo', () => {
  const p = posicionFirma({ etiqueta, titulo, firma });
  assert.ok(p.firma.y > 0 && p.sello.y > 0);
});
caso('si no se encuentra el título, la firma igual cabe encima de la etiqueta', () => {
  const p = posicionFirma({ etiqueta, titulo: null, firma });
  assert.ok(p.firma.h >= 16 && p.firma.y >= etiqueta.y + etiqueta.h);
});
caso('una firma muy ancha se achica sin deformarse', () => {
  const p = posicionFirma({ etiqueta, titulo, firma: { w: 2000, h: 100 } });
  assert.ok(Math.abs(p.firma.w / p.firma.h - 20) < 0.01);
  assert.ok(p.firma.w <= Math.max(80, etiqueta.w * 1.6) + 0.01);
});

caso('el sello no cruza el borde de abajo del recuadro', () => {
  const p = posicionFirma({ etiqueta, titulo, firma });
  assert.ok(p.sello.y >= etiqueta.y);
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
