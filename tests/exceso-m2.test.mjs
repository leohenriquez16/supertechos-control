// tests de lib/helpers/excesoM2.js (v8.77: metros ejecutados de más vs contratado)
import {
  excesoDeArea, excesoDeProyecto, duplicadosDeReportes, reporteParecido, lineasOcDesdeExceso,
  congelarM2Cotizado, puedeGestionarOC, precioM2Area, TOLERANCIA_EXCESO, ventaOcPosteriores, lineasOcDesdeFaltante,
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

// --- solo lona pasada: m² físicos (la tarea que más lleva) ---
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 180), R('top', 100)] });
t('físico por la tarea mayor', cerca(e.m2Exceso, 30) && cerca(e.rdSinOc, 30000) && e.maxTarea.tareaId === 'lona');

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
// máx previo 170 → perdido 20 ; ejecutado 190 → exceso 40 ; nuevo 20
t('mezcla: solo lo nuevo se cobra', cerca(e.m2Nuevo, 20) && cerca(e.m2SinOc, 20) && cerca(e.m2Perdido, 20));

// --- retoques, rechazados y excluidos de nómina no cuentan ---
e = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 150), R('top', 150), R('top', 30, '2026-11-25', { reparacion: true }), R('lona', 30, '2026-11-25', { atrasoEstado: 'rechazado' }), R('top', 30, '2026-11-25', { excluirNomina: true })] });
t('filtros', e.estado === 'ok');

// --- rollos ---
e = excesoDeArea({ area, sistema: sis, reportes: [{ proyectoId: 'p1', areaId: 'a1', tareaId: 'lona', rollos: 20, fecha: '2026-11-25' }, R('top', 170)] });
t('rollos x 8.5', e.maxTarea.m2 === 170 && cerca(e.m2Exceso, 20));

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

// --- revisión: aplicar la OC no revive lo perdido ---
{
  const a100 = { id: 'a1', nombre: 'Techo', m2: 100, sistemaId: 's1' };
  const reps = [R('lona', 120, '2026-10-01'), R('top', 120, '2026-10-01'), R('lona', 30), R('top', 30)];
  let x = excesoDeArea({ area: a100, sistema: sis, reportes: reps });
  t('antes de OC: perdido 20, nuevo 30', cerca(x.m2Perdido, 20) && cerca(x.m2SinOc, 30));
  const oc = { proyectoId: 'p1', estado: 'aplicada', aplicadaAt: '2026-11-25T10:00:00Z', lineas: [{ areaId: 'a1', m2: 30 }] };
  x = excesoDeArea({ area: { ...a100, m2: 130 }, sistema: sis, reportes: reps, ordenesCambio: [oc] });
  t('después de OC: nada por cobrar', x.m2SinOc === 0 && x.rdSinOc === 0 && x.estado !== 'sin_oc');
  t('después de OC: lo perdido sigue perdido', cerca(x.m2Perdido, 20) || x.estado === 'perdido');
}
// --- revisión: OC del exceso no genera otra (sin bucle) ---
{
  const reps = [R('lona', 300), R('top', 150)];
  let x = excesoDeArea({ area, sistema: sis, reportes: reps });
  t('exceso físico 150', cerca(x.m2SinOc, 150));
  const oc = { proyectoId: 'p1', estado: 'aplicada', aplicadaAt: '2026-11-25T10:00:00Z', lineas: [{ areaId: 'a1', m2: 150 }] };
  x = excesoDeArea({ area: { ...area, m2: 300 }, sistema: sis, reportes: reps, ordenesCambio: [oc] });
  t('tras aplicarla, 0', x.m2SinOc === 0 && x.estado === 'ok');
}
// --- área nacida de OC no es ajuste manual ---
t('área de OC sin ajuste', excesoDeArea({ area: { id: 'n', m2: 50, m2Cotizado: 0, origenOc: 'oc1', sistemaId: 's1' }, sistema: sis, reportes: [] }).ajusteManual === 0);
// --- área con 0 m² y avances ---
t('sin m2 con avances', excesoDeArea({ area: { id: 'a1', m2: 0, sistemaId: 's1' }, sistema: sis, reportes: [R('lona', 40)] }).estado === 'sin_m2');
// --- tolerancia solo sobre lo nuevo ---
{
  const reps = [R('lona', 104.9 * 1.5, '2026-10-01'), R('top', 157, '2026-10-01'), R('lona', 1), R('top', 1)];
  const x = excesoDeArea({ area, sistema: sis, reportes: reps });
  t('poquito nuevo sobre viejo = tolerancia', x.estado === 'tolerancia' && x.rdSinOc === 0);
}
// --- venta de OCs aplicadas después del presupuesto ---
t('venta OC posterior', ventaOcPosteriores([
  { proyectoId: 'p1', estado: 'aplicada', aplicadaAt: '2026-12-01T00:00:00Z', montoTotal: 30000 },
  { proyectoId: 'p1', estado: 'aplicada', aplicadaAt: '2026-10-01T00:00:00Z', montoTotal: 5000 },
  { proyectoId: 'p1', estado: 'enviada', montoTotal: 7000 },
  { proyectoId: 'p2', estado: 'aplicada', aplicadaAt: '2026-12-01T00:00:00Z', montoTotal: 9000 },
], 'p1', { createdAt: '2026-11-01T00:00:00Z' }) === 30000);

// --- metros de menos ---
{
  const reps = [R('lona', 130), R('top', 130)];
  let x = excesoDeArea({ area, sistema: sis, reportes: reps });
  t('obra en curso con menos: ok', x.estado === 'ok' && x.m2Faltante === 0);
  x = excesoDeArea({ area, sistema: sis, reportes: reps, terminada: true });
  t('terminada con 20 menos', x.estado === 'de_menos' && cerca(x.m2MenosSinOc, 20) && cerca(x.rdMenosSinOc, 20000));
  x = excesoDeArea({ area, sistema: sis, reportes: [R('lona', 145), R('top', 145)], terminada: true });
  t('3.3% de menos = tolerancia', x.estado === 'ok' && x.rdMenosSinOc === 0);
  const ocR = { proyectoId: 'p1', estado: 'enviada', lineas: [{ areaId: 'a1', m2: -20 }] };
  x = excesoDeArea({ area, sistema: sis, reportes: reps, terminada: true, ordenesCambio: [ocR] });
  t('rebaja en trámite', x.estado === 'de_menos_oc' && x.m2MenosSinOc === 0 && cerca(x.rdMenosConOc, 20000));
  const ocRA = { ...ocR, estado: 'aplicada', aplicadaAt: '2026-11-25T00:00:00Z' };
  x = excesoDeArea({ area: { ...area, m2: 130, m2Cotizado: 150 }, sistema: sis, reportes: reps, terminada: true, ordenesCambio: [ocRA] });
  t('rebaja aplicada: ok y sin ajuste', x.estado === 'ok' && x.ajusteManual === 0);
  t('rebaja no cuenta como exceso', x.m2SinOc === 0);
  const pr = { id: 'p1', sistema: 's1', estado: 'finalizado_no_entregado', areas: [area] };
  const ex = excesoDeProyecto({ proyecto: pr, sistemas: { s1: sis }, reportes: reps });
  t('obra finalizada → de menos', ex.hayMenos && cerca(ex.rdMenosSinOc, 20000) && ex.pideAccion);
  const exF = excesoDeProyecto({ proyecto: { ...pr, estado: 'facturado' }, sistemas: { s1: sis }, reportes: reps });
  t('facturada no se marca', !exF.hayMenos);
  const exA = excesoDeProyecto({ proyecto: { ...pr, estado: 'en_ejecucion' }, sistemas: { s1: sis }, reportes: reps, estadosArea: [{ proyectoId: 'p1', areaId: 'a1', estado: 'completada' }] });
  t('área completada → de menos', exA.hayMenos);
  const lr = lineasOcDesdeFaltante(ex);
  t('líneas de rebaja negativas', lr.length === 1 && lr[0].m2 === -20 && lr[0].monto === -20000);
}
// --- 2da revisión ---
t('área de OC: tolerancia sobre lo contratado', excesoDeArea({ area: { id: 'a1', m2: 100, origenOc: 'x', m2Cotizado: 0, sistemaId: 's1' }, sistema: sis,
  reportes: [R('lona', 103), R('top', 103)], ordenesCambio: [{ proyectoId: 'p1', estado: 'aplicada', aplicadaAt: '2026-11-25T00:00:00Z', lineas: [{ areaId: 'a1', m2: 100 }] }] }).estado === 'tolerancia');
{
  const x = excesoDeArea({ area: { id: 'a1', m2: 0, sistemaId: 's1' }, sistema: sis, reportes: [R('lona', 50)] });
  t('sin m2: sin monto', x.estado === 'sin_m2' && x.rdSinOc === 0);
  t('sin m2 pide acción', excesoDeProyecto({ proyecto: { id: 'p1', areas: [{ id: 'a1', m2: 0, sistemaId: 's1' }] }, sistemas: { s1: sis }, reportes: [R('lona', 50)] }).pideAccion);
}
t('clon conserva foto de venta', ventaOcPosteriores([{ proyectoId: 'p1', estado: 'aplicada', aplicadaAt: '2026-11-26T00:00:00Z', montoTotal: 100000 }], 'p1',
  { createdAt: '2026-11-30T00:00:00Z', venta: { fotoAt: '2026-10-01T00:00:00Z' } }) === 100000);

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
