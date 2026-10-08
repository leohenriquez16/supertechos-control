// v8.56.0 — REQUISITOS PARA ARRANCAR UNA OBRA.
// Una obra no pasa a "en ejecución" sin lo que hace falta para medirla, pagarla y
// facturarla. Nace del diagnóstico de oct-2026: de 20 obras aprobadas, 18 no tenían
// maestro, supervisor ni fecha de inicio, y los huecos aparecían el día de la nómina.
//
// Puro: recibe la obra ya normalizada (camelCase) y devuelve qué le falta.

const vacio = (o) => !o || Object.keys(o).length === 0;
const num = (v) => Number(v) > 0;

/**
 * v8.61.2 — Lo que hace que una obra VALGA algo en producción (si falta, produce RD$0 aunque
 * se reporte). Una sola regla para el candado de arranque y para el correo diario.
 * @param {object} proy      obra normalizada (sistemaId, areas, valorCotizacion)
 * @param {object} sistemas  { id: datos del sistema } — opcional; sin él no revisa precios ni tareas
 */
export function faltantesDeValor(proy = {}, sistemas = null) {
  const f = [];
  const areas = proy.areas || [];
  const sids = [...new Set([proy.sistemaId, ...areas.map(a => a.sistemaId)].filter(Boolean))];
  if (!sids.length) f.push('sistema');
  else if (sistemas && sids.some(sid => !(sistemas[sid]?.tareas?.length > 0))) f.push('tareas del sistema');
  if (!areas.length) f.push('áreas');
  else {
    if (areas.some(a => !num(a.m2))) f.push('m² en todas las áreas');
    if (sistemas && areas.some(a => !num(a.precioVentaM2) && !num(sistemas[a.sistemaId || proy.sistemaId]?.precio_m2))) {
      f.push('precio de venta en las áreas');
    }
  }
  if (!num(proy.valorCotizacion)) f.push('valor de la cotización');
  return f;
}

/**
 * @param {object} proy  obra normalizada
 * @param {object} ctx   { tieneContacto: boolean }  — el contacto puede vivir en otra tabla
 * @returns {string[]} lista de lo que falta (vacía = lista para arrancar)
 */
export function faltantesParaEjecucion(proy = {}, ctx = {}) {
  const f = [];

  // Quién responde por la obra
  if (!proy.maestroId) f.push('maestro asignado');
  if (!proy.supervisorId) f.push('supervisor asignado');

  // Cuándo arranca
  if (!proy.fechaInicio && !proy.fechaEstimadaInicio) f.push('fecha de inicio');

  // Dónde es y con quién se habla
  if (proy.ubicacionLat == null || proy.ubicacionLng == null) f.push('ubicación en el mapa');
  if (!ctx.tieneContacto) f.push('contacto del cliente');

  // Qué se va a hacer y cuánto vale (v8.61.2: regla compartida con el correo diario)
  f.push(...faltantesDeValor(proy, ctx.sistemas || null));

  // Cómo se paga la mano de obra — sin esto la nómina calcula RD$0
  const modo = proy.modoPagoManoObra;
  if (!modo) f.push('cómo se paga la mano de obra');
  else if (modo === 'm2_fijo' && !num(proy.precioM2FijoMaestro)) f.push('precio por m² del maestro');
  else if (modo === 'm2' && vacio(proy.preciosTareasM2)) f.push('precios por tarea (m²)');
  else if (modo === 'tarea' && vacio(proy.preciosManoObraTareas)) f.push('precios de mano de obra por tarea');
  else if ((modo === 'dia' || modo === 'dia_m2') && !num(proy.costoDiaConfigurado)) f.push('costo por día del maestro');

  return f;
}

export const listaFaltantes = (f) => f.map(x => '• ' + x).join('\n');
