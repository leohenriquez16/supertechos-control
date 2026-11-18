// v8.43.0: posiciones EN VIVO de la flota (Pressto GPS / GPSWOX).
// Pide sesión (lib/server/sesionInterna.js); el cliente llama con lib/fetchConSesion.js.
import { obtenerDispositivosGPS } from '../../../../lib/gps';
import { verificarSesionInterna } from '../../../../lib/server/sesionInterna';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const ses = await verificarSesionInterna(request);
  if (ses.error) return ses.error;
  try {
    const dispositivos = await obtenerDispositivosGPS();
    return Response.json({ dispositivos, at: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: e.message || String(e), dispositivos: [] }, { status: 500 });
  }
}
