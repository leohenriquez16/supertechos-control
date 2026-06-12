// app/api/contabilidad/parse-estado/route.js
// v8.26.2: [Conciliación bancaria] Parsea un ESTADO DE CUENTA bancario (PDF, foto
// o CSV/texto) con Claude y devuelve los movimientos como JSON. Mismo patrón que
// /api/caja-chica/parse-factura (edge runtime, fetch directo a Anthropic).

export const runtime = 'edge';
export const maxDuration = 60;

const PROMPT = (fechaHoy) => `Eres un asistente que extrae los MOVIMIENTOS de un estado de cuenta bancario dominicano (Banreservas, Popular, BHD, etc.).

HOY ES: ${fechaHoy}.

Devuelve EXCLUSIVAMENTE un JSON con esta estructura, sin texto antes ni después:

{
  "banco": string | null,          // nombre del banco si se ve
  "numero_cuenta": string | null,  // número de cuenta si se ve (puede venir parcial)
  "periodo": string | null,        // ej. "2026-05" si se deduce
  "movimientos": [
    {
      "fecha": "YYYY-MM-DD",
      "descripcion": string,        // descripción/beneficiario tal como aparece (limpia espacios)
      "referencia": string | null,  // número de referencia/documento si hay columna
      "monto": number               // NEGATIVO si es débito/retiro/cargo (sale dinero), POSITIVO si es crédito/depósito (entra dinero)
    }
  ],
  "advertencias": string[]          // ej. "columna de balance ilegible", "página cortada"
}

REGLAS:
- Si el estado tiene columnas separadas de Débito y Crédito: débito → monto negativo, crédito → positivo.
- NO inventes movimientos; si una línea es ilegible, omítela y agrégala a advertencias.
- Las fechas dominicanas suelen ser DD/MM/YYYY — conviértelas a YYYY-MM-DD (usa el período del estado como pista).
- Ignora líneas de "BALANCE ANTERIOR", subtotales y encabezados; solo transacciones reales.
- Montos con coma de miles y punto decimal (ej. 12,500.00 → 12500.00).`;

export async function POST(request) {
  try {
    const { base64Data, mediaType, textoCsv } = await request.json();
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key de Anthropic no configurada' }), { status: 500 });
    }
    if (!base64Data && !textoCsv) {
      return new Response(JSON.stringify({ error: 'Envía base64Data (PDF/imagen) o textoCsv' }), { status: 400 });
    }

    const content = [];
    if (textoCsv) {
      content.push({ type: 'text', text: `CONTENIDO DEL ESTADO (CSV/texto):\n\n${String(textoCsv).slice(0, 60000)}` });
    } else {
      let pureBase64 = base64Data;
      let detectedMedia = mediaType || 'image/jpeg';
      const m = String(base64Data).match(/^data:([^;]+);base64,(.+)$/);
      if (m) { detectedMedia = m[1]; pureBase64 = m[2]; }
      if (detectedMedia === 'application/pdf') {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pureBase64 } });
      } else {
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(detectedMedia)) detectedMedia = 'image/jpeg';
        content.push({ type: 'image', source: { type: 'base64', media_type: detectedMedia, data: pureBase64 } });
      }
    }
    content.push({ type: 'text', text: PROMPT(new Date().toISOString().slice(0, 10)) });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8000,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `API error ${response.status}`, details: errorText.substring(0, 400) }), { status: 500 });
    }

    const data = await response.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'No se pudo interpretar la respuesta del modelo' }), { status: 500 });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    // Saneamiento mínimo
    parsed.movimientos = (parsed.movimientos || [])
      .filter(mv => mv && mv.fecha && typeof mv.monto === 'number' && mv.monto !== 0)
      .map(mv => ({
        fecha: mv.fecha,
        descripcion: String(mv.descripcion || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        referencia: mv.referencia ? String(mv.referencia).trim().slice(0, 80) : null,
        monto: Math.round(Number(mv.monto) * 100) / 100,
      }));
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Error procesando el estado' }), { status: 500 });
  }
}
