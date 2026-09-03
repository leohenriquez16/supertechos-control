// app/api/email/autorizacion-retiro/route.js
// v8.49.12 (pedido de Leo): los requerimientos a suplidores (ej. Noxida) salen del ERP —
// correo al suplidor autorizando el retiro, con quién retira (nombre, cédula, vehículo)
// y la referencia (OC/cotización). CC a Compras y a Leo.
// POST { para, suplidor, materiales, referencia, retiraNombre, retiraCedula, vehiculo, enviadoPor }

import { NextResponse } from 'next/server';
import { emailsApagados } from '../../../../lib/emailGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CC = ['ljaime@supertechos.com.do', 'lhenriquez@supertechos.com.do'];

export async function POST(request) {
  if (emailsApagados()) return NextResponse.json({ ok: true, sent: false, reason: 'emails_apagados' });
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
  if (!RESEND_API_KEY || !RESEND_FROM) return NextResponse.json({ ok: false, error: 'Falta configuración de Resend' }, { status: 500 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }
  const { para, suplidor, materiales, referencia, retiraNombre, retiraCedula, vehiculo, enviadoPor } = body || {};
  if (!para || !/.+@.+\..+/.test(para)) return NextResponse.json({ ok: false, error: 'Correo del suplidor inválido' }, { status: 400 });
  if (!materiales || !retiraNombre) return NextResponse.json({ ok: false, error: 'Faltan materiales o quién retira' }, { status: 400 });

  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fecha = new Date().toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: 'long', year: 'numeric' });
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#27272a;line-height:1.6;max-width:560px;">
    <p>Estimados ${esc(suplidor || '')},</p>
    <p>Por este medio <b>LH Super Techos, SRL</b> autoriza el retiro de los siguientes materiales${referencia ? ` correspondientes a la referencia <b>${esc(referencia)}</b>` : ''}:</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:10px 14px;white-space:pre-line;">${esc(materiales)}</div>
    <table style="border-collapse:collapse;font-size:14px;margin-top:12px;">
      <tr><td style="padding:2px 10px 2px 0;color:#71717a;">Autorizado a retirar</td><td><b>${esc(retiraNombre)}</b></td></tr>
      ${retiraCedula ? `<tr><td style="padding:2px 10px 2px 0;color:#71717a;">Cédula</td><td>${esc(retiraCedula)}</td></tr>` : ''}
      ${vehiculo ? `<tr><td style="padding:2px 10px 2px 0;color:#71717a;">Vehículo</td><td>${esc(vehiculo)}</td></tr>` : ''}
      <tr><td style="padding:2px 10px 2px 0;color:#71717a;">Fecha</td><td>${esc(fecha)}</td></tr>
    </table>
    <p>Favor entregar únicamente a la persona indicada, contra presentación de su cédula.</p>
    <p style="margin-bottom:2px;">Saludos cordiales,</p>
    <p style="margin-top:0;"><b>${esc(enviadoPor || 'Super Techos')}</b><br/>LH Super Techos, SRL · 809-372-0202<br/><span style="color:#71717a;font-size:12px;">Correo generado desde nuestro sistema de control de obras.</span></p>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: RESEND_FROM, to: [para], cc: CC, reply_to: 'lhenriquez@supertechos.com.do',
      subject: `Autorización de retiro — Super Techos${referencia ? ` · ${referencia}` : ''} · retira ${retiraNombre}`,
      html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ ok: false, error: data?.message || `Resend HTTP ${res.status}` }, { status: 502 });
  return NextResponse.json({ ok: true, id: data?.id || null });
}
