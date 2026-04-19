// app/api/email/send/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 20;

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
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function severidadTheme(severidad) {
  switch (severidad) {
    case 'alerta':
      return { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', label: 'ALERTA' };
    case 'aviso':
      return { color: '#92400e', bg: '#fffbeb', border: '#fde68a', label: 'AVISO' };
    default:
      return { color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', label: 'INFO' };
  }
}

function renderEmailHTML({ titulo, mensaje, detalles, severidad, appUrl }) {
  const theme = severidadTheme(severidad);
  const detallesHTML = detalles && typeof detalles === 'object'
    ? Object.entries(detalles)
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 12px;color:#666;font-size:13px;border-bottom:1px solid #eee;width:40%;"><strong>${escapeHtml(k)}</strong></td><td style="padding:8px 12px;color:#111;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(String(v))}</td></tr>`
        )
        .join('')
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:${theme.bg};border-left:4px solid ${theme.color};padding:20px 24px;">
          <div style="font-size:11px;letter-spacing:1px;color:${theme.color};font-weight:700;margin-bottom:6px;">${theme.label}</div>
          <div style="font-size:20px;color:#111;font-weight:600;">${escapeHtml(titulo)}</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(mensaje)}</p>
          ${detallesHTML ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;border:1px solid #eee;border-radius:6px;overflow:hidden;">${detallesHTML}</table>` : ''}
          ${appUrl ? `<div style="margin-top:24px;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">Abrir ERP</a></div>` : ''}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 24px;border-top:1px solid #eee;color:#9ca3af;font-size:11px;">
          Super Techos ERP · Notificación automática · No responder a este correo.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderEmailText({ titulo, mensaje, detalles }) {
  let txt = `${titulo}\n\n${mensaje}\n`;
  if (detalles && typeof detalles === 'object') {
    txt += '\n';
    for (const [k, v] of Object.entries(detalles)) {
      txt += `${k}: ${v}\n`;
    }
  }
  txt += '\n---\nSuper Techos ERP · Notificación automática';
  return txt;
}

export async function POST(request) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!RESEND_API_KEY || !RESEND_FROM) {
    return NextResponse.json(
      { ok: false, error: 'Falta configuración de Resend en el servidor' },
      { status: 500 }
    );
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Falta configuración de Supabase en el servidor' },
      { status: 500 }
    );
  }

  const rateLimitKey = request.headers.get('x-forwarded-for') || 'global';
  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit excedido, reintenta en un minuto' },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const { evento_key, titulo_custom, mensaje, detalles, destinatarios_override, app_url } = body || {};

  if (!evento_key || typeof evento_key !== 'string') {
    return NextResponse.json({ ok: false, error: 'evento_key requerido' }, { status: 400 });
  }
  if (!mensaje || typeof mensaje !== 'string') {
    return NextResponse.json({ ok: false, error: 'mensaje requerido' }, { status: 400 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: config, error: configErr } = await sb
    .from('notification_configs')
    .select('*')
    .eq('evento_key', evento_key)
    .single();

  if (configErr || !config) {
    return NextResponse.json(
      { ok: false, error: `Evento '${evento_key}' no configurado` },
      { status: 404 }
    );
  }

  if (!config.activo) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: 'Evento desactivado en configuración' },
      { status: 200 }
    );
  }

  const destinatarios = Array.isArray(destinatarios_override) && destinatarios_override.length > 0
    ? destinatarios_override
    : config.destinatarios;

  if (!destinatarios || destinatarios.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Sin destinatarios configurados' },
      { status: 400 }
    );
  }

  const titulo = titulo_custom || config.nombre;
  const asunto = `[Super Techos] ${titulo}`;
  const html = renderEmailHTML({
    titulo,
    mensaje,
    detalles,
    severidad: config.severidad,
    appUrl: app_url || 'https://supertechos-control.vercel.app',
  });
  const text = renderEmailText({ titulo, mensaje, detalles });

  const { data: sendRow } = await sb
    .from('notification_sends')
    .insert({
      evento_key,
      destinatarios,
      asunto,
      estado: 'pendiente',
      datos_contexto: detalles || {},
    })
    .select()
    .single();

  try {
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: destinatarios,
        subject: asunto,
        html,
        text,
      }),
    });

    const resendData = await resendResp.json();

    if (!resendResp.ok) {
      if (sendRow) {
        await sb
          .from('notification_sends')
          .update({ estado: 'fallido', error: JSON.stringify(resendData) })
          .eq('id', sendRow.id);
      }
      await sb
        .from('notification_configs')
        .update({
          ultimo_envio: new Date().toISOString(),
          ultimo_envio_ok: false,
          ultimo_envio_error: resendData?.message || 'Error desconocido de Resend',
        })
        .eq('id', config.id);

      return NextResponse.json(
        { ok: false, error: 'Resend rechazó el envío', detail: resendData },
        { status: 502 }
      );
    }

    if (sendRow) {
      await sb
        .from('notification_sends')
        .update({ estado: 'enviado', resend_id: resendData?.id || null })
        .eq('id', sendRow.id);
    }
    await sb
      .from('notification_configs')
      .update({
        ultimo_envio: new Date().toISOString(),
        ultimo_envio_ok: true,
        ultimo_envio_error: null,
        total_enviados: (config.total_enviados || 0) + 1,
      })
      .eq('id', config.id);

    return NextResponse.json(
      { ok: true, resend_id: resendData?.id, destinatarios },
      { status: 200 }
    );
  } catch (err) {
    if (sendRow) {
      await sb
        .from('notification_sends')
        .update({ estado: 'fallido', error: String(err?.message || err) })
        .eq('id', sendRow.id);
    }
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
