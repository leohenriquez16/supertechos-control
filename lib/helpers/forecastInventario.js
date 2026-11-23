// v8.79.0: pronóstico de inventario de productos importados.
// Existencia y salidas por mes vienen de Odoo (tabla inventario_productos, la llena la Mac);
// las llegadas, de las cargas abiertas en `importaciones` (cantidad pedida − recibida, en su ETA);
// la demanda de obras aprobadas, de `inventario_demanda` (v8.80.0).

const mesesAtras = (n, hoy = new Date()) => {
  const r = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    r.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return r;
};

// Consumo promedio mensual de los últimos n meses COMPLETOS. Meses sin salida cuentan 0,
// pero no se cuentan meses anteriores al primer registro (Odoo empezó en abr-2026).
export function consumoMensual(mensual = {}, n = 6, hoy = new Date()) {
  const claves = Object.keys(mensual).sort();
  if (!claves.length) return 0;
  const meses = mesesAtras(n, hoy).filter(m => m >= claves[0]);
  if (!meses.length) return 0;
  return meses.reduce((s, m) => s + Math.max(0, Number(mensual[m] || 0)), 0) / meses.length;
}

// Llegadas futuras por producto a partir de las cargas abiertas
export function llegadasPorProducto(importaciones = []) {
  const r = {};
  for (const imp of importaciones) {
    if (imp.estado === 'almacen') continue;
    for (const p of imp.productos || []) {
      const pend = Number(p.cantidad || 0) - Number(p.recibido || 0);
      if (pend <= 0) continue;
      (r[p.odoo_product_id] ||= []).push({ fecha: imp.eta || null, cantidad: pend, oc: imp.oc, estado: imp.estado, etaReal: !!imp.trackingActualizado && !['produccion', 'por_zarpar'].includes(imp.estado) });
    }
  }
  for (const k of Object.keys(r)) r[k].sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'));
  return r;
}

// Proyección semanal: disponible = existencia − comprometido; cada semana resta el consumo
// semanal y suma las llegadas que caen en esa semana.
// Demanda de obras aprobadas repartida por semana (pendiente ÷ semanas entre desde y hasta).
export function demandaSemanal(demandas = [], semanas = 26, hoy = new Date()) {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const out = Array(semanas + 1).fill(0);
  for (const d of demandas) {
    const pend = Number(d.pendiente || 0);
    if (pend <= 0) continue;
    const a = d.desde ? new Date(d.desde + 'T00:00:00') : inicio;
    const b = d.hasta ? new Date(d.hasta + 'T00:00:00') : new Date(a.getTime() + 28 * 86400000);
    const wa = Math.max(1, Math.ceil((a - inicio) / (7 * 86400000)) || 1);
    const wb = Math.max(wa, Math.ceil((b - inicio) / (7 * 86400000)));
    const n = wb - wa + 1;
    for (let w = wa; w <= Math.min(wb, semanas); w++) out[w] += pend / n;
  }
  return out;
}

// Cada semana se descuenta lo MAYOR entre el consumo promedio y lo que piden las obras
// aprobadas esa semana (el promedio ya trae obras: sumarlos contaría doble).
export function proyectar({ stock = 0, comprometido = 0, consumoMes = 0, llegadas = [], demandas = [], semanas = 26, hoy = new Date() }) {
  const semanal = consumoMes * 12 / 52;
  const obras = demandaSemanal(demandas, semanas, hoy);
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let saldo = Number(stock) - Number(comprometido);
  const puntos = [{ semana: 0, fecha: inicio.toISOString().slice(0, 10), saldo, llega: 0 }];
  let agota = null;
  if (saldo <= 0 && semanal > 0) agota = puntos[0].fecha;
  for (let w = 1; w <= semanas; w++) {
    const fin = new Date(inicio); fin.setDate(fin.getDate() + 7 * w);
    const ini = new Date(fin); ini.setDate(ini.getDate() - 7);
    const llega = llegadas.filter(l => l.fecha && new Date(l.fecha + 'T00:00:00') > ini && new Date(l.fecha + 'T00:00:00') <= fin)
      .reduce((s, l) => s + l.cantidad, 0);
    const antes = saldo;
    const sale = Math.max(semanal, obras[w] || 0);
    saldo = saldo - sale + llega;
    if (!agota && sale > 0 && antes - sale + llega <= 0) {
      // día aproximado dentro de la semana
      const dias = Math.max(0, Math.min(7, Math.floor((antes + llega) / (sale / 7))));
      const d = new Date(ini); d.setDate(d.getDate() + dias); agota = d.toISOString().slice(0, 10);
    }
    puntos.push({ semana: w, fecha: fin.toISOString().slice(0, 10), saldo: Math.round(saldo * 10) / 10, llega, sale: Math.round(sale * 10) / 10, obras: Math.round((obras[w] || 0) * 10) / 10 });
  }
  if (!agota && semanal > 0 && puntos[puntos.length - 1].saldo > 0) { // más allá del horizonte: extrapolar
    const ult = puntos[puntos.length - 1];
    const d = new Date(ult.fecha + 'T00:00:00'); d.setDate(d.getDate() + Math.round(ult.saldo / semanal * 7)); agota = d.toISOString().slice(0, 10);
  }
  const proxima = llegadas.find(l => l.fecha && l.fecha >= inicio.toISOString().slice(0, 10)) || llegadas[0] || null;
  const pendienteObras = demandas.reduce((t, d) => t + Number(d.pendiente || 0), 0);
  const coberturaSemanas = semanal > 0 ? (Number(stock) - Number(comprometido)) / semanal : null;
  // ¿se queda sin material antes de la próxima llegada?
  let quiebre = null;
  if (agota && (!proxima?.fecha || agota < proxima.fecha)) {
    quiebre = { desde: agota, hasta: proxima?.fecha || null, dias: proxima?.fecha ? Math.round((new Date(proxima.fecha) - new Date(agota)) / 86400000) : null };
  }
  return { semanal, puntos, agota, proxima, coberturaSemanas, quiebre, pendienteObras };
}
