// lib/helpers/formato.js
// Helpers de formato de números, fechas y monedas (es-DO)

// v8.10.11: formatRD ahora muestra 2 decimales (centavos) consistentemente
export const formatRD = (n) => {
  const num = Number(n) || 0;
  return `RD$${num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// v8.17.14: separador de miles (es-DO) en todos los números. Preserva el
// comportamiento original de quitar ceros decimales trailing (ej. 45.0 → 45).
export const formatNum = (n, dec = 1) => {
  const num = Number(n) || 0;
  const fixed = num.toFixed(dec);
  const [intPart, fracPart] = fixed.split('.');
  // Aplica comas a la parte entera (signo negativo conservado por Number)
  const intFmt = Number(intPart).toLocaleString('es-DO');
  if (!fracPart) return intFmt;
  // Quitar ceros decimales trailing (ej. ".50" → ".5", ".00" → "")
  const fracClean = fracPart.replace(/0+$/, '');
  return fracClean ? `${intFmt}.${fracClean}` : intFmt;
};

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

// v8.17.56: fecha + hora ("17 may '26 14:32") para audit log
export const formatFechaHora = (iso) => {
  const d = _toFechaSafe(iso);
  if (!d) return '—';
  const fecha = d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' });
  const hora = d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fecha} ${hora}`;
};

// v8.17.56: RNC dominicano se muestra como ###-#####-# (3-5-1 = 9 dígitos).
// Si llega algo no estándar, devuelve el string crudo.
export const formatRNC = (rnc) => {
  if (!rnc) return '';
  const d = String(rnc).replace(/\D/g, '');
  if (d.length === 9) return `${d.slice(0, 3)}-${d.slice(3, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`; // cédula 3-7-1
  return d;
};

// Solo los dígitos del RNC (para guardar). Acepta cualquier input con dashes/espacios.
export const limpiarRNC = (rnc) => String(rnc || '').replace(/\D/g, '');
