// v8.9.22: Recibe la credencial generada por el navegador y la guarda en DB
// Nota: validación simplificada (sin verificar attestation completa)

export const runtime = 'edge';

import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const { personaId, credential, deviceName, deviceType, challenge } = await req.json();
    if (!personaId || !credential || !credential.id) {
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_KEY
    );

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
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
