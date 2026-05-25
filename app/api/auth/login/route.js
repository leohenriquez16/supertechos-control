// v8.17.89: Login server-side con PIN hash bcrypt.
//
// Antes: lib/db.js loginConTelefono hacía SELECT * desde el browser con
// anon key — cualquier cliente con la anon key podía leer todos los PINs
// en plaintext. Ahora el endpoint usa service role, bcrypt.compare, y
// nunca devuelve el PIN al frontend.
//
// Lazy migration: si la columna `pin` aún trae plaintext (legacy de
// antes de hashear), compara directo y re-hashea on-the-fly. Así no se
// rompen logins existentes aunque el script de migración no se haya
// corrido. El script idempotente debe correrse una vez para dejar todo
// limpio en producción.

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { normalizarTelefono, mapPersonaRow, esHashBcrypt } from '../../../../lib/helpers/personas';

const BCRYPT_COST = 10;
const ERROR_GENERICO = 'Teléfono o PIN incorrecto';

export async function POST(request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: 'Falta configuración de Supabase en el servidor' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const tel = normalizarTelefono(body?.telefono);
  const pin = String(body?.pin || '');

  if (tel.length !== 10 || !pin) {
    return Response.json({ error: ERROR_GENERICO }, { status: 401 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Trae candidatos por sufijo del teléfono y normaliza en memoria.
  // El teléfono guardado puede tener formato variado ("+1 809…", con espacios,
  // con guiones) — el sufijo de 10 dígitos es lo confiable.
  const sufijo = tel.slice(-10);
  const { data: candidatos, error } = await sb
    .from('personal')
    .select('id, telefono, pin, archivado')
    .ilike('telefono', `%${sufijo.slice(-4)}%`);

  if (error) {
    console.error('login: error fetching personal:', error.message);
    return Response.json({ error: ERROR_GENERICO }, { status: 401 });
  }

  const persona = (candidatos || []).find(
    p => !p.archivado && normalizarTelefono(p.telefono) === tel
  );
  if (!persona || !persona.pin) {
    return Response.json({ error: ERROR_GENERICO }, { status: 401 });
  }

  // Comparación: bcrypt si ya es hash, plaintext si es legacy.
  let match = false;
  let necesitaRehash = false;
  if (esHashBcrypt(persona.pin)) {
    try {
      match = await bcrypt.compare(pin, persona.pin);
    } catch (e) {
      console.error('login: bcrypt.compare falló:', e.message);
      match = false;
    }
  } else {
    // PIN legacy en plaintext — comparación directa.
    match = persona.pin === pin;
    necesitaRehash = match;
  }

  if (!match) {
    return Response.json({ error: ERROR_GENERICO }, { status: 401 });
  }

  if (necesitaRehash) {
    try {
      const hash = await bcrypt.hash(pin, BCRYPT_COST);
      const { error: upErr } = await sb.from('personal').update({ pin: hash }).eq('id', persona.id);
      if (upErr) console.warn('login: rehash falló para persona', persona.id, upErr.message);
    } catch (e) {
      // Si falla el rehash el login igual procede. El script de migración
      // operacional cubrirá el caso.
      console.warn('login: rehash error:', e.message);
    }
  }

  // Cargar persona completa (todos los campos que necesita el front).
  const { data: full, error: fullErr } = await sb
    .from('personal')
    .select('*')
    .eq('id', persona.id)
    .maybeSingle();
  if (fullErr || !full) {
    return Response.json({ error: ERROR_GENERICO }, { status: 401 });
  }

  return Response.json({ persona: mapPersonaRow(full) });
}
