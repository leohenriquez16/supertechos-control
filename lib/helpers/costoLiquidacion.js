// v8.74.16: costo de LIQUIDACIÓN de un producto importado, a partir de sus entradas
// grandes al almacén en Odoo (una por carga). Sirve para corregir salidas valoradas con
// un costo absurdo por un error de registro (ej. OC P01445 de Bitunil digitada en PESOS
// con precios en DÓLARES → rollos Bituguard 3KG valorados a RD$14.70).
//
// entradas: [{ fecha: 'YYYY-MM-DD…', unit: número, ref: 'AL/IN/01174' }] (cantidad ≥ 10)
// Referencia = mediana de los costos DISTINTOS (un error repetido en varias entradas no
// arrastra la mediana). Válida = entre la mitad y el doble de la referencia.

const LIMITE_BAJO = 0.5, LIMITE_ALTO = 2;

export function referenciaLiquidacion(entradas) {
  const distintos = [...new Set((entradas || []).map(e => Math.round(Number(e.unit) * 100) / 100).filter(u => u > 0))].sort((a, b) => a - b);
  if (!distintos.length) return null;
  const m = Math.floor(distintos.length / 2);
  return distintos.length % 2 ? distintos[m] : (distintos[m - 1] + distintos[m]) / 2;
}

export function liquidacionesValidas(entradas) {
  const ref = referenciaLiquidacion(entradas);
  if (ref == null) return { ref: null, validas: [] };
  const validas = (entradas || []).filter(e => e.unit >= ref * LIMITE_BAJO && e.unit <= ref * LIMITE_ALTO)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  return { ref, validas };
}

// ¿El costo unitario de una salida está fuera de lo razonable para este producto?
export function costoFueraDeRango(unit, ref) {
  if (ref == null || !(ref > 0)) return false;
  return !(unit > 0) || unit < ref * LIMITE_BAJO || unit > ref * LIMITE_ALTO;
}

// Liquidación vigente a la fecha: la última válida en o antes de la fecha; si la salida es
// anterior a todas, la primera.
export function liquidacionAFecha(validas, fecha) {
  if (!validas?.length) return null;
  let elegida = null;
  for (const e of validas) { if (!fecha || e.fecha <= fecha) elegida = e; }
  return elegida || validas[0];
}
