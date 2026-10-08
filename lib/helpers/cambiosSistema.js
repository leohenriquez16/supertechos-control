// v8.61.4 — Qué cambia al editar un sistema y a qué obras les mueve el avance.
// Caso oct-2026: el 5-oct se guardó el catálogo, al sistema Acrílico Polybrite 44 se le
// agregaron "Primera/Segunda mano" (peso 25% c/u) y 8 obras bajaron de avance sin que nadie
// lo notara; además el ERP no registraba quién guarda los sistemas. Puro (sin red).

import { calcAvanceProyecto } from './calculos.js';

const ESTADOS_CERRADOS = ['facturado', 'finalizado_recibido_conforme'];

/** Diferencias entre dos versiones de un sistema (tareas por id). */
export function diffSistema(antes = {}, despues = {}) {
  const ta = new Map((antes.tareas || []).map(t => [t.id, t]));
  const td = new Map((despues.tareas || []).map(t => [t.id, t]));
  const agregadas = [...td.values()].filter(t => !ta.has(t.id)).map(t => t.nombre);
  const quitadas = [...ta.values()].filter(t => !td.has(t.id)).map(t => ({ id: t.id, nombre: t.nombre }));
  const pesos = [...td.values()].filter(t => ta.has(t.id) && Number(ta.get(t.id).peso) !== Number(t.peso))
    .map(t => ({ nombre: t.nombre, de: Number(ta.get(t.id).peso) || 0, a: Number(t.peso) || 0 }));
  const renombradas = [...td.values()].filter(t => ta.has(t.id) && ta.get(t.id).nombre !== t.nombre)
    .map(t => ({ de: ta.get(t.id).nombre, a: t.nombre }));
  const precio = Number(antes.precio_m2 || 0) !== Number(despues.precio_m2 || 0)
    ? { de: Number(antes.precio_m2 || 0), a: Number(despues.precio_m2 || 0) } : null;
  const nombre = (antes.nombre || '') !== (despues.nombre || '') ? { de: antes.nombre, a: despues.nombre } : null;
  const hayCambios = !!(agregadas.length || quitadas.length || pesos.length || renombradas.length || precio || nombre);
  return { agregadas, quitadas, pesos, renombradas, precio, nombre, hayCambios };
}

/** Texto corto para el historial. */
export function resumenDiff(d) {
  const p = [];
  if (d.nombre) p.push(`nombre: ${d.nombre.de} → ${d.nombre.a}`);
  if (d.agregadas.length) p.push(`tareas agregadas: ${d.agregadas.join(', ')}`);
  if (d.quitadas.length) p.push(`tareas quitadas: ${d.quitadas.map(t => t.nombre).join(', ')}`);
  if (d.renombradas.length) p.push(`renombradas: ${d.renombradas.map(r => `${r.de} → ${r.a}`).join(', ')}`);
  if (d.pesos.length) p.push(`pesos: ${d.pesos.map(x => `${x.nombre} ${x.de}%→${x.a}%`).join(', ')}`);
  if (d.precio) p.push(`precio m²: ${d.precio.de} → ${d.precio.a}`);
  return p.join(' · ');
}

/**
 * Obras abiertas que usan el sistema y cómo les cambia el avance.
 * También devuelve los reportes que quedarían sin tarea (si se quita una tarea con avance).
 */
export function impactoCambioSistema({ antes, despues, proyectos = [], reportes = [], sistemas = {} }) {
  const sid = despues?.id || antes?.id;
  const usan = proyectos.filter(p => !p.archivado && !ESTADOS_CERRADOS.includes(p.estado)
    && ((p.areas || []).some(a => (a.sistemaId || p.sistema) === sid) || p.sistema === sid));
  const sisAntes = { ...sistemas, [sid]: antes }, sisDespues = { ...sistemas, [sid]: despues };
  const obras = [];
  usan.forEach(p => {
    try {
      const a = calcAvanceProyecto(p, reportes, sisAntes[p.sistema] || antes, sisAntes).porcentaje || 0;
      const d = calcAvanceProyecto(p, reportes, sisDespues[p.sistema] || despues, sisDespues).porcentaje || 0;
      if (Math.abs(a - d) >= 0.5) obras.push({ id: p.id, ref: p.referenciaOdoo || p.cliente || p.id, antes: Math.round(a), despues: Math.round(d) });
    } catch { /* obra con datos incompletos: no bloquea */ }
  });
  const idsQuitadas = new Set(((antes?.tareas || []).filter(t => !(despues?.tareas || []).some(x => x.id === t.id))).map(t => t.id));
  const huerfanos = reportes.filter(r => idsQuitadas.has(r.tareaId));
  return { obras: obras.sort((x, y) => (x.despues - x.antes) - (y.despues - y.antes)), huerfanos };
}
