// v8.74.0: Resumen mensual Aprobado vs Facturado vs Ejecutado (funciones puras, con tests).
// Montos SIN ITBIS en RD$. Empresa: 'st' (Super Techos) o 'pg' (Prouco).

const mesesDelAnio = (anio) => Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);

/** Empresa de una obra del ERP por el prefijo de su referencia Odoo: PG → Prouco, resto ST. */
export function empresaProyecto(ref) {
  return String(ref || '').trim().toUpperCase().startsWith('PG') ? 'pg' : 'st';
}

/** Agrupa los movimientos de Odoo ({fecha, empresa, monto}) en los 12 meses del año. */
export function agruparOdooPorMes({ aprobado = [], facturado = [] } = {}, anio) {
  const m = new Map(mesesDelAnio(anio).map(k => [k, { mes: k, aprobado: { st: 0, pg: 0, n: 0 }, facturado: { st: 0, pg: 0 } }]));
  aprobado.forEach(o => { const x = m.get(String(o.fecha).slice(0, 7)); if (!x) return; x.aprobado[o.empresa === 'pg' ? 'pg' : 'st'] += Number(o.monto) || 0; x.aprobado.n += 1; });
  facturado.forEach(f => { const x = m.get(String(f.fecha).slice(0, 7)); if (!x) return; x.facturado[f.empresa === 'pg' ? 'pg' : 'st'] += Number(f.monto) || 0; });
  return [...m.values()];
}

/** Suma lo ejecutado (filas de filasProduccion) por mes y empresa. */
export function ejecutadoPorMes(filas = [], proyectos = [], anio, { incluirRetro = false } = {}) {
  const ref = new Map(proyectos.map(p => [p.id, p.referenciaOdoo]));
  const m = {};
  filas.forEach(f => {
    if (!f?.fecha || (!incluirRetro && f.retro) || !String(f.fecha).startsWith(`${anio}-`)) return;
    const k = f.fecha.slice(0, 7);
    (m[k] = m[k] || { st: 0, pg: 0 })[empresaProyecto(ref.get(f.proyectoId))] += Number(f.rdSinItbis) || 0;
  });
  return m;
}

/**
 * Une Odoo + ejecutado en la tabla final. Meses futuros (después de hastaMes 'AAAA-MM') se omiten.
 * diferencia = ejecutado − facturado (positivo = ejecutado sin facturar).
 */
export function armarResumenMensual(mesesOdoo = [], ejecutado = {}, { anio, hastaMes = null } = {}) {
  const base = new Map((mesesOdoo || []).map(x => [x.mes, x]));
  const filas = mesesDelAnio(anio).filter(k => !hastaMes || k <= hastaMes).map(k => {
    const o = base.get(k) || {};
    const ap = { st: 0, pg: 0, n: 0, ...(o.aprobado || {}) };
    const fa = { st: 0, pg: 0, ...(o.facturado || {}) };
    const ej = { st: 0, pg: 0, ...(ejecutado[k] || {}) };
    ap.total = ap.st + ap.pg; fa.total = fa.st + fa.pg; ej.total = ej.st + ej.pg;
    return { mes: k, aprobado: ap, facturado: fa, ejecutado: ej, diferencia: ej.total - fa.total };
  });
  const suma = (g, c) => filas.reduce((s, f) => s + (f[g][c] || 0), 0);
  const totales = {
    aprobado: { st: suma('aprobado', 'st'), pg: suma('aprobado', 'pg'), total: suma('aprobado', 'total'), n: suma('aprobado', 'n') },
    facturado: { st: suma('facturado', 'st'), pg: suma('facturado', 'pg'), total: suma('facturado', 'total') },
    ejecutado: { st: suma('ejecutado', 'st'), pg: suma('ejecutado', 'pg'), total: suma('ejecutado', 'total') },
  };
  totales.diferencia = totales.ejecutado.total - totales.facturado.total;
  return { filas, totales };
}
