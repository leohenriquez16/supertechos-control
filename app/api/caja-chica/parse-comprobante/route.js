// v8.19.45: Endpoint que recibe la foto/base64 de un COMPROBANTE DE PAGO BANCARIO
// (transferencia, depósito, pago a tercero) y extrae con Claude Vision:
// monto, fecha del pago, banco, número de referencia/transacción, beneficiario.
// Se usa al registrar una ENTREGA de caja chica, para validar que el dinero
// entregado corresponde a un pago bancario real (no una "entrada" inventada).
//
// Mismo patrón que /api/caja-chica/parse-factura (edge runtime, fetch directo a Anthropic).

export const runtime = 'edge';
export const maxDuration = 60;

function buildPrompt(fechaHoy) {
  return `Eres un asistente que extrae datos estructurados de COMPROBANTES DE PAGO BANCARIOS dominicanos: transferencias, depósitos, pagos a terceros, capturas de apps de banco (Banreservas, Popular, BHD, Scotiabank, etc.) o recibos de cajero.

HOY ES: ${fechaHoy} (úsalo de referencia para validar fechas — el pago casi nunca es futuro).

Devuelve EXCLUSIVAMENTE un JSON con esta estructura, sin texto antes ni después:

{
  "es_comprobante_bancario": boolean,  // true solo si la imagen es claramente un comprobante de pago/transferencia/depósito de un banco
  "monto": number | null,              // monto pagado/transferido, en RD$ (sin símbolos ni comas)
  "fecha": string | null,              // FECHA DEL PAGO, formato YYYY-MM-DD
  "banco": string | null,              // nombre del banco emisor (ej: "Banreservas", "Banco Popular")
  "referencia": string | null,         // número de referencia / confirmación / # de transacción
  "beneficiario": string | null,       // a quién se le pagó (nombre o cuenta destino), si aparece
  "ordenante": string | null,          // quién paga / cuenta origen, si aparece
  "confianza": "alta" | "media" | "baja",
  "advertencias": string[]             // dudas, datos borrosos, o por qué no parece comprobante
}

REGLAS IMPORTANTES:
- "monto": el valor PRINCIPAL transferido/pagado. Si hay comisión aparte, NO la sumes; usa el monto enviado al beneficiario.
- "fecha": la fecha en que se realizó el pago/transferencia. Formato YYYY-MM-DD. Resuelve DD/MM vs MM/DD usando que el pago no es futuro (HOY=${fechaHoy}).
- Si la imagen NO es un comprobante bancario (es una factura, una foto cualquiera, etc.), devuelve "es_comprobante_bancario": false, "confianza": "baja", todos los campos null y explica en "advertencias".
- Si el monto o la fecha se ven borrosos o ambiguos, ponlos igual pero baja la "confianza" y añade una advertencia.
- No incluyas explicaciones fuera del JSON.`;
}

export async function POST(request) {
  try {
    const { base64Data, mediaType } = await request.json();

    if (!base64Data) {
      return new Response(JSON.stringify({ error: 'Imagen no recibida' }), { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key de Anthropic no configurada en Vercel' }), { status: 500 });
    }

    // Normalizar dataURL → base64 puro.
    let pureBase64 = base64Data;
    let detectedMedia = mediaType || 'image/jpeg';
    const m = String(base64Data).match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      detectedMedia = m[1];
      pureBase64 = m[2];
    }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(detectedMedia)) {
      detectedMedia = 'image/jpeg';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: detectedMedia, data: pureBase64 } },
            { type: 'text', text: buildPrompt(new Date().toISOString().slice(0, 10)) },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return new Response(JSON.stringify({
        error: `API error ${response.status}`,
        details: errorText.substring(0, 500),
      }), { status: 500 });
    }

    const data = await response.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    if (!text) {
      return new Response(JSON.stringify({ error: 'Respuesta vacía del modelo' }), { status: 500 });
    }

    // Aislar el JSON (a veces viene en ```json ... ```).
    let jsonText = text;
    const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonText = fence[1].trim();
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'No se pudo interpretar la respuesta del modelo',
        raw: text.substring(0, 500),
      }), { status: 500 });
    }

    // Post-proceso defensivo de fecha: validar formato y que no sea muy futura.
    if (parsed && typeof parsed === 'object') {
      const parseISO = (s) => {
        if (!s || typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
        const d = new Date(s + 'T12:00:00');
        return isNaN(d.getTime()) ? null : d;
      };
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const fp = parseISO(parsed.fecha);
      if (parsed.fecha && !fp) {
        parsed.advertencias = [...(parsed.advertencias || []), `Formato de fecha inválido: ${parsed.fecha}`];
        parsed.fecha = null;
      } else if (fp && (fp - hoy) > 2 * 24 * 60 * 60 * 1000) {
        parsed.advertencias = [...(parsed.advertencias || []), `La fecha del pago (${parsed.fecha}) está en el futuro — revísala.`];
      }
      // Normalizar monto a número.
      if (parsed.monto != null) {
        const n = Number(String(parsed.monto).replace(/[^0-9.]/g, ''));
        parsed.monto = isNaN(n) ? null : n;
      }
    }

    return new Response(JSON.stringify({ datos: parsed, modelo: 'claude-sonnet-4-5-20250929' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error parsing comprobante:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500 });
  }
}
