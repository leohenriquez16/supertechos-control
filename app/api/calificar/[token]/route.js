// app/api/calificar/[token]/route.js
// v8.54.1 (C3): API pública de la calificación del cliente (CSAT). Sin login; service_role.
//   GET  → devuelve el contexto (cliente/tema) y si ya fue respondida.
//   POST → guarda la calificación (1-5) + comentario (una sola vez) y la registra en la bitácora.

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export async function GET(_request, { params }) {
  const token = params?.token;
  if (!token) return Response.json({ ok: false, error: 'token' }, { status: 400 });
  const db = sb();
  const { data } = await db.from('retroalimentacion_cliente').select('*').eq('token', token).maybeSingle();
  if (!data) return Response.json({ ok: false, error: 'no encontrado' }, { status: 404 });
  return Response.json({
    ok: true,
    clienteNombre: data.cliente_nombre || '',
    contexto: data.contexto || '',
    yaRespondido: !!data.respondido_at,
    calificacion: data.calificacion ?? null,
  });
}

export async function POST(request, { params }) {
  const token = params?.token;
  if (!token) return Response.json({ ok: false, error: 'token' }, { status: 400 });
  let body = {};
  try { body = await request.json(); } catch { /* noop */ }
  const cal = Number(body?.calificacion);
  const comentario = (body?.comentario || '').toString().slice(0, 2000);
  if (!(cal >= 1 && cal <= 5)) return Response.json({ ok: false, error: 'calificación 1-5' }, { status: 400 });

  const db = sb();
  const { data: row } = await db.from('retroalimentacion_cliente').select('*').eq('token', token).maybeSingle();
  if (!row) return Response.json({ ok: false, error: 'no encontrado' }, { status: 404 });
  if (row.respondido_at) return Response.json({ ok: true, yaRespondido: true });

  const { error } = await db.from('retroalimentacion_cliente')
    .update({ calificacion: cal, comentario: comentario || null, respondido_at: new Date().toISOString() })
    .eq('token', token);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Queda en la bitácora de comunicación del ticket (entrante).
  try {
    await db.from('chatter_mensajes').insert({
      id: 'ch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      entity_type: row.entity_type, entity_id: String(row.entity_id),
      tipo: 'comunicacion', evento: 'comunicacion', canal: 'formulario', direccion: 'entrante',
      cuerpo: `El cliente calificó con ${cal}/5${comentario ? `: “${comentario}”` : '.'}`,
      meta: { csat: cal }, autor_nombre: row.cliente_nombre || 'Cliente',
    });
  } catch { /* noop: la bitácora no debe romper el guardado */ }

  return Response.json({ ok: true });
}
