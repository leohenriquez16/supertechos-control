// v8.17.89: Cambio de PIN server-side. Hashea con bcrypt y persiste.
//
// Sirve tanto para "cambiar mi PIN" (post-onboarding) como para "setear
// PIN de otra persona" (admin invitando o reseteando). El cliente
// registra el audit log después del éxito (mantiene el patrón actual).

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { pinValido } from '../../../../lib/helpers/personas';

const BCRYPT_COST = 10;

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

  const personaId = String(body?.personaId || '').trim();
  const nuevoPin = String(body?.nuevoPin || '');
  const marcarPinTemporal = body?.marcarPinTemporal === true; // opcional

  if (!personaId) {
    return Response.json({ error: 'personaId requerido' }, { status: 400 });
  }
  if (!pinValido(nuevoPin)) {
    return Response.json({ error: 'El PIN debe tener entre 4 y 6 dígitos' }, { status: 400 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  let hash;
  try {
    hash = await bcrypt.hash(nuevoPin, BCRYPT_COST);
  } catch (e) {
    console.error('cambiar-pin: bcrypt.hash falló:', e.message);
    return Response.json({ error: 'No se pudo hashear el PIN' }, { status: 500 });
  }

  const updates = {
    pin: hash,
    pin_temporal: !!marcarPinTemporal,
  };

  const { error } = await sb.from('personal').update(updates).eq('id', personaId);
  if (error) {
    console.error('cambiar-pin: update falló:', error.message);
    return Response.json({ error: 'No se pudo actualizar el PIN' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
