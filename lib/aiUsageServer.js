// lib/aiUsageServer.js
// v8.42.3: medidor de consumo de IA. Cada endpoint que llama a Anthropic registra aquí
// los tokens de la respuesta (la API los devuelve en `usage`). Fire-and-forget: nunca
// bloquea ni rompe la llamada principal. Compatible con runtime edge (fetch + REST).

export async function registrarUsoIA({ funcion, usuarioNombre = null, modelo = null, usage = null }) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || !usage) return;
    await fetch(`${url}/rest/v1/ai_usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        funcion,
        usuario_nombre: usuarioNombre,
        modelo,
        input_tokens: Number(usage.input_tokens) || 0,
        output_tokens: Number(usage.output_tokens) || 0,
      }),
    });
  } catch { /* nunca romper la llamada principal por telemetría */ }
}
