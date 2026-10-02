// v8.58.0 — PROGRAMAS DE LOCACIONES (campaña multi-sitio con un mismo cliente).
// Nace del acuerdo con Towers and Sites: 60 antenas que hay que levantar, cotizar y
// ejecutar antes de fin de año, entre techos y pintura. Cada locación pasa por el mismo
// camino, y el cuello de botella casi nunca es la obra: es la luz verde del propietario,
// la cotización sin aprobar o el sitio aprobado que nadie programó.
//
// Este helper es puro: recibe las locaciones del programa con su levantamiento y su obra
// (ambos viven en `proyectos`) y deriva en qué etapa está cada una, el resumen del
// programa y los grupos por cercanía para planificar la semana por zona.

// v8.59.0: 8 etapas en 5 fases, cada una con su color e icono, y a quién le toca.
// Los nombres dicen el estado Y lo que falta ("Levantado · por cotizar"), para que nadie
// tenga que adivinar qué sigue.
export const FASES = [
  { id: 'autorizacion', label: 'Coordinación' },
  { id: 'levantamiento', label: 'Levantamiento' },
  { id: 'cotizacion', label: 'Cotización' },
  { id: 'ejecucion', label: 'Ejecución' },
  { id: 'cierre', label: 'Cierre' },
];
export const ETAPAS = [
  { id: 'sin_luz_verde', fase: 'autorizacion', icono: 'lock', label: 'Pendiente coordinar levantamiento', detalle: 'Falta coordinar con el propietario el día de la visita', deQuien: 'cliente' },
  { id: 'por_levantar', fase: 'levantamiento', icono: 'map-pin', label: 'Coordinado para levantar', detalle: 'Visita coordinada, falta hacerla', deQuien: 'nosotros' },
  { id: 'levantado', fase: 'levantamiento', icono: 'ruler', label: 'Levantado · por cotizar', detalle: 'Visitado, falta enviar la cotización', deQuien: 'nosotros' },
  { id: 'cotizado', fase: 'cotizacion', icono: 'file', label: 'Esperando aprobación', detalle: 'Cotización enviada, falta que el cliente la apruebe', deQuien: 'cliente' },
  { id: 'por_programar', fase: 'ejecucion', icono: 'calendar', label: 'Aprobado · por programar', detalle: 'Aprobado, falta ponerle fecha', deQuien: 'nosotros' },
  { id: 'en_ejecucion', fase: 'ejecucion', icono: 'tool', label: 'En ejecución', detalle: 'Brigada trabajando en el sitio', deQuien: 'nosotros' },
  { id: 'terminado', fase: 'cierre', icono: 'clipboard', label: 'Terminado · por entregar', detalle: 'Ejecutado, falta el recibido conforme', deQuien: 'nosotros' },
  { id: 'entregado', fase: 'cierre', icono: 'check', label: 'Entregado', detalle: 'Recibido conforme, con garantía', deQuien: null },
];
export const ETAPA = Object.fromEntries(ETAPAS.map(e => [e.id, e]));
const ORDEN = Object.fromEntries(ETAPAS.map((e, i) => [e.id, i]));

// Estados reales de `proyectos` (oct-2026): aprobado, planificado, en_ejecucion, parado,
// finalizado_no_entregado, finalizado_recibido_conforme, facturado. Facturado va después de
// la entrega en el flujo de Super Techos (El Almirante: recibido, informe y garantía → facturado).
const ESTADOS_OBRA_TERMINADA = ['finalizado_no_entregado'];
const ESTADOS_OBRA_ENTREGADA = ['finalizado_recibido_conforme', 'facturado', 'cobrado'];
const ESTADOS_OBRA_POR_PROGRAMAR = ['aprobado', 'planificado', 'parado'];

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
  if (estadoObra && ESTADOS_OBRA_POR_PROGRAMAR.includes(estadoObra)) return 'por_programar';
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
// Un color por etapa, sin dos tonos parecidos: gris (cliente autoriza), ámbar y azul
// (levantamiento), violeta (cliente aprueba), coral y verde (ejecución), teal y blanco
// (cierre). Leíbles sobre el fondo oscuro del ERP y sobre el blanco del portal.
export const COLOR_ETAPA = {
  sin_luz_verde: '#888780',
  por_levantar: '#EF9F27',
  levantado: '#378ADD',
  cotizado: '#7F77DD',
  por_programar: '#D85A30',
  en_ejecucion: '#639922',
  terminado: '#1D9E75',
  entregado: '#E8E6E1',
};
/** Etiqueta corta de a quién le toca. */
export const turnoDe = (etapaId) => {
  const q = ETAPA[etapaId]?.deQuien;
  return q === 'cliente' ? 'Le toca al cliente' : q === 'nosotros' ? 'Le toca a Super Techos' : 'Cerrado';
};
export const ordenEtapa = (id) => ORDEN[id] ?? 99;

// --- Amarre automático -----------------------------------------------------------------
// El programa se alimenta solo de los módulos que ya existen: levantamientos (esquema
// `surveys`) y obras (`proyectos`). Para cada locación busca su levantamiento y su obra:
//   1. por el código UT del cliente dentro del nombre (DO-01-SD-00119-08),
//   2. si no, por el nombre de la locación dentro del nombre del levantamiento
//      (va antes que la distancia: San Carlos y San Gerónimo se levantaron con las MISMAS
//      coordenadas por error, y por cercanía se cruzarían al revés),
//   3. si no, por cercanía: el levantamiento a menos de 300 m de la antena,
//   4. la obra, por la referencia de Odoo que trajo el levantamiento (ST-C5858).
// Nunca pisa un amarre que ya existe: solo completa lo que falta.

const RADIO_AMARRE_KM = 0.3;
const RADIO_MISMO_LUGAR_KM = 15; // mismo nombre a más de 15 km = otra antena en otra ciudad
const sinAcentos = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** El nombre de la locación (sin paréntesis ni sufijos) aparece en el nombre del levantamiento. */
const nombreEnTexto = (nombre, texto) => {
  const base = sinAcentos(nombre).replace(/\(.*?\)|\[.*?\]/g, ' ').split(/[-,]/)[0].replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const t = sinAcentos(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ');
  // Prueba el nombre completo y lo va acortando por el final ("san geronimo uasd" →
  // "san geronimo"), sin bajar de 2 palabras ni de 6 letras para no cruzar por "antena".
  const palabras = base.split(' ');
  for (let n = palabras.length; n >= 2; n--) {
    const frag = palabras.slice(0, n).join(' ');
    if (frag.length >= 6 && t.includes(frag)) return true;
  }
  return palabras.length === 1 && base.length >= 6 && t.includes(base);
};
const codigoEnTexto = (codigo, texto) => {
  if (!codigo || !texto) return false;
  const limpio = (x) => String(x).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return limpio(texto).includes(limpio(codigo));
};
/** 'ST5758' y 'ST-C5758' son la misma cotización. */
export const normalizarRefOdoo = (r) => {
  const m = String(r || '').toUpperCase().match(/(ST|PG)\s*-?\s*C?\s*-?(\d{3,5})/);
  return m ? `${m[1]}-C${m[2]}` : '';
};

/**
 * @param {array} locaciones      filas del programa (camelCase)
 * @param {array} levantamientos  [{ id, siteNombre, lat, lng, referenciaOdoo, realizadoAt, cotizadoAt, fechaVisita, horaVisita }]
 * @param {array} obras           [{ id, nombre, referenciaOdoo, valorCotizacion }]
 * @returns {array} cambios        [{ id, campos }] solo para las locaciones que ganan algo
 */
export function amarrarLocaciones(locaciones = [], levantamientos = [], obras = []) {
  const cambios = [];
  const levUsados = new Set(locaciones.map(l => l.levantamientoId).filter(Boolean));
  const obraUsada = new Set(locaciones.map(l => l.proyectoId).filter(Boolean));

  locaciones.forEach(loc => {
    const c = {};
    // 1) Levantamiento
    let lev = null;
    if (!loc.levantamientoId) {
      lev = levantamientos.find(v => !levUsados.has(v.id) && codigoEnTexto(loc.codigoUt, v.siteNombre))
        // por nombre, pero no si queda en otra ciudad: "Manoguayabo, San Juan" ≠ Manoguayabo (SD)
        || levantamientos.find(v => !levUsados.has(v.id) && nombreEnTexto(loc.nombre, v.siteNombre)
          && distanciaKm({ lat: Number(loc.lat), lng: Number(loc.lng) }, { lat: Number(v.lat), lng: Number(v.lng) }) <= RADIO_MISMO_LUGAR_KM);
      if (!lev) {
        let mejor = null, dMin = Infinity;
        levantamientos.forEach(v => {
          if (levUsados.has(v.id)) return;
          const d = distanciaKm({ lat: Number(loc.lat), lng: Number(loc.lng) }, { lat: Number(v.lat), lng: Number(v.lng) });
          if (d < dMin) { dMin = d; mejor = v; }
        });
        if (mejor && dMin <= RADIO_AMARRE_KM) lev = mejor;
      }
      if (lev) {
        levUsados.add(lev.id);
        c.levantamientoId = lev.id;
        const fecha = lev.realizadoAt || lev.cotizadoAt;
        if (fecha && !loc.levantadoAt) c.levantadoAt = fecha;
        const ref = normalizarRefOdoo(lev.referenciaOdoo);
        if (ref && !loc.cotizacionRef && lev.cotizadoAt) c.cotizacionRef = ref;
        if (lev.cotizadoAt && !loc.cotizadoAt) c.cotizadoAt = lev.cotizadoAt;
        if (!loc.luzVerde) { c.luzVerde = true; c.luzVerdePor = 'Levantamiento creado'; }
        if (lev.fechaVisita && !loc.fechaVisita) { c.fechaVisita = lev.fechaVisita; if (lev.horaVisita) c.horaVisita = lev.horaVisita; }
      }
    }
    // 2) Obra
    if (!loc.proyectoId) {
      const ref = c.cotizacionRef || normalizarRefOdoo(loc.cotizacionRef);
      const obra = obras.find(o => !obraUsada.has(o.id) && ref && normalizarRefOdoo(o.referenciaOdoo) === ref)
        || obras.find(o => !obraUsada.has(o.id) && codigoEnTexto(loc.codigoUt, o.nombre));
      if (obra) {
        obraUsada.add(obra.id);
        c.proyectoId = obra.id;
        if (!loc.cotizacionRef && obra.referenciaOdoo) c.cotizacionRef = normalizarRefOdoo(obra.referenciaOdoo);
        if (!loc.cotizacionMonto && obra.valorCotizacion) c.cotizacionMonto = Number(obra.valorCotizacion);
        if (!loc.cotizacionAprobada) c.cotizacionAprobada = true; // si hay obra, el cliente aprobó
        if (!loc.luzVerde && !c.luzVerde) { c.luzVerde = true; c.luzVerdePor = 'Obra aprobada'; }
      }
    }
    if (Object.keys(c).length) cambios.push({ id: loc.id, campos: c });
  });
  return cambios;
}

/** "jue 9 oct · 9:00 a. m." — fecha y hora de la visita coordinada, para mostrar. */
export function textoCoordinacion(fecha, hora) {
  if (!fecha) return '';
  let t = '';
  try { t = new Date(String(fecha).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { t = String(fecha); }
  if (hora) {
    const [h, m] = String(hora).split(':').map(Number);
    if (!Number.isNaN(h)) t += ` · ${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
  }
  return t;
}

// --- Desde cuándo está en cada etapa -------------------------------------------------
// Cada etapa tiene una fecha de entrada que sale de un dato real, no de un campo que alguien
// tenga que mantener: la coordinación, la visita, la cotización, la aprobación y, para la
// obra, el historial de estados del proyecto (historial_estados).
const ESTADO_OBRA_A_ETAPA = {
  aprobado: 'por_programar', planificado: 'por_programar', parado: 'por_programar',
  en_ejecucion: 'en_ejecucion', finalizado_no_entregado: 'terminado',
  finalizado_recibido_conforme: 'entregado', facturado: 'entregado', cobrado: 'entregado',
};

/**
 * @param {object} loc            locación (camelCase): luzVerdeAt, levantadoAt, cotizadoAt, cotizacionAprobadaAt, createdAt
 * @param {array}  historialObra  [{ estadoNuevo, fecha }] de historial_estados, en cualquier orden
 * @returns {object} { [etapaId]: 'ISO fecha de entrada' }
 */
export function fechasPorEtapa(loc = {}, historialObra = []) {
  const f = { sin_luz_verde: loc.createdAt || null };
  if (loc.luzVerdeAt) f.por_levantar = loc.luzVerdeAt;
  if (loc.levantadoAt) f.levantado = loc.levantadoAt;
  if (loc.cotizadoAt) f.cotizado = loc.cotizadoAt;
  if (loc.cotizacionAprobadaAt) f.por_programar = loc.cotizacionAprobadaAt;
  [...historialObra]
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .forEach(h => {
      const e = ESTADO_OBRA_A_ETAPA[h.estadoNuevo];
      if (e && !f[e]) f[e] = h.fecha; // la PRIMERA vez que entró a esa etapa
    });
  return f;
}

/** Fecha de entrada a la etapa actual y días que lleva ahí. */
export function enEtapaDesde(etapaId, fechas = {}, hoy = new Date()) {
  const desde = fechas[etapaId] || null;
  if (!desde) return { desde: null, dias: null };
  const dias = Math.max(0, Math.floor((hoy - new Date(desde)) / 86400000));
  return { desde, dias };
}

export const TIPOS_DOCUMENTO = [
  { id: 'oc', label: 'Orden de compra' },
  { id: 'cotizacion', label: 'Cotización' },
  { id: 'autorizacion', label: 'Autorización del propietario' },
  { id: 'informe', label: 'Informe' },
  { id: 'garantia', label: 'Carta de garantía' },
  { id: 'otro', label: 'Otro' },
];

/** Ruta dentro del bucket: programas/<locación>/<tipo>/<id>_<nombre-limpio>. Sin "..", sin acentos. */
export function rutaDocumento(locacionId, tipo, id, nombre) {
  const limpio = String(nombre || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^[._]+/, '').slice(-80) || 'archivo';
  return `programas/${locacionId}/${tipo}/${id}_${limpio}`;
}
