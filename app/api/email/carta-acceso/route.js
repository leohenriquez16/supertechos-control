// app/api/email/carta-acceso/route.js
// v8.17.41 — Envío de Carta de Acceso al cliente con PDF adjunto.
// Endpoint independiente del flujo de notificaciones automáticas (notification_configs)
// porque acá los destinatarios vienen directo del contacto del proyecto, no de una
// configuración global.

import { NextResponse } from 'next/server';
import { emailsApagados } from '../../../../lib/emailGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 10;

function checkRateLimit(key) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  record.count += 1;
  rateLimitMap.set(key, record);
  return record.count <= RATE_LIMIT_MAX_CALLS;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validación básica de email (no perfecta, pero suficiente para evitar disparos al vacío)
function emailValido(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export async function POST(request) {
  if (emailsApagados()) return NextResponse.json({ ok: true, sent: false, reason: 'emails_apagados' }, { status: 200 });
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;

  if (!RESEND_API_KEY || !RESEND_FROM) {
    return NextResponse.json(
      { ok: false, error: 'Falta configuración de Resend en el servidor (RESEND_API_KEY / RESEND_FROM_EMAIL)' },
      { status: 500 }
    );
  }

  const rateLimitKey = request.headers.get('x-forwarded-for') || 'global';
  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit excedido (10 cartas/minuto), reintenta luego' },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const {
    destinatarios,       // string[] — emails del cliente
    cc = [],             // string[] opcional — copia interna (ej: admin que envió)
    asunto,              // string — asunto del email
    mensaje_html,        // string — cuerpo HTML del email
    pdf_base64,          // string — el PDF en base64 (sin prefijo data:)
    pdf_filename = 'carta-acceso.pdf',
    proyecto_ref,        // string opcional — para logging
  } = body || {};

  // Validaciones
  if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
    return NextResponse.json({ ok: false, error: 'destinatarios requerido (array no vacío)' }, { status: 400 });
  }
  const dests = destinatarios.filter(emailValido);
  if (dests.length === 0) {
    return NextResponse.json({ ok: false, error: 'Ningún destinatario con email válido' }, { status: 400 });
  }
  const ccs = (Array.isArray(cc) ? cc : []).filter(emailValido);

  if (!asunto || typeof asunto !== 'string') {
    return NextResponse.json({ ok: false, error: 'asunto requerido' }, { status: 400 });
  }
  if (!pdf_base64 || typeof pdf_base64 !== 'string') {
    return NextResponse.json({ ok: false, error: 'pdf_base64 requerido' }, { status: 400 });
  }
  // Limpiar prefijo data: si vino con él
  const pdfClean = pdf_base64.replace(/^data:application\/pdf;base64,/, '');

  // Tamaño máximo razonable del PDF: Resend acepta hasta ~40MB, pero para una carta
  // realista debería pesar <500KB. Si es más grande probablemente algo está mal.
  const sizeBytes = Math.ceil((pdfClean.length * 3) / 4);
  if (sizeBytes > 10 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'PDF excede 10MB' }, { status: 413 });
  }

  const resendPayload = {
    from: RESEND_FROM,
    to: dests,
    subject: asunto,
    html: mensaje_html || '<p>Adjunto la carta de acceso del personal asignado al proyecto.</p>',
    attachments: [
      {
        filename: pdf_filename,
        content: pdfClean, // base64
      },
    ],
  };
  if (ccs.length > 0) resendPayload.cc = ccs;

  try {
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendResp.json().catch(() => ({}));

    if (!resendResp.ok) {
      console.error('Resend rechazó carta:', resendData);
      return NextResponse.json(
        { ok: false, error: 'Resend rechazó el envío', detail: resendData },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { ok: true, resend_id: resendData?.id, destinatarios: dests, cc: ccs, proyecto_ref },
      { status: 200 }
    );
  } catch (err) {
    console.error('Error enviando carta-acceso:', err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
