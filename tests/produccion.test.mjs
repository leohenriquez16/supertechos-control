import { filasProduccion, resumenProduccionObra } from '../lib/helpers/produccion.js';
let ok = 0, ko = 0;
const t = (n, c, v) => { if (c) ok++; else { ko++; console.error('FALLA:', n, v ?? ''); } };
const near = (a, b) => Math.abs(a - b) < 0.01;
const sistemas = { s1: { id: 's1', precio_m2: 1000, tareas: [{ id: 't1', peso: 40 }, { id: 't2', peso: 60 }] } };
const area = { id: 'a1', m2: 100, sistemaId: 's1' };
const pSin = { id: 'p1', sistema: 's1', areas: [area] };                       // sin cotización
const pCot = { id: 'p2', sistema: 's1', areas: [area], valorCotizacion: 118000, itbisFactor: 1.18 }; // derivado 100k
const pExe = { id: 'p3', sistema: 's1', areas: [area], valorCotizacion: 100000, itbisFactor: 1 };
const rep = (id, pid, tarea, m2, fecha, extra = {}) => ({ id, proyectoId: pid, areaId: 'a1', tareaId: tarea, m2, fecha, ...extra });
let f = filasProduccion({ reportes: [rep('r1', 'p1', 't1', 50, '2026-10-01')], proyectos: [pSin], sistemas });
t('sin cotización: base sin ITBIS', near(f[0].rdSinItbis, 50 * 1000 * 0.4), f[0]?.rdSinItbis);
t('sin cotización: con = ×1.18', near(f[0].rdConItbis, 20000 * 1.18));
f = filasProduccion({ reportes: [rep('r1', 'p2', 't2', 100, '2026-10-01')], proyectos: [pCot], sistemas });
t('cotizada: con ITBIS escala a la cotización', near(f[0].rdConItbis, 60000 * 1.18), f[0]?.rdConItbis);
t('cotizada: sin ITBIS', near(f[0].rdSinItbis, 60000));
f = filasProduccion({ reportes: [rep('r1', 'p3', 't2', 100, '2026-10-01')], proyectos: [pExe], sistemas });
t('exenta: con = sin', near(f[0].rdConItbis, f[0].rdSinItbis));
f = filasProduccion({ reportes: [rep('r1', 'p1', 't1', 80, '2026-10-01'), rep('r2', 'p1', 't1', 50, '2026-10-02')], proyectos: [pSin], sistemas });
t('tope: el segundo reporte solo cuenta 20 m²', near(f[1].rdSinItbis, 20 * 1000 * 0.4), f[1]?.rdSinItbis);
f = filasProduccion({ reportes: [rep('r1', 'p1', 't1', 50, '2026-10-01', { reparacion: true })], proyectos: [pSin], sistemas });
t('retoque no suma', f.length === 0);
f = filasProduccion({ reportes: [rep('r1', 'p1', 't1', 50, '2026-10-01')], proyectos: [{ ...pSin, archivado: true }], sistemas });
t('archivada sí cuenta', f.length === 1);
const r = resumenProduccionObra(filasProduccion({ reportes: [rep('r1', 'p1', 't1', 10, '2026-10-06'), rep('r2', 'p1', 't2', 10, '2026-09-30')], proyectos: [pSin], sistemas }), 'p1', '2026-10-06');
t('resumen hoy/mes/total', near(r.hoy, 4000 * 1.18) && near(r.mes, 4000 * 1.18) && near(r.total, 10000 * 1.18), JSON.stringify(r));
console.log(`${ok} pasadas, ${ko} fallidas`); if (ko) process.exit(1);
