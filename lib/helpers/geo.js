// lib/helpers/geo.js — v8.45.0
// Utilidades de coordenadas compartidas (Rutas, Levantamientos, Clientes).
// parseCoords acepta "18.48, -69.91" o un link de Google Maps
// (…@18.48,-69.91… | …?q=18.48,-69.91…).
export const parseCoords = (str) => {
  const s = String(str || '');
  const m = s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || s.match(/[?&]q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || s.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
};
