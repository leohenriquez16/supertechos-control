// v8.17.89: Invitación al app server-side. Genera PIN, lo hashea con
// bcrypt y persiste. Devuelve el PIN plaintext UNA SOLA VEZ para que
// el admin lo comparta por WhatsApp.
//
// Modos (mismos que la lógica original en lib/db.js):
//   - `personaIdExistente` definido → activa esa persona específica
//     preservando ID y datos vinculados.
//   - sin `personaIdExistente` → match por teléfono. Si existe, re-invita.
//     Si no, crea persona nueva con rol maestro.

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { normalizarTelefono } from '../../../../lib/helpers/personas';

const BCRYPT_COST = 10;

function generarPinAleatorio(longitud = 6) {
  let pin = '';
  for (let i = 0; i < longitud; i++) pin += Math.floor(Math.random() * 10);
  return pin;
}

export async function POST(request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: 'Falta configuración de Supabase en el servidor' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const nombre = String(body?.nombre || '').trim();
  const tel = normalizarTelefono(body?.telefono);
  const invitadoPorId = body?.invitadoPorId || null;
  const pinTemporal = body?.pinTemporal ? String(body.pinTemporal) : null;
  const rolesExtra = Array.isArray(body?.rolesExtra) ? body.rolesExtra : [];
  const personaIdExistente = body?.personaIdExistente || null;

  if (!nombre) return Response.json({ error: 'Nombre obligatorio' }, { status: 400 });
  if (tel.length !== 10) {
    return Response.json({ error: 'Teléfono debe ser de 10 dígitos (RD)' }, { status: 400 });
  }
  if (pinTemporal && !/^\d{4,6}$/.test(pinTemporal)) {
    return Response.json({ error: 'El PIN temporal debe tener entre 4 y 6 dígitos' }, { status: 400 });
  }

  const pinPlain = pinTemporal || generarPinAleatorio(6);
  const ahora = new Date().toISOString();

  let pinHash;
  try {
    pinHash = await bcrypt.hash(pinPlain, BCRYPT_COST);
  } catch (e) {
    console.error('invitar: bcrypt.hash falló:', e.message);
    return Response.json({ error: 'No se pudo hashear el PIN' }, { status: 500 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Modo "activar persona existente" — preserva ID, roles y datos vinculados.
  if (personaIdExistente) {
    const { data: existente, error: errFetch } = await sb.from('personal')
      .select('id, nombre, roles')
      .eq('id', personaIdExistente)
      .maybeSingle();
    if (errFetch) {
      console.error('invitar: fetch existente falló:', errFetch.message);
      return Response.json({ error: 'No se pudo leer la persona' }, { status: 500 });
    }
    if (!existente) {
      return Response.json({ error: 'La persona ya no existe en la base' }, { status: 404 });
    }

    const { error } = await sb.from('personal').update({
      telefono: tel,
      pin: pinHash,
      pin_temporal: true,
      onboarding_completado: false,
      invitado_at: ahora,
      invitado_por_id: invitadoPorId,
    }).eq('id', personaIdExistente);
    if (error) {
      console.error('invitar: update existente falló:', error.message);
      return Response.json({ error: 'No se pudo activar a la persona' }, { status: 500 });
    }

    return Response.json({
      id: personaIdExistente,
      nombre: existente.nombre,
      telefono: tel,
      pin: pinPlain,
      esNueva: false,
      modo: 'activacion_existente',
    });
  }

  // Modo "nuevo" — match por teléfono o creación.
  const { data: existentes, error: listErr } = await sb.from('personal').select('id, nombre, telefono');
  if (listErr) {
    console.error('invitar: list personal falló:', listErr.message);
    return Response.json({ error: 'No se pudo leer personal' }, { status: 500 });
  }
  const matchExistente = (existentes || []).find(
    p => normalizarTelefono(p.telefono) === tel
  );
  const roles = Array.from(new Set(['maestro', ...rolesExtra]));

  if (matchExistente) {
    const { error } = await sb.from('personal').update({
      pin: pinHash,
      pin_temporal: true,
      onboarding_completado: false,
      invitado_at: ahora,
      invitado_por_id: invitadoPorId,
      telefono: tel,
    }).eq('id', matchExistente.id);
    if (error) {
      console.error('invitar: update match falló:', error.message);
      return Response.json({ error: 'No se pudo re-invitar a la persona' }, { status: 500 });
    }
    return Response.json({
      id: matchExistente.id,
      nombre: matchExistente.nombre,
      telefono: tel,
      pin: pinPlain,
      esNueva: false,
      modo: 'reinvitacion',
    });
  }

  // Crear persona nueva.
  const id = 'p_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const row = {
    id,
    nombre,
    telefono: tel,
    pin: pinHash,
    pin_temporal: true,
    onboarding_completado: false,
    invitado_at: ahora,
    invitado_por_id: invitadoPorId,
    roles,
  };
  const { error } = await sb.from('personal').insert(row);
  if (error) {
    console.error('invitar: insert falló:', error.message);
    return Response.json({ error: 'No se pudo crear la persona' }, { status: 500 });
  }

  return Response.json({
    id,
    nombre,
    telefono: tel,
    pin: pinPlain,
    esNueva: true,
    modo: 'nueva',
    roles,
  });
}
