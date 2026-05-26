// v8.17.91: Login server-side con PIN hash bcrypt + emisión de sesión Supabase.
//
// Histórico:
//   - v8.17.89 (PR 2): mover login al server con bcrypt. Cliente solo recibe
//     persona, nunca el hash.
//   - v8.17.90 (PR 2A): agregar bridge personal.auth_user_id ↔ auth.users.
//   - v8.17.91 (este, PR 2B): tras validar el PIN, emitir un magiclink token_hash
//     via Admin API. El cliente lo verifica con verifyOtp y queda con sesión
//     Supabase real (auth.uid() poblado) — base para RLS gradual en PR 2C+.
//
// Fallback de defensa en profundidad: si por cualquier razón (persona sin
// auth_user_id, Admin API caída, race de backfill) no se puede emitir
// sesión, el endpoint devuelve solo { persona } y el cliente sigue
// funcionando como en PR 2. NUNCA bloquea el login.
//
// Lazy migration de PINs (heredada de PR 2): si la columna `pin` aún trae
// plaintext, compara directo y re-hashea on-the-fly.

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
  // v8.17.91: incluir auth_user_id para emitir sesión Supabase si está disponible.
  const sufijo = tel.slice(-10);
  const { data: candidatos, error } = await sb
    .from('personal')
    .select('id, telefono, pin, auth_user_id')
    .ilike('telefono', `%${sufijo.slice(-4)}%`);

  if (error) {
    console.error('login: error fetching personal:', error.message);
    return Response.json({ error: ERROR_GENERICO }, { status: 401 });
  }

  const persona = (candidatos || []).find(
    p => normalizarTelefono(p.telefono) === tel
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

  // v8.17.91: intentar emitir sesión Supabase via Admin API. Si falla por
  // cualquier razón, el endpoint sigue devolviendo { persona } y el cliente
  // funciona como en PR 2 (sin sesión Supabase). NUNCA bloquea el login.
  const otp = await emitirSesionSupabase(sb, persona.auth_user_id);

  return Response.json({ persona: mapPersonaRow(full), ...(otp && { otp }) });
}

// Emite un token_hash de magiclink para que el cliente lo intercambie por
// sesión via supabase.auth.verifyOtp. Patrón documentado de Supabase para
// custom auth bridge (cuando ya validaste credenciales con tu propio mecanismo).
//
// Devuelve { token_hash, type, email } o null si no fue posible emitir
// (persona sin auth_user_id, Admin API caída, etc.).
async function emitirSesionSupabase(sb, authUserId) {
  if (!authUserId) return null;
  try {
    const { data: user, error: userErr } = await sb.auth.admin.getUserById(authUserId);
    if (userErr || !user?.user?.email) {
      console.warn('login: no se pudo obtener email del auth.user', authUserId, userErr?.message);
      return null;
    }
    const email = user.user.email;
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr) {
      console.warn('login: generateLink falló para', email, linkErr.message);
      return null;
    }
    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) {
      console.warn('login: generateLink no devolvió hashed_token para', email);
      return null;
    }
    return { token_hash: tokenHash, type: 'magiclink', email };
  } catch (e) {
    console.warn('login: emisión de sesión Supabase falló:', e.message);
    return null;
  }
}
