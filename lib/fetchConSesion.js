// fetch para las rutas internas de /api que piden sesión (GPS, rutas).
// Agrega:
//   - Authorization: Bearer <access_token> si hay sesión Supabase.
//   - x-usuario-id: el id de la persona logueada (localStorage 'supertechos_usuario_id').
// Uso igual que fetch: fetchConSesion('/api/gps/posiciones').then(r => r.json())
// Con body JSON: fetchConSesion(url, { method: 'POST', body: JSON.stringify({...}) })
// (pone Content-Type: application/json si hay body string y no se indicó otro).
import { supabase } from './supabase';

export async function headersDeSesion() {
  const h = {};
  try {
    const { data } = await supabase.auth.getSession();
    const tok = data?.session?.access_token;
    if (tok) h.Authorization = `Bearer ${tok}`;
  } catch { /* sin sesión Supabase: sigue con el id */ }
  try {
    const id = typeof window !== 'undefined' ? localStorage.getItem('supertechos_usuario_id') : null;
    if (id) h['x-usuario-id'] = id;
  } catch { /* localStorage bloqueado */ }
  return h;
}

export async function fetchConSesion(url, opciones = {}) {
  const extra = await headersDeSesion();
  const headers = new Headers(opciones.headers || {});
  Object.entries(extra).forEach(([k, v]) => { if (!headers.has(k)) headers.set(k, v); });
  if (typeof opciones.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(url, { ...opciones, headers });
}

export default fetchConSesion;
