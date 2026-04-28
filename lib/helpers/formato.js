// lib/helpers/formato.js
// Helpers de formato de números, fechas y monedas (es-DO)

// v8.10.11: formatRD ahora muestra 2 decimales (centavos) consistentemente
export const formatRD = (n) => {
  const num = Number(n) || 0;
  return `RD$${num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatNum = (n, dec = 1) => Number(n).toFixed(dec).replace(/\.0+$/, '');

// v8.10.18: formatFecha defensivo - acepta varios formatos sin crashear
const _toFechaSafe = (iso) => {
  if (!iso) return null;
  const s = String(iso);
  // Si ya tiene tiempo ('T'), úsalo directo. Si no, agrega T12:00:00
  const fechaStr = s.includes('T') ? s : s + 'T12:00:00';
  const d = new Date(fechaStr);
  if (isNaN(d.getTime())) return null;
  return d;
};

export const formatFecha = (iso) => {
  const d = _toFechaSafe(iso);
  if (!d) return '—';
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
};

export const formatFechaCorta = (iso) => {
  const d = _toFechaSafe(iso);
  if (!d) return '—';
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' });
};

export const formatFechaLarga = (iso) => {
  const d = _toFechaSafe(iso);
  if (!d) return '—';
  return d.toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long' });
};
