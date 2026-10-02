// v8.56.0 — REQUISITOS PARA ARRANCAR UNA OBRA.
// Una obra no pasa a "en ejecución" sin lo que hace falta para medirla, pagarla y
// facturarla. Nace del diagnóstico de oct-2026: de 20 obras aprobadas, 18 no tenían
// maestro, supervisor ni fecha de inicio, y los huecos aparecían el día de la nómina.
//
// Puro: recibe la obra ya normalizada (camelCase) y devuelve qué le falta.

const vacio = (o) => !o || Object.keys(o).length === 0;
const num = (v) => Number(v) > 0;

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

  // Qué se va a hacer y cuánto vale
  if (!proy.sistemaId) f.push('sistema');
  const areas = proy.areas || [];
  if (!areas.length) f.push('áreas');
  else if (areas.some(a => !num(a.m2))) f.push('m² en todas las áreas');
  if (!num(proy.valorCotizacion)) f.push('valor de la cotización');

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
