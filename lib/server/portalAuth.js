// v8.59.1 — Autenticación del portal del cliente, compartida por las rutas de /api/programa.
// Clave del programa en el header x-clave; 8 intentos fallidos por IP cada 15 minutos.
import { createClient } from '@supabase/supabase-js';
import { claveValida } from './portalPrograma';

export const sbServicio = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const intentos = new Map();
const VENTANA = 15 * 60 * 1000;
const bloqueado = (ip) => { const r = intentos.get(ip); return !!r && Date.now() - r.desde <= VENTANA && r.n >= 8; };
const fallo = (ip) => {
  const r = intentos.get(ip);
  if (!r || Date.now() - r.desde > VENTANA) intentos.set(ip, { n: 1, desde: Date.now() });
  else r.n++;
};

/** @returns {{db, programa} | {error: Response}} */
export async function autenticarPortal(request, codigo) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sin-ip';
  if (bloqueado(ip)) return { error: Response.json({ ok: false, error: 'Demasiados intentos. Espera 15 minutos.' }, { status: 429 }) };
  const db = sbServicio();
  const { data: programa } = await db.from('programas')
    .select('id, nombre, cliente_nombre, fecha_meta, clave_portal, archivado')
    .eq('codigo_publico', codigo).maybeSingle();
  const clave = request.headers.get('x-clave') || '';
  if (!programa || programa.archivado || !claveValida(clave, programa.clave_portal)) {
    fallo(ip);
    return { error: Response.json({ ok: false, error: 'Código o clave incorrectos.' }, { status: 401 }) };
  }
  return { db, programa };
}
