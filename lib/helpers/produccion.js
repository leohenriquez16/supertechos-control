// v8.60.0 — UNA sola fórmula de producción en dinero para todo el ERP (obra, dashboard, bonos).
// Antes había tres: la de la obra (correcta), la del dashboard y la de bonos (sin tope de m²
// y sin escalar al valor cotizado), así que el mes del dashboard no cuadraba con las obras.
//
// Por reporte:  m² útiles × precio de venta del área × peso de la tarea
//   · tope: lo reportado de una tarea en un área no pasa de los m² del área (lo demás vale 0)
//   · retoques (reparacion) no suman; rollos → m² como en el avance de la obra
//   · si la obra tiene valor cotizado, se escala a ese valor (que viene de Odoo CON ITBIS)
//   · ITBIS: el real de la cotización (proyecto.itbisFactor = total / sin ITBIS); exentas = 1.
//     Sin cotización se asume el precio de lista sin ITBIS y 18%.
// Las obras archivadas cuentan en su historia (antes desaparecían del dashboard al archivar).

import { getM2Reporte, getPrecioVentaArea, getFactorCotizacion } from './calculos.js';

const ITBIS_DEFECTO = 1.18;

export function filasProduccion({ reportes = [], proyectos = [], sistemas = {}, hasta = null } = {}) {
  const porId = new Map(proyectos.map(p => [p.id, p]));
  const cacheProy = new Map();
  const acumulado = new Map(); // proyecto|área|tarea → m² ya contados
  const ordenados = [...reportes]
    // v8.61.0: arranque (trabajo previo al ERP) no es producción; atrasos sin aprobar tampoco.
    .filter(r => r && r.fecha && !r.reparacion && !r.arranque && r.atrasoEstado !== 'pendiente' && r.atrasoEstado !== 'rechazado')
    .map(r => (r.fechaProduccion && r.fechaProduccion !== r.fecha ? { ...r, fecha: r.fechaProduccion } : r))
    .filter(r => !hasta || r.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.createdAt || a.id || '').localeCompare(String(b.createdAt || b.id || '')));
  const out = [];
  ordenados.forEach(r => {
    const proy = porId.get(r.proyectoId);
    if (!proy) return;
    const area = (proy.areas || []).find(a => a.id === r.areaId);
    const sid = area?.sistemaId || proy.sistema;
    const sis = sistemas?.[sid];
    if (!cacheProy.has(proy.id)) {
      const pesos = {}, nTareas = {};
      [...new Set([proy.sistema, ...(proy.areas || []).map(a => a.sistemaId).filter(Boolean)])].forEach(s2 => {
        const tareas = sistemas?.[s2]?.tareas || [];
        tareas.forEach(t => { if (pesos[t.id] === undefined) pesos[t.id] = (Number(t.peso) || 0) / 100; });
        nTareas[s2] = tareas.length;
      });
      const cotizada = proy.valorCotizacion != null && proy.valorCotizacion !== '' && !isNaN(Number(proy.valorCotizacion));
      const factor = cotizada ? getFactorCotizacion(proy, sistemas?.[proy.sistema], sistemas) : 1;
      const itbis = Number(proy.itbisFactor) > 0 ? Number(proy.itbisFactor) : ITBIS_DEFECTO;
      cacheProy.set(proy.id, { pesos, nTareas, cotizada, factor, itbis });
    }
    const c = cacheProy.get(proy.id);
    const m2Rep = sis?.tareas ? getM2Reporte(r, sis) : Number(r.m2) || 0;
    if (!(m2Rep > 0)) return;
    let m2 = m2Rep;
    if (area && Number(area.m2) > 0) {
      const k = `${proy.id}|${area.id}|${r.tareaId}`;
      const ya = acumulado.get(k) || 0;
      m2 = Math.max(0, Math.min(m2Rep, Number(area.m2) - ya));
      acumulado.set(k, ya + m2Rep);
    }
    let peso = c.pesos[r.tareaId];
    if (peso === undefined) { const n = c.nTareas[sid] || 0; peso = n > 0 ? 1 / n : 1; }
    const base = m2 * getPrecioVentaArea(area, sis) * peso;
    const rdConItbis = c.cotizada ? base * c.factor : base * c.itbis;
    const rdSinItbis = c.cotizada ? rdConItbis / c.itbis : base;
    out.push({
      fecha: r.fecha, retro: !!r.retroactivo, proyectoId: proy.id,
      maestroId: area?.maestroAreaId || proy.maestroId || null,
      m2p: m2 * peso, rdConItbis, rdSinItbis,
    });
  });
  return out;
}

/** Suma por obra: hoy, mes en curso y acumulado. */
export function resumenProduccionObra(filas, proyectoId, hoy) {
  const mes = hoy.slice(0, 7);
  const r = { hoy: 0, mes: 0, total: 0, hoySin: 0, mesSin: 0, totalSin: 0 };
  filas.forEach(f => {
    if (f.proyectoId !== proyectoId) return;
    r.total += f.rdConItbis; r.totalSin += f.rdSinItbis;
    if (f.fecha.slice(0, 7) === mes) { r.mes += f.rdConItbis; r.mesSin += f.rdSinItbis; }
    if (f.fecha === hoy) { r.hoy += f.rdConItbis; r.hoySin += f.rdSinItbis; }
  });
  return r;
}
