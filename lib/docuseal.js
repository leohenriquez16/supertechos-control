// v8.16: Cliente para la API REST de DocuSeal Cloud.
// Se invoca desde el server (lib/db.js o endpoints) — NO desde cliente,
// para no exponer la API key.
//
// Docs: https://www.docuseal.com/docs/api
// Auth: header X-Auth-Token con la API key.
// Base URL: https://api.docuseal.com

const BASE_URL = 'https://api.docuseal.com';

function getApiKey() {
  const key = process.env.DOCUSEAL_API_KEY;
  if (!key) throw new Error('DOCUSEAL_API_KEY no configurada en variables de entorno');
  return key;
}

async function fetchDocuSeal(path, { method = 'GET', body = null } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-Auth-Token': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) {
    const err = new Error(`DocuSeal API ${res.status}: ${json?.error || json?._raw || res.statusText}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Crea una submission a partir de un template existente.
// El cliente firma vía URL única que devuelve DocuSeal en el campo `slug`.
//
// Si `enviarPorEmail = true`, DocuSeal envía email automático al firmante.
// Si false, NO envía nada y nosotros mandamos el link por WhatsApp/email manual.
//
// Args:
//   templateId: number — id de plantilla en DocuSeal
//   submitter: { email, name, phone?, values: {...} }
//   enviarPorEmail: bool
//
// DocuSeal exige el teléfono en formato internacional E.164 (+<código país><dígitos>).
// RD: 10 dígitos (809/829/849 + 7) → +1XXXXXXXXXX.
function telefonoE164(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return undefined;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '+' + d;
}

// Devuelve la primera submission creada con su slug y URL pública.
// `mensaje` (opcional): { subject, body } personaliza el correo de DocuSeal.
// El body admite variables de DocuSeal: {{submitter.link}}, {{template.name}}, {{account.name}}.
export async function crearSubmission({ templateId, submitter, enviarPorEmail = true, mensaje = null }) {
  const body = {
    template_id: Number(templateId),
    send_email: !!enviarPorEmail,
    send_sms: false,
    submitters: [
      {
        email: submitter.email,
        name: submitter.name,
        phone: telefonoE164(submitter.phone),
        values: submitter.values || {},
        ...(mensaje && (mensaje.subject || mensaje.body) ? { message: { subject: mensaje.subject || '', body: mensaje.body || '' } } : {}),
      },
    ],
  };

  const resp = await fetchDocuSeal('/submissions', { method: 'POST', body });
  // DocuSeal devuelve un array de submitters (uno por cada submitter pasado).
  // Cada uno tiene id, slug, embed_src, status.
  const arr = Array.isArray(resp) ? resp : (resp.data || []);
  const primero = arr[0] || {};
  const slug = primero.slug;
  return {
    submitterId: primero.id,
    submissionId: primero.submission_id || primero.submission?.id,
    slug,
    urlFirmante: slug ? `https://docuseal.com/s/${slug}` : null,
    raw: resp,
  };
}

// Consulta el estado de una submission por ID.
export async function obtenerSubmission(submissionId) {
  return await fetchDocuSeal(`/submissions/${submissionId}`);
}

// Descarga el PDF firmado completo.
// DocuSeal devuelve URLs firmadas (S3) en el campo `documents[].url`.
// Devolvemos un Blob ya descargado para subirlo a Supabase Storage.
export async function descargarPdfFirmado(submissionId) {
  const sub = await obtenerSubmission(submissionId);
  // El documento "combined" suele estar en sub.combined_document_url o
  // dentro de sub.documents[i].url. Probamos ambos.
  const url = sub.combined_document_url
    || sub.audit_log_url
    || (sub.documents && sub.documents[0] && sub.documents[0].url);
  if (!url) throw new Error('DocuSeal no devolvió URL del PDF firmado');

  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo descargar PDF: ${r.status}`);
  return await r.blob();
}

// Verifica el HMAC-SHA256 que DocuSeal envía en el header
// 'X-DocuSeal-Signature' o 'X-Docuseal-Signature'. El secret se configura
// en docuseal.com → Settings → Webhooks (DOCUSEAL_WEBHOOK_SECRET en Vercel).
//
// Devuelve true si es válido. NO lanza para no filtrar info al atacante.
export async function verificarFirmaWebhook(rawBody, signatureHeader) {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('DOCUSEAL_WEBHOOK_SECRET no configurado — saltando verificación');
    return true; // En dev: dejar pasar. En prod: configurar el secret SIEMPRE.
  }
  if (!signatureHeader) return false;

  // HMAC-SHA256 con Web Crypto API (compatible con edge runtime)
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  // DocuSeal manda la firma en hex
  return hex.toLowerCase() === String(signatureHeader).toLowerCase();
}
