// v8.19.63: Webhook de WhatsApp Cloud API (Meta).
// - GET:  verificación del webhook (Meta llama con hub.challenge).
// - POST: recibe mensajes entrantes, matchea el cliente por teléfono y responde un acuse.
//   v8.54.2 (C2): si el cliente tiene una reclamación ABIERTA reciente (≤7 días), el mensaje
//   se PEGA a esa (no se duplica); si no, crea una nueva. Todo entrante y el acuse saliente
//   quedan en la BITÁCORA de comunicación del ticket (chatter_mensajes, canal whatsapp).
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

      // v8.54.2 (C2): si el cliente tiene una reclamación ABIERTA reciente (≤7 días), la
      // respuesta se PEGA a esa (no se duplica). Si no, se crea una nueva.
      let reclId = null;
      if (clienteId) {
        const hace7 = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: abiertas } = await sb.from('reclamaciones')
          .select('id, updated_at, created_at, fecha_apertura')
          .eq('cliente_id', clienteId).eq('archivado', false)
          .in('estado', ['abierta', 'en_proceso'])
          .order('created_at', { ascending: false }).limit(5);
        const reciente = (abiertas || []).find((r) => (r.updated_at || r.created_at || r.fecha_apertura || '') >= hace7);
        if (reciente) reclId = reciente.id;
      }
      const esNueva = !reclId;
      if (esNueva) {
        reclId = 'rec_' + Date.now() + Math.random().toString(36).slice(2, 6);
        await sb.from('reclamaciones').insert({
          id: reclId, cliente_id: clienteId, canal: 'whatsapp', estado: 'abierta', severidad: 'media',
          descripcion: msg.texto,
          notas: `WhatsApp de ${msg.contactName || 'cliente'} (${msg.from})${clienteId ? '' : ' — sin match de cliente, asignar manual'}`,
        });
      } else {
        // Reabre/mantiene la conversación viva (updated_at) sin cambiar el estado.
        try { await sb.from('reclamaciones').update({ updated_at: new Date().toISOString() }).eq('id', reclId); } catch { /* noop */ }
      }

      // v8.54.2 (C2): el mensaje del cliente queda en la BITÁCORA (entrante).
      const chatterRow = (dir, canalTxt, cuerpo, autorNombre) => ({
        id: 'ch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        entity_type: 'reclamacion', entity_id: String(reclId),
        tipo: 'comunicacion', evento: 'comunicacion', canal: canalTxt, direccion: dir,
        cuerpo, autor_nombre: autorNombre,
      });
      try { await sb.from('chatter_mensajes').insert(chatterRow('entrante', 'whatsapp', msg.texto, msg.contactName || clienteNombre || 'Cliente')); } catch { /* noop */ }

      // Acuse al cliente (dentro de la ventana de 24h porque él inició) — también a la bitácora.
      const acuse = `Gracias${clienteNombre ? ' ' + clienteNombre : ''}, recibimos tu mensaje en Super Techos. Un asesor te contactará a la brevedad. 🧰`;
      await enviarWhatsAppTexto(msg.from, acuse);
      try { await sb.from('chatter_mensajes').insert(chatterRow('saliente', 'whatsapp', acuse + ' (acuse automático)', 'Sistema')); } catch { /* noop */ }
    }
  } catch (e) {
    console.error('whatsapp webhook error:', e?.message);
    // Igual devolvemos 200 para que Meta no reintente en loop.
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}
