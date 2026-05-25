// v8.17.92: Recibe la credencial generada por el navegador y la guarda en DB.
// Cambio: node runtime + service role (antes edge + anon) — necesario porque
// PR 2C.1 activa RLS en webauthn_credentials. El endpoint funciona aunque la
// persona aún no tenga sesión Supabase (caso típico durante onboarding).

import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const { personaId, credential, deviceName, deviceType, challenge } = await req.json();
    if (!personaId || !credential || !credential.id) {
      return Response.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return Response.json({ error: 'Falta configuración de Supabase en el servidor' }, { status: 500 });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const credentialId = credential.id;
    const publicKey = credential.response?.publicKey ||
                      credential.response?.attestationObject ||
                      credential.rawId ||
                      credential.id;

    const transports = credential.response?.transports || [];

    const { error } = await supabase.from('webauthn_credentials').insert({
      id: 'wa_' + Date.now() + Math.random().toString(36).slice(2, 7),
      persona_id: personaId,
      credential_id: credentialId,
      public_key: publicKey,
      counter: 0,
      device_name: deviceName || 'Dispositivo',
      device_type: deviceType || 'other',
      transports: JSON.stringify(transports),
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
