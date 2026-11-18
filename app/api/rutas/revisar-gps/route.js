// Cruza las paradas de los viajes con el recorrido del GPS (Pressto / GPSWOX).
// POST /api/rutas/revisar-gps  body { fecha?: 'YYYY-MM-DD', viajeId? }
//   - Por cada viaje (no cancelado) de esa fecha —o solo ese viaje— cuyo vehículo
//     tenga gps_device_id: baja el historial del día y busca la primera visita a
//     cada parada (lib/helpers/rutas.js cruzarParadasConGps).
//   - Guarda llegada/salida/permanencia/distancia en cada parada visitada.
//   - Si la parada estaba 'pendiente' y el GPS dice que la visitó, la marca
//     completada (completada_at = llegada, completada_por = 'gps'). Decisión de
//     Leo: el GPS la marca sola. Mismos efectos que "✓ Hecha" desde oficina:
//     la diligencia se cierra y la requisición (si no es recogida) pasa a entregada.
//   - Guarda viajes.gps_revisado_at.
// Devuelve { viajes: [{ id, paradas: [...] }], errores: [...] }.
// Pide sesión (lib/server/sesionInterna.js) o Bearer CRON_SECRET (para un cron futuro).
import { obtenerHistorialGPS } from '../../../../lib/gps';
import { verificarSesionInterna } from '../../../../lib/server/sesionInterna';
import { cruzarParadasConGps, PARADA_CANCELADA, VIAJE_CANCELADO } from '../../../../lib/helpers/rutas';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const horaRD = (iso) => new Date(iso).toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit', hour12: true });
const num = (x) => (x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);

function notaGps(prev, v) {
  const min = Math.max(1, Math.round(v.permanenciaS / 60));
  const linea = `Marcada hecha por GPS: llegó ${horaRD(v.llegada)}, estuvo ${min} min`;
  return [String(prev || '').trim(), linea].filter(Boolean).join('\n');
}

export async function POST(request) {
  const ses = await verificarSesionInterna(request, { permitirCron: true });
  if (ses.error) return ses.error;
  const db = ses.db;

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const viajeId = body?.viajeId ? String(body.viajeId) : null;
  const fecha = body?.fecha ? String(body.fecha) : (viajeId ? null : hoyRD());
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return Response.json({ error: 'Fecha inválida (usa YYYY-MM-DD)' }, { status: 400 });

  // 1) Viajes con sus paradas
  let q = db.from('viajes').select('id, fecha, estado, vehiculo_id, viaje_paradas(*)');
  q = viajeId ? q.eq('id', viajeId) : q.eq('fecha', fecha);
  const { data: viajesRaw, error: vErr } = await q;
  if (vErr) return Response.json({ error: vErr.message }, { status: 500 });
  const viajes = (viajesRaw || []).filter(v => v.estado !== VIAJE_CANCELADO);
  if (viajeId && !viajes.length) return Response.json({ error: 'Viaje no encontrado o cancelado' }, { status: 404 });

  const errores = [];
  const resultado = [];

  // 2) Vehículos → gps_device_id
  const vehIds = [...new Set(viajes.map(v => v.vehiculo_id).filter(Boolean))];
  const devicePorVeh = {};
  if (vehIds.length) {
    const { data: vehs, error } = await db.from('vehiculos').select('id, gps_device_id').in('id', vehIds);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    (vehs || []).forEach(x => { if (x.gps_device_id) devicePorVeh[x.id] = x.gps_device_id; });
  }

  // 3) Coordenadas de obra para paradas sin lat/lng propias
  const proyIds = [...new Set(viajes.flatMap(v => (v.viaje_paradas || [])
    .filter(p => p.proyecto_id && (p.lat == null || p.lng == null)).map(p => p.proyecto_id)))];
  const coordsObra = {};
  if (proyIds.length) {
    const { data: prs } = await db.from('proyectos').select('id, ubicacion_lat, ubicacion_lng').in('id', proyIds);
    (prs || []).forEach(p => { const lat = num(p.ubicacion_lat), lng = num(p.ubicacion_lng); if (lat != null && lng != null) coordsObra[p.id] = { lat, lng }; });
  }

  // 4) Historial por (dispositivo, fecha) — una sola llamada por camión y día
  const cacheHist = new Map();
  const historial = (deviceId, f) => {
    const k = `${deviceId}|${f}`;
    if (!cacheHist.has(k)) cacheHist.set(k, obtenerHistorialGPS(deviceId, f));
    return cacheHist.get(k);
  };

  const ahora = new Date().toISOString();
  for (const v of viajes) {
    const deviceId = v.vehiculo_id ? devicePorVeh[v.vehiculo_id] : null;
    if (!deviceId) { errores.push({ viajeId: v.id, error: v.vehiculo_id ? 'El vehículo no tiene GPS amarrado' : 'El viaje no tiene vehículo de la flota' }); continue; }
    let puntos;
    try { ({ puntos } = await historial(deviceId, v.fecha)); }
    catch (e) { errores.push({ viajeId: v.id, error: e?.message || String(e) }); continue; }

    const paradas = (v.viaje_paradas || []).filter(p => p.estado !== PARADA_CANCELADA).map(p => {
      const c = (p.lat != null && p.lng != null) ? { lat: Number(p.lat), lng: Number(p.lng) } : coordsObra[p.proyecto_id] || null;
      return { ...p, proyectoId: p.proyecto_id || null, lat: c?.lat ?? null, lng: c?.lng ?? null };
    });
    const visitas = cruzarParadasConGps(paradas, puntos);
    const salida = [];

    for (const p of paradas) {
      const vis = visitas[p.id];
      if (!vis) { salida.push({ id: p.id, visitada: false, sinCoordenadas: p.lat == null || p.lng == null }); continue; }
      const u = { llegada_gps_at: vis.llegada, salida_gps_at: vis.salida, permanencia_gps_s: vis.permanenciaS, distancia_gps_m: vis.distanciaM };
      const marcar = p.estado === 'pendiente';
      if (marcar) {
        u.estado = 'completada';
        u.completada_at = vis.llegada;
        u.completada_por = 'gps';
        u.notas = notaGps(p.notas, vis);
      }
      const { error: upErr } = await db.from('viaje_paradas').update(u).eq('id', p.id);
      if (upErr) { errores.push({ viajeId: v.id, paradaId: p.id, error: upErr.message }); continue; }
      if (marcar) {
        // Mismos efectos que marcar hecha desde oficina (no bloquean la parada).
        if (p.diligencia_id) {
          const { error } = await db.from('diligencias').update({ estado: 'completada', completada_at: vis.llegada }).eq('id', p.diligencia_id);
          if (error) errores.push({ viajeId: v.id, paradaId: p.id, error: `Diligencia: ${error.message}` });
        }
        if (p.requisicion_id && p.tipo !== 'recogida') {
          const { error } = await db.from('requisiciones').update({ estado: 'entregada', entregada_at: vis.llegada, updated_at: ahora }).eq('id', p.requisicion_id);
          if (error) errores.push({ viajeId: v.id, paradaId: p.id, error: `Requisición: ${error.message}` });
        }
      }
      salida.push({ id: p.id, visitada: true, marcadaPorGps: marcar, ...vis });
    }

    const { error: vUpErr } = await db.from('viajes').update({ gps_revisado_at: ahora }).eq('id', v.id);
    if (vUpErr) errores.push({ viajeId: v.id, error: vUpErr.message });
    resultado.push({ id: v.id, paradas: salida });
  }

  return Response.json({ viajes: resultado, errores, fecha, revisadoAt: ahora });
}
