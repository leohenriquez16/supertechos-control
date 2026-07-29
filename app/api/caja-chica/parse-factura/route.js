// Endpoint que recibe la foto base64 de una factura y extrae con Claude Vision:
// monto_total, rnc, fecha, proveedor, concepto sugerido, confianza, líneas (si se ve).
// Mantiene el mismo patrón que /api/extract-pdf (edge runtime, fetch directo a Anthropic).

export const runtime = 'edge';
export const maxDuration = 60;

// Construye el prompt incluyendo dinámicamente las categorías que el cliente
// envíe. Si no envía nada, usa la lista por defecto (compatibilidad).
// v8.17.57: recibe `fechaHoy` (YYYY-MM-DD) para que el modelo distinga la fecha
// de la factura de la fecha de vencimiento del NCF y resuelva ambigüedades DD/MM
// vs MM/DD usando el mes actual como pista.
function buildPrompt(categorias, fechaHoy) {
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

HOY ES: ${fechaHoy} (úsalo de referencia para validar fechas).

Devuelve EXCLUSIVAMENTE un JSON con esta estructura, sin texto antes ni después:

{
  "monto_total": number | null,
  "subtotal": number | null,
  "itbis": number | null,
  "propina_legal": number | null,
  "rnc": string | null,            // RNC del PROVEEDOR (quien EMITE la factura)
  "rnc_cliente": string | null,    // RNC del CLIENTE (a quien va dirigida la factura)
  "empresa_receptora": string | null, // 'super_techos' si rnc_cliente == 130774331, 'prouco' si == 131515541, sino null
  "fecha": string | null,        // FECHA DE EMISIÓN de la factura, formato YYYY-MM-DD. NO confundir con vencimiento NCF.
  "fecha_vencimiento_ncf": string | null, // VENCIMIENTO del NCF si aparece en la factura (suele ser 31/12 de un año futuro). YYYY-MM-DD.
  "proveedor": string | null,    // nombre de la empresa que emite
  "ncf": string | null,          // número comprobante fiscal si visible (ej: B0100012345)
  "categoria_sugerida": string | null, // ELIGE EXACTAMENTE UNO de los IDs listados abajo
  "concepto": string | null,     // PRODUCTO para Odoo, según el tipo de gasto:
                                 //  - Ferretería / materiales de construcción → EXACTAMENTE "Materiales Varios" (NO detalles cada ítem).
                                 //  - Combustible (gasolinera): LEE si es "Gasoil" o "Gasolina" y pon exactamente esa palabra.
                                 //  - Gas (tanque/cilindro de gas GLP) → "Gas".
                                 //  - Otros → breve descripción de qué se compró (10-60 chars).
  "lineas": [                    // hasta 10 productos, opcional
    { "descripcion": string, "cantidad": number | null, "precio": number | null }
  ],
  "confianza": "alta" | "media" | "baja",
  "advertencias": string[]
}

CATEGORÍAS DISPONIBLES (debes elegir UNA de estos IDs exactos para "categoria_sugerida"; si nada encaja claramente usa "otros" o el último ID de la lista):
${descripcionesCategorias}

IDs válidos: ${ids}

⚠️ EMPRESAS NUESTRAS (NUNCA son el proveedor — siempre son el comprador/receptor):
Cuando veas estos nombres o RNCs en la factura, son NUESTRA empresa (el cliente que paga), NO el vendedor:
- "LH SUPER TECHOS SRL" / "SUPER TECHOS" → RNC 130774331 → empresa_receptora: "super_techos"
- "PROUCO GROUP DOMINICANA SRL" / "PROUCO" → RNC 131515541 → empresa_receptora: "prouco"

🚫 REGLA DURA — Si el "proveedor" que ibas a poner es Super Techos o Prouco, ESTÁS CONFUNDIDO:
Esa empresa es el CLIENTE/COMPRADOR, no el vendedor. Una empresa no se vende a sí misma.
Vuelve a leer la factura y busca al PROVEEDOR REAL (Ferretería, Estación de combustible, Restaurante, etc).
- Su nombre va arriba del documento, suele tener logo.
- Su RNC va junto a su nombre (en el encabezado), no abajo donde está "Cliente:" o "Receptor:".

📅 FECHAS — REGLA CRÍTICA (la IA se equivoca seguido aquí):
Las facturas dominicanas TÍPICAMENTE muestran 2 fechas distintas:
1. FECHA DE EMISIÓN (la del día que se imprimió/emitió la factura). Es la que va en "fecha".
2. FECHA DE VENCIMIENTO DEL NCF (cuándo expira el comprobante fiscal). Casi siempre es el 31/12 de un año futuro. Va en "fecha_vencimiento_ncf".

Pistas para distinguirlas:
- La emisión está cerca de HOY (${fechaHoy}). Casi siempre dentro de los últimos 30-60 días, raro que sea más vieja que 6 meses.
- El vencimiento NCF suele decir "Válido hasta:", "Fecha de vencimiento:", "Vence:", "Fecha límite emisión:". Suele caer en 31/12/AAAA con AAAA > año actual.
- Si ves una fecha más allá del próximo 31/12, es vencimiento NCF, NO la emisión.

Formato DD/MM/AAAA vs MM/DD/AAAA — facturas dominicanas son AMBIGUAS:
- En RD el estándar es DD/MM (día primero), pero algunos sistemas usan MM/DD (estilo gringo).
- Si la primera parte es > 12, es DEFINITIVAMENTE DD/MM (no hay mes 13).
- Si AMBAS partes son ≤ 12 y la factura parece reciente, asume DD/MM (estándar RD). Ej: HOY es ${fechaHoy}, si la factura dice "05/04/2026", interpreta como 5 de abril, no 4 de mayo.
- Si dudas, mira el contexto (¿pasó ya esa fecha? ¿es coherente con el NCF reciente?).

Reglas:
- Si un campo no se ve claro, usa null en lugar de inventar.
- monto_total siempre es el TOTAL final (después de ITBIS y propina si aplican).
- RNC dominicano: 9 u 11 dígitos, puede tener formato 130-77433-1. Normaliza a solo dígitos.
- "proveedor" y "rnc" SIEMPRE pertenecen al vendedor (el que emite/factura). NUNCA pongas Super Techos o Prouco ahí.
- "rnc_cliente" pertenece a Super Techos o Prouco (nuestra empresa). Suele aparecer en una sección "Cliente:" / "Datos del Receptor:" / "Razón Social del Cliente:".
- Si rnc_cliente NO coincide con ninguno de los 2 RNCs conocidos (130774331 ni 131515541), deja "empresa_receptora" en null.
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
            { type: 'text', text: buildPrompt(categorias, new Date().toISOString().slice(0, 10)) },
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

    // v8.17.40: Post-proceso defensivo — si la IA confundió Super Techos/Prouco como
    // proveedor, lo corregimos. Una empresa no se vende a sí misma: si aparecen como
    // proveedor, en realidad son la empresa receptora y el verdadero proveedor está
    // perdido (lo dejamos en null para que el admin lo corrija).
    const RNCS_NUESTROS = {
      '130774331': 'super_techos',
      '131515541': 'prouco',
    };
    const esNombreNuestro = (nombre) => {
      if (!nombre) return false;
      const n = String(nombre).toUpperCase();
      return n.includes('SUPER TECHOS') || n.includes('PROUCO') || n.includes('LH SUPER');
    };
    if (parsed && typeof parsed === 'object') {
      const rncProveedor = (parsed.rnc || '').replace(/\D/g, '');
      const rncCliente = (parsed.rnc_cliente || '').replace(/\D/g, '');
      // Caso 1: RNC del "proveedor" coincide con una empresa nuestra → swap
      if (RNCS_NUESTROS[rncProveedor]) {
        parsed.empresa_receptora = RNCS_NUESTROS[rncProveedor];
        parsed.rnc_cliente = parsed.rnc_cliente || rncProveedor;
        parsed.rnc = null;
        parsed.proveedor = null;
        parsed.advertencias = [
          ...(parsed.advertencias || []),
          'La IA puso a Super Techos/Prouco como proveedor — corregido a empresa_receptora. Revisa el proveedor real.',
        ];
      }
      // Caso 2: el nombre del proveedor menciona nuestras empresas → null
      else if (esNombreNuestro(parsed.proveedor)) {
        // Si nombre coincide pero RNC no, asumir igual que es nuestra empresa
        if (!parsed.empresa_receptora) {
          // Inferir por el nombre
          const nom = String(parsed.proveedor).toUpperCase();
          if (nom.includes('PROUCO')) parsed.empresa_receptora = 'prouco';
          else if (nom.includes('SUPER TECHOS') || nom.includes('LH SUPER')) parsed.empresa_receptora = 'super_techos';
        }
        parsed.proveedor = null;
        parsed.rnc = null;
        parsed.advertencias = [
          ...(parsed.advertencias || []),
          'La IA puso a Super Techos/Prouco como proveedor — corregido. Revisa el proveedor real.',
        ];
      }
      // Set empresa_receptora si el rnc_cliente coincide y aún está vacío
      if (!parsed.empresa_receptora && RNCS_NUESTROS[rncCliente]) {
        parsed.empresa_receptora = RNCS_NUESTROS[rncCliente];
      }

      // v8.17.57: post-proceso de fechas. Si la IA puso una fecha demasiado en
      // el futuro, casi seguro confundió la emisión con el vencimiento NCF.
      // Reglas:
      //   - Si `fecha` está > 60 días en el futuro → es vencimiento NCF, no emisión.
      //     Movemos a `fecha_vencimiento_ncf` y dejamos `fecha` en null.
      //   - Si hay `fecha` y `fecha_vencimiento_ncf` y ambas se ven válidas,
      //     mantenemos la más cercana a hoy en `fecha`.
      //   - Validamos formato YYYY-MM-DD; si no lo cumple, null.
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const SESENTA_DIAS_MS = 60 * 24 * 60 * 60 * 1000;
      const parseISO = (s) => {
        if (!s || typeof s !== 'string') return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
        const d = new Date(s + 'T12:00:00');
        return isNaN(d.getTime()) ? null : d;
      };
      const fechaEmision = parseISO(parsed.fecha);
      const fechaVenc = parseISO(parsed.fecha_vencimiento_ncf);
      // Si fecha "de emisión" está >60d en el futuro → es vencimiento NCF
      if (fechaEmision && (fechaEmision - hoy) > SESENTA_DIAS_MS) {
        parsed.advertencias = [
          ...(parsed.advertencias || []),
          `La fecha ${parsed.fecha} está demasiado en el futuro — parece vencimiento NCF, no emisión. Revisa.`,
        ];
        // Si no había vencimiento NCF, usar esta. Si había, conservar la suya.
        if (!fechaVenc) parsed.fecha_vencimiento_ncf = parsed.fecha;
        parsed.fecha = null;
      }
      // Si hay ambas, elegir la más cercana a hoy como emisión.
      else if (fechaEmision && fechaVenc) {
        const distEmis = Math.abs(fechaEmision - hoy);
        const distVenc = Math.abs(fechaVenc - hoy);
        if (distVenc < distEmis) {
          // La que llamaba "vencimiento" en realidad está más cerca → swap
          const tmp = parsed.fecha;
          parsed.fecha = parsed.fecha_vencimiento_ncf;
          parsed.fecha_vencimiento_ncf = tmp;
          parsed.advertencias = [
            ...(parsed.advertencias || []),
            'Las fechas estaban intercambiadas (emisión vs vencimiento NCF) — corregido.',
          ];
        }
      }
      // Si fecha no parseó bien, anularla
      if (parsed.fecha && !parseISO(parsed.fecha)) {
        parsed.advertencias = [
          ...(parsed.advertencias || []),
          `Formato de fecha inválido: ${parsed.fecha}`,
        ];
        parsed.fecha = null;
      }
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
