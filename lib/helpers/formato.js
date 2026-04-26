// lib/helpers/formato.js
// Helpers de formato de números, fechas y monedas (es-DO)

// v8.10.11: formatRD ahora muestra 2 decimales (centavos) consistentemente
// Ej: 1234.5 -> "RD$1,234.50", 1234 -> "RD$1,234.00"
export const formatRD = (n) => {
  const num = Number(n) || 0;
  return `RD$${num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatNum = (n, dec = 1) => Number(n).toFixed(dec).replace(/\.0+$/, '');

export const formatFecha = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });

export const formatFechaCorta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' });

export const formatFechaLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long' });
