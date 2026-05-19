// v8.17.72: streaming para evitar 504 Gateway Timeout.
// Antes esperábamos a que Anthropic terminara TODA la respuesta y recién ahí
// devolvíamos al cliente. Con PDFs de cotización + prompt largo, la generación
// podía tardar 30-60s y el gateway de Vercel cortaba con 504 antes de que la
// función respondiera.
// Ahora hacemos stream: true en Anthropic, parseamos los eventos SSE en el
// servidor y reenviamos solo los text_delta como texto plano al cliente.
// Mientras hay bytes fluyendo, el gateway no corta. El cliente concatena todo
// y al final parsea como JSON.
export const runtime = 'edge';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const { base64Data, prompt } = await request.json();

    if (!base64Data) {
      return new Response(JSON.stringify({ error: 'PDF no recibido' }), { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API Key de Anthropic no configurada en Vercel' }), { status: 500 });
    }

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8000,
        stream: true,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    // Si falla ANTES de empezar a streamear, devolvemos error normal (JSON).
    if (!anthropicResp.ok) {
      const errorText = await anthropicResp.text();
      console.error('Anthropic API error:', anthropicResp.status, errorText);
      return new Response(JSON.stringify({
        error: `API error ${anthropicResp.status}`,
        details: errorText.substring(0, 500)
      }), { status: 500 });
    }

    // Stream Anthropic SSE → text/plain con solo los text_delta concatenados.
    const stream = new ReadableStream({
      async start(controller) {
        const reader = anthropicResp.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // Cada evento SSE viene como `data: {...}\n\n`. Parseamos línea a línea.
            let nl;
            while ((nl = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const ev = JSON.parse(data);
                if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                  controller.enqueue(encoder.encode(ev.delta.text));
                }
                // Otros eventos (message_start, content_block_start, ping, etc.) los ignoramos.
              } catch {
                // línea malformada — seguimos
              }
            }
          }
          controller.close();
        } catch (e) {
          console.error('Stream error:', e);
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500 });
  }
}
