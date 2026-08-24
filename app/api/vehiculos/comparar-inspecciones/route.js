// v8.35.3: Compara dos inspecciones del mismo vehículo con AI (visión) y devuelve
// las diferencias (daños nuevos, limpieza, odómetro). Mismo patrón que
// /api/caja-chica/parse-comprobante (edge, fetch directo a Anthropic).
export const runtime = 'edge';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(request) {
  try {
    const { anterior, actual } = await request.json();
    // anterior/actual: { fecha, odometroKm, fotos: [{ angulo, url }] }
    if (!anterior?.fotos?.length || !actual?.fotos?.length) {
      return json({ error: 'Faltan fotos de alguna inspección para comparar.' }, 400);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return json({ error: 'API Key de Anthropic no configurada en Vercel' }, 500);
    }

    const content = [];
    content.push({ type: 'text', text:
      'Eres un inspector de flota vehicular. Te doy las fotos de DOS inspecciones del MISMO vehículo, ' +
      'tomadas desde los mismos ángulos (alante, lados, atrás, bonete abierto, odómetro, interior). ' +
      'Compara la inspección ANTERIOR con la ACTUAL y detecta DIFERENCIAS: daños nuevos (rayones, ' +
      'abolladuras, cristales/gomas dañadas, piezas faltantes), cambios de limpieza/estado, y la ' +
      'diferencia de kilometraje del odómetro. Sé concreto y menciona el ángulo.' });

    content.push({ type: 'text', text: `--- INSPECCIÓN ANTERIOR (fecha ${anterior.fecha || '?'}, odómetro ${anterior.odometroKm ?? '?'} km) ---` });
    for (const f of anterior.fotos) {
      content.push({ type: 'text', text: `Ángulo: ${f.angulo}` });
      content.push({ type: 'image', source: { type: 'url', url: f.url } });
    }
    content.push({ type: 'text', text: `--- INSPECCIÓN ACTUAL (fecha ${actual.fecha || '?'}, odómetro ${actual.odometroKm ?? '?'} km) ---` });
    for (const f of actual.fotos) {
      content.push({ type: 'text', text: `Ángulo: ${f.angulo}` });
      content.push({ type: 'image', source: { type: 'url', url: f.url } });
    }
    content.push({ type: 'text', text:
      'Devuelve SOLO un JSON con este formato exacto (sin texto extra):\n' +
      '{ "resumen": "1-2 frases", "km_recorridos": number|null, ' +
      '"diferencias": [ { "angulo": "alante|lados|atras|bonete|odometro|interior|general", ' +
      '"cambio": "descripción concreta del cambio o daño nuevo", "severidad": "leve|moderado|grave" } ], ' +
      '"sin_cambios": boolean, "recomendaciones": ["..."] }' });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1500,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('Anthropic API error:', resp.status, errorText);
      return json({ error: `API error ${resp.status}`, details: errorText.substring(0, 500) }, 500);
    }

    const data = await resp.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    if (!text) return json({ error: 'Respuesta vacía del modelo' }, 500);

    let jsonText = text;
    const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonText = fence[1].trim();
    const a = jsonText.indexOf('{'), b = jsonText.lastIndexOf('}');
    if (a >= 0 && b > a) jsonText = jsonText.substring(a, b + 1);

    let parsed;
    try { parsed = JSON.parse(jsonText); }
    catch { return json({ error: 'No se pudo interpretar la respuesta del modelo', raw: text.substring(0, 800) }, 500); }

    return json({ ok: true, resultado: parsed });
  } catch (e) {
    console.error('comparar-inspecciones:', e);
    return json({ error: e?.message || 'Error interno' }, 500);
  }
}
