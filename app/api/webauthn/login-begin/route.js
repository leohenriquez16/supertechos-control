// v8.9.22: Inicia autenticación biométrica
// Devuelve challenge + lista de credenciales válidas

export const runtime = 'edge';

import { createClient } from '@supabase/supabase-js';

function randomBase64(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

export async function POST(req) {
  try {
    const { personaId } = await req.json(); // opcional: si se sabe quién, restringe a sus credenciales

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_KEY
    );

    let query = supabase.from('webauthn_credentials').select('credential_id, transports, persona_id').eq('revocado', false);
    if (personaId) query = query.eq('persona_id', personaId);

    const { data: creds, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!creds || creds.length === 0) {
      return new Response(JSON.stringify({ error: 'Sin credenciales registradas' }), { status: 404 });
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

    return new Response(JSON.stringify({ options, challenge }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
