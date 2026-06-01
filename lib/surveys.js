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

// v8.19.65: asignar una persona (del personal habilitado) a un levantamiento.
export async function asignarPersonaSurvey(projectId, personaId, nombre) {
  const { error } = await supabase
    .schema('surveys')
    .from('projects')
    .update({ asignado_a_id: personaId || null, asignado_a_nombre: nombre || null })
    .eq('id', projectId);
  if (error) throw error;
}

// v8.19.72: requerimiento de escalera del levantamiento (clave para el maestro:
// saber qué llevar antes de ir). no = no hace falta · normal · larga (para subir).
export const ESCALERA = {
  no:     { label: 'No hace falta escalera', short: 'Sin escalera',   color: '#22c55e', icon: '✓' },
  normal: { label: 'Escalera normal',         short: 'Escalera',       color: '#f59e0b', icon: '🪜' },
  larga:  { label: 'Escalera larga (subir)',  short: 'Escalera larga', color: '#ef4444', icon: '🪜' },
};
export async function setRequiereEscaleraSurvey(projectId, valor) {
  const { error } = await supabase
    .schema('surveys')
    .from('projects')
    .update({ requiere_escalera: valor || null })
    .eq('id', projectId);
  if (error) throw error;
}

// v8.19.81: [Fase 2] completitud del levantamiento. Cuenta los campos obligatorios
// del template (incluye mínimos de fotos) contra lo capturado en general_data y en
// las áreas (a.data[fieldId]). Devuelve % + lista de faltantes. Función pura.
export function calcularCompletitud(template, generalData = {}, areas = []) {
  const faltantes = [];
  let req = 0, ok = 0;
  const tieneValor = (f, v) => {
    if (f.type === 'photos') return Array.isArray(v) && v.length >= (f.min || 1);
    if (f.type === 'boolean') return v === true || v === false;
    if (Array.isArray(v)) return v.length > 0;
    return v != null && String(v).trim() !== '';
  };
  const esReq = (f) => f.required || (f.type === 'photos' && f.min);
  for (const sec of (template?.schema?.sections || template?.sections || [])) {
    const reqFields = (sec.fields || []).filter(esReq);
    if (sec.type !== 'repeating_block') {
      for (const f of reqFields) { req++; if (tieneValor(f, generalData[f.id])) ok++; else faltantes.push({ seccion: sec.title, label: f.label }); }
    } else {
      const filas = areas.filter(a => a.block_id === sec.id);
      if (reqFields.length && filas.length === 0) { req++; faltantes.push({ seccion: sec.title, label: `Agregar al menos 1 en "${sec.title}"` }); continue; }
      for (const a of filas) {
        for (const f of reqFields) { req++; if (tieneValor(f, (a.data || {})[f.id])) ok++; else faltantes.push({ seccion: sec.title, label: `${a.name || 'Área'}: ${f.label}` }); }
      }
    }
  }
  const pct = req === 0 ? 100 : Math.round((ok / req) * 100);
  return { pct, req, ok, faltantes };
}

export async function setCompletitudProyecto(projectId, pct) {
  if (!projectId) return;
  const { error } = await supabase
    .schema('surveys')
    .from('projects')
    .update({ porcentaje_completitud: pct })
    .eq('id', projectId);
  if (error) console.warn('setCompletitudProyecto:', error.message);
}

// ============================================================
// v8.19.82: [Fase 3] Puntos singulares (marcados sobre la foto)
// ============================================================
export const PUNTOS_SINGULARES = {
  bache:    { label: 'Bache',                 icon: '🕳️', color: '#a16207' },
  aire:     { label: 'Aire acondicionado',    icon: '❄️', color: '#0ea5e9' },
  desague:  { label: 'Desagüe / tragante',    icon: '💧', color: '#3b82f6' },
  junta:    { label: 'Junta de dilatación',   icon: '➖', color: '#8b5cf6' },
  grieta:   { label: 'Grieta',                icon: '⚡', color: '#ef4444' },
  tuberia:  { label: 'Tubería',               icon: '🔧', color: '#64748b' },
  antena:   { label: 'Antena / pararrayos',   icon: '📡', color: '#14b8a6' },
  domo:     { label: 'Domo / claraboya',      icon: '🔆', color: '#f59e0b' },
  chimenea: { label: 'Chimenea / extractor',  icon: '🏭', color: '#71717a' },
  bajante:  { label: 'Bajante pluvial',       icon: '⬇️', color: '#2563eb' },
};

export async function listarPuntosSingulares(visitId) {
  if (!visitId) return [];
  const { data, error } = await supabase.schema('surveys').from('puntos_singulares')
    .select('*').eq('visit_id', visitId).order('created_at', { ascending: true });
  if (error) { console.warn('listarPuntosSingulares:', error.message); return []; }
  return data || [];
}
export async function crearPuntoSingular(p) {
  const { data, error } = await supabase.schema('surveys').from('puntos_singulares').insert({
    visit_id: p.visitId, area_id: p.areaId || null, photo_id: p.photoId || null,
    tipo: p.tipo, x_relativa: p.xRelativa ?? null, y_relativa: p.yRelativa ?? null,
    cantidad: p.cantidad || 1, dimension: p.dimension || null, severidad: p.severidad || null,
    requiere_tratamiento_especial: !!p.requiereTratamientoEspecial, notas: p.notas || null,
  }).select('*').single();
  if (error) throw error;
  return data;
}
export async function actualizarPuntoSingular(id, campos) {
  const u = {};
  if (campos.tipo !== undefined) u.tipo = campos.tipo;
  if (campos.cantidad !== undefined) u.cantidad = campos.cantidad;
  if (campos.dimension !== undefined) u.dimension = campos.dimension;
  if (campos.severidad !== undefined) u.severidad = campos.severidad;
  if (campos.requiereTratamientoEspecial !== undefined) u.requiere_tratamiento_especial = !!campos.requiereTratamientoEspecial;
  if (campos.notas !== undefined) u.notas = campos.notas;
  const { error } = await supabase.schema('surveys').from('puntos_singulares').update(u).eq('id', id);
  if (error) throw error;
}
export async function eliminarPuntoSingular(id) {
  const { error } = await supabase.schema('surveys').from('puntos_singulares').delete().eq('id', id);
  if (error) throw error;
}

// v8.19.83: [Fase 4] precios de referencia por m² (RD$, min/max) por línea de
// servicio. Editables en la pantalla de estimación. Solo referencia.
export const PRECIOS_REF_M2 = {
  waterproofing:      [600, 1200],
  paint:              [200, 450],
  thermal_insulation: [700, 1400],
  epoxy_floor:        [1500, 3500],
  urethane_cement:    [2500, 5000],
  concrete_polishing: [800, 1800],
  concrete_repair:    [1000, 3000],
  other:              [500, 1500],
};

// Persiste la estimación en el levantamiento: monto_estimado_min/max + detalle en metadata.
export async function setEstimacionProyecto(projectId, est) {
  if (!projectId) return;
  const { data: proj } = await supabase.schema('surveys').from('projects').select('metadata').eq('id', projectId).maybeSingle();
  const metadata = { ...(proj?.metadata || {}), estimacion: est.detalle || null };
  const { error } = await supabase.schema('surveys').from('projects').update({
    monto_estimado_min: est.min ?? null, monto_estimado_max: est.max ?? null, metadata,
  }).eq('id', projectId);
  if (error) throw error;
}

// Estimación de materiales adicionales a partir de los puntos (reglas del brief).
export function estimarMaterialesPuntos(puntos) {
  const conteo = {};
  for (const p of puntos) conteo[p.tipo] = (conteo[p.tipo] || 0) + (Number(p.cantidad) || 1);
  const out = [];
  const ceil = (n) => Math.ceil(n);
  if (conteo.bache) out.push({ material: 'Mortero de reparación', cantidad: ceil(conteo.bache / 5), unidad: 'saco(s)', detalle: `${conteo.bache} bache(s)` });
  if (conteo.desague) out.push({ material: 'Sellador poliuretano', cantidad: ceil(conteo.desague / 3), unidad: 'galón(es)', detalle: `${conteo.desague} desagüe(s)` });
  if (conteo.junta) out.push({ material: 'Cartucho de sellador', cantidad: conteo.junta * 2, unidad: 'cartucho(s)', detalle: `${conteo.junta} junta(s)` });
  if (conteo.grieta) out.push({ material: 'Sellador de grietas', cantidad: conteo.grieta, unidad: 'cartucho(s)', detalle: `${conteo.grieta} grieta(s)` });
  const detalles = (conteo.tuberia || 0) + (conteo.antena || 0) + (conteo.domo || 0) + (conteo.chimenea || 0) + (conteo.bajante || 0);
  if (detalles) out.push({ material: 'Sellado de detalles / penetraciones', cantidad: detalles, unidad: 'detalle(s)', detalle: 'tuberías, antenas, domos, chimeneas, bajantes' });
  if (conteo.aire) out.push({ material: 'Refuerzo de bases de A/C', cantidad: conteo.aire, unidad: 'unidad(es)', detalle: `${conteo.aire} A/C` });
  return out;
}

// v8.19.64: todos los sites (para la vista de mapa del módulo de levantamientos).
export async function listarTodosLosSitesSurvey() {
  const { data, error } = await supabase
    .schema('surveys')
    .from('sites')
    .select('id, project_id, name, address, latitude, longitude, survey_status');
  if (error) {
    console.warn('listarTodosLosSitesSurvey:', error.message);
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
// CREATE PROJECT / SITES
// ============================================================

// Genera un ID legible tipo 'proj-banreservas-pintura-2026'.
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function crearProyectoSurvey({ name, clientName, serviceLine, company, templateId, description, createdByAuthUserId }) {
  const baseSlug = slugify(name) || 'proyecto';
  const id = `proj-${baseSlug}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await supabase
    .schema('surveys')
    .from('projects')
    .insert({
      id,
      name,
      client_name: clientName,
      service_line: serviceLine,
      company,
      template_id: templateId,
      description: description || null,
      status: 'planning',
      created_by: createdByAuthUserId || null,
    })
    .select('*')
    .single();
  if (error) {
    console.error('crearProyectoSurvey:', error.message);
    throw error;
  }
  return data;
}

export async function crearSiteSurvey({ projectId, externalCode, name, address, province, city, siteSubtype, latitude, longitude, contactName, contactRole, officePhone, mobilePhone, weekdayHours, saturdayHours, notes, surveyStatus = 'pending' }) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('sites')
    .insert({
      project_id: projectId,
      external_code: externalCode || null,
      name,
      address: address || null,
      province: province || null,
      city: city || null,
      site_subtype: siteSubtype || null,
      latitude: latitude != null && latitude !== '' ? Number(latitude) : null,
      longitude: longitude != null && longitude !== '' ? Number(longitude) : null,
      contact_name: contactName || null,
      contact_role: contactRole || null,
      office_phone: officePhone || null,
      mobile_phone: mobilePhone || null,
      weekday_hours: weekdayHours || null,
      saturday_hours: saturdayHours || null,
      notes: notes || null,
      survey_status: surveyStatus,
    })
    .select('*')
    .single();
  if (error) {
    console.error('crearSiteSurvey:', error.message);
    throw error;
  }
  return data;
}

export async function crearSitesEnLote(projectId, sitesArray) {
  const rows = sitesArray.map(s => ({
    project_id: projectId,
    external_code: s.externalCode || s.external_code || null,
    name: s.name,
    address: s.address || null,
    province: s.province || null,
    city: s.city || null,
    site_subtype: s.siteSubtype || s.site_subtype || null,
    latitude: s.latitude != null && s.latitude !== '' ? Number(s.latitude) : null,
    longitude: s.longitude != null && s.longitude !== '' ? Number(s.longitude) : null,
    contact_name: s.contactName || s.contact_name || null,
    contact_role: s.contactRole || s.contact_role || null,
    office_phone: s.officePhone || s.office_phone || null,
    mobile_phone: s.mobilePhone || s.mobile_phone || null,
    weekday_hours: s.weekdayHours || s.weekday_hours || null,
    saturday_hours: s.saturdayHours || s.saturday_hours || null,
    notes: s.notes || null,
    survey_status: s.surveyStatus || s.survey_status || 'pending',
  }));
  const { data, error } = await supabase
    .schema('surveys')
    .from('sites')
    .insert(rows)
    .select('*');
  if (error) {
    console.error('crearSitesEnLote:', error.message);
    throw error;
  }
  return data || [];
}

// ============================================================
// VISITS
// ============================================================
export async function crearVisita({ siteId, surveyorAuthUserId }) {
  // v8.19.51: surveyor_id es nullable. Si el id no existe en auth.users (FK 23503),
  // reintentamos sin levantador para no bloquear el levantamiento en campo.
  const intentar = (surveyor) => supabase
    .schema('surveys')
    .from('visits')
    .insert({ site_id: siteId, surveyor_id: surveyor || null, checkin_at: new Date().toISOString() })
    .select('*')
    .single();

  let { data, error } = await intentar(surveyorAuthUserId);
  if (error && surveyorAuthUserId && (error.code === '23503' || /foreign key|surveyor/i.test(error.message || ''))) {
    ({ data, error } = await intentar(null));
  }
  if (error) {
    console.error('crearVisita:', error.message);
    throw error;
  }
  return data;
}

export async function obtenerVisita(visitId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('visits')
    .select('*')
    .eq('id', visitId)
    .maybeSingle();
  if (error) {
    console.warn('obtenerVisita:', error.message);
    return null;
  }
  return data;
}

export async function actualizarVisita(visitId, campos) {
  const { error } = await supabase
    .schema('surveys')
    .from('visits')
    .update(campos)
    .eq('id', visitId);
  if (error) {
    console.error('actualizarVisita:', error.message);
    throw error;
  }
}

export async function listarVisitasDeSite(siteId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('visits')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('listarVisitasDeSite:', error.message);
    return [];
  }
  return data || [];
}

export async function cerrarVisita(visitId) {
  const { error } = await supabase
    .schema('surveys')
    .from('visits')
    .update({ checkout_at: new Date().toISOString() })
    .eq('id', visitId);
  if (error) {
    console.error('cerrarVisita:', error.message);
    throw error;
  }
}

// ============================================================
// AREAS
// ============================================================
export async function listarAreasDeVisita(visitId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('areas')
    .select('*')
    .eq('visit_id', visitId)
    .order('area_number', { ascending: true });
  if (error) {
    console.warn('listarAreasDeVisita:', error.message);
    return [];
  }
  return data || [];
}

export async function crearArea({ visitId, blockId, areaNumber, name, data, measurements, openings, similarToAreaId, grossAreaM2, openingsAreaM2, netAreaM2, secondaryAreaM2, notes }) {
  const { data: row, error } = await supabase
    .schema('surveys')
    .from('areas')
    .insert({
      visit_id: visitId,
      block_id: blockId,
      area_number: areaNumber,
      name,
      data: data || {},
      measurements: measurements || [],
      openings: openings || [],
      similar_to_area_id: similarToAreaId || null,
      gross_area_m2: grossAreaM2 ?? null,
      openings_area_m2: openingsAreaM2 ?? null,
      net_area_m2: netAreaM2 ?? null,
      secondary_area_m2: secondaryAreaM2 ?? null,
      notes: notes ?? null,
    })
    .select('*')
    .single();
  if (error) {
    console.error('crearArea:', error.message);
    throw error;
  }
  return row;
}

export async function actualizarArea(areaId, campos) {
  const { error } = await supabase
    .schema('surveys')
    .from('areas')
    .update(campos)
    .eq('id', areaId);
  if (error) {
    console.error('actualizarArea:', error.message);
    throw error;
  }
}

export async function eliminarArea(areaId) {
  const { error } = await supabase
    .schema('surveys')
    .from('areas')
    .delete()
    .eq('id', areaId);
  if (error) {
    console.error('eliminarArea:', error.message);
    throw error;
  }
}

// ============================================================
// PHOTOS (bucket surveys-photos)
// ============================================================
export async function subirFotoSurvey({ visitId, areaId = null, file, photoType = null, caption = null, isCritical = false }) {
  // Path: ${visitId}/${areaId || 'general'}/${timestamp}-${name}.ext
  const ext = (file.name || '').split('.').pop() || 'jpg';
  const ts = Date.now();
  const path = `${visitId}/${areaId || 'general'}/${ts}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error: upErr } = await supabase.storage.from('surveys-photos').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (upErr) {
    console.error('subirFotoSurvey upload:', upErr.message);
    throw upErr;
  }
  const { data: row, error: dbErr } = await supabase
    .schema('surveys')
    .from('photos')
    .insert({
      visit_id: visitId,
      area_id: areaId,
      storage_path: path,
      photo_type: photoType,
      caption,
      is_critical: !!isCritical,
    })
    .select('*')
    .single();
  if (dbErr) {
    console.error('subirFotoSurvey insert:', dbErr.message);
    throw dbErr;
  }
  return row;
}

export async function listarFotosVisita(visitId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('photos')
    .select('*')
    .eq('visit_id', visitId)
    .order('taken_at', { ascending: true });
  if (error) {
    console.warn('listarFotosVisita:', error.message);
    return [];
  }
  return data || [];
}

export async function getSignedUrlFotoSurvey(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from('surveys-photos')
    .createSignedUrl(storagePath, expiresIn);
  if (error) {
    console.warn('getSignedUrlFotoSurvey:', error.message);
    return null;
  }
  return data?.signedUrl || null;
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
