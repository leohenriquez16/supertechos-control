'use client';

// lib/chatter.js — Chatter tipo Odoo. Bitácora de eventos automáticos
// (creación, cambios de estado) + notas manuales, por entidad.
// Entidades: 'levantamiento' | 'reclamacion' | 'contacto' | 'proyecto' | 'locacion'.

import { supabase } from './supabase';

function nuevoId() {
  return 'ch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function rowToObj(r) {
  return {
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    tipo: r.tipo,
    evento: r.evento || null,
    cuerpo: r.cuerpo || '',
    canal: r.canal || null,          // v8.54.0: whatsapp|correo|llamada|presencial|formulario|sistema
    direccion: r.direccion || null,  // v8.54.0: saliente|entrante|interno
    meta: r.meta || {},
    autorId: r.autor_id || null,
    autorNombre: r.autor_nombre || '',
    createdAt: r.created_at,
  };
}

// Lista los mensajes de una entidad (más reciente primero).
export async function listarChatter(entityType, entityId) {
  if (!entityType || !entityId) return [];
  const { data, error } = await supabase
    .from('chatter_mensajes')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', String(entityId))
    .order('created_at', { ascending: false });
  if (error) { console.warn('listarChatter:', error.message); return []; }
  return (data || []).map(rowToObj);
}

// Inserta un mensaje (uso interno). Nunca lanza: el chatter no debe romper el flujo.
async function insertar({ entityType, entityId, tipo, evento, cuerpo, meta, autor, canal, direccion }) {
  if (!entityType || !entityId) return null;
  try {
    const row = {
      id: nuevoId(),
      entity_type: entityType,
      entity_id: String(entityId),
      tipo: tipo || 'evento',
      evento: evento || null,
      cuerpo: cuerpo || null,
      canal: canal || null,
      direccion: direccion || null,
      meta: meta || {},
      autor_id: autor?.id || null,
      autor_nombre: autor?.nombre || autor?.autorNombre || '',
    };
    const { data, error } = await supabase.from('chatter_mensajes').insert(row).select('*').single();
    if (error) { console.warn('chatter insertar:', error.message); return null; }
    return rowToObj(data);
  } catch (e) {
    console.warn('chatter insertar (catch):', e?.message || e);
    return null;
  }
}

// Evento: entidad creada.
export async function registrarCreacion(entityType, entityId, autor, detalle = '') {
  return insertar({
    entityType, entityId, tipo: 'evento', evento: 'creado',
    cuerpo: detalle || 'Creó el registro', autor,
  });
}

// Evento: cambio de estado.
export async function registrarCambioEstado(entityType, entityId, from, to, autor, etiqueta = '') {
  const fromL = from || '—';
  const toL = to || '—';
  return insertar({
    entityType, entityId, tipo: 'evento', evento: 'estado',
    cuerpo: `Cambió ${etiqueta || 'estado'}: ${fromL} → ${toL}`,
    meta: { from: from || null, to: to || null, etiqueta: etiqueta || 'estado' },
    autor,
  });
}

// Evento genérico (otros cambios relevantes).
export async function registrarEvento(entityType, entityId, cuerpo, autor, meta = {}) {
  return insertar({ entityType, entityId, tipo: 'evento', evento: 'cambio', cuerpo, meta, autor });
}

// Nota manual (comentario interno del usuario).
export async function agregarNota(entityType, entityId, cuerpo, autor) {
  if (!cuerpo || !cuerpo.trim()) return null;
  return insertar({ entityType, entityId, tipo: 'nota', evento: 'nota', cuerpo: cuerpo.trim(), autor });
}

// v8.54.0 (C1): comunicación con el cliente — queda en la bitácora con canal y dirección.
// canal: whatsapp|correo|llamada|presencial|formulario|sistema. direccion: saliente|entrante|interno.
export async function registrarComunicacion(entityType, entityId, { canal, direccion, cuerpo, meta = {}, autor } = {}) {
  return insertar({
    entityType, entityId, tipo: 'comunicacion', evento: 'comunicacion',
    canal: canal || 'sistema', direccion: direccion || 'saliente',
    cuerpo: cuerpo || null, meta, autor,
  });
}

export async function eliminarMensajeChatter(id) {
  try { await supabase.from('chatter_mensajes').delete().eq('id', id); } catch { /* noop */ }
}
