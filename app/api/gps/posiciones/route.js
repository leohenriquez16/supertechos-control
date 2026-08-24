// v8.43.0: posiciones EN VIVO de la flota (Pressto GPS / GPSWOX).
import { obtenerDispositivosGPS } from '../../../../lib/gps';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dispositivos = await obtenerDispositivosGPS();
    return Response.json({ dispositivos, at: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: e.message || String(e), dispositivos: [] }, { status: 500 });
  }
}
