// app/api/email/alerta-compras/route.js
// v8.49.2 (ticket Jonathan Jacobo): cuando almacén marca un renglón "comprar",
// avisa por correo a Compras (Lily) con copia a Leo. Antes no existía ninguna alerta.
// POST { proyecto, articulo, cantidad, unidad, requisicion, marcadoPor }

import { NextResponse } from 'next/server';
import { emailsApagados } from '../../../../lib/emailGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PARA = 'ljaime@supertechos.com.do';        // Lily — Compras
const CC = 'lhenriquez@supertechos.com.do';      // Leo

export async function POST(request) {
  if (emailsApagados()) return NextResponse.json({ ok: true, sent: false, reason: 'emails_apagados' });
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return NextResponse.json({ ok: false, error: 'Falta configuración de Resend en el servidor' }, { status: 500 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const { proyecto, articulo, cantidad, unidad, requisicion, marcadoPor } = body || {};
  if (!articulo) return NextResponse.json({ ok: false, error: 'Falta el artículo' }, { status: 400 });

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#27272a;line-height:1.6;">
    <p><b>Almacén marcó un artículo para COMPRAR:</b></p>
    <table style="border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:2px 10px 2px 0;color:#71717a;">Artículo</td><td><b>${esc(articulo)}</b>${cantidad ? ` — ${esc(cantidad)} ${esc(unidad || '')}` : ''}</td></tr>
      ${proyecto ? `<tr><td style="padding:2px 10px 2px 0;color:#71717a;">Obra</td><td>${esc(proyecto)}</td></tr>` : ''}
      ${requisicion ? `<tr><td style="padding:2px 10px 2px 0;color:#71717a;">Solicitud</td><td>${esc(requisicion)}</td></tr>` : ''}
      ${marcadoPor ? `<tr><td style="padding:2px 10px 2px 0;color:#71717a;">Marcado por</td><td>${esc(marcadoPor)}</td></tr>` : ''}
    </table>
    <p style="color:#71717a;font-size:12px;margin-top:18px;">Super Techos, SRL · Alerta automática del ERP (módulo Almacén).</p>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [PARA],
      cc: [CC],
      subject: `🛒 Comprar: ${articulo}${proyecto ? ` — ${proyecto}` : ''}`,
      html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ ok: false, error: data?.message || `Resend HTTP ${res.status}` }, { status: 502 });
  return NextResponse.json({ ok: true, id: data?.id || null });
}
