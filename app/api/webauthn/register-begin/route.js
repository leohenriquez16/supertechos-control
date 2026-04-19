// v8.9.22: Inicia el registro de una nueva credencial biométrica
// Genera un challenge que el navegador firma con el sensor biométrico

export const runtime = 'edge';

function randomBase64(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

export async function POST(req) {
  try {
    const { personaId, personaNombre } = await req.json();
    if (!personaId) {
      return new Response(JSON.stringify({ error: 'personaId requerido' }), { status: 400 });
    }

    const challenge = randomBase64(32);
    const rpID = new URL(req.url).hostname; // ej. erp.supertechos.com.do

    const options = {
      challenge,
      rp: {
        name: 'Super Techos ERP',
        id: rpID,
      },
      user: {
        id: Buffer.from(personaId).toString('base64url'),
        name: personaId,
        displayName: personaNombre || personaId,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // solo biométrico del dispositivo
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    return new Response(JSON.stringify({ options, challenge }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
