import { cruzarParadasConGps, distanciaM } from '../lib/helpers/rutas.js';
import { normalizarHistorialGPS, fechaGpsAISO } from '../lib/gps.js';
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

// 3) Obra: 200 m del pin. Parada libre no la cuenta (radio 150); obra sí (250).
const a200 = [pt(0, 200, 0), pt(300, 200, 0), pt(360, 2000, 40)];
t('parada libre a 200 m = no', !cruzarParadasConGps([parada], a200).p1);
const rObra = cruzarParadasConGps([{ ...parada, id: 'o1', proyectoId: 'pr1' }], a200).o1;
t('obra a 200 m = sí (radio 250)', !!rObra && rObra.distanciaM === 200);

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

console.log(`rutas-gps: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
