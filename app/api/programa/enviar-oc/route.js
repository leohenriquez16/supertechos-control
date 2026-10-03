// app/api/programa/enviar-oc/route.js
// v8.59.3 — Reenvía al cliente la OC firmada y sellada, como adjunto, a los correos de
// compras del programa (programas.correos_oc), con copia a Miguel y Leo.
// Solo envía documentos tipo oc_firmada con validación aprobada; los destinatarios salen de
// la base, nunca del pedido, así que esta ruta no sirve para mandar correos a terceros.
import { sbServicio } from '../../../../lib/server/portalAuth';

export const dynamic = 'force-dynamic';

const enviados = new Map(); // docId -> ms (frena dobles clics)

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { /* noop */ }
  const docId = String(body?.docId || '');
  const quien = String(body?.quien || 'Super Techos').slice(0, 80);
  if (!docId) return Response.json({ ok: false, error: 'Falta el documento.' }, { status: 400 });
  if (Date.now() - (enviados.get(docId) || 0) < 60 * 1000) return Response.json({ ok: false, error: 'Ya se envió hace un momento.' }, { status: 429 });

  const db = sbServicio();
  const { data: doc } = await db.from('programa_documentos')
    .select('id, programa_id, locacion_id, tipo, nombre, path, numero_oc, validacion').eq('id', docId).maybeSingle();
  if (!doc || doc.tipo !== 'oc_firmada') return Response.json({ ok: false, error: 'Solo se puede enviar una OC firmada.' }, { status: 400 });
  if (doc.validacion && doc.validacion.ok === false) return Response.json({ ok: false, error: 'Esta OC no pasó la validación.' }, { status: 400 });

  const [{ data: prog }, { data: loc }] = await Promise.all([
    db.from('programas').select('nombre, correos_oc').eq('id', doc.programa_id).maybeSingle(),
    db.from('programa_locaciones').select('nombre, codigo_ut').eq('id', doc.locacion_id).maybeSingle(),
  ]);
  const para = (prog?.correos_oc || []).filter(Boolean);
  if (!para.length) return Response.json({ ok: false, error: 'El programa no tiene correos de compras configurados.' }, { status: 400 });

  const { data: archivo, error: dlErr } = await db.storage.from('proyecto-archivos').download(doc.path);
  if (dlErr || !archivo) return Response.json({ ok: false, error: 'No se encontró el archivo.' }, { status: 404 });
  const contenido = Buffer.from(await archivo.arrayBuffer()).toString('base64');

  const KEY = process.env.RESEND_API_KEY, FROM = process.env.RESEND_FROM_EMAIL;
  if (!KEY || !FROM) return Response.json({ ok: false, error: 'Falta la configuración de correo.' }, { status: 500 });
  const oc = doc.numero_oc ? `OC ${doc.numero_oc}` : 'la orden de compra';
  const sitio = `${loc?.nombre || ''}${loc?.codigo_ut ? ` (${loc.codigo_ut})` : ''}`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: para,
      cc: ['mmartinez@supertechos.com.do', 'lhenriquez@supertechos.com.do'],
      reply_to: 'mmartinez@supertechos.com.do',
      subject: `${oc} firmada · ${sitio} · LH Super Techos`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
        <p>Buenos días,</p>
        <p>Adjuntamos ${oc} correspondiente al sitio <b>${sitio}</b>, firmada y sellada por LH Super Techos en señal de recibido.</p>
        <p>Quedamos atentos para coordinar la ejecución.</p>
        <p>Saludos,<br><b>${quien}</b><br>LH Super Techos, SRL · 809-535-9293</p></div>`,
      attachments: [{ filename: doc.nombre, content: contenido }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return Response.json({ ok: false, error: j?.message || 'No se pudo enviar el correo.' }, { status: 502 });

  enviados.set(docId, Date.now());
  await db.from('programa_documentos').update({ enviado_cliente_at: new Date().toISOString(), enviado_a: para.join(', ') }).eq('id', doc.id);
  return Response.json({ ok: true, enviadoA: para });
}
