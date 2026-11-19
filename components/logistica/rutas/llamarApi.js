// v8.75: ÚNICO punto por donde Rutas llama a las APIs internas del servidor (GPS, rutas).
// Va con sesión (fetchConSesion): las rutas /api/gps/* y /api/rutas/* responden 401 sin ella.
// El error trae `status` para que la pantalla distinga "no te toca" (403) o
// "espera un momento" (429) de un fallo real.
import { fetchConSesion } from '../../../lib/fetchConSesion';

export async function llamarApi(metodo, url, body) {
  const r = await fetchConSesion(url, { method: metodo, body: body !== undefined ? JSON.stringify(body) : undefined });
  let d = null;
  try { d = await r.json(); } catch { d = null; }
  if (!r.ok) { const e = new Error(d?.error || `Error ${r.status}`); e.status = r.status; throw e; }
  return d;
}
