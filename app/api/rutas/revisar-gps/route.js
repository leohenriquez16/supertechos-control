// Cruza las paradas de los viajes con el recorrido del GPS (Pressto / GPSWOX).
// POST /api/rutas/revisar-gps  body { fecha?: 'YYYY-MM-DD', viajeId? }
//   - Solo oficina/logística (roles admin | almacen | logistica) o el cron.
//   - Por cada viaje (no cancelado) de esa fecha —o solo ese viaje— cuyo vehículo
//     tenga gps_device_id: baja el historial del día (recortado a ese día) y lo
//     cruza con las paradas DENTRO DE LA VENTANA DEL VIAJE (hora_inicio →
//     hora_fin o ahora) y EN EL ORDEN de la ruta (lib/helpers/rutas.js).
//   - Guarda llegada/salida/permanencia/distancia en cada parada (solo si cambió),
//     en un update que no toca estado ni notas.
//   - Si el viaje ya inició (tiene hora_inicio) y la parada sigue 'pendiente',
//     la marca completada (completada_at = llegada, completada_por = 'gps') con un
//     update CONDICIONAL (.eq('estado','pendiente')): si el chofer u oficina la
//     marcaron entre la lectura y la escritura, no se pisa. Decisión de Leo: el
//     GPS la marca sola. Efectos (solo si de verdad marcó): la diligencia se
//     cierra y la requisición (si no es recogida) pasa a entregada.
//   - Viaje 'planificado' sin hora_inicio: guarda los datos GPS, NO marca.
//   - Se salta viajes revisados hace < 4 min, y los de días pasados ya revisados
//     después del cierre de ese día (no van a cambiar).
//   - Guarda viajes.gps_revisado_at.
// Devuelve { viajes: [{ id, paradas: [...] }], errores: [...], omitidos: [...] }.
//   omitidos = viajes sin vehículo de la flota / sin GPS / revisados hace poco:
//   es normal, la pantalla no debe mostrarlo como fallo.
// Pide sesión (lib/server/sesionInterna.js) o Bearer CRON_SECRET (para un cron futuro).
import { obtenerHistorialGPS } from '../../../../lib/gps';
import { verificarSesionInterna, tieneRolInterno } from '../../../../lib/server/sesionInterna';
import { crearLimitador } from '../../../../lib/server/limiteFrecuencia';
import { cruzarParadasConGps, ventanaViajeGps, cambioDatosGps, esParadaBase, PARADA_CANCELADA, VIAJE_CANCELADO } from '../../../../lib/helpers/rutas';
import { OFICINA } from '../../../../lib/helpers/rutasOficina';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const num = (x) => (x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const ROLES_PERMITIDOS = ['admin', 'almacen', 'logistica'];
const REVISION_MIN_MS = 4 * 60 * 1000;
// Una corrida por persona y (viaje | fecha) cada 60 s; y no más de una cada 10 s por persona.
const porClave = crearLimitador({ ventanaMs: 60 * 1000 });
const porPersona = crearLimitador({ ventanaMs: 10 * 1000 });
const finDelDiaMs = (fecha) => Date.parse(`${fecha}T23:59:59.999-04:00`);

export async function POST(request) {
  const ses = await verificarSesionInterna(request, { permitirCron: true });
  if (ses.error) return ses.error;
  if (!tieneRolInterno(ses, ROLES_PERMITIDOS)) {
    return Response.json({ error: 'Solo la oficina de logística puede revisar el GPS de las rutas.' }, { status: 403 });
  }
  const db = ses.db;

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const viajeId = body?.viajeId ? String(body.viajeId) : null;
  const fecha = body?.fecha ? String(body.fecha) : (viajeId ? null : hoyRD());
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return Response.json({ error: 'Fecha inválida (usa YYYY-MM-DD)' }, { status: 400 });
  if (viajeId && viajeId.length > 64) return Response.json({ error: 'Viaje inválido' }, { status: 400 });

  // Límite de frecuencia (en memoria). El cron no se limita.
  if (ses.via !== 'cron') {
    const quien = ses.persona?.id || 'anon';
    const clave = `${quien}|${viajeId ? `v:${viajeId}` : `f:${fecha}`}`;
    // Misma persona y mismo día/viaje dentro de 60 s: no se repite (respuesta vacía, sin aviso).
    const l1 = porClave(clave, Date.now(), { soloConsultar: true });
    if (!l1.ok) return Response.json({ viajes: [], errores: [], omitidos: [], fecha, limitado: true, esperaS: l1.esperaS });
    // Ráfaga de la misma persona (distintos días/viajes): 429.
    const l2 = porPersona(quien);
    if (!l2.ok) return Response.json({ error: `Espera ${l2.esperaS} s antes de revisar otra vez.` }, { status: 429 });
    porClave(clave);
  }

  // 1) Viajes con sus paradas
  let q = db.from('viajes').select('id, fecha, estado, vehiculo_id, hora_inicio, hora_fin, gps_revisado_at, viaje_paradas(*)');
  q = viajeId ? q.eq('id', viajeId) : q.eq('fecha', fecha);
  const { data: viajesRaw, error: vErr } = await q;
  if (vErr) return Response.json({ error: vErr.message }, { status: 500 });
  const viajes = (viajesRaw || []).filter(v => v.estado !== VIAJE_CANCELADO);
  if (viajeId && !viajes.length) return Response.json({ error: 'Viaje no encontrado o cancelado' }, { status: 404 });

  const errores = [];
  const omitidos = [];
  const resultado = [];
  const ahoraMs = Date.now();
  const ahora = new Date(ahoraMs).toISOString();

  // Saltar lo que no va a cambiar: revisado hace < 4 min, o día pasado ya
  // revisado después del cierre de ese día (+ 1 h de margen).
  const porRevisar = viajes.filter(v => {
    const rev = v.gps_revisado_at ? Date.parse(v.gps_revisado_at) : NaN;
    if (Number.isFinite(rev) && ahoraMs - rev < REVISION_MIN_MS) { omitidos.push({ viajeId: v.id, motivo: 'revisado hace poco' }); return false; }
    const fin = finDelDiaMs(v.fecha);
    if (Number.isFinite(rev) && Number.isFinite(fin) && fin < ahoraMs && rev > fin + 3600 * 1000) { omitidos.push({ viajeId: v.id, motivo: 'día cerrado ya revisado' }); return false; }
    return true;
  });

  // 2) Vehículos → gps_device_id
  const vehIds = [...new Set(porRevisar.map(v => v.vehiculo_id).filter(Boolean))];
  const devicePorVeh = {};
  if (vehIds.length) {
    const { data: vehs, error } = await db.from('vehiculos').select('id, gps_device_id').in('id', vehIds);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    (vehs || []).forEach(x => { if (x.gps_device_id) devicePorVeh[x.id] = x.gps_device_id; });
  }

  // 3) Coordenadas de obra para paradas sin lat/lng propias
  const proyIds = [...new Set(porRevisar.flatMap(v => (v.viaje_paradas || [])
    .filter(p => p.proyecto_id && (p.lat == null || p.lng == null)).map(p => p.proyecto_id)))];
  const coordsObra = {};
  if (proyIds.length) {
    const { data: prs } = await db.from('proyectos').select('id, ubicacion_lat, ubicacion_lng').in('id', proyIds);
    (prs || []).forEach(p => { const lat = num(p.ubicacion_lat), lng = num(p.ubicacion_lng); if (lat != null && lng != null) coordsObra[p.id] = { lat, lng }; });
  }

  // 4) Historial por (dispositivo, fecha): una llamada por camión y día, todas EN PARALELO.
  const conGps = [];
  porRevisar.forEach(v => {
    const deviceId = v.vehiculo_id ? devicePorVeh[v.vehiculo_id] : null;
    if (!deviceId) omitidos.push({ viajeId: v.id, motivo: v.vehiculo_id ? 'El vehículo no tiene GPS amarrado' : 'El viaje no tiene vehículo de la flota' });
    else conGps.push({ v, deviceId });
  });
  const cacheHist = new Map();
  conGps.forEach(({ v, deviceId }) => {
    const k = `${deviceId}|${v.fecha}`;
    if (!cacheHist.has(k)) cacheHist.set(k, obtenerHistorialGPS(deviceId, v.fecha).then(r => ({ r }), e => ({ e })));
  });

  for (const { v, deviceId } of conGps) {
    const h = await cacheHist.get(`${deviceId}|${v.fecha}`);
    if (h.e) { errores.push({ viajeId: v.id, error: h.e?.message || String(h.e) }); continue; }
    const puntos = h.r?.puntos || [];

    const ventana = ventanaViajeGps(v, { ahoraMs });
    const paradas = (v.viaje_paradas || []).filter(p => p.estado !== PARADA_CANCELADA).map(p => {
      const propia = p.lat != null && p.lng != null;
      const c = propia ? { lat: Number(p.lat), lng: Number(p.lng) } : coordsObra[p.proyecto_id] || null;
      const x = { ...p, proyectoId: p.proyecto_id || null, usaPinObra: !propia && !!c, lat: c?.lat ?? null, lng: c?.lng ?? null };
      return { ...x, esBase: esParadaBase(x, OFICINA) };
    });
    const visitas = cruzarParadasConGps(paradas, puntos, { desde: ventana.desde, hasta: ventana.hasta });
    const salida = [];

    for (const p of paradas) {
      const vis = visitas[p.id] || null;

      // a) Datos GPS: update aparte, sin tocar estado ni notas, solo si cambió.
      if (cambioDatosGps(p, vis)) {
        const u = vis
          ? { llegada_gps_at: vis.llegada, salida_gps_at: vis.salida, permanencia_gps_s: vis.permanenciaS, distancia_gps_m: vis.distanciaM }
          : { llegada_gps_at: null, salida_gps_at: null, permanencia_gps_s: null, distancia_gps_m: null };
        const { error: upErr } = await db.from('viaje_paradas').update(u).eq('id', p.id);
        if (upErr) { errores.push({ viajeId: v.id, paradaId: p.id, error: upErr.message }); continue; }
      }
      if (!vis) { salida.push({ id: p.id, visitada: false, sinCoordenadas: p.lat == null || p.lng == null }); continue; }

      // b) Marcar hecha: solo si el viaje ya inició y la parada SIGUE pendiente.
      let marcada = false;
      if (ventana.puedeMarcar && p.estado === 'pendiente') {
        const { data: filas, error: mErr } = await db.from('viaje_paradas')
          .update({ estado: 'completada', completada_at: vis.llegada, completada_por: 'gps' })
          .eq('id', p.id).eq('estado', 'pendiente').select('id');
        if (mErr) errores.push({ viajeId: v.id, paradaId: p.id, error: mErr.message });
        marcada = !mErr && Array.isArray(filas) && filas.length > 0;
      }
      if (marcada) {
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
      salida.push({ id: p.id, visitada: true, marcadaPorGps: marcada, ...vis });
    }

    const { error: vUpErr } = await db.from('viajes').update({ gps_revisado_at: ahora }).eq('id', v.id);
    if (vUpErr) errores.push({ viajeId: v.id, error: vUpErr.message });
    resultado.push({ id: v.id, paradas: salida, marcaAutomatica: ventana.puedeMarcar });
  }

  return Response.json({ viajes: resultado, errores, omitidos, fecha, revisadoAt: ahora });
}
