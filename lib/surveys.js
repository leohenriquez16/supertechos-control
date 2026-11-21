// v8.19.1: Helpers para queries al schema `surveys.*`.
// Mantiene el patrón del ERP: client-side queries con anon key.
// RLS de surveys.* (PR 3A) filtra según rol del user.

import { supabase } from './supabase';
import { sinCampanas, planAsignacion } from './helpers/coordinacion.js'; // v8.95.0

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

// v8.27.10: código automático del levantamiento (LEV-AAAA-MM-###, correlativo por
// mes en hora RD). Atómico vía RPC. Devuelve null si falla (no bloquea la creación).
export async function siguienteCodigoLevantamiento() {
  try {
    const { data, error } = await supabase.rpc('siguiente_codigo_levantamiento');
    if (error) { console.warn('siguienteCodigoLevantamiento:', error.message); return null; }
    return data || null;
  } catch (e) { console.warn('siguienteCodigoLevantamiento:', e?.message); return null; }
}

// ============================================================
// PROJECTS
// ============================================================
// v8.95.0: `incluirCampanas` = también los proyectos-campaña de Coordinación (ej. Banreservas). Por defecto NO:
// la campaña es un proyecto aparte que no entra al Kanban, la Torre, los bonos ni el Inicio de levantamientos.
export async function listarProyectosSurveys({ incluirCampanas = false } = {}) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('listarProyectosSurveys:', error.message);
    return [];
  }
  return incluirCampanas ? (data || []) : sinCampanas(data || []);
}

// v8.95.0: ids de los proyectos-campaña. Si la columna es_campana aún no existe (migración 152 sin aplicar),
// devuelve un conjunto vacío y nada se filtra: todo sigue igual que antes.
let _campanas = { ids: null, at: 0 };
export async function idsCampanas() {
  if (_campanas.ids && Date.now() - _campanas.at < 60000) return _campanas.ids;
  const { data, error } = await supabase.schema('surveys').from('projects').select('id').eq('es_campana', true);
  if (error) {
    // Solo «la columna aún no existe» se toma como «no hay campañas»; ante un fallo de red se usa el último valor bueno.
    if (/es_campana/.test(error.message || '')) { _campanas = { ids: new Set(), at: Date.now() }; return _campanas.ids; }
    if (_campanas.ids) return _campanas.ids;
    return new Set();
  }
  _campanas = { ids: new Set((data || []).map(p => p.id)), at: Date.now() };
  return _campanas.ids;
}
// v8.95.0: hace un update en tandas de 150 ids (una URL con cientos de ids puede pasar el límite del servidor).
async function enTandas(ids, fn) {
  for (let i = 0; i < ids.length; i += 150) await fn(ids.slice(i, i + 150));
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
// v8.94.0: `estricto` lanza el error en vez de devolver [] (para no decidir nada con una lectura fallida).
export async function listarSitesProyectoSurvey(projectId, { estricto = false } = {}) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('sites')
    .select('*')
    .eq('project_id', projectId)
    .order('external_code', { ascending: true });
  if (error) {
    console.warn('listarSitesProyectoSurvey:', error.message);
    if (estricto) throw error;
    return [];
  }
  return data || [];
}

// v8.94.0: estado de UNA oficina del levantamiento (plantillas «por sitio»: se cierra oficina por oficina).
export async function marcarEstadoSitioSurvey(siteId, estado) {
  const { error } = await supabase.schema('surveys').from('sites').update({ survey_status: estado }).eq('id', siteId);
  if (error) { console.error('marcarEstadoSitioSurvey:', error.message); throw error; }
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

// v8.94.0: la completitud (calcularCompletitud, showIfOk) vive en lib/helpers/completitudSurvey.js,
// un módulo puro que se puede probar con node. Se reexporta aquí para no cambiar ningún import.
export { calcularCompletitud, showIfOk } from './helpers/completitudSurvey.js';

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
// v8.19.86: [Fase 6] polígonos satelitales del levantamiento (opcional). Se
// guardan en metadata.poligonos. Aditivo.
export async function setPoligonosProyecto(projectId, poligonos) {
  if (!projectId) return;
  const { data: proj } = await supabase.schema('surveys').from('projects').select('metadata').eq('id', projectId).maybeSingle();
  const metadata = { ...(proj?.metadata || {}), poligonos };
  const { error } = await supabase.schema('surveys').from('projects').update({ metadata }).eq('id', projectId);
  if (error) throw error;
}

// Área (m²) de un polígono [lat,lng][] por proyección equirectangular + shoelace.
export function areaPoligonoM2(latlngs) {
  if (!latlngs || latlngs.length < 3) return 0;
  const R = 6378137;
  const rad = (d) => (d * Math.PI) / 180;
  const latMean = rad(latlngs.reduce((a, p) => a + p[0], 0) / latlngs.length);
  const pts = latlngs.map(([lat, lng]) => [R * rad(lng) * Math.cos(latMean), R * rad(lat)]);
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
  return Math.abs(a) / 2;
}

// v8.19.90: borrado con autorización del owner (asignado_a_id).
export async function eliminarProyectoSurvey(projectId) {
  // sites → visits → areas/photos/puntos caen por cascada (ON DELETE CASCADE).
  const { error } = await supabase.schema('surveys').from('projects').delete().eq('id', projectId);
  if (error) throw error;
}
export async function solicitarEliminacionSurvey(projectId, persona) {
  const { error } = await supabase.schema('surveys').from('projects').update({
    eliminacion_solicitada_por: persona?.id || null,
    eliminacion_solicitada_por_nombre: persona?.nombre || null,
    eliminacion_solicitada_at: new Date().toISOString(),
  }).eq('id', projectId);
  if (error) throw error;
}
export async function cancelarSolicitudEliminacionSurvey(projectId) {
  const { error } = await supabase.schema('surveys').from('projects').update({
    eliminacion_solicitada_por: null, eliminacion_solicitada_por_nombre: null, eliminacion_solicitada_at: null,
  }).eq('id', projectId);
  if (error) throw error;
}

// v8.19.84: [Fase 5] agendar la visita del levantamiento (calendario).
export async function setFechaVisitaProgramada(projectId, fecha) {
  if (!projectId) return;
  const { error } = await supabase.schema('surveys').from('projects')
    .update({ fecha_visita_programada: fecha || null }).eq('id', projectId);
  if (error) throw error;
}

// v8.25.24: tipos/modalidades de cita (Edwin las agenda y confirma desde oficina).
export const TIPO_CITA = {
  hora_fija:    { label: 'Hora fija',                 short: 'Hora fija',   color: '#3b82f6', icon: '🕐' },
  manana:       { label: 'En la mañana',              short: 'Mañana',      color: '#f59e0b', icon: '🌅' },
  tarde:        { label: 'En la tarde',               short: 'Tarde',       color: '#f97316', icon: '🌇' },
  dia_completo: { label: 'Cualquier hora del día',    short: 'Todo el día', color: '#22c55e', icon: '📆' },
  cualquier_dia:{ label: 'Cualquier día (hora laboral)', short: 'Cualquier día', color: '#14b8a6', icon: '🗓️' },
  restringida:  { label: 'Solo días/horas específicas', short: 'Restringida', color: '#a855f7', icon: '📌' },
};

// hora "HH:MM" (24h) → "h:MM AM/PM"
export function formatHora12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (isNaN(h)) return hhmm;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}

// Texto corto de cuándo es la cita, según su tipo.
export function citaTextoHora(l) {
  switch (l?.tipo_cita) {
    case 'hora_fija': return l.hora_visita ? formatHora12(l.hora_visita) : 'Hora fija';
    case 'manana': return 'En la mañana';
    case 'tarde': return 'En la tarde';
    case 'dia_completo': return 'Cualquier hora';
    case 'cualquier_dia': return 'Cualquier día · hora laboral';
    case 'restringida': return l.cita_restriccion ? l.cita_restriccion : 'Solo días/horas específicas';
    default: return l?.hora_visita ? formatHora12(l.hora_visita) : '';
  }
}

// Guardar datos de la cita (fecha, hora, tipo, restricción).
export async function setCitaSurvey(projectId, { fecha, hora, tipo, restriccion } = {}) {
  if (!projectId) return;
  const patch = {};
  if (fecha !== undefined) patch.fecha_visita_programada = fecha || null;
  if (hora !== undefined) patch.hora_visita = hora || null;
  if (tipo !== undefined) patch.tipo_cita = tipo || null;
  if (restriccion !== undefined) patch.cita_restriccion = restriccion || null;
  const { error } = await supabase.schema('surveys').from('projects').update(patch).eq('id', projectId);
  if (error) throw error;
}

// Confirmar / desconfirmar la cita (Edwin desde la oficina).
export async function confirmarCitaSurvey(projectId, persona, confirmada = true) {
  if (!projectId) return;
  const patch = {
    cita_confirmada: !!confirmada,
    cita_confirmada_por: confirmada ? (persona?.nombre || null) : null,
    cita_confirmada_at: confirmada ? new Date().toISOString() : null,
  };
  const { error } = await supabase.schema('surveys').from('projects').update(patch).eq('id', projectId);
  if (error) throw error;
}

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
  // v8.95.0: sin las oficinas de las campañas de Coordinación (proyecto aparte), excluidas en el servidor y por
  // páginas de 1000 (el servidor corta en 1000 filas: filtrar después dejaba fuera sitios normales).
  const camp = await idsCampanas();
  const todos = [];
  for (let desde = 0; ; desde += 1000) {
    let q = supabase.schema('surveys').from('sites')
      .select('id, project_id, external_code, name, address, province, city, latitude, longitude, survey_status, cliente_id, ubicacion_id, contact_name, mobile_phone, office_phone')
      .order('id', { ascending: true }).range(desde, desde + 999);
    if (camp.size) q = q.not('project_id', 'in', `(${[...camp].map(id => `"${id}"`).join(',')})`);
    const { data, error } = await q;
    if (error) { console.warn('listarTodosLosSitesSurvey:', error.message); return todos; }
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todos;
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

export async function crearSiteSurvey({ projectId, externalCode, referenciaOdoo, name, address, province, city, siteSubtype, latitude, longitude, contactName, contactRole, officePhone, mobilePhone, weekdayHours, saturdayHours, notes, surveyStatus = 'pending', clienteId, ubicacionId }) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('sites')
    .insert({
      project_id: projectId,
      external_code: externalCode || null,
      referencia_odoo: referenciaOdoo || null, // v8.27.11: # ticket cliente/Odoo
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
      cliente_id: clienteId || null,
      ubicacion_id: ubicacionId || null,
    })
    .select('*')
    .single();
  if (error) {
    console.error('crearSiteSurvey:', error.message);
    throw error;
  }
  return data;
}

// v8.25.38: actualizar los datos del sitio del levantamiento (contacto/dirección/
// coordenadas/horarios) una vez creado.
export async function actualizarSiteSurvey(siteId, campos = {}) {
  const map = {
    name: 'name', address: 'address', province: 'province', city: 'city',
    externalCode: 'external_code', // v8.27.7: código interno (LEV-AAAA-MM-###)
    referenciaOdoo: 'referencia_odoo', // v8.27.11: # de ticket cliente/Odoo
    siteSubtype: 'site_subtype', contactName: 'contact_name', contactRole: 'contact_role',
    officePhone: 'office_phone', mobilePhone: 'mobile_phone',
    weekdayHours: 'weekday_hours', saturdayHours: 'saturday_hours', notes: 'notes',
    clienteId: 'cliente_id', ubicacionId: 'ubicacion_id', // v8.45.0: amarre a la locación del cliente
  };
  const updates = {};
  for (const [k, col] of Object.entries(map)) {
    if (campos[k] !== undefined) updates[col] = (campos[k] === '' ? null : campos[k]);
  }
  if (campos.latitude !== undefined) updates.latitude = (campos.latitude != null && campos.latitude !== '') ? Number(campos.latitude) : null;
  if (campos.longitude !== undefined) updates.longitude = (campos.longitude != null && campos.longitude !== '') ? Number(campos.longitude) : null;
  const { data, error } = await supabase.schema('surveys').from('sites').update(updates).eq('id', siteId).select('*').single();
  if (error) { console.error('actualizarSiteSurvey:', error.message); throw error; }
  return data;
}

// v8.24.17: finalizar el levantamiento → estado "Realizado" (survey_completed).
// v8.94.0: si el proyecto ya está en cotización (en revisión o realizada), no se toca: volver a cerrar una visita
// (para agregar fotos o completar lo pendiente) no lo regresa a Realizado. En Realizado se vuelve a sellar como siempre.
const ETAPAS_YA_COTIZANDO = ['Cotizacion en Revision', 'Cotizacion Realizada'];
export async function finalizarLevantamientoSurvey(projectId) {
  const { data: prevP } = await supabase.schema('surveys').from('projects').select('odoo_stage').eq('id', projectId).maybeSingle();
  if (ETAPAS_YA_COTIZANDO.includes(prevP?.odoo_stage)) return false; // devuelve si de verdad lo movió
  const { error } = await supabase.schema('surveys').from('projects')
    // v8.31.0: realizado_at alimenta el KPI "cotización el mismo día" (bono comercial)
    .update({ status: 'survey_completed', odoo_stage: 'Realizado', stage_changed_at: new Date().toISOString(), realizado_at: new Date().toISOString() }).eq('id', projectId);
  if (error) { console.error('finalizarLevantamientoSurvey:', error.message); throw error; }
  await logCambioEtapa(projectId, 'Realizado', prevP?.odoo_stage || null); // v8.52.0
  return true;
}
export async function reabrirLevantamientoSurvey(projectId) {
  const { data: prevP } = await supabase.schema('surveys').from('projects').select('odoo_stage').eq('id', projectId).maybeSingle();
  const { error } = await supabase.schema('surveys').from('projects')
    .update({ status: 'survey_in_progress', odoo_stage: 'Asignado', stage_changed_at: new Date().toISOString() }).eq('id', projectId);
  if (error) { console.error('reabrirLevantamientoSurvey:', error.message); throw error; }
  await logCambioEtapa(projectId, 'Asignado', prevP?.odoo_stage || null); // v8.52.0
}

// v8.25.16: etapas del pipeline de Levantamientos (equipo Odoo "Levantamientos").
export const ETAPAS_LEVANTAMIENTO = ['New', 'Contactado', 'Asignado', 'Agendado', 'Realizado', 'Cotizacion en Revision', 'Cotizacion Realizada', 'No se pudo coordinar', 'No podemos cotizar', 'Cliente no esta interesado'];

// v8.52.0: Torre de Control — registra cada cambio de etapa para medir el tiempo por
// etapa. No rompe el flujo si falla (best-effort). etapaAnterior se pasa desde el caller
// (leída ANTES del update); si es undefined se relee.
async function logCambioEtapa(projectId, etapaNueva, etapaAnterior) {
  try {
    if (etapaAnterior === undefined) {
      const { data } = await supabase.schema('surveys').from('projects').select('odoo_stage').eq('id', projectId).maybeSingle();
      etapaAnterior = data?.odoo_stage || null;
    }
    if (etapaAnterior === etapaNueva) return;
    await supabase.schema('surveys').from('stage_history').insert({
      id: 'sh_' + Date.now() + Math.random().toString(36).slice(2, 6),
      project_id: projectId, etapa_anterior: etapaAnterior || null, etapa_nueva: etapaNueva,
    });
  } catch (e) { console.warn('stage_history:', e?.message); }
}
// Cambia la etapa (odoo_stage) de un levantamiento y sincroniza el status local.
export async function setEtapaSurvey(projectId, etapa) {
  // v8.27.x: para marcar "Cotizacion Realizada" hay que tener registrado el # de
  // cotización (ST-C…) en al menos un sitio del levantamiento (referencia_odoo).
  if (etapa === 'Cotizacion Realizada') {
    const { data: sites } = await supabase.schema('surveys').from('sites')
      .select('referencia_odoo').eq('project_id', projectId);
    const tieneCotizacion = (sites || []).some((s) => (s.referencia_odoo || '').trim());
    if (!tieneCotizacion) {
      const e = new Error('Para pasar a "Cotización realizada" primero registra el número de cotización (ST-C…) en el levantamiento.');
      e.code = 'COTIZACION_REQUERIDA';
      throw e;
    }
  }
  // v8.52.0: etapa anterior (para el historial) leída ANTES del update
  const { data: prevP } = await supabase.schema('surveys').from('projects').select('odoo_stage').eq('id', projectId).maybeSingle();
  const etapaAnterior = prevP?.odoo_stage || null;
  const mapStatus = { 'New': 'planning', 'Contactado': 'planning', 'Asignado': 'survey_in_progress', 'Agendado': 'survey_in_progress', 'Realizado': 'survey_completed', 'Cotizacion en Revision': 'survey_completed', 'Cotizacion Realizada': 'quoted' };
  const updates = { odoo_stage: etapa, stage_changed_at: new Date().toISOString() };
  if (mapStatus[etapa]) updates.status = mapStatus[etapa];
  // v8.31.0: timestamps del bono comercial — realizado y cotizado
  if (mapStatus[etapa] === 'survey_completed') updates.realizado_at = new Date().toISOString();
  if (mapStatus[etapa] === 'quoted') updates.cotizado_at = new Date().toISOString();
  const { error } = await supabase.schema('surveys').from('projects').update(updates).eq('id', projectId);
  if (error) { console.error('setEtapaSurvey:', error.message); throw error; }
  await logCambioEtapa(projectId, etapa, etapaAnterior); // v8.52.0

  // v8.31.0: al quedar COTIZADA nace la tarea de CONFIRMAR con el cliente que la
  // recibió (≤24h) — eso asegura el KPI del comercial (Edwin).
  if (mapStatus[etapa] === 'quoted') {
    try { await crearTareaConfirmacionRecepcion(projectId); } catch (e) { console.warn('Tarea confirmación no creada:', e?.message); }
  }
}

// Crea (si no existe) la tarea "confirmar recepción de la cotización" asignada al
// comercial (Edwin), con fecha límite a 24 horas.
export async function crearTareaConfirmacionRecepcion(projectId) {
  const { data: proy } = await supabase.schema('surveys').from('projects').select('id, client_name').eq('id', projectId).maybeSingle();
  if (!proy) return;
  // ¿ya existe la tarea para este levantamiento?
  const { data: existentes } = await supabase.from('tareas').select('id')
    .eq('tipo', 'confirmar_recepcion_cotizacion').ilike('descripcion', `%[lev:${projectId}]%`).limit(1);
  if (existentes && existentes.length) return;
  const { data: edwin } = await supabase.from('personal').select('id, nombre').ilike('nombre', '%edwin%parra%').limit(1);
  const manana = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10);
  await supabase.from('tareas').insert({
    id: 't_' + Date.now() + Math.random(),
    tipo: 'confirmar_recepcion_cotizacion',
    titulo: `Confirmar que ${proy.client_name || 'el cliente'} recibió la cotización`,
    descripcion: `Llamar o escribir al cliente para confirmar que la cotización le llegó y agendarle seguimiento. [lev:${projectId}]`,
    asignada_a_id: edwin?.[0]?.id || null, asignada_a_nombre: edwin?.[0]?.nombre || null,
    fecha_limite: manana,
  });
}

// v8.52.0: Torre de Control — marca si la fecha de visita la impuso el CLIENTE
// (pausa el SLA) o si el sistema es COMPLEJO (ruta de consulta técnica, 24h).
export async function marcarVisitaPorCliente(projectId, valor) {
  const { error } = await supabase.schema('surveys').from('projects').update({ visita_por_cliente: !!valor }).eq('id', projectId);
  if (error) throw error;
}
export async function marcarConsultaTecnica(projectId, valor, motivo = null) {
  const updates = {
    requiere_consulta_tecnica: !!valor,
    consulta_tecnica_motivo: valor ? (motivo || null) : null,
    consulta_tecnica_at: valor ? new Date().toISOString() : null,
  };
  const { error } = await supabase.schema('surveys').from('projects').update(updates).eq('id', projectId);
  if (error) throw error;
}
// Datos para la Torre de Control: proyectos de levantamiento + la fecha real de
// recepción (envío del formulario, solicitudes_levantamiento.created_at por levantamiento_id).
export async function listarTorreControl() {
  const { data: proys } = await supabase.schema('surveys').from('projects')
    .select('id, client_name, odoo_stage, status, created_at, stage_changed_at, realizado_at, cotizado_at, fecha_visita_programada, visita_por_cliente, requiere_consulta_tecnica, consulta_tecnica_motivo, consulta_tecnica_at, asignado_a_nombre')
    .order('stage_changed_at', { ascending: true });
  let sols = [];
  try {
    const { data } = await supabase.from('solicitudes_levantamiento')
      .select('levantamiento_id, created_at, ticket, urgencia').not('levantamiento_id', 'is', null);
    sols = data || [];
  } catch (e) { console.warn('torre solicitudes:', e?.message); }
  const solPorLev = {};
  sols.forEach((s) => { if (s.levantamiento_id) solPorLev[s.levantamiento_id] = s; });
  const camp = await idsCampanas(); // v8.95.0: la campaña de Coordinación no entra en la Torre
  return (proys || []).filter((p) => !camp.has(p.id)).map((p) => ({
    ...p,
    recepcionAt: solPorLev[p.id]?.created_at || p.created_at,
    ticket: solPorLev[p.id]?.ticket || null,
    urgencia: solPorLev[p.id]?.urgencia || null,
  }));
}

// v8.22.3: cambiar el tipo (familia/template) de un levantamiento ya creado.
export async function actualizarTipoProyectoSurvey(projectId, serviceLine, templateId) {
  const { error } = await supabase
    .schema('surveys')
    .from('projects')
    .update({ service_line: serviceLine, template_id: templateId })
    .eq('id', projectId);
  if (error) { console.error('actualizarTipoProyectoSurvey:', error.message); throw error; }
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

export async function listarVisitasDeSite(siteId, { estricto = false } = {}) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('visits')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('listarVisitasDeSite:', error.message);
    if (estricto) throw error; // v8.94.0
    return [];
  }
  return data || [];
}

// v8.24.7: visita "abierta" del sitio = sin checkout (la más reciente). Para reusar
// en vez de crear una nueva cada vez que se abre el formulario.
export async function obtenerVisitaAbiertaDeSite(siteId) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('visits')
    .select('*')
    .eq('site_id', siteId)
    .is('checkout_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  // v8.94.0: un error ya no se confunde con «no hay visita abierta» (antes creaba una visita nueva en blanco).
  if (error) { console.warn('obtenerVisitaAbiertaDeSite:', error.message); throw error; }
  return (data && data[0]) || null;
}

// v8.25.39: reabrir la última visita del sitio (quitarle el checkout) para seguir
// editando / agregar fotos a un levantamiento ya realizado.
export async function reabrirVisitaDeSite(siteId) {
  const { data, error: errSel } = await supabase.schema('surveys').from('visits')
    .select('id').eq('site_id', siteId).order('created_at', { ascending: false }).limit(1);
  if (errSel) { console.error('reabrirVisitaDeSite:', errSel.message); throw errSel; } // v8.94.0
  const vid = data && data[0]?.id;
  if (!vid) return null;
  const { error } = await supabase.schema('surveys').from('visits').update({ checkout_at: null }).eq('id', vid);
  if (error) { console.error('reabrirVisitaDeSite:', error.message); throw error; }
  return vid;
}

// v8.24.7: eliminar una visita (sus áreas/fotos caen por ON DELETE CASCADE).
export async function eliminarVisita(visitId) {
  const { error } = await supabase.schema('surveys').from('visits').delete().eq('id', visitId);
  if (error) { console.error('eliminarVisita:', error.message); throw error; }
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
export async function listarAreasDeVisita(visitId, { estricto = false } = {}) {
  const { data, error } = await supabase
    .schema('surveys')
    .from('areas')
    .select('*')
    .eq('visit_id', visitId)
    .order('area_number', { ascending: true });
  if (error) {
    console.warn('listarAreasDeVisita:', error.message);
    if (estricto) throw error; // v8.94.0
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
  // v8.19.94: comprimir antes de subir (calidad técnica + tamaño controlado).
  let cuerpo = file, contentType = file.type || 'image/jpeg', ext = (file.name || '').split('.').pop() || 'jpg';
  try {
    if ((file.type || '').startsWith('image/')) {
      const { comprimirImagenABlob } = await import('./imports');
      cuerpo = await comprimirImagenABlob(file, 1600, 0.7);
      contentType = 'image/jpeg'; ext = 'jpg';
    }
  } catch (e) { console.warn('compresión foto survey falló, subo original:', e?.message); }
  // Path: ${visitId}/${areaId || 'general'}/${timestamp}-${rand}.ext
  const ts = Date.now();
  const path = `${visitId}/${areaId || 'general'}/${ts}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error: upErr } = await supabase.storage.from('surveys-photos').upload(path, cuerpo, {
    contentType,
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

// v8.20.5: familias de servicio (para elegir por categoría al crear) y el catálogo
// de "tipos" (tipo de techo / tipo de piso) que se elige POR ÁREA dentro del
// levantamiento. Cada familia agrupa varios service_line; los tipos de cada familia
// son esos mismos service_line con su etiqueta amigable.
export const FAMILIAS_SERVICIO = [
  { key: 'pisos',       label: 'Pisos',                        tipoLabel: 'Tipo de piso', lines: ['epoxy_floor', 'urethane_cement', 'concrete_polishing', 'concrete_repair'] },
  { key: 'pintura',     label: 'Pintura',                      tipoLabel: 'Tipo',         lines: ['paint'] },
  { key: 'impermeable', label: 'Impermeabilizante / Aislante', tipoLabel: 'Trabajo a realizar', lines: ['waterproofing', 'thermal_insulation'] },
  { key: 'generico',    label: 'Genérico / Otro',              tipoLabel: 'Tipo',         lines: ['other'] },
];

export function familiaDeServiceLine(line) {
  return FAMILIAS_SERVICIO.find(f => f.lines.includes(line))?.key || null;
}

// Tipos (techo/piso) disponibles dentro de una familia. Devuelve { line, label }.
// Para familias convencionales agrega "Otro / No convencional" (captura manual).
export function tiposDeFamilia(key) {
  const f = FAMILIAS_SERVICIO.find(x => x.key === key);
  if (!f) return [];
  const base = f.lines.map(l => ({ line: l, label: SERVICE_LINES[l]?.label || l }));
  if (key !== 'generico') base.push({ line: 'other', label: 'Otro / No convencional' });
  return base;
}

export function familiaPorKey(key) {
  return FAMILIAS_SERVICIO.find(f => f.key === key) || null;
}

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

// v8.86.0: fotos de los levantamientos de una obra (pestaña Fotos del proyecto).
// Se buscan los sites con la misma cotización (o sub-cotización) o la misma ubicación del cliente.
export async function fotosLevantamientoDeObra({ refs = [], ubicacionId = null } = {}) {
  const or = [];
  const refsOk = refs.map(r => String(r || '').trim()).filter(Boolean);
  if (refsOk.length) or.push(`referencia_odoo.in.(${refsOk.map(r => `"${r}"`).join(',')})`);
  if (ubicacionId) or.push(`ubicacion_id.eq.${ubicacionId}`);
  if (!or.length) return [];
  const { data: sites, error } = await supabase.schema('surveys').from('sites')
    .select('id, name, referencia_odoo').or(or.join(','));
  if (error || !sites?.length) return [];
  const { data: visitas } = await supabase.schema('surveys').from('visits')
    .select('id, site_id, checkin_at').in('site_id', sites.map(s => s.id));
  if (!visitas?.length) return [];
  const { data: fotos } = await supabase.schema('surveys').from('photos')
    .select('id, visit_id, storage_path, caption, photo_type, taken_at, is_critical')
    .in('visit_id', visitas.map(v => v.id)).order('taken_at', { ascending: true });
  const sitePorVisita = Object.fromEntries(visitas.map(v => [v.id, sites.find(s => s.id === v.site_id)]));
  const conUrl = await Promise.all((fotos || []).map(async f => ({
    ...f, url: await getSignedUrlFotoSurvey(f.storage_path, 3600), site: sitePorVisita[f.visit_id]?.name || '',
  })));
  return conUrl.filter(f => f.url);
}


// ============================================================
// v8.95.0: COORDINACIÓN de levantamientos por campaña (ej. pintura de las oficinas de Banreservas)
// Todo por OFICINA (surveys.sites). Personas = personal.id (texto).
// ============================================================
export async function obtenerCampanas() {
  const { data, error } = await supabase.schema('surveys').from('projects').select('*').eq('es_campana', true).order('created_at', { ascending: false });
  if (error) { console.warn('obtenerCampanas:', error.message); return []; }
  return data || [];
}
export async function listarSitesCampana(projectId) {
  const { data, error } = await supabase.schema('surveys').from('sites').select('*').eq('project_id', projectId)
    .order('zona', { ascending: true, nullsFirst: false }).order('external_code', { ascending: true });
  if (error) { console.error('listarSitesCampana:', error.message); throw error; }
  return data || [];
}
// v8.96.0: equipo de técnicos de la campaña (metadata.equipo_ids del proyecto). Lo comparten Edwin y Leo.
export async function guardarEquipoCampana(projectId, ids) {
  const { data: proj, error: e1 } = await supabase.schema('surveys').from('projects').select('metadata').eq('id', projectId).maybeSingle();
  if (e1) throw e1;
  const metadata = { ...(proj?.metadata || {}), equipo_ids: [...new Set(ids)] };
  const { error } = await supabase.schema('surveys').from('projects').update({ metadata }).eq('id', projectId);
  if (error) throw error;
  return metadata;
}
// Oficinas de campaña asignadas a una persona (con su proyecto), menos las ya validadas.
export async function listarMisOficinasCampana(personaId) {
  if (!personaId) return [];
  const camp = [...(await idsCampanas())];
  if (!camp.length) return [];
  const { data, error } = await supabase.schema('surveys').from('sites').select('*')
    .eq('asignado_a_id', personaId).in('project_id', camp).neq('survey_status', 'validated');
  if (error) { console.warn('listarMisOficinasCampana:', error.message); return []; }
  return data || [];
}
// Asignar y programar en lote (personaId null = quitar). Ver planAsignacion.
export async function asignarOficinas(sites, { personaId = null, nombre = null, fecha = null, franja = null, por = null } = {}) {
  const plan = planAsignacion(sites, { personaId, nombre, fecha, franja, por, ahora: new Date().toISOString() });
  if (!plan.ids.length) return;
  await enTandas(plan.ids, async (ids) => {
    const { error } = await supabase.schema('surveys').from('sites').update(plan.campos).in('id', ids);
    if (error) { console.error('asignarOficinas:', error.message); throw error; }
  });
  for (const [estado, lista] of Object.entries(plan.idsAEstado)) {
    // Solo las que SIGUEN sin levantar en la base (la pantalla pudo estar vieja): una oficina ya levantada no vuelve atrás.
    await enTandas(lista, async (ids) => {
      const { error: e2 } = await supabase.schema('surveys').from('sites').update({ survey_status: estado })
        .in('id', ids).in('survey_status', ['pending', 'coordinated', 'confirmed', 'in_route']);
      if (e2) { console.error('asignarOficinas estado:', e2.message); throw e2; }
    });
  }
}
export async function confirmarCitaOficinas(siteIds, por, confirmada = true) {
  if (!siteIds?.length) return;
  await enTandas(siteIds, async (ids) => {
    const { error } = await supabase.schema('surveys').from('sites')
      .update({ cita_confirmada: confirmada, cita_confirmada_por: confirmada ? por : null, cita_confirmada_at: confirmada ? new Date().toISOString() : null }).in('id', ids);
    if (error) throw error;
    const { error: e2 } = await supabase.schema('surveys').from('sites').update({ survey_status: confirmada ? 'confirmed' : 'coordinated' })
      .in('id', ids).in('survey_status', confirmada ? ['pending', 'coordinated'] : ['confirmed']);
    if (e2) throw e2;
  });
}
// «No pude levantar» (sin empezar, o empezada y sin poder terminar): queda pendiente con técnico y día, para que Edwin
// la reprograme; lo ya capturado se conserva y se sigue en la próxima visita.
export async function marcarNoPudoOficina(siteId, { motivo, nota = null }) {
  const { data, error } = await supabase.schema('surveys').from('sites')
    .update({ no_pudo_motivo: motivo, no_pudo_nota: nota || null, no_pudo_at: new Date().toISOString(), survey_status: 'pending' })
    .eq('id', siteId).in('survey_status', ['pending', 'coordinated', 'confirmed', 'in_route', 'in_progress']).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Esta oficina ya no está abierta (se levantó o la cambió Edwin). Recarga.');
}
// El técnico abrió la oficina: «en proceso» (solo si aún no se levantaba). No bloquea si falla.
export async function marcarEnSitioOficina(siteId) {
  const { error } = await supabase.schema('surveys').from('sites').update({ survey_status: 'in_progress' })
    .eq('id', siteId).in('survey_status', ['pending', 'coordinated', 'confirmed', 'in_route']);
  if (error) console.warn('marcarEnSitioOficina:', error.message);
}
// Al cerrar el formulario de una oficina de campaña: su estado nuevo; se limpian devolución y «no pude» (la nota queda).
export async function cerrarOficinaCampana(siteId, estado) {
  const { error } = await supabase.schema('surveys').from('sites').update({ survey_status: estado, devuelto_at: null, no_pudo_at: null }).eq('id', siteId);
  if (error) { console.error('cerrarOficinaCampana:', error.message); throw error; }
}
export async function validarOficina(siteId, por) {
  const { data, error } = await supabase.schema('surveys').from('sites')
    .update({ survey_status: 'validated', validado_por: por, validado_at: new Date().toISOString() })
    .eq('id', siteId).eq('survey_status', 'completed').select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('La oficina ya no está «por revisar» (alguien la cambió). Recarga.');
}
export async function devolverOficina(siteId, por, nota) {
  if (!String(nota || '').trim()) throw new Error('Escribe qué hay que corregir.');
  const { data, error } = await supabase.schema('surveys').from('sites')
    .update({ survey_status: 'missing_info', devuelto_nota: String(nota).trim(), devuelto_por: por, devuelto_at: new Date().toISOString(), validado_por: null, validado_at: null })
    .eq('id', siteId).in('survey_status', ['completed', 'validated']).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('La oficina ya no está «por revisar» (alguien la cambió). Recarga.');
}
