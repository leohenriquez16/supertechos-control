// Enlaces de navegación para el chofer (Waze / Google Maps). Funciones puras,
// sin dependencias, para poder probarlas en node.

const tieneCoords = (p) => p && p.lat != null && p.lng != null && p.lat !== '' && p.lng !== ''
  && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
const ll = (lat, lng) => `${Number(lat)},${Number(lng)}`;

// Waze abre la app directo en el celular (o la web si no la tiene).
export function urlWaze(lat, lng) {
  if (!tieneCoords({ lat, lng })) return null;
  return `https://waze.com/ul?ll=${ll(lat, lng)}&navigate=yes`;
}

// Google Maps con navegación al destino desde donde está el chofer.
export function urlGoogleDestino(lat, lng) {
  if (!tieneCoords({ lat, lng })) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${ll(lat, lng)}&travelmode=driving&dir_action=navigate`;
}

// Tramos de la ruta completa: Google Maps acepta pocas paradas intermedias, así que
// se parte de `max` en `max`. Cada tramo sale desde donde esté el chofer; destino =
// la última parada del tramo, waypoints = las anteriores (separadas por %7C).
// Solo cuenta paradas con lat/lng. Cada tramo trae las paradas que cubre para
// poder rotular el botón ("Ruta 1–9" usando p.numero si viene).
export function tramosRuta(paradas, max = 9) {
  const conCoords = (paradas || []).filter(tieneCoords);
  const tam = Math.max(1, Math.floor(max) || 9);
  const tramos = [];
  for (let i = 0; i < conCoords.length; i += tam) {
    const grupo = conCoords.slice(i, i + tam);
    const destino = grupo[grupo.length - 1];
    const intermedias = grupo.slice(0, -1);
    let url = `https://www.google.com/maps/dir/?api=1&destination=${ll(destino.lat, destino.lng)}&travelmode=driving`;
    if (intermedias.length) url += `&waypoints=${intermedias.map(p => ll(p.lat, p.lng)).join('%7C')}`;
    url += '&dir_action=navigate';
    tramos.push({ url, paradas: grupo });
  }
  return tramos;
}

// Contrato: arreglo de URLs, una por tramo.
export function urlGoogleRuta(paradas, max = 9) {
  return tramosRuta(paradas, max).map(t => t.url);
}

// Rótulo del botón de un tramo: "Ruta 1–9", "Ruta 10–12", "Ruta 13".
export function rotuloTramo(tramo, indice, max = 9) {
  const nums = (tramo?.paradas || []).map(p => p.numero).filter(n => n != null);
  const desde = nums.length ? nums[0] : indice * max + 1;
  const hasta = nums.length ? nums[nums.length - 1] : indice * max + (tramo?.paradas?.length || 1);
  return desde === hasta ? `Ruta ${desde}` : `Ruta ${desde}–${hasta}`;
}
