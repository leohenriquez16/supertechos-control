// v8.19.63: Cliente de WhatsApp Cloud API (Meta) — envío de mensajes y plantillas.
// Requiere env vars: WHATSAPP_TOKEN (token permanente del System User),
// WHATSAPP_PHONE_NUMBER_ID (id del número), opcional WHATSAPP_API_VERSION.
// Server-side only (no exponer el token al cliente).

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

function endpoint() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return `https://graph.facebook.com/${API_VERSION}/${id}/messages`;
}

// Normaliza un teléfono dominicano a formato E.164 sin '+': 1809XXXXXXX.
export function normalizarTelefonoRD(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 && /^(809|829|849)/.test(d)) d = '1' + d;     // 809... → 1809...
  if (d.length === 11 && d.startsWith('1')) return d;               // 1809...
  return d;                                                          // ya internacional u otro país
}

async function postMessage(payload) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, error: 'Faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID' };
  }
  try {
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: j.error?.message || `HTTP ${r.status}`, details: j };
    return { ok: true, id: j.messages?.[0]?.id, raw: j };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Mensaje de texto libre (solo válido dentro de la ventana de 24h de servicio).
export async function enviarWhatsAppTexto(to, body) {
  const num = normalizarTelefonoRD(to);
  if (!num) return { ok: false, error: 'Teléfono inválido' };
  return postMessage({ to: num, type: 'text', text: { preview_url: false, body } });
}

// Plantilla aprobada (HSM) — para mensajes proactivos fuera de la ventana 24h
// (ej. recordatorio de mantenimiento). `components` según la plantilla aprobada.
export async function enviarWhatsAppPlantilla(to, templateName, languageCode = 'es', components = []) {
  const num = normalizarTelefonoRD(to);
  if (!num) return { ok: false, error: 'Teléfono inválido' };
  return postMessage({
    to: num, type: 'template',
    template: { name: templateName, language: { code: languageCode }, ...(components.length ? { components } : {}) },
  });
}
