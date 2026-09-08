// app/api/email/ticket-resuelto/route.js
// v8.50.7 (pedido de Leo): cuando un ticket de Gotera se marca RESUELTO, el que lo
// reportó recibe un correo con la respuesta (la gente no volvía a entrar al módulo y
// no se enteraba). CC a Leo siempre. Fire-and-forget desde el módulo Gotera.
// POST { para, nombre, titulo, respuesta, resueltoPor }

import { NextResponse } from 'next/server';
import { emailsApagados } from '../../../../lib/emailGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CC = 'lhenriquez@supertechos.com.do';

export async function POST(request) {
  if (emailsApagados()) return NextResponse.json({ ok: true, sent: false, reason: 'emails_apagados' });
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
  if (!RESEND_API_KEY || !RESEND_FROM) return NextResponse.json({ ok: false, error: 'Falta configuración de Resend' }, { status: 500 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }
  const { para, nombre, titulo, respuesta, resueltoPor } = body || {};
  if (!para || !/.+@.+\..+/.test(para)) return NextResponse.json({ ok: false, error: 'Correo del reportante inválido' }, { status: 400 });
  if (!titulo) return NextResponse.json({ ok: false, error: 'Falta el título del ticket' }, { status: 400 });

  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#27272a;line-height:1.6;max-width:560px;">
    <p>Hola ${esc((nombre || '').split(' ')[0] || '')},</p>
    <p>Tu reporte en Gotera quedó <b style="color:#15803d;">RESUELTO</b> ✅</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:10px 14px;">
      <div style="font-weight:bold;">${esc(titulo)}</div>
      ${respuesta ? `<div style="margin-top:6px;color:#3f3f46;">${esc(respuesta)}</div>` : ''}
    </div>
    <p>Entra al ERP y verifica que quedó como esperabas — si no, responde reabriendo el reporte en Gotera.</p>
    <p style="color:#71717a;font-size:12px;">${resueltoPor ? `Resuelto por ${esc(resueltoPor)} · ` : ''}Correo automático del ERP Super Techos (módulo Gotera).</p>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: RESEND_FROM, to: [para], cc: [CC],
      subject: `✅ Resuelto: ${titulo}`,
      html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ ok: false, error: data?.message || `Resend HTTP ${res.status}` }, { status: 502 });
  return NextResponse.json({ ok: true, id: data?.id || null });
}
