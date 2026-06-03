// app/api/email/levantamiento-recibido/route.js
// v8.21.0 — Correo "Levantamiento recibido" al cliente, al crear el levantamiento.
// Usa Resend (RESEND_API_KEY / RESEND_FROM_EMAIL). En entornos sin esas variables
// (ej. LOCAL) responde 200 con sent:false para NO romper el flujo ni enviar correos
// reales durante pruebas.
//
// NOTA: el texto/plantilla de comunicación está PENDIENTE de definir por el cliente.
// `plantillaLevantamientoRecibido()` abajo es un placeholder editable.

import { NextResponse } from 'next/server';
import { emailsApagados } from '../../../../lib/emailGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function emailValido(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// === PLACEHOLDER de plantilla — reemplazar con la comunicación oficial ===
function plantillaLevantamientoRecibido({ clienteNombre, contactoNombre, servicio, locacion, fecha, empresa }) {
  const saludo = contactoNombre ? `Estimado/a ${escapeHtml(contactoNombre)}` : `Estimados ${escapeHtml(clienteNombre || 'cliente')}`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <div style="background:#c0121a;padding:16px 20px;border-radius:8px 8px 0 0">
      <div style="color:#fff;font-weight:bold;font-size:18px;letter-spacing:1px">SUPER TECHOS</div>
    </div>
    <div style="border:1px solid #e5e5e5;border-top:none;padding:20px;border-radius:0 0 8px 8px">
      <p>${saludo},</p>
      <p>Hemos <b>recibido su solicitud de levantamiento</b> y la registramos en nuestro sistema. Nuestro equipo coordinará la visita técnica.</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse;margin:14px 0">
        ${servicio ? `<tr><td style="padding:4px 0;color:#666">Servicio</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(servicio)}</td></tr>` : ''}
        ${locacion ? `<tr><td style="padding:4px 0;color:#666">Locación</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(locacion)}</td></tr>` : ''}
        ${fecha ? `<tr><td style="padding:4px 0;color:#666">Fecha de registro</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(fecha)}</td></tr>` : ''}
      </table>
      <p style="color:#555">En breve nos pondremos en contacto para coordinar los detalles. Si tiene alguna pregunta, responda a este correo.</p>
      <p style="margin-top:18px">Saludos cordiales,<br/><b>${escapeHtml(empresa || 'Super Techos')}</b></p>
    </div>
    <div style="text-align:center;color:#999;font-size:11px;padding:10px">Este es un mensaje automático de confirmación.</div>
  </div>`;
}

export async function POST(request) {
  if (emailsApagados()) return NextResponse.json({ ok: true, sent: false, reason: 'emails_apagados' }, { status: 200 });
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  const {
    destinatarios = [],
    cc = [],
    clienteNombre = '',
    contactoNombre = '',
    servicio = '',
    locacion = '',
    fecha = '',
    empresa = 'Super Techos',
    asunto,
  } = body || {};

  const dests = (Array.isArray(destinatarios) ? destinatarios : []).filter(emailValido);

  // Sin proveedor configurado (LOCAL) o sin destinatarios → no enviamos, pero no rompemos.
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return NextResponse.json({ ok: true, sent: false, reason: 'resend_no_configurado', destinatarios: dests }, { status: 200 });
  }
  if (dests.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: 'sin_destinatarios_validos' }, { status: 200 });
  }

  const html = plantillaLevantamientoRecibido({ clienteNombre, contactoNombre, servicio, locacion, fecha, empresa });
  const payload = {
    from: RESEND_FROM,
    to: dests,
    subject: asunto || `Levantamiento recibido — ${clienteNombre || 'Super Techos'}`,
    html,
  };
  const ccs = (Array.isArray(cc) ? cc : []).filter(emailValido);
  if (ccs.length > 0) payload.cc = ccs;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('Resend rechazó levantamiento-recibido:', data);
      return NextResponse.json({ ok: false, sent: false, error: 'Resend rechazó el envío', detail: data }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent: true, resend_id: data?.id, destinatarios: dests }, { status: 200 });
  } catch (err) {
    console.error('Error enviando levantamiento-recibido:', err);
    return NextResponse.json({ ok: false, sent: false, error: String(err?.message || err) }, { status: 500 });
  }
}
