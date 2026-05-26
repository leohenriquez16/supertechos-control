// v8.19.1: Helpers para queries al schema `surveys.*`.
// Mantiene el patrón del ERP: client-side queries con anon key.
// RLS de surveys.* (PR 3A) filtra según rol del user.

import { supabase } from './supabase';

// ============================================================
// TEMPLATES
// ============================================================
export async function listarTemplatesSurveys() {
  const { data, error } = await supabase
    .schema('surveys')
    .from('templates')
    .select('id, name, service_line, company, version, description, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) {
    console.warn('listarTemplatesSurveys:', error.message);
    return [];
  }
  return data || [];
}

export async function obtenerTemplateSurvey(templateId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();
  if (error) {
    console.warn('obtenerTemplateSurvey:', error.message);
    return null;
  }
  return data;
}

// ============================================================
// PROJECTS
// ============================================================
export async function listarProyectosSurveys() {
  const { data, error } = await supabase
    .schema('surveys')
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('listarProyectosSurveys:', error.message);
    return [];
  }
  return data || [];
}

export async function obtenerProyectoSurvey(projectId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (error) {
    console.warn('obtenerProyectoSurvey:', error.message);
    return null;
  }
  return data;
}

// ============================================================
// SITES
// ============================================================
export async function listarSitesProyectoSurvey(projectId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('sites')
    .select('*')
    .eq('project_id', projectId)
    .order('external_code', { ascending: true });
  if (error) {
    console.warn('listarSitesProyectoSurvey:', error.message);
    return [];
  }
  return data || [];
}

export async function obtenerSiteSurvey(siteId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .maybeSingle();
  if (error) {
    console.warn('obtenerSiteSurvey:', error.message);
    return null;
  }
  return data;
}

// ============================================================
// CONSTANTES de presentación
// ============================================================
export const SERVICE_LINES = {
  paint:               { label: 'Pintura',              color: '#CC0000' },
  waterproofing:       { label: 'Impermeabilización',   color: '#0066CC' },
  thermal_insulation:  { label: 'Aislamiento Térmico',  color: '#FF8800' },
  epoxy_floor:         { label: 'Pisos Epóxicos',       color: '#009966' },
  urethane_cement:     { label: 'Uretano Cemento',      color: '#996633' },
  concrete_polishing:  { label: 'Pulido de Concreto',   color: '#666666' },
  concrete_repair:     { label: 'Reparación Concreto',  color: '#888888' },
  other:               { label: 'Otro',                 color: '#999999' },
};

export const COMPANIES = {
  super_techos: 'Super Techos',
  prouco:       'Prouco Group',
  shared:       'Super Techos / Prouco',
};

export const PROJECT_STATUS = {
  planning:            'Planificación',
  survey_in_progress:  'Levantamiento en curso',
  survey_completed:    'Levantamiento completado',
  quoted:              'Cotizado',
  awarded:             'Adjudicado',
  in_execution:        'En ejecución',
  completed:           'Completado',
  cancelled:           'Cancelado',
};

export const SITE_STATUS = {
  pending:      { label: 'Pendiente',     color: '#71717a' },
  coordinated:  { label: 'Coordinado',    color: '#3b82f6' },
  confirmed:    { label: 'Confirmado',    color: '#06b6d4' },
  in_route:     { label: 'En ruta',       color: '#f59e0b' },
  in_progress:  { label: 'En sitio',      color: '#eab308' },
  completed:    { label: 'Completado',    color: '#22c55e' },
  validated:    { label: 'Validado',      color: '#a855f7' },
  missing_info: { label: 'Falta info',    color: '#ef4444' },
};
