// lib/helpers/formato.js
// Helpers de formato de números, fechas y monedas (es-DO)

export const formatRD = (n) => `RD$${Math.round(n).toLocaleString('es-DO')}`;

export const formatNum = (n, dec = 1) => Number(n).toFixed(dec).replace(/\.0+$/, '');

export const formatFecha = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });

export const formatFechaCorta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' });

export const formatFechaLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long' });
