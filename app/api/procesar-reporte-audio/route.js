export const runtime = 'edge';
export const maxDuration = 60;

// v8.9.11: Procesa la transcripción de un audio de reporte de avance
// y extrae datos estructurados usando Claude.
// El audio se transcribe en el navegador con Web Speech API y se envía aquí el texto.
export async function POST(request) {
  try {
    const { transcripcion, proyecto, sistemas, personal } = await request.json();

    if (!transcripcion || !transcripcion.trim()) {
      return new Response(JSON.stringify({ error: 'Transcripción vacía' }), { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key de Anthropic no configurada' }), { status: 500 });
    }

    // Construir contexto del proyecto para que Claude entienda qué existe
    const areasTexto = (proyecto?.areas || []).map(a => {
      const sisId = a.sistemaId || proyecto.sistema;
      const sis = sistemas?.[sisId];
      return `  - ${a.nombre} (${a.m2} m², sistema: ${sis?.nombre || 'sin sistema'})`;
    }).join('\n');

    // Todas las tareas disponibles de todos los sistemas del proyecto
    const tareasUnicas = new Map();
    (proyecto?.areas || []).forEach(a => {
      const sisId = a.sistemaId || proyecto.sistema;
      const sis = sistemas?.[sisId];
      (sis?.tareas || []).forEach(t => {
        if (!tareasUnicas.has(t.id)) tareasUnicas.set(t.id, t);
      });
    });
    const tareasTexto = [...tareasUnicas.values()].map(t => `  - ${t.nombre} (id: ${t.id})`).join('\n');

    // Personal del proyecto
    const personalTexto = (personal || []).map(p => `  - ${p.nombre} (${(p.roles || []).join(', ')})`).join('\n');

    const prompt = `Eres un asistente para Super Techos, empresa de impermeabilización en República Dominicana.
El maestro ha dejado un reporte de avance diario por audio. Tu tarea es extraer información estructurada.

CONTEXTO DEL PROYECTO:
Nombre: ${proyecto?.nombre || proyecto?.referenciaProyecto || 'N/A'}
Cliente: ${proyecto?.cliente || 'N/A'}

ÁREAS DEL PROYECTO:
${areasTexto || '(sin áreas)'}

TAREAS POSIBLES:
${tareasTexto || '(sin tareas)'}

PERSONAL ASIGNADO:
${personalTexto || '(sin personal)'}

TRANSCRIPCIÓN DEL MAESTRO:
"${transcripcion}"

INSTRUCCIONES:
Extrae TODA la información posible y devuelve un JSON con esta estructura exacta (sin markdown, sin explicación):

{
  "avances": [
    {
      "areaNombre": "nombre del área tal como aparece arriba (el más cercano si hay ambigüedad)",
      "areaId": "id del área si puedes inferirlo, o null",
      "tareaNombre": "nombre de la tarea ejecutada (Primera mano, Segunda mano, Limpieza, Malla, etc)",
      "tareaId": "id de la tarea si puedes inferirla, o null",
      "m2": número en metros cuadrados (o null si no se mencionó),
      "notaEspecifica": "detalles específicos de este avance (opcional)"
    }
  ],
  "materialesUsados": [
    {
      "nombre": "nombre del material mencionado",
      "cantidad": número,
      "unidad": "cubetas, sacos, rollos, galones, etc."
    }
  ],
  "bloqueos": [
    "descripción corta de cada problema o bloqueo mencionado"
  ],
  "personalAusente": [
    "nombre de personal que no fue o se ausentó"
  ],
  "personalPresente": [
    "nombre de personal que estuvo trabajando"
  ],
  "clima": "normal | lluvia | no_laborable | otro",
  "horaInicio": "HH:MM si se mencionó, o null",
  "horaFin": "HH:MM si se mencionó, o null",
  "notasCalidad": "observaciones sobre calidad del trabajo, si las hay",
  "tareasAdicionales": "tareas no planificadas mencionadas",
  "necesitaMaterial": ["materiales que faltan o se necesitan pedir"],
  "resumen": "resumen de 1-2 oraciones del reporte en español"
}

IMPORTANTE:
- Si algo no se menciona en el audio, pon null o [] según corresponda, NO inventes.
- Los nombres de áreas y tareas deben matchear los de la lista arriba (ignorando mayúsculas/acentos).
- Las cantidades de m² son aproximaciones — si dice "como 80 metros" pon 80.
- Si el maestro menciona "avancé" o "terminé" sin área específica, intenta inferir del contexto previo del audio.
- Responde SOLO el JSON, sin texto adicional.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return new Response(JSON.stringify({
        error: `API error ${response.status}`,
        detail: errorText.slice(0, 500),
      }), { status: 500 });
    }

    const data = await response.json();
    const textContent = data.content?.[0]?.text || '';

    // Extraer JSON del response
    let resultado = null;
    try {
      // Limpiar markdown si hay
      const clean = textContent.replace(/```json\s*|```\s*/g, '').trim();
      resultado = JSON.parse(clean);
    } catch (e) {
      console.error('Error parseando JSON de Claude:', e, textContent);
      return new Response(JSON.stringify({
        error: 'Respuesta de IA no pudo parsearse',
        raw: textContent.slice(0, 500),
      }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, data: resultado }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Error en procesar-reporte-audio:', e);
    return new Response(JSON.stringify({ error: e.message || 'Error procesando reporte' }), { status: 500 });
  }
}
