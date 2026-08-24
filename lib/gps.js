// lib/gps.js — v8.43.0
// Cliente del GPS de la flota (Pressto GPS, plataforma GPSWOX).
// Server-side only: usa GPS_API_URL + GPS_API_KEY (user_api_hash).

export async function obtenerDispositivosGPS() {
  const base = process.env.GPS_API_URL;
  const key = process.env.GPS_API_KEY;
  if (!base || !key) throw new Error('Faltan GPS_API_URL / GPS_API_KEY');
  const url = `${base.replace(/\/$/, '')}/api/get_devices?user_api_hash=${encodeURIComponent(key)}&lang=en`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GPS API ${res.status}`);
  const grupos = await res.json();
  const out = [];
  (Array.isArray(grupos) ? grupos : []).forEach(g => (g.items || []).forEach(d => {
    out.push({
      id: d.id,
      nombre: d.name || `#${d.id}`,
      lat: d.lat ?? null, lng: d.lng ?? null,
      velocidad: Number(d.speed) || 0,
      rumbo: d.course ?? null,
      online: d.online || 'offline',        // online | ack | offline
      hora: d.time || null,
      timestamp: d.timestamp || null,
    });
  }));
  return out;
}
