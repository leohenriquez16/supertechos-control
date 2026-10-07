// v8.59.8 — Precio ajustado: monto total acordado con el maestro, pagado por avance manual (%).
// Pura: la usan la nómina, la obra y las pruebas.

const ord = (a) => [...(a || [])].sort((x, y) => (x.fecha || '').localeCompare(y.fecha || '') || (x.createdAt || '').localeCompare(y.createdAt || ''));

/** % de avance vigente al cierre de `fecha` (incluida). 0 si no hay registros. */
export function pctAl(avances, fecha) {
  let pct = 0;
  ord(avances).forEach(a => { if ((a.fecha || '') <= fecha) pct = Math.max(pct, Number(a.pct) || 0); });
  return Math.min(100, pct);
}

/** % vigente justo antes de `fecha` (excluida). */
export function pctAntesDe(avances, fecha) {
  let pct = 0;
  ord(avances).forEach(a => { if ((a.fecha || '') < fecha) pct = Math.max(pct, Number(a.pct) || 0); });
  return Math.min(100, pct);
}

/** Lo que toca pagar en el corte [inicio, fin]. */
export function pagoAjustadoCorte({ monto, avances, inicio, fin }) {
  const m = Number(monto) || 0;
  if (m <= 0) return { monto: 0, pctDesde: 0, pctHasta: 0 };
  const pctDesde = pctAntesDe(avances, inicio);
  const pctHasta = Math.max(pctDesde, pctAl(avances, fin));
  return { monto: Math.round(m * (pctHasta - pctDesde)) / 100, pctDesde, pctHasta };
}

/** Valida un % nuevo: número, 0–100 y no menor que el último registrado. Devuelve el error o null. */
export function validarNuevoAvance(avances, pct) {
  const n = Number(pct);
  if (pct === '' || pct == null || !Number.isFinite(n)) return 'Escribe el % de avance.';
  if (n < 0 || n > 100) return 'El avance va de 0 a 100%.';
  const ultimo = ord(avances).reduce((m, a) => Math.max(m, Number(a.pct) || 0), 0);
  if (n < ultimo) return `El avance no puede bajar: el último registrado es ${ultimo}%.`;
  if (n === ultimo && avances?.length) return `Ya está en ${ultimo}%.`;
  return null;
}
