// tests de lib/helpers/excesoM2.js (v8.77: metros ejecutados de más vs contratado)
import {
  excesoDeArea, excesoDeProyecto, duplicadosDeReportes, reporteParecido, lineasOcDesdeExceso,
  congelarM2Cotizado, puedeGestionarOC, precioM2Area, TOLERANCIA_EXCESO,
} from '../lib/helpers/excesoM2.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const cerca = (a, b, e = 0.01) => Math.abs(a - b) <= e;

const sis = { id: 's1', precio_m2: 1000, tareas: [
  { id: 'lona', nombre: 'Lona', peso: 60, reporta: 'rollos' },
  { id: 'top', nombre: 'Topcoat', peso: 40 },
] };
const area = { id: 'a1', nombre: 'Techo', m2: 150, sistemaId: 's1' };
const R = (tarea, m2, fecha = '2026-11-25', extra = {}) => ({ proyectoId: 'p1', areaId: 'a1', tareaId: tarea, m2, fecha, ...extra });

// --- sin exceso ---
let e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 150), R('top', 150)] });
t('exacto = ok', e.estado === 'ok' && e.m2Exceso === 0 && e.rdSinOc === 0);

// --- 180 en ambas tareas, después del corte: 30 m² sin OC ---
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 100), R('lona', 80), R('top', 180)] });
t('exceso 30 m2', cerca(e.m2Exceso, 30) && cerca(e.m2SinOc, 30) && e.estado === 'sin_oc');
t('rd al precio del sistema', cerca(e.rdSinOc, 30000));
t('pct 20%', cerca(e.pct, 0.2));
t('maxTarea', e.maxTarea.m2 === 180);

// --- solo lona pasada: pondera por peso (60%) ---
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 180), R('top', 100)] });
t('ponderado por peso', cerca(e.m2Exceso, 18) && cerca(e.rdSinOc, 18000));

// --- tolerancia 5% ---
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 157), R('top', 157)] });
t('4.7% dentro de tolerancia', e.estado === 'tolerancia' && e.rdSinOc === 0 && e.m2Exceso > 0);
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 159), R('top', 159)] });
t('6% se cobra completo', e.estado === 'sin_oc' && cerca(e.m2SinOc, 9));
t('tolerancia es 5%', TOLERANCIA_EXCESO === 0.05);

// --- antes del corte = perdido ---
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 180, '2026-10-01'), R('top', 180, '2026-10-02')] });
t('todo antes del corte = perdido', e.estado === 'perdido' && e.rdSinOc === 0 && cerca(e.rdPerdido, 30000));
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 170, '2026-10-01'), R('lona', 20), R('top', 190)] });
// lona: total 190 (exc 40), previo 170 (exc 20) · top: total 190 (exc 40), previo 0
// total pond = 40 ; previo pond = 20*0.6 = 12 ; nuevo = 28
t('mezcla: solo lo nuevo se cobra', cerca(e.m2Nuevo, 28) && cerca(e.m2SinOc, 28) && cerca(e.m2Perdido, 12));

// --- retoques, rechazados y excluidos de nómina no cuentan ---
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 150), R('top', 150), R('top', 30, '2026-11-25', { reparacion: true }), R('lona', 30, '2026-11-25', { atrasoEstado: 'rechazado' }), R('top', 30, '2026-11-25', { excluirNomina: true })] });
t('filtros', e.estado === 'ok');

// --- rollos ---
e = excesoDeArea({ area, sistema: sis, reportes: [{ proyectoId: 'p1', areaId: 'a1', tareaId: 'lona', rollos: 20, fecha: '2026-11-25' }, R('top', 170)] });
t('rollos x 8.5', e.maxTarea.m2 === 170 && cerca(e.m2Exceso, 20 * 0.6 + 20 * 0.4));

// --- órdenes de cambio abiertas cubren el exceso ---
const ocB = { proyectoId: 'p1', estado: 'borrador', lineas: [{ areaId: 'a1', m2: 20 }] };
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 180), R('top', 180)], ordenesCambio: [ocB] });
t('OC cubre parte', cerca(e.m2ConOc, 20) && cerca(e.m2SinOc, 10) && e.estado === 'sin_oc');
const ocB2 = { ...ocB, lineas: [{ areaId: 'a1', m2: 40 }] };
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 180), R('top', 180)], ordenesCambio: [ocB2] });
t('OC cubre todo', e.estado === 'con_oc' && e.m2SinOc === 0 && cerca(e.rdConOc, 30000));
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 180), R('top', 180)], ordenesCambio: [{ ...ocB2, estado: 'rechazada' }] });
t('OC rechazada no cubre', e.estado === 'sin_oc');

// --- OC aplicada sube el área: ya no hay exceso; ajuste manual 0 ---
const areaAplicada = { ...area, m2: 180, m2Cotizado: 150 };
const ocAp = { proyectoId: 'p1', estado: 'aplicada', lineas: [{ areaId: 'a1', m2: 30 }] };
e = excesoDeArea({ area: areaAplicada, sistema: sis, reportes: [R('lona', 180), R('top', 180)], ordenesCambio: [ocAp] });
t('OC aplicada: ok y sin ajuste manual', e.estado === 'ok' && e.ajusteManual === 0);
// --- subido a mano sin OC ---
e = excesoDeArea({ area: areaAplicada, sistema: sis, reportes: [R('lona', 180), R('top', 180)] });
t('ajuste manual detectado', e.ajusteManual === 30);
t('sin m2Cotizado no hay ajuste', excesoDeArea({ area, sistema: sis, reportes: [] }).ajusteManual === 0);

// --- precio propio del área ---
t('precio del área', precioM2Area({ precioVentaM2: 1200 }, sis) === 1200);
t('precio vacío = sistema', precioM2Area({ precioVentaM2: '' }, sis) === 1000);
e = excesoDeArea({ area: { ...area, precioVentaM2: 1200 }, sistema: sis, reportes: [R('lona', 180), R('top', 180)] });
t('rd con precio del área', cerca(e.rdSinOc, 36000));

// --- tareas por unidades no cuentan ---
const sisU = { ...sis, tareas: [...sis.tareas, { id: 'u', nombre: 'Drenajes', peso: 0, reporta: 'unidades' }] };
e = excesoDeArea({ area, sistema: sisU, reportes: [R('lona', 150), R('top', 150), R('u', 999)] });
t('unidades fuera', e.estado === 'ok');

// --- duplicados ---
const dups = duplicadosDeReportes([R('lona', 100), R('lona', 100.5), R('lona', 50), R('top', 100), R('lona', 100, '2026-11-26')], sis);
t('1 duplicado mismo día', dups.length === 1);
t('reporteParecido', !!reporteParecido([R('lona', 100)], { proyectoId: 'p1', areaId: 'a1', tareaId: 'lona', fecha: '2026-11-25', m2: 100.4 }));
t('reporteParecido otro día no', !reporteParecido([R('lona', 100)], { proyectoId: 'p1', areaId: 'a1', tareaId: 'lona', fecha: '2026-11-26', m2: 100 }));
t('reporteParecido m2 distinto no', !reporteParecido([R('lona', 100)], { proyectoId: 'p1', areaId: 'a1', tareaId: 'lona', fecha: '2026-11-25', m2: 90 }));
t('reporteParecido ignora excluidos', !reporteParecido([R('lona', 100, '2026-11-25', { excluirNomina: true })], { proyectoId: 'p1', areaId: 'a1', tareaId: 'lona', fecha: '2026-11-25', m2: 100 }));

// --- proyecto ---
const proy = { id: 'p1', sistema: 's1', areas: [area, { id: 'a2', nombre: 'Losa', m2: 100, sistemaId: 's1' }] };
const reps = [R('lona', 180), R('top', 180),
  { proyectoId: 'p1', areaId: 'a2', tareaId: 'lona', m2: 100, fecha: '2026-11-25' },
  { proyectoId: 'p1', areaId: 'a2', tareaId: 'top', m2: 100, fecha: '2026-11-25' },
  { proyectoId: 'p2', areaId: 'a1', tareaId: 'lona', m2: 999, fecha: '2026-11-25' }];
const ex = excesoDeProyecto({ proyecto: proy, sistemas: { s1: sis }, reportes: reps });
t('proyecto: solo áreas con algo', ex.areas.length === 1 && ex.areas[0].areaId === 'a1');
t('proyecto: total', cerca(ex.rdSinOc, 30000) && ex.hayExceso);
t('proyecto: otro proyecto no cuenta', cerca(ex.m2SinOc, 30));
const lineas = lineasOcDesdeExceso(ex);
t('líneas OC', lineas.length === 1 && lineas[0].m2 === 30 && lineas[0].precioM2 === 1000 && lineas[0].monto === 30000);
t('sin sistema no revienta', excesoDeProyecto({ proyecto: { id: 'p9', areas: [area] }, sistemas: {}, reportes: [] }).areas.length === 0);

// --- congelar m² cotizado ---
let c = congelarM2Cotizado([{ id: 'a1', m2: 180 }], [{ id: 'a1', m2: 150 }]);
t('congela el m2 anterior', c[0].m2Cotizado === 150 && c[0].m2 === 180);
c = congelarM2Cotizado([{ id: 'a1', m2: 200, m2Cotizado: 150 }], [{ id: 'a1', m2: 180, m2Cotizado: 150 }]);
t('no lo vuelve a mover', c[0].m2Cotizado === 150);
c = congelarM2Cotizado([{ id: 'a1', m2: 200 }], [{ id: 'a1', m2: 180, m2Cotizado: 150 }]);
t('conserva el congelado aunque el form lo pierda', c[0].m2Cotizado === 150);
c = congelarM2Cotizado([{ id: 'n', m2: 80 }], []);
t('área nueva', c[0].m2Cotizado === 80);
c = congelarM2Cotizado([{ id: 'n', m2: 30, m2Cotizado: 0 }], []);
t('área de OC queda en 0', c[0].m2Cotizado === 0);

// --- permisos ---
t('owner', puedeGestionarOC({ roles: ['admin', 'owner'] }));
t('rol ordenes_cambio', puedeGestionarOC({ roles: ['admin', 'ordenes_cambio'] }));
t('admin solo no', !puedeGestionarOC({ roles: ['admin'] }));
t('sin usuario', !puedeGestionarOC(null));

console.log(`excesoM2: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
