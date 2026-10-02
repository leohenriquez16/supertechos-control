// v8.58.0 — PROGRAMAS DE LOCACIONES (campaña multi-sitio con un mismo cliente).
// Nace del acuerdo con Towers and Sites: 60 antenas que hay que levantar, cotizar y
// ejecutar antes de fin de año, entre techos y pintura. Cada locación pasa por el mismo
// camino, y el cuello de botella casi nunca es la obra: es la luz verde del propietario,
// la cotización sin aprobar o el sitio aprobado que nadie programó.
//
// Este helper es puro: recibe las locaciones del programa con su levantamiento y su obra
// (ambos viven en `proyectos`) y deriva en qué etapa está cada una, el resumen del
// programa y los grupos por cercanía para planificar la semana por zona.

export const ETAPAS = [
  { id: 'sin_luz_verde', label: 'Sin luz verde', detalle: 'Esperando autorización del propietario', deQuien: 'cliente' },
  { id: 'por_levantar', label: 'Por levantar', detalle: 'Autorizado, falta la visita', deQuien: 'nosotros' },
  { id: 'levantado', label: 'Levantado', detalle: 'Visitado, falta cotizar', deQuien: 'nosotros' },
  { id: 'cotizado', label: 'Cotizado', detalle: 'Esperando aprobación del cliente', deQuien: 'cliente' },
  { id: 'por_programar', label: 'Por programar', detalle: 'Aprobado, falta fecha de ejecución', deQuien: 'nosotros' },
  { id: 'en_ejecucion', label: 'En ejecución', detalle: 'Brigada trabajando', deQuien: 'nosotros' },
  { id: 'terminado', label: 'Terminado', detalle: 'Ejecutado, falta entregar', deQuien: 'nosotros' },
  { id: 'entregado', label: 'Entregado', detalle: 'Recibido conforme, con garantía', deQuien: null },
];
export const ETAPA = Object.fromEntries(ETAPAS.map(e => [e.id, e]));
const ORDEN = Object.fromEntries(ETAPAS.map((e, i) => [e.id, i]));

const ESTADOS_OBRA_TERMINADA = ['terminado', 'medido', 'facturado', 'cobrado'];
const ESTADOS_OBRA_ENTREGADA = ['recibido_conforme', 'entregado', 'cerrado'];

/**
 * En qué etapa está una locación. La obra manda sobre el levantamiento, y el
 * levantamiento sobre la luz verde: así una locación nunca retrocede por un dato viejo.
 * @param {object} loc  fila de programa_locaciones
 * @param {object} ctx  { levantamiento, obra } — filas de proyectos (pueden faltar)
 */
export function etapaDeLocacion(loc = {}, ctx = {}) {
  const { levantamiento, obra } = ctx;
  const estadoObra = obra?.estado;
  if (estadoObra && ESTADOS_OBRA_ENTREGADA.includes(estadoObra)) return 'entregado';
  if (estadoObra && ESTADOS_OBRA_TERMINADA.includes(estadoObra)) return 'terminado';
  if (estadoObra === 'en_ejecucion') return 'en_ejecucion';
  if (estadoObra === 'planificado' || estadoObra === 'aprobado') return 'por_programar';
  if (loc.cotizacionAprobada) return 'por_programar';
  if (loc.cotizacionRef || estadoObra === 'cubicando') return 'cotizado';
  if (levantamiento?.fechaMedicion || levantamiento?.estado === 'levantado' || loc.levantadoAt) return 'levantado';
  if (loc.luzVerde) return 'por_levantar';
  return 'sin_luz_verde';
}

/** Días parado en la etapa actual (desde la última fecha conocida de esa locación). */
export function diasEnEtapa(loc = {}, hoy = new Date()) {
  const ref = loc.etapaDesde || loc.updatedAt || loc.createdAt;
  if (!ref) return null;
  const d = Math.floor((hoy - new Date(ref)) / 86400000);
  return d >= 0 ? d : null;
}

/**
 * Resumen del programa: cuántas locaciones hay en cada etapa, de quién depende cada
 * una y si el ritmo alcanza para la fecha meta.
 */
export function resumenPrograma(locaciones = [], { fechaMeta, hoy = new Date() } = {}) {
  const porEtapa = Object.fromEntries(ETAPAS.map(e => [e.id, 0]));
  let enNosotros = 0, enCliente = 0;
  locaciones.forEach(l => {
    const e = l.etapa || 'sin_luz_verde';
    porEtapa[e] = (porEtapa[e] || 0) + 1;
    const de = ETAPA[e]?.deQuien;
    if (de === 'nosotros') enNosotros++;
    if (de === 'cliente') enCliente++;
  });
  const total = locaciones.length;
  const entregadas = porEtapa.entregado || 0;
  const terminadas = entregadas + (porEtapa.terminado || 0);
  const faltan = total - entregadas;

  let ritmo = null;
  if (fechaMeta) {
    const diasRestantes = Math.max(0, Math.round((new Date(fechaMeta) - hoy) / 86400000));
    const semanas = Math.max(1, diasRestantes / 7);
    ritmo = {
      diasRestantes,
      porSemanaNecesarias: Math.ceil(faltan / semanas),
      faltan,
    };
  }
  return {
    total, entregadas, terminadas, faltan, porEtapa,
    pendientesNuestros: enNosotros, pendientesCliente: enCliente,
    pctAvance: total ? Math.round((entregadas / total) * 100) : 0,
    ritmo,
  };
}

/** Lo que el CLIENTE tiene trancado, que es lo primero que debe ver al entrar. */
export function pendientesDelCliente(locaciones = []) {
  const sinLuz = locaciones.filter(l => l.etapa === 'sin_luz_verde');
  const porAprobar = locaciones.filter(l => l.etapa === 'cotizado');
  const sinSupervisor = locaciones.filter(l => !l.supervisorClienteNombre && l.etapa !== 'entregado');
  return { sinLuzVerde: sinLuz, cotizacionesPorAprobar: porAprobar, sinSupervisor };
}

// --- Planificación por zona ---------------------------------------------------------
const RADIO_TIERRA_KM = 6371;
const rad = (g) => (g * Math.PI) / 180;
export function distanciaKm(a, b) {
  if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return Infinity;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(s));
}

/**
 * Agrupa las locaciones listas para trabajar por cercanía, para mandar la brigada a
 * varias el mismo día en vez de cruzar la ciudad por una sola.
 * @param {array} locaciones  con lat/lng
 * @param {number} radioKm    qué tan cerca tienen que estar para ir juntas
 */
export function agruparPorZona(locaciones = [], radioKm = 8) {
  const pend = locaciones.filter(l => Number(l.lat) && Number(l.lng))
    .map(l => ({ ...l, lat: Number(l.lat), lng: Number(l.lng) }));
  const grupos = [];
  const usadas = new Set();
  pend.forEach(l => {
    if (usadas.has(l.id)) return;
    const cerca = pend.filter(o => !usadas.has(o.id) && distanciaKm(l, o) <= radioKm);
    cerca.forEach(o => usadas.add(o.id));
    const lat = cerca.reduce((s, o) => s + o.lat, 0) / cerca.length;
    const lng = cerca.reduce((s, o) => s + o.lng, 0) / cerca.length;
    grupos.push({
      centro: { lat, lng },
      zona: cerca[0].sector || cerca[0].ciudad || 'Zona',
      locaciones: cerca.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')),
    });
  });
  const sinCoords = locaciones.filter(l => !(Number(l.lat) && Number(l.lng)));
  if (sinCoords.length) grupos.push({ centro: null, zona: 'Sin coordenadas', locaciones: sinCoords });
  return grupos.sort((a, b) => b.locaciones.length - a.locaciones.length);
}

/** Color del pin en el mapa y del chip en el tablero, por etapa. */
export const COLOR_ETAPA = {
  sin_luz_verde: '#71717a',
  por_levantar: '#f0b429',
  levantado: '#38bdf8',
  cotizado: '#a78bfa',
  por_programar: '#fb923c',
  en_ejecucion: '#22c55e',
  terminado: '#15803d',
  entregado: '#111827',
};
export const ordenEtapa = (id) => ORDEN[id] ?? 99;
