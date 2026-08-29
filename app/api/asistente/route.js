import { registrarUsoIA } from '../../../lib/aiUsageServer'; // v8.42.3: medidor de consumo IA
export const runtime = 'edge';
export const maxDuration = 60;

// v8.9.20: Asistente conversacional para admin
// v8.27.70: abierto a TODOS los usuarios como asistente de AYUDA del ERP (manual de uso).
//   - Admin: manual + contexto del negocio (como antes).
//   - No-admin: SOLO el manual — nunca datos de negocio (producción, montos, proyectos ajenos).
// Recibe pregunta + contexto ERP → Claude responde

import { MANUAL_ERP } from '../../../lib/manualERP';

export async function POST(request) {
  try {
    const { pregunta, contexto, historial, esAdmin = true, nombreUsuario = '', rolUsuario = '' } = await request.json();

    if (!pregunta || !pregunta.trim()) {
      return new Response(JSON.stringify({ error: 'Pregunta vacía' }), { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key de Anthropic no configurada' }), { status: 500 });
    }

    const REGLAS_COMUNES = `
INSTRUCCIONES:
- Responde en español dominicano, de forma concisa y natural
- Si no tienes la información, dilo claramente (no inventes datos)
- Formato: párrafos cortos o listas simples, NO uses markdown complicado
- Sé directo pero cálido
- Si la pregunta es ambigua, pide aclaración
- Cuando expliques CÓMO HACER algo en el ERP, usa el MANUAL DE USO de abajo y da los pasos concretos (dónde tocar). Si el manual no lo cubre, dilo y sugiere reportarlo en Gotera.

NO hagas esto:
- Respuestas largas innecesarias
- Markdown con muchos símbolos
- Introducciones tipo "Claro, déjame ayudarte..."`;

    // Construir mensaje system según el rol
    const systemPrompt = esAdmin && contexto
      ? `Eres el asistente personal de Leo Henríquez, administrador y dueño de Super Techos SRL, una empresa de impermeabilización y pisos epóxicos en Santo Domingo, República Dominicana.

Tu rol es ayudarle a responder preguntas sobre su negocio usando los datos que te doy, Y a explicar cómo se usa el ERP (manual abajo).

CONTEXTO ACTUAL DEL NEGOCIO (${new Date().toLocaleString('es-DO')}):
${contexto}

${REGLAS_COMUNES}
- Usa números específicos cuando los tengas
- Para cantidades de dinero, usa formato RD$ X,XXX; para m², "m²" sin decimales excesivos
- Si te preguntan por un proyecto/cliente que no aparece en el contexto, di simplemente que no lo ves en los datos actuales. NUNCA afirmes que está "finalizado" o "archivado" si no lo sabes — no lo adivines.
- Si detectas algo preocupante en los datos (proyectos muy atrasados, personal inactivo, etc.), menciónalo proactivamente

EJEMPLOS DE RESPUESTAS BUENAS:
P: "¿Cómo va todo?"
R: "Bien en general. Tienes 4 proyectos activos, este mes llevas 1,240 m² producidos. Ojo: Hospital del Seibo lleva 12 días sin reportes."
P: "¿Cuánto le debo a Juan?"
R: "Este corte (1-15 abril) Juan va por RD$18,500 basado en 92.5 m² producidos."

MANUAL DE USO DEL ERP (para preguntas de "cómo se hace"):
${MANUAL_ERP}`
      : `Eres el asistente de AYUDA del ERP de Super Techos (control de obras de impermeabilización y pisos, Santo Domingo, RD). Estás hablando con ${nombreUsuario || 'un usuario'} (rol: ${rolUsuario || 'usuario'}).

Tu ÚNICO rol es explicar cómo se usa el ERP, con los pasos del manual de abajo, adaptados a su rol.

REGLAS DE SEGURIDAD (estrictas):
- NO tienes acceso a datos del negocio (producción, montos, nóminas, proyectos, clientes) y NO debes inventarlos ni estimarlos.
- Si preguntan por datos (cuánto se pagó, cuántos m², etc.), responde que ese dato se ve en su módulo correspondiente del ERP (ej. "Mi Producción", "Mi Caja Chica") o que lo consulte con la oficina.
- No des instrucciones de funciones de admin a quien no es admin; sugiere hablar con la oficina.

${REGLAS_COMUNES}

MANUAL DE USO DEL ERP:
${MANUAL_ERP}`;

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
        model: 'claude-sonnet-4-5-20250929',
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
    await registrarUsoIA({ funcion: 'asistente', modelo: 'claude-sonnet-4-5-20250929', usage: data?.usage, usuarioNombre: nombreUsuario || (esAdmin ? "admin" : rolUsuario) });
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
