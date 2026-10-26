import { empresaProyecto, agruparOdooPorMes, ejecutadoPorMes, armarResumenMensual } from '../lib/helpers/resumenMensual.js';
let ok = 0, ko = 0;
const t = (n, c, v) => { if (c) ok++; else { ko++; console.error('FALLA:', n, v ?? ''); } };
t('PG → pg', empresaProyecto('PG-C1269') === 'pg');
t('ST y vacío → st', empresaProyecto('ST-C1') === 'st' && empresaProyecto(null) === 'st');
const meses = agruparOdooPorMes({
  aprobado: [{ fecha: '2026-01-05', empresa: 'st', monto: 100 }, { fecha: '2026-01-20', empresa: 'pg', monto: 50 }, { fecha: '2025-12-31', empresa: 'st', monto: 999 }],
  facturado: [{ fecha: '2026-01-10', empresa: 'st', monto: 80 }, { fecha: '2026-01-11', empresa: 'st', monto: -30 }, { fecha: '2026-05-02', empresa: 'pg', monto: 40 }],
}, 2026);
t('12 meses', meses.length === 12);
t('aprobado enero', meses[0].aprobado.st === 100 && meses[0].aprobado.pg === 50 && meses[0].aprobado.n === 2, JSON.stringify(meses[0]));
t('nota de crédito resta', meses[0].facturado.st === 50);
t('fuera del año no entra', meses.every(m => m.aprobado.st !== 1099));
const proyectos = [{ id: 'p1', referenciaOdoo: 'ST-C1' }, { id: 'p2', referenciaOdoo: 'PG-C2' }];
const filas = [{ fecha: '2026-05-03', proyectoId: 'p1', rdSinItbis: 70 }, { fecha: '2026-05-04', proyectoId: 'p2', rdSinItbis: 20 }, { fecha: '2026-05-05', proyectoId: 'p1', rdSinItbis: 1000, retro: true }, { fecha: '2025-05-05', proyectoId: 'p1', rdSinItbis: 5 }];
let ej = ejecutadoPorMes(filas, proyectos, 2026);
t('ejecutado sin retro', ej['2026-05'].st === 70 && ej['2026-05'].pg === 20, JSON.stringify(ej));
t('ejecutado con retro', ejecutadoPorMes(filas, proyectos, 2026, { incluirRetro: true })['2026-05'].st === 1070);
const r = armarResumenMensual(meses, ej, { anio: 2026, hastaMes: '2026-10' });
t('hasta octubre', r.filas.length === 10 && r.filas[9].mes === '2026-10');
const may = r.filas[4];
t('diferencia mayo = ejecutado − facturado', may.ejecutado.total === 90 && may.facturado.total === 40 && may.diferencia === 50);
t('totales', r.totales.aprobado.total === 150 && r.totales.aprobado.n === 2 && r.totales.facturado.total === 90 && r.totales.ejecutado.total === 90 && r.totales.diferencia === 0, JSON.stringify(r.totales));
console.log(`resumen-mensual: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
