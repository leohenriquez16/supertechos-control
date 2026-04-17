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
