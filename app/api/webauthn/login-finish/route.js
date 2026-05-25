// v8.17.91: Completa el login con biometría + emite sesión Supabase.
//
// Histórico:
//   - v8.9.22 (original): valida la credencial WebAuthn, devuelve persona subset.
//   - v8.17.91 (PR 2B): tras éxito, si la persona tiene auth_user_id, emite
//     un magiclink token_hash via Admin API. El cliente lo verifica con
//     verifyOtp y queda con sesión Supabase real.
//
// Fallback: si la emisión de sesión falla (persona sin auth_user_id, Admin
// API caída, etc.), el endpoint devuelve solo { persona } y biometria.js
// continúa funcionando como antes. NUNCA bloquea el login.
//
// Cambios vs antes:
//   - YA NO usa edge runtime — necesitamos service role + Admin API.
//   - Cambia de anon key a SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const { credential } = await req.json();
    if (!credential || !credential.id) {
      return Response.json({ error: 'Credencial inválida' }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return Response.json({ error: 'Falta configuración de Supabase en el servidor' }, { status: 500 });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Buscar la credencial
    const { data: cred, error: credErr } = await supabase.from('webauthn_credentials')
      .select('*')
      .eq('credential_id', credential.id)
      .eq('revocado', false)
      .maybeSingle();

    if (credErr || !cred) {
      return Response.json({ error: 'Credencial no reconocida' }, { status: 404 });
    }

    // Buscar la persona
    const { data: persona, error: perrErr } = await supabase.from('personal')
      .select('*')
      .eq('id', cred.persona_id)
      .maybeSingle();

    if (perrErr || !persona) {
      return Response.json({ error: 'Persona no encontrada' }, { status: 404 });
    }

    if (persona.archivado) {
      return Response.json({ error: 'Persona archivada' }, { status: 403 });
    }

    // Actualizar last_used_at
    await supabase.from('webauthn_credentials').update({
      last_used_at: new Date().toISOString(),
      counter: (Number(cred.counter) || 0) + 1,
    }).eq('id', cred.id);

    // v8.17.91: emitir sesión Supabase si la persona tiene auth_user_id.
    // Si falla, sigue el flujo legacy (subset de persona, sin sesión).
    const otp = await emitirSesionSupabase(supabase, persona.auth_user_id);

    // Devolver datos de la persona (mismo subset que antes — biometria.js
    // espera este shape). El frontend completará campos al hacer loadAllData.
    return Response.json({
      persona: {
        id: persona.id,
        nombre: persona.nombre,
        roles: persona.roles || [],
        maestroId: persona.maestro_id || null,
        foto2x2: persona.foto2x2 || null,
        telefono: persona.telefono || null,
        reporteAudioHabilitado: persona.reporte_audio_habilitado || false,
      },
      ...(otp && { otp }),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// Emite un token_hash de magiclink para que el cliente lo intercambie por
// sesión via supabase.auth.verifyOtp. Mismo patrón que /api/auth/login.
// Devuelve { token_hash, type, email } o null si no fue posible.
async function emitirSesionSupabase(sb, authUserId) {
  if (!authUserId) return null;
  try {
    const { data: user, error: userErr } = await sb.auth.admin.getUserById(authUserId);
    if (userErr || !user?.user?.email) {
      console.warn('webauthn login: no se pudo obtener email del auth.user', authUserId, userErr?.message);
      return null;
    }
    const email = user.user.email;
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr) {
      console.warn('webauthn login: generateLink falló para', email, linkErr.message);
      return null;
    }
    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) {
      console.warn('webauthn login: generateLink no devolvió hashed_token para', email);
      return null;
    }
    return { token_hash: tokenHash, type: 'magiclink', email };
  } catch (e) {
    console.warn('webauthn login: emisión de sesión Supabase falló:', e.message);
    return null;
  }
}
