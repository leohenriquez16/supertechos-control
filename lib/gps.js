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

// ------------------------------------------------------------
// Historial de un día de un dispositivo (GPSWOX get_history).
// Devuelve { puntos:[{lat,lng,t,speed}], paradas:[{lat,lng,desde,hasta,dur_s}] }
// con t/desde/hasta en ISO (UTC). Tolerante al formato: grupos en items[] con
// sus puntos en items[].items[] (lat/lng/time/raw_time/speed).
// v8.75.1: en PRESSTO tanto raw_time como time vienen en la HORA LOCAL de la cuenta
// (RD, -04:00; se cambia con GPS_TZ_OFFSET). Verificado contra producción: el Kia del
// 17-nov arrancó a las 05:57 hora RD (reporte diario de Pressto) y get_history trae
// raw_time '05:57'. Si algún día viniera en UTC: GPS_RAW_TIME_UTC=1.
// ------------------------------------------------------------
const TZ_GPS = () => process.env.GPS_TZ_OFFSET || '-04:00';
const RAW_UTC = () => process.env.GPS_RAW_TIME_UTC === '1';

// '2026-11-18 09:00:00' | '18-11-2026 09:00:00' | epoch (s/ms) → ISO | null
export function fechaGpsAISO(v, { utc = false } = {}) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) {
    const n = Number(v); const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms); return isNaN(d) ? null : d.toISOString();
  }
  let s = String(v).trim();
  const dmy = s.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (dmy) s = `${dmy[3]}-${dmy[2]}-${dmy[1]} ${dmy[4]}`;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d.toISOString(); }
  const tz = m[5] || (utc ? 'Z' : TZ_GPS());
  const d = new Date(`${m[1]}T${m[2]}${m[3] || ':00'}${tz}`);
  return isNaN(d) ? null : d.toISOString();
}

const tPunto = (p) => fechaGpsAISO(p.raw_time, { utc: RAW_UTC() }) || fechaGpsAISO(p.timestamp) || fechaGpsAISO(p.time);

export function normalizarHistorialGPS(json) {
  const grupos = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
  const puntos = [];
  const paradas = [];
  grupos.forEach(g => {
    const its = Array.isArray(g?.items) ? g.items : [];
    const propios = [];
    its.forEach(p => {
      const lat = Number(p?.lat ?? p?.latitude), lng = Number(p?.lng ?? p?.longitude);
      const t = tPunto(p || {});
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !t || (lat === 0 && lng === 0)) return;
      const pt = { lat, lng, t, speed: Number(p.speed) || 0 };
      propios.push(pt); puntos.push(pt);
    });
    // status 2 = parada (stop) en GPSWOX. Mientras está parqueado el equipo casi
    // no reporta: se agregan puntos sintéticos al inicio y fin de la parada para
    // que el cruce vea toda la permanencia.
    if (Number(g?.status) === 2 && propios.length) {
      const { lat, lng } = propios[0];
      const desde = fechaGpsAISO(g.raw_time, { utc: RAW_UTC() }) || propios[0].t;
      const durG = Number(g.time_seconds ?? g.duration);
      let hasta = propios[propios.length - 1].t;
      if (Number.isFinite(durG) && durG > 0) hasta = new Date(Date.parse(desde) + durG * 1000).toISOString();
      const dur_s = Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / 1000));
      paradas.push({ lat, lng, desde, hasta, dur_s });
      puntos.push({ lat, lng, t: desde, speed: 0, sintetico: true }, { lat, lng, t: hasta, speed: 0, sintetico: true });
    }
  });
  // ordenar y quitar duplicados exactos
  const vistos = new Set();
  const limpios = puntos
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
    .filter(p => { const k = `${p.t}|${p.lat}|${p.lng}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  return { puntos: limpios, paradas };
}

// Recorta el historial al día pedido en la zona de la cuenta GPS:
// [fecha 00:00, min(fecha 23:59:59.999, ahora)]. Un grupo de parada que empezó
// el día anterior (o cuya duración pasa de la medianoche o de ahora) traía puntos
// fuera del día y producía "llegadas de ayer". Los puntos reales fuera del rango
// se descartan; los sintéticos de una parada se ajustan al borde del rango.
export function recortarHistorialAlDia({ puntos = [], paradas = [] } = {}, fecha, { ahoraMs = Date.now() } = {}) {
  const ini = Date.parse(`${fecha}T00:00:00.000${TZ_GPS()}`);
  const finDia = Date.parse(`${fecha}T23:59:59.999${TZ_GPS()}`);
  if (!Number.isFinite(ini) || !Number.isFinite(finDia)) return { puntos, paradas };
  const fin = Math.min(finDia, ahoraMs);
  if (fin < ini) return { puntos: [], paradas: [] };
  const iso = (ms) => new Date(ms).toISOString();
  const vistos = new Set();
  const ps = [];
  (puntos || []).forEach(p => {
    let ms = Date.parse(p.t);
    if (!Number.isFinite(ms)) return;
    if (ms < ini || ms > fin) { if (!p.sintetico) return; ms = Math.min(fin, Math.max(ini, ms)); }
    const q = { ...p, t: iso(ms) };
    const k = `${q.t}|${q.lat}|${q.lng}`;
    if (vistos.has(k)) return; vistos.add(k);
    ps.push(q);
  });
  ps.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const pars = (paradas || []).map(x => {
    const d = Math.max(ini, Date.parse(x.desde)), h = Math.min(fin, Date.parse(x.hasta));
    if (!Number.isFinite(d) || !Number.isFinite(h) || h < d) return null;
    return { ...x, desde: iso(d), hasta: iso(h), dur_s: Math.round((h - d) / 1000) };
  }).filter(Boolean);
  return { puntos: ps, paradas: pars };
}

export async function obtenerHistorialGPS(deviceId, fecha) {
  const base = process.env.GPS_API_URL;
  const key = process.env.GPS_API_KEY;
  if (!base || !key) throw new Error('Faltan GPS_API_URL / GPS_API_KEY');
  if (!deviceId) throw new Error('El vehículo no tiene GPS amarrado (gps_device_id)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) throw new Error('Fecha inválida (usa YYYY-MM-DD)');
  const qs = new URLSearchParams({
    user_api_hash: key, device_id: String(deviceId),
    from_date: fecha, from_time: '00:00:00', to_date: fecha, to_time: '23:59:59', lang: 'es',
  });
  const url = `${base.replace(/\/$/, '')}/api/get_history?${qs}`;
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); }
  catch (e) { throw new Error(`No se pudo conectar al GPS: ${e?.message || e}`); }
  if (!res.ok) throw new Error(`GPS historial respondió ${res.status}`);
  let json;
  try { json = await res.json(); } catch { throw new Error('GPS historial devolvió algo que no es JSON'); }
  if (json && json.status === 0) throw new Error(`GPS historial: ${json.message || 'error'}`);
  return recortarHistorialAlDia(normalizarHistorialGPS(json), fecha);
}
