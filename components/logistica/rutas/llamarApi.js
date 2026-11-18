// v8.75: ÚNICO punto por donde Rutas llama a las APIs del servidor (GPS).
// TODO(rutas-gps): cuando la parte GPS publique su helper de fetch con sesión,
// cambiar SOLO esta función para usarlo. Hoy es un fetch normal.
export async function llamarApi(metodo, url, body) {
  const opts = { method: metodo, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  let d = null;
  try { d = await r.json(); } catch { d = null; }
  if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
  return d;
}
