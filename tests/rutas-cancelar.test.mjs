import { puedeCancelarViaje, planCancelacionViaje, notaCancelacion, notaHechaDesdeOficina, filtrarViajes, viajesViejosSinCerrar, requisicionesMontadas } from '../lib/helpers/rutas.js';
import { tipoSugeridoParaSistema, getTipoGarantia } from '../lib/garantiasCatalogo.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };

const v = { id: 'v1', fecha: '2026-09-01', estado: 'planificado', notas: 'Salir temprano', paradas: [
  { id: 'p1', estado: 'completada', requisicionId: 'rq0' },
  { id: 'p2', estado: 'pendiente', requisicionId: 'rq1' },
  { id: 'p3', estado: 'pendiente', diligenciaId: 'd1' },
  { id: 'p4', estado: 'pendiente', requisicionId: 'rq1' },
  { id: 'p5', estado: 'cancelada', requisicionId: 'rq9' },
] };
const plan = planCancelacionViaje(v);
t('cancela solo pendientes', JSON.stringify(plan.paradasACancelar) === '["p2","p3","p4"]');
t('requisiciones únicas a devolver', JSON.stringify(plan.requisicionesADevolver) === '["rq1"]');
t('diligencias a devolver', JSON.stringify(plan.diligenciasADevolver) === '["d1"]');
t('viaje vacío', planCancelacionViaje({ paradas: [] }).paradasACancelar.length === 0);
t('puede cancelar planificado', puedeCancelarViaje(v));
t('puede cancelar en curso', puedeCancelarViaje({ estado: 'en_curso' }));
t('no cancela completado', !puedeCancelarViaje({ estado: 'completado' }));
t('no cancela cancelado', !puedeCancelarViaje({ estado: 'cancelado' }));

const n = notaCancelacion('Salir temprano', { motivo: '  nunca salió ', nombre: 'Erisdania', fechaISO: '2026-10-20T15:00:00Z' });
t('nota cancelación conserva previa', n.startsWith('Salir temprano\n'));
t('nota cancelación texto', n.endsWith('Cancelado el 2026-10-20 por Erisdania: nunca salió'));
t('nota cancelación sin previa', notaCancelacion('', { motivo: 'x' }) === 'Cancelado: x');
const nh = notaHechaDesdeOficina(null, { nombre: 'Erisdania', fechaISO: '2026-10-20T15:30:00Z' });
t('nota oficina', nh === 'Marcada hecha desde oficina por Erisdania (2026-10-20 15:30)');

const lista = [v, { id: 'v2', fecha: '2026-10-20', estado: 'cancelado', paradas: [{ requisicionId: 'rqX', estado: 'cancelada' }] }, { id: 'v3', fecha: '2026-09-02', estado: 'completado', paradas: [] }, { id: 'v4', fecha: '2026-10-20', estado: 'planificado', paradas: [] }];
t('activos sin cancelados', filtrarViajes(lista).map(x => x.id).join() === 'v1,v3,v4');
t('cancelados', filtrarViajes(lista, 'cancelados').map(x => x.id).join() === 'v2');
t('viejos sin cerrar', viajesViejosSinCerrar(lista, '2026-10-20').map(x => x.id).join() === 'v1');
const m = requisicionesMontadas(lista);
t('montadas ignora canceladas', m.has('rq0') && m.has('rq1') && !m.has('rq9') && !m.has('rqX'));

// Garantías: Silicona sobre Lona Asfáltica
t('sugiere silicona sobre lona por nombre', tipoSugeridoParaSistema({ nombre: 'Silicona Sobre Lona Asfaltica' }) === 'silicona_sobre_lona');
t('sugiere silicona sobre lona por id', tipoSugeridoParaSistema({ id: 's_1776642312281', nombre: 'X' }) === 'silicona_sobre_lona');
t('lona sola sigue membrana', tipoSugeridoParaSistema({ nombre: 'Lona asfáltica granulada' }) === 'imper_membrana');
const tg = getTipoGarantia('silicona_sobre_lona');
t('cobertura exacta', tg.cobertura === 'Reparación de membrana asfáltica, traslapes y terminaciones, lavado del techo, colocación de primer Bleed Blocker, sellado de puntos singulares y colocación de impermeabilización en silicona.');
t('condición exacta', tg.condicion === 'Vigente siempre que se realicen las inspecciones obligatorias cada 24 meses y no se evidencien roturas por golpes, perforaciones en el techo por trabajos, roturas por trabajos de plomería, electricidad u otros.');

console.log(`rutas-cancelar + garantía silicona: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
