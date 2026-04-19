export const runtime = 'edge';
export const maxDuration = 60;

// v8.9.20: Asistente conversacional para admin
// Recibe pregunta + contexto ERP → Claude responde

export async function POST(request) {
  try {
    const { pregunta, contexto, historial } = await request.json();

    if (!pregunta || !pregunta.trim()) {
      return new Response(JSON.stringify({ error: 'Pregunta vacía' }), { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key de Anthropic no configurada' }), { status: 500 });
    }

    // Construir mensaje system con todo el contexto del ERP
    const systemPrompt = `Eres el asistente personal de Leo Henríquez, administrador y dueño de Super Techos SRL, una empresa de impermeabilización y pisos epóxicos en Santo Domingo, República Dominicana.

Tu rol es ayudarle a responder preguntas sobre su negocio usando los datos que te doy.

CONTEXTO ACTUAL DEL NEGOCIO (${new Date().toLocaleString('es-DO')}):
${contexto}

INSTRUCCIONES:
- Responde en español dominicano, de forma concisa y natural
- Usa números específicos cuando los tengas
- Si no tienes la información, dilo claramente (no inventes datos)
- Formato: párrafos cortos o listas simples, NO uses markdown complicado
- Para cantidades de dinero, usa formato RD$ X,XXX
- Para m², usa "m²" sin decimales excesivos
- Sé directo pero cálido, como un asesor de confianza
- Si la pregunta es ambigua, pide aclaración
- Si detectas algo preocupante en los datos (proyectos muy atrasados, personal inactivo, etc.), menciónalo proactivamente

EJEMPLOS DE RESPUESTAS BUENAS:
P: "¿Cómo va todo?"
R: "Bien en general. Tienes 4 proyectos activos, este mes llevas 1,240 m² producidos. Ojo: Hospital del Seibo lleva 12 días sin reportes."

P: "¿Cuánto le debo a Juan?"
R: "Este corte (1-15 abril) Juan va por RD$18,500 basado en 92.5 m² producidos."

NO hagas esto:
- Respuestas largas innecesarias
- Markdown con muchos símbolos
- Introducciones tipo "Claro, déjame ayudarte..."`;

    const messages = [];
    // Agregar historial previo (máximo últimos 6 turnos)
    if (Array.isArray(historial)) {
      historial.slice(-6).forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }
    // Pregunta actual
    messages.push({ role: 'user', content: pregunta });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Error Anthropic:', err);
      return new Response(JSON.stringify({ error: 'Error del asistente: ' + err.slice(0, 200) }), { status: 500 });
    }

    const data = await response.json();
    const respuesta = data.content?.[0]?.text || 'No pude generar respuesta.';

    return new Response(JSON.stringify({ respuesta }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error en asistente:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error interno' }), { status: 500 });
  }
}
