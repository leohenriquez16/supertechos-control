// v8.19.63: Webhook de WhatsApp Cloud API (Meta).
// - GET:  verificación del webhook (Meta llama con hub.challenge).
// - POST: recibe mensajes entrantes → crea una reclamación (canal=whatsapp),
//         intenta matchear el cliente por teléfono, y responde un acuse.
// Server-side (nodejs). Verifica la firma X-Hub-Signature-256 si hay APP_SECRET.

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { enviarWhatsAppTexto, normalizarTelefonoRD } from '../../../../lib/whatsapp';

export const runtime = 'nodejs';

// ---- GET: verificación del webhook ----
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

function firmaValida(rawBody, signatureHeader) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // si no está configurado, no bloqueamos (modo setup)
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader)); }
  catch { return false; }
}

// ---- POST: mensajes entrantes ----
export async function POST(request) {
  const rawBody = await request.text();
  if (!firmaValida(rawBody, request.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return new Response('Bad JSON', { status: 400 }); }

  // Responder 200 rápido es lo que Meta espera; procesamos lo que haya.
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const mensajes = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contactName = value.contacts?.[0]?.profile?.name || null;
        for (const m of value.messages || []) {
          if (m.type !== 'text' && m.type !== 'button' && m.type !== 'interactive') continue;
          const texto = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || '(mensaje sin texto)';
          mensajes.push({ from: m.from, texto, contactName });
        }
      }
    }

    for (const msg of mensajes) {
      // Matchear cliente por teléfono (últimos 10 dígitos).
      const num = normalizarTelefonoRD(msg.from) || '';
      const ult10 = num.slice(-10);
      let clienteId = null, clienteNombre = null;
      if (ult10) {
        const { data: clientes } = await sb.from('clientes').select('id, nombre, telefono_principal').not('telefono_principal', 'is', null);
        const match = (clientes || []).find(c => (c.telefono_principal || '').replace(/\D/g, '').slice(-10) === ult10);
        if (match) { clienteId = match.id; clienteNombre = match.nombre; }
        if (!clienteId) {
          const { data: contactos } = await sb.from('contactos').select('cliente_id, telefono').not('telefono', 'is', null);
          const mc = (contactos || []).find(c => (c.telefono || '').replace(/\D/g, '').slice(-10) === ult10);
          if (mc) clienteId = mc.cliente_id;
        }
      }

      // Crear la reclamación entrante.
      const id = 'rec_' + Date.now() + Math.random().toString(36).slice(2, 6);
      await sb.from('reclamaciones').insert({
        id, cliente_id: clienteId, canal: 'whatsapp', estado: 'abierta', severidad: 'media',
        descripcion: msg.texto,
        notas: `WhatsApp de ${msg.contactName || 'cliente'} (${msg.from})${clienteId ? '' : ' — sin match de cliente, asignar manual'}`,
      });

      // Acuse al cliente (dentro de la ventana de 24h porque él inició).
      await enviarWhatsAppTexto(msg.from, `Gracias${clienteNombre ? ' ' + clienteNombre : ''}, recibimos tu mensaje en Super Techos. Un asesor te contactará a la brevedad. 🧰`);
    }
  } catch (e) {
    console.error('whatsapp webhook error:', e?.message);
    // Igual devolvemos 200 para que Meta no reintente en loop.
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}
