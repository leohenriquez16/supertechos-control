// v8.17.92: Inicia autenticación biométrica — devuelve challenge + lista de
// credenciales válidas.
//
// Cambio: node runtime + service role (antes edge + anon). PR 2C.1 activa
// RLS en webauthn_credentials, y este endpoint corre antes de cualquier
// sesión Supabase del user (la sesión se emite recién en login-finish tras
// verificar la credencial). Service role bypassea RLS para listar las
// credenciales necesarias.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

function randomBase64(len = 32) {
  return randomBytes(len).toString('base64url');
}

export async function POST(req) {
  try {
    const { personaId } = await req.json(); // opcional: si se sabe quién, restringe a sus credenciales

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return Response.json({ error: 'Falta configuración de Supabase en el servidor' }, { status: 500 });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    let query = supabase.from('webauthn_credentials').select('credential_id, transports, persona_id').eq('revocado', false);
    if (personaId) query = query.eq('persona_id', personaId);

    const { data: creds, error } = await query;
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!creds || creds.length === 0) {
      return Response.json({ error: 'Sin credenciales registradas' }, { status: 404 });
    }

    const challenge = randomBase64(32);
    const rpID = new URL(req.url).hostname;

    const options = {
      challenge,
      timeout: 60000,
      rpId: rpID,
      userVerification: 'required',
      allowCredentials: creds.map(c => ({
        id: c.credential_id,
        type: 'public-key',
        transports: c.transports ? JSON.parse(c.transports) : [],
      })),
    };

    return Response.json({ options, challenge });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
