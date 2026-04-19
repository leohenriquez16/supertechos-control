// v8.9.22: Completa el login con biometría
// Busca la credencial, devuelve la persona asociada

export const runtime = 'edge';

import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const { credential } = await req.json();
    if (!credential || !credential.id) {
      return new Response(JSON.stringify({ error: 'Credencial inválida' }), { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_KEY
    );

    // Buscar la credencial
    const { data: cred, error: credErr } = await supabase.from('webauthn_credentials')
      .select('*')
      .eq('credential_id', credential.id)
      .eq('revocado', false)
      .maybeSingle();

    if (credErr || !cred) {
      return new Response(JSON.stringify({ error: 'Credencial no reconocida' }), { status: 404 });
    }

    // Buscar la persona
    const { data: persona, error: perrErr } = await supabase.from('personal')
      .select('*')
      .eq('id', cred.persona_id)
      .maybeSingle();

    if (perrErr || !persona) {
      return new Response(JSON.stringify({ error: 'Persona no encontrada' }), { status: 404 });
    }

    if (persona.archivado) {
      return new Response(JSON.stringify({ error: 'Persona archivada' }), { status: 403 });
    }

    // Actualizar last_used_at
    await supabase.from('webauthn_credentials').update({
      last_used_at: new Date().toISOString(),
      counter: (Number(cred.counter) || 0) + 1,
    }).eq('id', cred.id);

    // Devolver datos de la persona (mismo formato que el login normal)
    return new Response(JSON.stringify({
      persona: {
        id: persona.id,
        nombre: persona.nombre,
        roles: persona.roles || [],
        maestroId: persona.maestro_id || null,
        foto2x2: persona.foto2x2 || null,
        telefono: persona.telefono || null,
        reporteAudioHabilitado: persona.reporte_audio_habilitado || false,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
