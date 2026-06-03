'use client';

// lib/notificaciones.js — Catálogo de módulos/etapas para el settings de
// notificaciones + helpers de plantillas y configuración por etapa.

import { supabase } from './supabase';

// Roles internos disponibles como destinatarios.
export const ROLES_INTERNOS = [
  { key: 'owner',      label: 'Dueño (owner)' },
  { key: 'admin',      label: 'Administradores' },
  { key: 'supervisor', label: 'Supervisor asignado' },
];

// Variables disponibles para las plantillas (se interpolan {{clave}}).
export const VARIABLES_PLANTILLA = [
  { k: 'cliente',     d: 'Nombre del cliente' },
  { k: 'contacto',    d: 'Nombre del contacto' },
  { k: 'empresa',     d: 'Empresa (Super Techos / Prouco)' },
  { k: 'etapa',       d: 'Etapa / estado actual' },
  { k: 'fecha',       d: 'Fecha del evento' },
  { k: 'referencia',  d: 'Referencia / código' },
  { k: 'proyecto',    d: 'Nombre del proyecto' },
  { k: 'locacion',    d: 'Locación / sitio' },
  { k: 'servicio',    d: 'Tipo de servicio' },
  { k: 'descripcion', d: 'Descripción (reclamación)' },
  { k: 'sistema',     d: 'Sistema / garantía' },
  { k: 'vence',       d: 'Fecha de vencimiento' },
];

// Módulos y sus etapas (clave + etiqueta). Las claves coinciden con los estados
// reales de cada módulo para poder enganchar el envío al cambiar de etapa.
export const MODULOS_NOTIF = [
  {
    key: 'proyecto', label: 'Proyectos',
    etapas: [
      { key: 'aprobado',                     label: 'Aprobado' },
      { key: 'planificado',                  label: 'Planificado' },
      { key: 'en_ejecucion',                 label: 'En ejecución' },
      { key: 'parado',                       label: 'Parado' },
      { key: 'finalizado_no_entregado',      label: 'Finalizado No Entregado' },
      { key: 'finalizado_recibido_conforme', label: 'Finalizado Recibido Conforme' },
      { key: 'facturado',                    label: 'Facturado' },
    ],
  },
  {
    key: 'levantamiento', label: 'Levantamientos',
    etapas: [
      { key: 'planning',            label: 'Recibido / Planificación' },
      { key: 'survey_in_progress',  label: 'Levantamiento en curso' },
      { key: 'survey_completed',    label: 'Levantamiento completado' },
      { key: 'quoted',              label: 'Cotizado' },
      { key: 'awarded',             label: 'Adjudicado' },
      { key: 'cancelled',           label: 'Cancelado' },
    ],
  },
  {
    key: 'reclamacion', label: 'Reclamaciones',
    etapas: [
      { key: 'abierta',    label: 'Abierta' },
      { key: 'en_proceso', label: 'En proceso' },
      { key: 'resuelta',   label: 'Resuelta' },
      { key: 'cerrada',    label: 'Cerrada' },
      { key: 'rechazada',  label: 'Rechazada' },
    ],
  },
  {
    key: 'garantia', label: 'Garantías / Mantenimientos',
    etapas: [
      { key: 'garantia_creada',         label: 'Garantía creada' },
      { key: 'mantenimiento_agendado',  label: 'Mantenimiento agendado' },
      { key: 'mantenimiento_por_vencer', label: 'Mantenimiento por vencer' },
      { key: 'mantenimiento_vencido',   label: 'Mantenimiento vencido' },
      { key: 'garantia_suspendida',     label: 'Garantía suspendida' },
    ],
  },
];

export function etiquetaEtapa(modulo, etapa) {
  const m = MODULOS_NOTIF.find(x => x.key === modulo);
  return m?.etapas.find(e => e.key === etapa)?.label || etapa;
}

// ---------- Plantillas ----------
function tplRow(r) {
  return { id: r.id, nombre: r.nombre, asunto: r.asunto || '', html: r.html || '', descripcion: r.descripcion || '', updatedAt: r.updated_at };
}

export async function listarPlantillas() {
  const { data, error } = await supabase.from('email_templates').select('*').order('nombre');
  if (error) { console.warn('listarPlantillas:', error.message); return []; }
  return (data || []).map(tplRow);
}

export async function guardarPlantilla(t) {
  const id = t.id || ('tpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const row = { id, nombre: t.nombre || 'Plantilla', asunto: t.asunto || '', html: t.html || '', descripcion: t.descripcion || null, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('email_templates').upsert(row).select('*').single();
  if (error) throw error;
  return tplRow(data);
}

export async function eliminarPlantilla(id) {
  const { error } = await supabase.from('email_templates').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Config por etapa ----------
function cfgRow(r) {
  return {
    id: r.id, modulo: r.modulo, etapa: r.etapa,
    clienteActivo: !!r.cliente_activo, clienteTemplateId: r.cliente_template_id || null,
    internoActivo: !!r.interno_activo, internoTemplateId: r.interno_template_id || null,
    internoRoles: Array.isArray(r.interno_roles) ? r.interno_roles : [],
    internoEmails: Array.isArray(r.interno_emails) ? r.interno_emails : [],
  };
}

export async function listarStageConfigs(modulo = null) {
  let q = supabase.from('stage_notif_configs').select('*');
  if (modulo) q = q.eq('modulo', modulo);
  const { data, error } = await q;
  if (error) { console.warn('listarStageConfigs:', error.message); return []; }
  return (data || []).map(cfgRow);
}

export async function guardarStageConfig(c) {
  const id = c.id || `${c.modulo}:${c.etapa}`;
  const row = {
    id, modulo: c.modulo, etapa: c.etapa,
    cliente_activo: !!c.clienteActivo, cliente_template_id: c.clienteTemplateId || null,
    interno_activo: !!c.internoActivo, interno_template_id: c.internoTemplateId || null,
    interno_roles: Array.isArray(c.internoRoles) ? c.internoRoles : [],
    interno_emails: Array.isArray(c.internoEmails) ? c.internoEmails : [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('stage_notif_configs').upsert(row).select('*').single();
  if (error) throw error;
  return cfgRow(data);
}

// Interpola {{clave}} en un texto con el objeto vars.
export function interpolar(texto, vars = {}) {
  return String(texto || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}
