import { esCampana, sinCampanas, hoyRD, sumarDias, lunesDe, diaCorto, estadoOficina, levantada, atrasada, accionTecnico, puedeAbrirOficina, planAsignacion, oficinasDeHoy, avancePorZona, agendaSemana, cargaDelDia, bandejaAtencion, totalAtencion, colorTecnico, coincideBusqueda, labelNoPudo, MOTIVOS_NO_PUDO, ESTADO_OFICINA } from '../lib/helpers/coordinacion.js';
import { readFileSync } from 'fs';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const S = (o) => ({ id: o.id || 'x', survey_status: 'pending', ...o });

// --- campaña aparte
t('esCampana', esCampana({ es_campana: true }) && !esCampana({}) && !esCampana(null));
t('sinCampanas por marca y por ids', sinCampanas([{ id: 'a' }, { id: 'b', es_campana: true }, { id: 'c' }], new Set(['c'])).map(p => p.id).join() === 'a' && sinCampanas(null).length === 0);

// --- fechas RD
t('hoyRD: 23:30 en RD (03:30Z del día siguiente) sigue siendo el día de RD', hoyRD(new Date('2026-11-21T03:30:00Z')) === '2026-11-20');
t('hoyRD: mediodía', hoyRD(new Date('2026-11-20T16:00:00Z')) === '2026-11-20');
t('sumarDias cruza fin de mes y de año', sumarDias('2026-11-30', 1) === '2026-12-01' && sumarDias('2026-12-31', 1) === '2027-01-01' && sumarDias('2027-01-01', -1) === '2026-12-31');
t('lunesDe: viernes, lunes y domingo', lunesDe('2026-11-20') === '2026-11-16' && lunesDe('2026-11-16') === '2026-11-16' && lunesDe('2026-11-22') === '2026-11-16');
t('diaCorto', diaCorto('2026-11-20') === 'Vie 20');

// --- estado de la oficina
t('sin técnico: sin asignar', estadoOficina(S({})) === 'sin_asignar');
t('técnico y día: programada', estadoOficina(S({ survey_status: 'coordinated', asignado_a_id: 'p1', visita_fecha: '2026-11-21' })) === 'programada');
t('confirmada con la oficina', estadoOficina(S({ survey_status: 'confirmed', asignado_a_id: 'p1', visita_fecha: '2026-11-21', cita_confirmada: true })) === 'confirmada');
t('en proceso', estadoOficina(S({ survey_status: 'in_progress', asignado_a_id: 'p1' })) === 'en_sitio');
t('cerrada por el técnico: por revisar', estadoOficina(S({ survey_status: 'completed' })) === 'por_revisar');
t('validada', estadoOficina(S({ survey_status: 'validated' })) === 'validada');
t('falta info (jardín o techo pendiente)', estadoOficina(S({ survey_status: 'missing_info' })) === 'falta_info');
t('devuelta por Edwin/Leo', estadoOficina(S({ survey_status: 'missing_info', devuelto_at: '2026-11-20T10:00:00Z' })) === 'devuelta');
t('no se pudo (sigue abierta)', estadoOficina(S({ survey_status: 'coordinated', asignado_a_id: 'p1', visita_fecha: '2026-11-20', no_pudo_at: 'x' })) === 'no_pudo');
t('no se pudo pero ya está en proceso: en proceso', estadoOficina(S({ survey_status: 'in_progress', no_pudo_at: 'x' })) === 'en_sitio');
t('todo estado tiene etiqueta y color', ['sin_asignar', 'programada', 'confirmada', 'no_pudo', 'en_sitio', 'falta_info', 'devuelta', 'por_revisar', 'validada'].every(k => ESTADO_OFICINA[k]?.label && ESTADO_OFICINA[k]?.color));
t('levantada = por revisar o validada', levantada(S({ survey_status: 'completed' })) && levantada(S({ survey_status: 'validated' })) && !levantada(S({ survey_status: 'missing_info' })));

// --- atrasadas
const hoy = '2026-11-20';
t('día pasado sin levantar: atrasada', atrasada(S({ survey_status: 'coordinated', asignado_a_id: 'p', visita_fecha: '2026-11-19' }), hoy));
t('hoy no está atrasada', !atrasada(S({ survey_status: 'coordinated', asignado_a_id: 'p', visita_fecha: hoy }), hoy));
t('levantada o falta info no cuentan como atrasada', !atrasada(S({ survey_status: 'completed', visita_fecha: '2026-11-01' }), hoy) && !atrasada(S({ survey_status: 'missing_info', visita_fecha: '2026-11-01' }), hoy));

// --- botón del técnico
t('acción: Iniciar / Seguir / Corregir / Ver', accionTecnico(S({ survey_status: 'coordinated', asignado_a_id: 'p', visita_fecha: hoy })).label === 'Iniciar'
  && accionTecnico(S({ survey_status: 'in_progress' })).label === 'Seguir' && accionTecnico(S({ survey_status: 'missing_info' })).label === 'Seguir'
  && accionTecnico(S({ survey_status: 'missing_info', devuelto_at: 'x' })).label === 'Corregir' && accionTecnico(S({ survey_status: 'validated' })).label === 'Ver');
t('quién abre: su técnico, admin y owner sí; otro técnico no', puedeAbrirOficina({ asignado_a_id: 'p1' }, { id: 'p1', roles: ['supervisor'] })
  && !puedeAbrirOficina({ asignado_a_id: 'p1' }, { id: 'p2', roles: ['supervisor'] }) && puedeAbrirOficina({}, { id: 'z', roles: ['admin'] })
  && puedeAbrirOficina({}, { id: 'z', roles: ['owner'] }) && !puedeAbrirOficina({}, null) && !puedeAbrirOficina({ asignado_a_id: null }, { id: null, roles: [] }));

// --- asignar y programar en lote
{
  const ofs = [S({ id: 'a' }), S({ id: 'b', survey_status: 'confirmed' }), S({ id: 'c', survey_status: 'in_progress' }), S({ id: 'd', survey_status: 'completed' }), S({ id: 'e', survey_status: 'validated' }), S({ id: 'f', survey_status: 'in_route' })];
  const p = planAsignacion(ofs, { personaId: 'p1', nombre: 'Osman', fecha: '2026-11-24', franja: 'manana', por: 'Edwin', ahora: 'T' });
  t('asignar: todas reciben técnico y día', p.ids.length === 6 && p.campos.asignado_a_id === 'p1' && p.campos.visita_fecha === '2026-11-24' && p.campos.visita_franja === 'manana');
  t('asignar: solo las aún no levantadas pasan a programada', p.idsAEstado.coordinated.join() === 'a,b,f');
  t('asignar: limpia «no pude» y la confirmación', p.campos.no_pudo_at === null && p.campos.cita_confirmada === false);
  const q = planAsignacion(ofs, { personaId: null, por: 'Edwin' });
  t('quitar asignación: las abiertas vuelven a pendiente, sin técnico ni día', q.campos.asignado_a_id === null && q.campos.visita_fecha === null && q.idsAEstado.pending.join() === 'a,b,f' && !q.idsAEstado.coordinated);
}

// --- mis oficinas de hoy
{
  const ofs = [
    S({ id: '1', name: 'B', asignado_a_id: 'yo', visita_fecha: hoy, visita_franja: 'tarde', survey_status: 'coordinated' }),
    S({ id: '2', name: 'A', asignado_a_id: 'yo', visita_fecha: hoy, visita_franja: 'tarde', survey_status: 'coordinated' }),
    S({ id: '3', name: 'Z', asignado_a_id: 'yo', visita_fecha: hoy, visita_franja: 'manana', survey_status: 'confirmed' }),
    S({ id: '4', asignado_a_id: 'otro', visita_fecha: hoy, survey_status: 'coordinated' }),
    S({ id: '5', asignado_a_id: 'yo', visita_fecha: '2026-11-18', survey_status: 'coordinated' }),
    S({ id: '6', asignado_a_id: 'yo', visita_fecha: '2026-11-17', survey_status: 'completed' }),
    S({ id: '7', asignado_a_id: 'yo', visita_fecha: '2026-11-10', survey_status: 'missing_info', devuelto_at: 'x' }),
    S({ id: '8', asignado_a_id: 'yo', visita_fecha: hoy, survey_status: 'completed' }),
    S({ id: '9', asignado_a_id: 'yo', visita_fecha: '2026-11-15', survey_status: 'missing_info' }),
  ];
  const m = oficinasDeHoy(ofs, 'yo', hoy);
  t('hoy: solo las mías, mañana antes que tarde y por nombre, sin las ya levantadas', m.hoy.map(s => s.id).join() === '3,2,1');
  t('atrasadas: días anteriores sin levantar', m.atrasadas.map(s => s.id).join() === '5');
  t('para completar o corregir: devueltas y con algo pendiente (falta info), sin importar el día', m.corregir.map(s => s.id).sort().join() === '7,9');
  const fut = oficinasDeHoy([S({ id: 'b', asignado_a_id: 'yo', visita_fecha: sumarDias(hoy, 3) }), S({ id: 'a', asignado_a_id: 'yo', visita_fecha: sumarDias(hoy, 1) }),
    S({ id: 'c', asignado_a_id: 'otro', visita_fecha: sumarDias(hoy, 1) }), S({ id: 'd', asignado_a_id: 'yo', visita_fecha: sumarDias(hoy, 2), survey_status: 'completed' })], 'yo', hoy);
  t('próximas: solo mías, después de hoy, sin levantar, por fecha', fut.proximas.map(s => s.id).join() === 'a,b');
}

// --- avance por zona
{
  const ofs = [S({ zona: 'Norte', survey_status: 'validated', asignado_a_id: 'p' }), S({ zona: 'Norte', survey_status: 'completed', asignado_a_id: 'p' }), S({ zona: 'Este' }), S({ survey_status: 'missing_info' })];
  const a = avancePorZona(ofs);
  t('zonas ordenadas y «Sin zona»', a.zonas.map(z => z.zona).join() === 'Este,Norte,Sin zona');
  t('sumas por zona = total', a.zonas.reduce((s, z) => s + z.total, 0) === a.total.total && a.total.total === 4);
  t('avance = levantadas / total', a.zonas.find(z => z.zona === 'Norte').pct === 100 && a.total.pct === 50 && a.total.validadas === 1 && a.total.faltaInfo === 1 && a.total.asignadas === 2);
}

// --- agenda semanal
{
  const lunes = '2026-11-16';
  const ofs = [S({ id: 'a', asignado_a_id: 'p1', visita_fecha: '2026-11-17', visita_franja: 'manana' }), S({ id: 'b', asignado_a_id: 'p1', visita_fecha: '2026-11-17', visita_franja: 'tarde' }),
    S({ id: 'c', asignado_a_id: 'p9', asignado_a_nombre: 'Fuera del equipo', visita_fecha: '2026-11-21' }), S({ id: 'd', asignado_a_id: 'p1', visita_fecha: '2026-11-23' })];
  const ag = agendaSemana(ofs, [{ id: 'p1', nombre: 'Osman' }, { id: 'p2', nombre: 'Wilfin' }], lunes);
  t('lunes a sábado', ag.dias.join() === '2026-11-16,2026-11-17,2026-11-18,2026-11-19,2026-11-20,2026-11-21');
  const p1 = ag.filas.find(f => f.tecnico.id === 'p1');
  t('cada oficina en su celda técnico/día/franja', p1.dias[1].manana.map(s => s.id).join() === 'a' && p1.dias[1].tarde.map(s => s.id).join() === 'b');
  t('la semana siguiente no entra', p1.dias.every(d => ![...d.manana, ...d.tarde].some(s => s.id === 'd')));
  t('técnico fuera del equipo con oficinas aparece en la agenda', ag.filas.some(f => f.tecnico.id === 'p9' && f.dias[5].manana.length === 1));
  t('carga del día', cargaDelDia(ofs, 'p1', '2026-11-17') === 2);
}

// --- bandeja de atención
{
  const ofs = [S({ id: 'a', asignado_a_id: 'p', visita_fecha: '2026-11-18', survey_status: 'coordinated', latitude: 1, longitude: 1 }),
    S({ id: 'b', no_pudo_at: 'x', asignado_a_id: 'p', visita_fecha: '2026-11-18', survey_status: 'coordinated', latitude: 1, longitude: 1 }),
    S({ id: 'c', survey_status: 'missing_info', latitude: 1, longitude: 1 }), S({ id: 'd', survey_status: 'missing_info', devuelto_at: 'x', latitude: 1, longitude: 1 }), S({ id: 'e' })];
  const b = bandejaAtencion(ofs, hoy);
  t('atención: atrasadas, no pude, falta info, devueltas, sin ubicación', b.atrasadas.map(s => s.id).join() === 'a' && b.noPudo.map(s => s.id).join() === 'b' && b.faltaInfo.map(s => s.id).join() === 'c' && b.devueltas.map(s => s.id).join() === 'd' && b.sinUbicacion.map(s => s.id).join() === 'e');
  t('total de atención', totalAtencion(b) === 5);
}

// --- varios
t('color por técnico estable y gris sin técnico', colorTecnico('p1', [{ id: 'p1' }]) === colorTecnico('p1', [{ id: 'p1' }]) && colorTecnico(null, []) === '#71717a' && colorTecnico('zz', []).startsWith('#'));
t('búsqueda sin tildes por código, nombre o técnico', coincideBusqueda({ external_code: '249', name: 'Núñez de Cáceres' }, 'nunez de caceres') && coincideBusqueda({ name: 'x', asignado_a_nombre: 'Osman Linares' }, 'osman') && !coincideBusqueda({ name: 'x' }, 'y') && coincideBusqueda({}, ''));
t('motivos de «no pude» con etiqueta', MOTIVOS_NO_PUDO.every(m => m.value && m.label) && labelNoPudo('lluvia') === 'Lluvia');

// --- la campaña no se mezcla con los levantamientos normales (salvaguardas en el código)
{
  const leer = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  t('migración 152: es_campana y columnas por oficina, aditiva', /ADD COLUMN IF NOT EXISTS es_campana/.test(leer('migrations/152_surveys_coordinacion_campana.sql')) && /visita_fecha\s+date/.test(leer('migrations/152_surveys_coordinacion_campana.sql')) && !/DROP /i.test(leer('migrations/152_surveys_coordinacion_campana.sql')));
  t('lib/surveys filtra campañas en listas globales', /idsCampanas/.test(leer('lib/surveys.js')) && /listarProyectosSurveys[\s\S]{0,600}sinCampanas/.test(leer('lib/surveys.js')));
  t('el formulario no finaliza el proyecto-campaña', /es_campana/.test(leer('components/surveys/DynamicSurveyForm.jsx')));
  t('métricas del dashboard excluyen campañas', /es_campana/.test(leer('lib/db.js')));
  t('correo diario de la Torre excluye campañas', /es_campana/.test(leer('app/api/cron/torre-control-diario/route.js')));
}

console.log(`coordinacion: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
