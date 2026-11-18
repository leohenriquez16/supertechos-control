// ============================================================
// UTILIDADES DE GEOLOCALIZACIÃ“N
// ============================================================

// Obtiene la ubicaciÃ³n actual del dispositivo. Timeout generoso.
// Retorna {lat, lng, precision} o null si falla (no bloquea nunca).
export function obtenerUbicacion(opciones = {}) {
  return new Promise((resolve) => {
    const timeout = opciones.timeout ?? 12000;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeout + 1000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: Math.round(pos.coords.accuracy || 0),
        });
      },
      (err) => {
        clearTimeout(timer);
        console.warn('Geolocation error:', err?.message || err);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

// Distancia entre dos coordenadas en metros (Haversine)
export function distanciaMetros(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Formatea una distancia en m o km para mostrar
export function formatDistancia(m) {
  if (m == null) return 'â€”';
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Abre Google Maps en nueva pestaÃ±a en la ubicaciÃ³n
export function abrirEnMapa(lat, lng) {
  if (lat == null || lng == null) return;
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  if (typeof window !== 'undefined') window.open(url, '_blank');
}

// v8.24.10: búsqueda de direcciones (geocoding directo) con Nominatim. Prioriza
// República Dominicana. Devuelve [{ lat, lng, label }].
export async function buscarDireccion(query, opts = {}) {
  if (!query || !query.trim()) return [];
  try {
    const cc = opts.pais || 'do';
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=6&accept-language=es&countrycodes=${cc}&q=${encodeURIComponent(query.trim())}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(d => ({ lat: Number(d.lat), lng: Number(d.lon), label: d.display_name }));
  } catch { return []; }
}

// v8.20.9: geocodificación inversa con Nominatim (OpenStreetMap, sin API key).
// Devuelve { sector, ciudad, provincia, pais, direccion } o null si falla.
// Uso ligero/ocasional (sugerencias al crear locaciones).
export async function geocodificarInverso(lat, lng) {
  if (lat == null || lng == null) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1&namedetails=1&accept-language=es&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address || {};
    // Calle (con número si existe).
    const calle = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : '';
    // Nombre del lugar (POI) si el punto cae sobre algo con nombre.
    const nombre = data?.name
      || data?.namedetails?.name
      || a.amenity || a.shop || a.office || a.building || a.tourism || a.leisure || a.industrial || '';
    return {
      sector: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.residential || a.hamlet || '',
      ciudad: a.city || a.town || a.village || a.municipality || a.county || '',
      provincia: a.state || a.region || a.province || a.state_district || '',
      pais: a.country || '',
      calle,
      // Dirección corta: calle (con número); si no hay calle, primer tramo del display_name.
      direccion: calle || (data?.display_name ? String(data.display_name).split(',')[0] : ''),
      nombre: typeof nombre === 'string' ? nombre : '',
    };
  } catch {
    return null;
  }
}
