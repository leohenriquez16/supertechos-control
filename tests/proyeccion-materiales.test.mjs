// v8.74.11: la proyección de materiales NO se extrapola por avance (el material se despacha
// por adelantado). Caso real: Lona 4KG Mineral Gris, 980 m², avance 52%, 116 de 115.3 rollos.
import { calcRentabilidadObra } from '../lib/helpers/presupuestoObra.js';
let ok = 0, ko = 0;
const t = (n, c, v) => { if (c) ok++; else { ko++; console.error('FALLA:', n, v ?? ''); } };

const sistemas = { lona: { id: 'lona', tareas: [{ id: 'inst', peso: 100 }] } };
const proyecto = { id: 'p1', sistema: 'lona', areas: [{ id: 'a1', m2: 980, sistemaId: 'lona' }] };
const reportes = [{ proyectoId: 'p1', areaId: 'a1', tareaId: 'inst', m2: 509.6 }]; // 52%
const mk = (cantLona, cantPrimer) => ({
  partidas: [{
    id: 'pa', sistemaId: 'lona', m2: 980, venta: { totalRd: 725200 },
    costos: [
      { id: 'l1', tipo: 'material', nombre: 'Lona', materialId: 'lona', cantidad: 115.3, unidad: 'rollo', costoUnidad: 1664.09, totalRd: 191859.79 },
      { id: 'l2', tipo: 'material', nombre: 'Primer', materialId: 'primer', cantidad: 19.6, unidad: 'cubeta', costoUnidad: 2250, totalRd: 44100 },
    ],
  }],
  _envios: [{ proyectoId: 'p1', materialId: 'lona', cantidad: cantLona }, { proyectoId: 'p1', materialId: 'primer', cantidad: cantPrimer }],
});
const run = (a, b) => { const pr = mk(a, b);
  return calcRentabilidadObra({ presupuesto: pr, proyecto, sistemas, reportes, envios: pr._envios }); };

const r = run(116, 15);
const p = r.partidas[0];
const [lona, primer] = p.lineas;
t('avance 52%', Math.abs(p.avance - 0.52) < 1e-9, p.avance);
t('lona: proyección = despachado (no real/avance)', Math.abs(lona.proyeccion - 193034.44) < 0.01, lona.proyeccion);
t('lona: alerta sobre despacho 0.7', Math.abs(lona.sobreDespacho - 0.7) < 1e-9, lona.sobreDespacho);
t('primer: proyección = presupuesto (despachado por debajo)', primer.proyeccion === 44100, primer.proyeccion);
t('primer: sin alerta', primer.sobreDespacho === 0, primer.sobreDespacho);

// despacho muy por encima del presupuesto: la proyección sube sola con lo despachado
const r2 = run(140, 15).partidas[0].lineas[0];
t('lona 140 rollos: proyección = 140 × costo', Math.abs(r2.proyeccion - 140 * 1664.09) < 0.01, r2.proyeccion);
t('lona 140 rollos: alerta 24.7', Math.abs(r2.sobreDespacho - 24.7) < 1e-9, r2.sobreDespacho);

// nada despachado: proyección = presupuesto
const r3 = run(0, 0).partidas[0].lineas[0];
t('sin despacho: proyección = presupuesto', r3.proyeccion === 191859.79, r3.proyeccion);

console.log(`${ok} pasadas, ${ko} fallidas`); if (ko) process.exit(1);
