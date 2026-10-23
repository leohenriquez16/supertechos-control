// v8.73.0: Agrupación, variación, proyección y alertas de la vista Producción.
// Funciones puras sobre las filas de filasProduccion (lib/helpers/produccion.js).
// NO recalculan dinero: solo suman rd (con ITBIS), rdSin (sin ITBIS) y m2p de cada fila.
//
// Cada fila que esperan: { fecha, proyectoId, maestroId, rd, rdSin, m2p, sistemaId, areaId,
//   tareaId, m2Util, precioM2, reportadoPor }  (rd/rdSin = rdConItbis/rdSinItbis).

const DIA_MS = 86400000;
const aFecha = (s) => new Date(s + 'T12:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
export const sumarDias = (fecha, n) => iso(new Date(aFecha(fecha).getTime() + n * DIA_MS));
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / DIA_MS);
const ultimoDiaMes = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const esHabil = (fecha) => aFecha(fecha).getUTCDay() !== 0; // lunes-sábado

/** Clave de bucket: día (fecha), semana (lunes), quincena (YYYY-MM·Q1/Q2), mes (YYYY-MM). */
export function claveBucket(fecha, periodo) {
  if (periodo === 'dia') return fecha;
  if (periodo === 'mes') return fecha.slice(0, 7);
  if (periodo === 'quincena') return `${fecha.slice(0, 7)}·Q${Number(fecha.slice(8, 10)) <= 15 ? 1 : 2}`;
  const dow = (aFecha(fecha).getUTCDay() + 6) % 7; // lunes=0
  return sumarDias(fecha, -dow);
}

/** Empresa por prefijo de la referencia Odoo. */
export function empresaDe(ref) {
  const r = String(ref || '').trim().toUpperCase();
  if (r.startsWith('ST-')) return 'Super Techos';
  if (r.startsWith('PG-')) return 'Prouco';
  return 'Sin referencia';
}

function agrupar(filas, claveDe, total) {
  const m = new Map();
  filas.forEach(f => {
    const [k, nombre] = claveDe(f);
    if (!m.has(k)) m.set(k, { k, nombre, rd: 0, rdSin: 0, m2: 0, reps: 0, filas: [], dias: new Set() });
    const g = m.get(k);
    g.rd += f.rd; g.rdSin += f.rdSin; g.m2 += f.m2p || 0; g.reps += 1; g.filas.push(f); g.dias.add(f.fecha);
  });
  return [...m.values()].map(g => {
    const nDias = g.dias.size;
    const { dias, ...resto } = g;
    return { ...resto, nDias, rdDia: nDias ? g.rd / nDias : 0, rdDiaSin: nDias ? g.rdSin / nDias : 0, pct: total > 0 ? g.rd / total : 0 };
  }).sort((a, b) => b.rd - a.rd || String(a.nombre).localeCompare(String(b.nombre)));
}

/**
 * Desglose de un conjunto de filas (ya filtradas al bucket) por obra, supervisor, maestro,
 * sistema y empresa. Cada grupo suma exactamente el total.
 */
// v8.73.1: cliente normalizado ("TOWERS AND SITES DOMINICANA" y "… SAS" son el mismo).
export function claveCliente(nombre) {
  const base = String(nombre || '').split(',')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b(S ?R ?L|S ?A ?S|S ?A|SRL|SAS|SA|EIRL)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return base;
}

export function desglosarProduccion(filas, { proyectos = [], personal = [], sistemas = {} } = {}) {
  const proy = new Map(proyectos.map(p => [p.id, p]));
  const pers = new Map(personal.map(p => [p.id, p]));
  const total = filas.reduce((s, f) => s + f.rd, 0);
  const totalSin = filas.reduce((s, f) => s + f.rdSin, 0);
  const m2 = filas.reduce((s, f) => s + (f.m2p || 0), 0);
  const nombreObra = (p) => [p?.referenciaOdoo, p?.cliente || p?.nombre].filter(Boolean).join(' · ') || p?.nombre || 'Obra sin nombre';
  const filasOrd = (g) => ({ ...g, filas: [...g.filas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.rd - a.rd) });
  return {
    total, totalSin, m2, reps: filas.length,
    porObra: agrupar(filas, f => [f.proyectoId, nombreObra(proy.get(f.proyectoId))], total).map(filasOrd),
    porSupervisor: agrupar(filas, f => {
      const sid = proy.get(f.proyectoId)?.supervisorId;
      const n = sid && pers.get(sid)?.nombre;
      return n ? [sid, n] : ['_sin', 'Sin supervisor'];
    }, total),
    porMaestro: agrupar(filas, f => {
      const n = f.maestroId && pers.get(f.maestroId)?.nombre;
      return n ? [f.maestroId, n] : ['_sin', 'Sin maestro'];
    }, total),
    porSistema: agrupar(filas, f => {
      const n = f.sistemaId && (sistemas?.[f.sistemaId]?.nombre || sistemas?.[f.sistemaId]?.name);
      return n ? [f.sistemaId, n] : ['_sin', 'Sin sistema'];
    }, total),
    porCliente: agrupar(filas, f => {
      const nom = String(proy.get(f.proyectoId)?.cliente || '').split(',')[0].trim();
      const k = claveCliente(nom);
      return k ? [k, nom] : ['_sin', 'Sin cliente'];
    }, total),
    porEmpresa: agrupar(filas, f => { const e = empresaDe(proy.get(f.proyectoId)?.referenciaOdoo); return [e, e]; }, total),
  };
}

/** Rango [desde, hasta] del periodo en curso y del anterior equivalente (misma cantidad de días transcurridos). */
export function rangosComparables(hoy, periodo) {
  if (periodo === 'dia') return { actual: [hoy, hoy], anterior: [sumarDias(hoy, -1), sumarDias(hoy, -1)], etiqueta: 'ayer' };
  if (periodo === 'semana') {
    const lun = claveBucket(hoy, 'semana');
    return { actual: [lun, hoy], anterior: [sumarDias(lun, -7), sumarDias(hoy, -7)], etiqueta: 'semana pasada' };
  }
  const ym = hoy.slice(0, 7), dia = Number(hoy.slice(8, 10));
  const [y, m] = ym.split('-').map(Number);
  const ymAnt = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const pad = (n) => String(n).padStart(2, '0');
  if (periodo === 'mes') {
    const dAnt = Math.min(dia, ultimoDiaMes(ymAnt));
    return { actual: [`${ym}-01`, hoy], anterior: [`${ymAnt}-01`, `${ymAnt}-${pad(dAnt)}`], etiqueta: 'mes pasado a la fecha' };
  }
  // quincena: Q1 (1-15) se compara con la Q2 del mes anterior; Q2 (16-fin) con la Q1 del mismo mes.
  if (dia <= 15) {
    const finAnt = ultimoDiaMes(ymAnt);
    const hasta = Math.min(16 + dia - 1, finAnt);
    return { actual: [`${ym}-01`, hoy], anterior: [`${ymAnt}-16`, `${ymAnt}-${pad(hasta)}`], etiqueta: 'quincena anterior' };
  }
  const hasta = Math.min(dia - 15, 15);
  return { actual: [`${ym}-16`, hoy], anterior: [`${ym}-01`, `${ym}-${pad(hasta)}`], etiqueta: 'quincena anterior' };
}

const sumaRango = (filas, [d, h]) => filas.reduce((a, f) => (f.fecha >= d && f.fecha <= h ? { rd: a.rd + f.rd, rdSin: a.rdSin + f.rdSin } : a), { rd: 0, rdSin: 0 });

/** Variación del periodo en curso vs el anterior equivalente. pct = null si el anterior es 0. */
export function variacionPeriodo(filas, hoy, periodo) {
  const r = rangosComparables(hoy, periodo);
  const act = sumaRango(filas, r.actual), ant = sumaRango(filas, r.anterior);
  return { ...r, rd: act.rd, rdSin: act.rdSin, rdAnt: ant.rd, rdAntSin: ant.rdSin, pct: ant.rd > 0 ? (act.rd - ant.rd) / ant.rd : null };
}

/**
 * Promedio por día hábil y proyección al cierre del mes, a la fecha de hoy.
 * Día hábil = lunes a sábado TRANSCURRIDO del mes (1 → hoy), haya o no producción: así un día
 * sin reportes baja el promedio (es lo que de verdad pasó) en vez de inflarlo.
 * Proyección = promedio × días hábiles totales del mes.
 */
export function proyeccionMes(filas, hoy) {
  const ym = hoy.slice(0, 7), fin = ultimoDiaMes(ym);
  let transcurridos = 0, totales = 0;
  for (let d = 1; d <= fin; d++) {
    const f = `${ym}-${String(d).padStart(2, '0')}`;
    if (!esHabil(f)) continue;
    totales++; if (f <= hoy) transcurridos++;
  }
  const s = sumaRango(filas, [`${ym}-01`, hoy]);
  const diasConProd = new Set(filas.filter(f => f.fecha >= `${ym}-01` && f.fecha <= hoy).map(f => f.fecha)).size;
  const prom = transcurridos ? s.rd / transcurridos : 0, promSin = transcurridos ? s.rdSin / transcurridos : 0;
  return { habilesTranscurridos: transcurridos, habilesMes: totales, diasConProd, promedio: prom, promedioSin: promSin, proyeccion: prom * totales, proyeccionSin: promSin * totales };
}

/** Obras en ejecución sin producción en los últimos `minDias` días o más (más viejas primero). */
export function obrasSinProduccion(proyectos = [], filas = [], hoy, { minDias = 3, personal = [] } = {}) {
  const ultima = new Map();
  filas.forEach(f => { if (f.fecha <= hoy && (!ultima.has(f.proyectoId) || f.fecha > ultima.get(f.proyectoId))) ultima.set(f.proyectoId, f.fecha); });
  const pers = new Map(personal.map(p => [p.id, p]));
  return proyectos
    .filter(p => p && !p.archivado && p.estado === 'en_ejecucion')
    .map(p => {
      const u = ultima.get(p.id) || null;
      const desde = u || p.fecha_inicio || null;
      const dias = desde ? diasEntre(desde, hoy) : null;
      return { id: p.id, nombre: [p.referenciaOdoo, p.cliente || p.nombre].filter(Boolean).join(' · ') || p.nombre, ultima: u, dias, supervisor: pers.get(p.supervisorId)?.nombre || 'Sin supervisor' };
    })
    .filter(o => o.dias === null || o.dias >= minDias)
    .sort((a, b) => (b.dias ?? 1e9) - (a.dias ?? 1e9));
}
