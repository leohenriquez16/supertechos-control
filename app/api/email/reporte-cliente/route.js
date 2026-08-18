// app/api/email/reporte-cliente/route.js
// v8.27.78: envía al CLIENTE un reporte de la obra (PDF adjunto) por Resend.
// Lo dispara un admin desde el ERP (validación humana antes del envío).
// POST { para, cc, asunto, mensaje, pdfBase64, filename }

import { NextResponse } from 'next/server';
import { emailsApagados } from '../../../../lib/emailGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PDF_BYTES = 3.6 * 1024 * 1024; // margen sobre los ~3MB del reporte

export async function POST(request) {
  if (emailsApagados()) return NextResponse.json({ ok: true, sent: false, reason: 'emails_apagados' });
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return NextResponse.json({ ok: false, error: 'Falta configuración de Resend en el servidor' }, { status: 500 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }
  const { para, cc, asunto, mensaje, pdfBase64, filename } = body || {};
  if (!para || !/.+@.+\..+/.test(para)) return NextResponse.json({ ok: false, error: 'Correo destino inválido' }, { status: 400 });
  if (!asunto || !pdfBase64) return NextResponse.json({ ok: false, error: 'Faltan asunto o PDF' }, { status: 400 });
  const limpio = String(pdfBase64).replace(/^data:[^;]+;base64,/, '');
  if (limpio.length * 0.75 > MAX_PDF_BYTES) return NextResponse.json({ ok: false, error: 'El PDF excede el tamaño máximo (3.5MB)' }, { status: 400 });

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#27272a;line-height:1.6;">
    <p>${String(mensaje || 'Adjunto el reporte de su obra.').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>
    <p style="color:#71717a;font-size:12px;margin-top:18px;">Super Techos, SRL · Este correo fue enviado desde nuestro sistema de control de obras.</p>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [para],
      ...(cc ? { cc: [cc] } : {}),
      subject: asunto,
      html,
      attachments: [{ filename: filename || 'reporte.pdf', content: limpio }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: data?.message || `Resend HTTP ${res.status}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: data?.id || null });
}
