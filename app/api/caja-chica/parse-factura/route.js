// Endpoint que recibe la foto base64 de una factura y extrae con Claude Vision:
// monto_total, rnc, fecha, proveedor, concepto sugerido, confianza, líneas (si se ve).
// Mantiene el mismo patrón que /api/extract-pdf (edge runtime, fetch directo a Anthropic).

export const runtime = 'edge';
export const maxDuration = 60;

// Construye el prompt incluyendo dinámicamente las categorías que el cliente
// envíe. Si no envía nada, usa la lista por defecto (compatibilidad).
function buildPrompt(categorias) {
  const lista = (categorias && categorias.length > 0)
    ? categorias
    : [
        { id: 'ferreteria',   nombre: 'Ferretería',   descripcion: 'Tornillos, cinta, pintura, materiales menores' },
        { id: 'combustible',  nombre: 'Combustible',  descripcion: 'Gasolina, gasoil' },
        { id: 'comida',       nombre: 'Comida',       descripcion: 'Almuerzo del equipo, refrigerios' },
        { id: 'peaje',        nombre: 'Peaje',        descripcion: 'Peajes' },
        { id: 'transporte',   nombre: 'Transporte',   descripcion: 'Taxis, fletes' },
        { id: 'herramientas', nombre: 'Herramientas', descripcion: 'Compra o reparación de herramientas' },
        { id: 'otros',        nombre: 'Otros',        descripcion: 'Otros gastos' },
      ];

  const ids = lista.map(c => c.id).join(' | ');
  const descripcionesCategorias = lista
    .map(c => `  - ${c.id}${c.nombre ? ` ("${c.nombre}")` : ''}${c.descripcion ? `: ${c.descripcion}` : ''}`)
    .join('\n');

  return `Eres un asistente que extrae datos estructurados de facturas físicas dominicanas (típicas de ferretería, gasolineras, restaurantes, peajes).

Devuelve EXCLUSIVAMENTE un JSON con esta estructura, sin texto antes ni después:

{
  "monto_total": number | null,
  "subtotal": number | null,
  "itbis": number | null,
  "propina_legal": number | null,
  "rnc": string | null,
  "fecha": string | null,        // formato YYYY-MM-DD si se identifica, null si no
  "proveedor": string | null,    // nombre de la empresa que emite
  "ncf": string | null,          // número comprobante fiscal si visible (ej: B0100012345)
  "categoria_sugerida": string | null, // ELIGE EXACTAMENTE UNO de los IDs listados abajo
  "concepto": string | null,     // breve descripción de qué se compró (10-60 chars)
  "lineas": [                    // hasta 10 productos, opcional
    { "descripcion": string, "cantidad": number | null, "precio": number | null }
  ],
  "confianza": "alta" | "media" | "baja",
  "advertencias": string[]
}

CATEGORÍAS DISPONIBLES (debes elegir UNA de estos IDs exactos para "categoria_sugerida"; si nada encaja claramente usa "otros" o el último ID de la lista):
${descripcionesCategorias}

IDs válidos: ${ids}

Reglas:
- Si un campo no se ve claro, usa null en lugar de inventar.
- monto_total siempre es el TOTAL final (después de ITBIS y propina si aplican).
- RNC dominicano: 9 u 11 dígitos, puede tener formato 130-77433-1.
- Si la imagen NO es una factura/recibo, devuelve confianza="baja" y todos los campos null excepto advertencias.
- "categoria_sugerida" DEBE ser uno de los IDs listados — no inventes nuevas categorías.
- No incluyas explicaciones fuera del JSON.`;
}

export async function POST(request) {
  try {
    const { base64Data, mediaType, categorias } = await request.json();

    if (!base64Data) {
      return new Response(JSON.stringify({ error: 'Imagen no recibida' }), { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key de Anthropic no configurada en Vercel' }), { status: 500 });
    }

    // El cliente puede enviar el dataURL completo (data:image/jpeg;base64,...) o solo el base64.
    // Normalizamos: extraer solo la parte base64.
    let pureBase64 = base64Data;
    let detectedMedia = mediaType || 'image/jpeg';
    const m = String(base64Data).match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      detectedMedia = m[1];
      pureBase64 = m[2];
    }
    // Whitelist de tipos soportados por Claude Vision
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
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: detectedMedia, data: pureBase64 } },
            { type: 'text', text: buildPrompt(categorias) },
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

    // Aislar el JSON: a veces Claude devuelve ```json...``` u otros wrappers.
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

    return new Response(JSON.stringify({ datos: parsed, modelo: 'claude-sonnet-4-5-20250929' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error parsing factura:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500 });
  }
}
