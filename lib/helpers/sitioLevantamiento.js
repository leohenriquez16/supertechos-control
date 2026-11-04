// v8.75.0 — EL SITIO de un levantamiento, para distinguir tarjetas del mismo cliente.
// En el Kanban de Levantamientos las 33 antenas de Towers and Sites decían todas
// "TOWERS AND SITES DOMINICANA": el nombre del sitio (la antena, la sucursal, la
// tienda) es lo que las diferencia, y 83 de los 124 levantamientos lo tienen distinto
// del cliente (medido 4-nov-2026). Puro, sin base de datos: se prueba con node.

const normalizar = (x) => String(x || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/** Texto en minúsculas, sin acentos ni espacios dobles: lo que se compara al buscar. */
export const normalizarBusqueda = normalizar;

/**
 * Nombre del sitio listo para enseñar (sin tabs ni espacios dobles), o '' si no hay o si
 * repite un texto que la tarjeta ya enseña (el cliente, el nombre del levantamiento).
 * @param {string}    nombreSitio
 * @param {...string} yaVisibles  textos que ya salen en la tarjeta o la fila
 */
export function nombreSitioVisible(nombreSitio, ...yaVisibles) {
  const limpio = String(nombreSitio || '').replace(/\s+/g, ' ').trim();
  if (!limpio) return '';
  const n = normalizar(limpio);
  if (yaVisibles.some(t => t && normalizar(t) === n)) return '';
  return limpio;
}

/**
 * Etapa de un levantamiento con las columnas del Kanban (las de Odoo). Los creados en el
 * ERP no traen odoo_stage hasta que alguien los mueve: se traduce su status.
 */
export const ETAPA_POR_STATUS = { planning: 'New', survey_in_progress: 'Asignado', survey_completed: 'Realizado', quoted: 'Cotizacion Realizada', awarded: 'Cotizacion Realizada', in_execution: 'Realizado', completed: 'Realizado', cancelled: 'No se pudo coordinar' };
export const etapaDeLevantamiento = (p) => p?.odoo_stage || ETAPA_POR_STATUS[p?.status] || 'New';

/**
 * Texto de búsqueda de los sitios de cada levantamiento, por id de proyecto: nombre del
 * sitio, código LEV, dirección, ciudad y provincia, ya normalizado. Junta todos los
 * sitios del proyecto (los multi-sitio se encuentran por cualquiera de ellos).
 * @param {array} sites  filas de surveys.sites con project_id
 * @returns {object} { [projectId]: 'texto normalizado' }
 */
export function textoBusquedaSitios(sites = []) {
  const m = {};
  for (const s of sites || []) {
    if (!s?.project_id) continue;
    const t = normalizar([s.name, s.external_code, s.address, s.city, s.province].filter(Boolean).join(' '));
    if (!t) continue;
    m[s.project_id] = m[s.project_id] ? `${m[s.project_id]} ${t}` : t;
  }
  return m;
}
