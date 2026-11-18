// Recorrido de un vehículo en un día (Pressto GPS / GPSWOX get_history).
// GET /api/gps/historial?vehiculoId=..&fecha=YYYY-MM-DD → { puntos, paradas, deviceId }
// Pide sesión (lib/server/sesionInterna.js); el cliente llama con lib/fetchConSesion.js.
import { obtenerHistorialGPS } from '../../../../lib/gps';
import { verificarSesionInterna } from '../../../../lib/server/sesionInterna';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const ses = await verificarSesionInterna(request);
  if (ses.error) return ses.error;
  const { searchParams } = new URL(request.url);
  const vehiculoId = searchParams.get('vehiculoId');
  const fecha = searchParams.get('fecha');
  if (!vehiculoId) return Response.json({ error: 'Falta vehiculoId' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return Response.json({ error: 'Fecha inválida (usa YYYY-MM-DD)' }, { status: 400 });

  const { data: veh, error } = await ses.db.from('vehiculos').select('id, gps_device_id').eq('id', vehiculoId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!veh) return Response.json({ error: 'Vehículo no encontrado' }, { status: 404 });
  if (!veh.gps_device_id) return Response.json({ error: 'Este vehículo no tiene GPS amarrado', puntos: [], paradas: [], deviceId: null }, { status: 422 });
  try {
    const { puntos, paradas } = await obtenerHistorialGPS(veh.gps_device_id, fecha);
    return Response.json({ puntos, paradas, deviceId: veh.gps_device_id });
  } catch (e) {
    return Response.json({ error: e.message || String(e), puntos: [], paradas: [], deviceId: veh.gps_device_id }, { status: 502 });
  }
}
