// app/api/enviar-reporte/route.js
// Endpoint para envío de reportes (entregas, incidentes) por correo vía Resend
// Recibe { destinatarios, asunto, html } y envía el correo

import { emailsApagados } from '../../../lib/emailGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (emailsApagados()) return Response.json({ ok: true, sent: false, reason: 'emails_apagados' }, { status: 200 });
  // Validar config
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;

  if (!RESEND_API_KEY || !RESEND_FROM) {
    return Response.json({
      enviado: false,
      motivo: 'Faltan RESEND_API_KEY o RESEND_FROM_EMAIL en variables de entorno',
    }, { status: 500 });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({
      enviado: false,
      motivo: 'JSON inválido en el body',
    }, { status: 400 });
  }

  const { destinatarios, asunto, html, cc } = body || {};

  // Validar destinatarios
  if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
    return Response.json({
      enviado: false,
      motivo: 'destinatarios debe ser un array no vacío',
    }, { status: 400 });
  }

  // Validar formato de cada email (to + cc)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ccList = Array.isArray(cc) ? cc.map(e => String(e || '').trim()).filter(Boolean) : [];
  const invalidos = [...destinatarios, ...ccList].filter(e => !emailRegex.test(String(e || '').trim()));
  if (invalidos.length > 0) {
    return Response.json({
      enviado: false,
      motivo: `Email(s) inválido(s): ${invalidos.join(', ')}`,
    }, { status: 400 });
  }

  // Validar asunto y html
  if (!asunto || typeof asunto !== 'string') {
    return Response.json({
      enviado: false,
      motivo: 'asunto requerido',
    }, { status: 400 });
  }

  if (!html || typeof html !== 'string') {
    return Response.json({
      enviado: false,
      motivo: 'html requerido',
    }, { status: 400 });
  }

  // Verificar tamaño del HTML (Resend tiene límite ~10MB pero es bueno avisar antes)
  const sizeMB = new Blob([html]).size / 1024 / 1024;
  if (sizeMB > 8) {
    return Response.json({
      enviado: false,
      motivo: `HTML demasiado grande (${sizeMB.toFixed(1)}MB). Probable que tenga fotos como data URLs. Usa URLs públicas en lugar de base64.`,
    }, { status: 413 });
  }

  // Llamar a Resend
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: destinatarios.map(e => String(e).trim()),
        ...(ccList.length ? { cc: ccList } : {}),
        subject: asunto,
        html,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return Response.json({
        enviado: false,
        motivo: data?.message || data?.name || `Resend rechazó el envío (HTTP ${resp.status})`,
        detalle: data,
      }, { status: 502 });
    }

    return Response.json({
      enviado: true,
      resendId: data.id,
      destinatarios,
    });
  } catch (e) {
    return Response.json({
      enviado: false,
      motivo: `Error de red llamando a Resend: ${e.message}`,
    }, { status: 500 });
  }
}
