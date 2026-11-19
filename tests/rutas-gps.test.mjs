import { cruzarParadasConGps, distanciaM, ventanaViajeGps, cambioDatosGps, esParadaBase } from '../lib/helpers/rutas.js';
import { normalizarHistorialGPS, fechaGpsAISO, recortarHistorialAlDia } from '../lib/gps.js';
import { crearLimitador } from '../lib/server/limiteFrecuencia.js';
// Los casos de abajo se escribieron con raw_time en UTC; Pressto real manda hora local (ver caso «Pressto real»).
process.env.GPS_RAW_TIME_UTC = '1';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };

// Punto de referencia (Santo Domingo) y desplazamientos en metros hacia el norte.
const LAT = 18.4861, LNG = -69.9312;
const norte = (m) => LAT + m / 111320;
const T0 = Date.parse('2026-11-18T13:00:00Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const pt = (s, mNorte, speed) => ({ lat: norte(mNorte), lng: LNG, t: at(s), speed });

t('distancia ~80 m', Math.abs(distanciaM(LAT, LNG, norte(80), LNG) - 80) < 1);

const parada = { id: 'p1', lat: LAT, lng: LNG };

// 1) Pasa de largo rápido: cruza el radio en ~40 s a 40 km/h.
const deLargo = [pt(0, -1000, 40), pt(60, -400, 40), pt(80, -100, 40), pt(100, 0, 40), pt(120, 100, 40), pt(180, 600, 40)];
t('pasa de largo = no visita', !cruzarParadasConGps([parada], deLargo).p1);

// 2) Se queda 5 min a 80 m: llegada al primer punto dentro, salida al último.
const queda = [pt(0, -1500, 35), pt(60, -400, 30), pt(100, 80, 3), pt(160, 80, 0), pt(280, 80, 0), pt(400, 80, 2), pt(460, 900, 40)];
const r2 = cruzarParadasConGps([parada], queda).p1;
t('5 min a 80 m = visita', !!r2);
t('llegada correcta', r2?.llegada === at(100));
t('salida correcta', r2?.salida === at(400));
t('permanencia 300 s', r2?.permanenciaS === 300);
t('distancia 80 m', r2?.distanciaM === 80);

// Detenido en el radio pero poco tiempo (2 min) = no.
const corto = [pt(0, 80, 0), pt(120, 80, 0), pt(200, 900, 40)];
t('menos de 3 min = no', !cruzarParadasConGps([parada], corto).p1);

// 3) Obra: 200 m del pin. Parada libre no la cuenta (radio 150); obra con el pin
// aproximado del proyecto sí (250); obra con coordenada propia exacta, no (150).
const a200 = [pt(0, 200, 0), pt(300, 200, 0), pt(360, 2000, 40)];
t('parada libre a 200 m = no', !cruzarParadasConGps([parada], a200).p1);
const rObra = cruzarParadasConGps([{ ...parada, id: 'o1', proyectoId: 'pr1', usaPinObra: true }], a200).o1;
t('obra con pin del proyecto a 200 m = sí (radio 250)', !!rObra && rObra.distanciaM === 200);
t('obra con lat/lng propia a 200 m = no (radio 150)', !cruzarParadasConGps([{ ...parada, id: 'o2', proyectoId: 'pr1' }], a200).o2);

// 4) Sin puntos = vacío.
t('sin puntos = {}', Object.keys(cruzarParadasConGps([parada], [])).length === 0);
t('puntos null = {}', Object.keys(cruzarParadasConGps([parada], null)).length === 0);

// 5) Dos visitas: se queda con la primera.
const dos = [pt(0, 20, 0), pt(240, 20, 0), pt(300, 3000, 50), pt(3600, 30, 0), pt(4200, 30, 0), pt(4300, 3000, 50)];
const r5 = cruzarParadasConGps([parada], dos).p1;
t('dos visitas = la primera', r5?.llegada === at(0) && r5?.salida === at(240));

// Parada sin coordenadas se ignora; puntos desordenados se ordenan.
t('parada sin lat/lng = ignorada', !cruzarParadasConGps([{ id: 'x' }], queda).x);
t('puntos desordenados', cruzarParadasConGps([parada], [...queda].reverse()).p1?.llegada === at(100));

// Normalización del historial GPSWOX
t('raw_time es UTC', fechaGpsAISO('2026-11-18 13:00:00', { utc: true }) === '2026-11-18T13:00:00.000Z');
t('time local RD (-04:00)', fechaGpsAISO('18-11-2026 09:00:00') === '2026-11-18T13:00:00.000Z');
t('epoch segundos', fechaGpsAISO(1763470800) === new Date(1763470800000).toISOString());
const hist = normalizarHistorialGPS({ items: [
  { status: 1, items: [{ lat: 18.5, lng: -69.9, raw_time: '2026-11-18 12:50:00', speed: 30 }] },
  { status: 2, raw_time: '2026-11-18 13:00:00', time_seconds: 600, items: [{ lat: 18.49, lng: -69.93, raw_time: '2026-11-18 13:00:05', speed: 0 }] },
  { status: 1, items: [{ lat: 0, lng: 0, raw_time: '2026-11-18 13:20:00', speed: 0 }, { lat: 'x', lng: 1, time: 'nada' }] },
] });
t('parada GPSWOX con duración', hist.paradas.length === 1 && hist.paradas[0].dur_s === 600 && hist.paradas[0].hasta === '2026-11-18T13:10:00.000Z');
t('puntos ordenados, sin 0,0 ni basura, con sintéticos de la parada', hist.puntos.length === 4 && hist.puntos[0].t === '2026-11-18T12:50:00.000Z' && hist.puntos.at(-1).t === '2026-11-18T13:10:00.000Z');
const visita = cruzarParadasConGps([{ id: 'q', lat: 18.49, lng: -69.93 }], hist.puntos).q;
t('parada GPSWOX de 10 min = visita', visita?.permanenciaS === 600);
t('historial vacío', normalizarHistorialGPS({}).puntos.length === 0 && normalizarHistorialGPS(null).paradas.length === 0);


// ===== Anti-tapón: tiempo LENTO acumulado, no un solo punto =====
// Cruza a 12 km/h en 4 min con UN punto a 3 km/h (revisión GPS #2).
const tapon = [pt(0, -200, 12), pt(60, -100, 12), pt(120, 0, 3), pt(180, 100, 12), pt(240, 140, 12), pt(300, 600, 30)];
t('tapón con un solo punto lento = no visita', !cruzarParadasConGps([{ ...parada, usaPinObra: true }], tapon).p1);
// Lento a ratos: 2 min lento + 1 min rápido + 2 min lento = 4 min lentos ≥ 3.
const aRatos = [pt(0, 50, 0), pt(120, 50, 2), pt(180, 60, 15), pt(240, 60, 1), pt(360, 60, 0), pt(420, 900, 40)];
const rRatos = cruzarParadasConGps([parada], aRatos).p1;
t('lento acumulado ≥ 3 min = visita', !!rRatos && rRatos.lentoS === 240 && rRatos.permanenciaS === 360);
const pocoLento = [pt(0, 50, 0), pt(100, 50, 2), pt(160, 60, 15), pt(400, 60, 20), pt(460, 900, 40)];
t('mucho tiempo en el radio pero < 3 min lento = no', !cruzarParadasConGps([parada], pocoLento).p1);

// ===== Ventana del viaje =====
// Durmió en la parada de 00:00 a 07:00 (relativo a T0) y vino otra vez después.
const durmio = [pt(-6 * 3600, 10, 0), pt(-3 * 3600, 10, 0), pt(-60, 10, 0), pt(0, 3000, 40), pt(3600, 3000, 0), pt(7200, 20, 0), pt(7500, 20, 0), pt(7600, 3000, 40)];
t('sin ventana toma la madrugada', cruzarParadasConGps([parada], durmio).p1?.llegada === at(-6 * 3600));
const rVent = cruzarParadasConGps([parada], durmio, { desde: at(60) }).p1;
t('con ventana (desde hora_inicio) ignora la madrugada', rVent?.llegada === at(7200));
t('hasta corta la visita posterior', !cruzarParadasConGps([parada], durmio, { desde: at(60), hasta: at(5000) }).p1);
t('ventana acepta ms', cruzarParadasConGps([parada], durmio, { desde: T0 + 60000 }).p1?.llegada === at(7200));

// ventanaViajeGps
const AH = Date.parse('2026-11-18T20:00:00Z');
const vPlan = ventanaViajeGps({ estado: 'planificado', hora_inicio: null }, { ahoraMs: AH });
t('planificado sin hora_inicio = no marca', vPlan.puedeMarcar === false && vPlan.desde === null && vPlan.hasta === AH);
const vCurso = ventanaViajeGps({ hora_inicio: '2026-11-18T11:00:00Z' }, { ahoraMs: AH });
t('en curso: desde hora_inicio hasta ahora', vCurso.puedeMarcar && vCurso.desde === Date.parse('2026-11-18T11:00:00Z') && vCurso.hasta === AH);
const vFin = ventanaViajeGps({ horaInicio: '2026-11-18T11:00:00Z', horaFin: '2026-11-18T18:00:00Z' }, { ahoraMs: AH });
t('terminado: hasta hora_fin + 30 min', vFin.hasta === Date.parse('2026-11-18T18:30:00Z'));
t('inicio en el futuro = no marca', ventanaViajeGps({ hora_inicio: '2026-11-18T21:00:00Z' }, { ahoraMs: AH }).puedeMarcar === false);

// ===== Orden de la ruta =====
// A (orden 1) a 0 m, B (orden 2) a 5 km. El camión pasó por B ANTES de A
// (otro viaje) y después hizo A → B. B debe tomar la visita posterior a A.
const B_M = 5000;
const pA = { id: 'A', orden: 1, lat: LAT, lng: LNG };
const pB = { id: 'B', orden: 2, lat: norte(B_M), lng: LNG };
const recorrido = [
  pt(0, B_M, 0), pt(600, B_M, 0), pt(700, 2500, 40),          // B temprano (no cuenta)
  pt(1800, 0, 0), pt(2400, 0, 0), pt(2500, 2500, 40),         // A
  pt(4000, B_M, 0), pt(4500, B_M, 0), pt(4600, 2500, 40),     // B en orden
];
const rOrden = cruzarParadasConGps([pB, pA], recorrido); // el arreglo viene desordenado: manda `orden`
t('orden: A se visita a su hora', rOrden.A?.llegada === at(1800));
t('orden: B toma la visita DESPUÉS de A', rOrden.B?.llegada === at(4000));
// Si A no se detectó, B toma su primera visita (el cursor no avanza).
t('orden: sin A, B toma la primera', cruzarParadasConGps([{ ...pA, lat: 10, lng: 10 }, pB], recorrido).B?.llegada === at(0));

// ===== Oficina: salir y regresar =====
// Ruta: Salir de oficina (1) → obra X (2) → Regresar a oficina (3).
const OF = { lat: LAT, lng: LNG };
const X_M = 4000;
const salir = { id: 'S', orden: 1, lat: LAT, lng: LNG, esBase: true };
const obraX = { id: 'X', orden: 2, lat: norte(X_M), lng: LNG };
const regreso = { id: 'R', orden: 3, lat: LAT, lng: LNG, esBase: true };
const jornada = [
  pt(0, 0, 0), pt(900, 0, 0), pt(1000, 1500, 40),             // en la oficina hasta salir
  pt(2000, X_M, 0), pt(3200, X_M, 0), pt(3300, 2000, 40),     // obra X
  pt(5000, 30, 0), pt(5600, 30, 0),                           // regresa a la oficina
];
const rJ = cruzarParadasConGps([salir, obraX, regreso], jornada);
t('oficina: salir = el rato de la mañana', rJ.S?.llegada === at(0));
t('oficina: obra X', rJ.X?.llegada === at(2000));
t('oficina: regreso = la visita posterior a todas', rJ.R?.llegada === at(5000) && rJ.R?.salida === at(5600));
// Todavía no ha vuelto: el regreso NO se marca con el rato de la mañana.
const rTemprano = cruzarParadasConGps([salir, obraX, regreso], jornada.slice(0, 6));
t('oficina: sin volver, el regreso no se marca', !rTemprano.R && !!rTemprano.S && !!rTemprano.X);
// Ruta sin "Salir": [obra X, Regresar]; el camión estuvo en la oficina al iniciar.
const rSinSalir = cruzarParadasConGps([{ ...obraX, orden: 1 }, { ...regreso, orden: 2 }], jornada.slice(0, 6));
t('oficina: el rato inicial en la base no cuenta como regreso', !rSinSalir.R);
// Regreso a un sitio repetido sin marca de base (p. ej. almacén al salir y al volver).
const rRep = cruzarParadasConGps([{ ...salir, esBase: false }, obraX, { ...regreso, esBase: false }], jornada);
t('regreso al mismo sitio sin esBase también va al final', rRep.R?.llegada === at(5000));
t('esParadaBase por coordenada', esParadaBase({ lat: LAT, lng: LNG }, OF) && !esParadaBase({ lat: norte(500), lng: LNG }, OF));
t('esParadaBase por nombre sin coordenada', esParadaBase({ lugar: 'Regresar a la oficina' }, OF) && !esParadaBase({ lugar: 'Obra Naco' }, OF));

// ===== cambioDatosGps =====
const vis = { llegada: at(0), salida: at(300), permanenciaS: 300, distanciaM: 20 };
t('cambio: sin datos previos = sí', cambioDatosGps({}, vis));
t('cambio: iguales = no', !cambioDatosGps({ llegada_gps_at: '2026-11-18T13:00:00+00:00', salida_gps_at: at(300), permanencia_gps_s: 300, distancia_gps_m: 20 }, vis));
t('cambio: salida nueva = sí', cambioDatosGps({ llegada_gps_at: at(0), salida_gps_at: at(200), permanencia_gps_s: 200, distancia_gps_m: 20 }, vis));
t('cambio: ya no hay visita y había datos = sí (se limpian)', cambioDatosGps({ llegada_gps_at: at(0) }, null));
t('cambio: sin visita ni datos = no', !cambioDatosGps({ llegada_gps_at: null }, null));

// ===== Historial recortado al día (sin puntos de ayer) =====
const histAyer = normalizarHistorialGPS({ items: [
  // parada que empezó ayer 20:00 RD y duró 12 h (hasta hoy 08:00 RD)
  { status: 2, raw_time: '2026-11-18 00:00:00', time_seconds: 12 * 3600, items: [{ lat: 18.49, lng: -69.93, raw_time: '2026-11-18 00:00:10', speed: 0 }] },
  { status: 1, items: [{ lat: 18.5, lng: -69.9, raw_time: '2026-11-18 13:00:00', speed: 30 }] },
] });
const rec = recortarHistorialAlDia(histAyer, '2026-11-18', { ahoraMs: Date.parse('2026-11-18T20:00:00Z') });
t('recorte: nada antes de las 00:00 RD', rec.puntos.every(p => Date.parse(p.t) >= Date.parse('2026-11-18T04:00:00Z')));
t('recorte: el inicio sintético se ajusta a las 00:00 RD', rec.puntos[0].t === '2026-11-18T04:00:00.000Z');
t('recorte: la parada queda dentro del día', rec.paradas[0].desde === '2026-11-18T04:00:00.000Z' && rec.paradas[0].hasta === '2026-11-18T12:00:00.000Z');
const recAhora = recortarHistorialAlDia(normalizarHistorialGPS({ items: [
  { status: 2, raw_time: '2026-11-18 14:00:00', time_seconds: 7200, items: [{ lat: 18.49, lng: -69.93, raw_time: '2026-11-18 14:00:05', speed: 0 }] },
] }), '2026-11-18', { ahoraMs: Date.parse('2026-11-18T15:00:00Z') });
t('recorte: nada después de ahora', recAhora.puntos.every(p => Date.parse(p.t) <= Date.parse('2026-11-18T15:00:00Z')) && recAhora.paradas[0].dur_s === 3600);
t('recorte: día futuro = vacío', recortarHistorialAlDia(histAyer, '2026-11-20', { ahoraMs: Date.parse('2026-11-18T20:00:00Z') }).puntos.length === 0);

// ===== Límite de frecuencia =====
const lim = crearLimitador({ ventanaMs: 60000 });
t('límite: primera pasa', lim('ana|f:2026-11-18', 0).ok);
t('límite: repetida a los 30 s no pasa', !lim('ana|f:2026-11-18', 30000).ok && lim('ana|f:2026-11-18', 30000).esperaS === 30);
t('límite: otra clave pasa', lim('ana|f:2026-11-17', 30000).ok);
t('límite: a los 60 s pasa otra vez', lim('ana|f:2026-11-18', 60000).ok);
t('límite: soloConsultar no anota', lim('ana|x', 0, { soloConsultar: true }).ok && lim('ana|x', 1000).ok && !lim('ana|x', 2000).ok);

{ // v8.75.1: Pressto real — raw_time en hora local RD
  const prev = process.env.GPS_RAW_TIME_UTC; delete process.env.GPS_RAW_TIME_UTC;
  const h = normalizarHistorialGPS({ items: [{ status: 1, items: [{ lat: 18.47, lng: -69.99, raw_time: '2026-11-17 05:57:32', speed: 30 }] }] });
  t('Pressto real: 05:57 hora RD = 09:57 UTC', h.puntos[0]?.t === '2026-11-17T09:57:32.000Z', h.puntos[0]?.t);
  process.env.GPS_RAW_TIME_UTC = prev;
}
console.log(`rutas-gps: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
