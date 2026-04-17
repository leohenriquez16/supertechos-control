import { supabase } from './supabase';

// ============================================================
// CARGAR TODOS LOS DATOS
// ============================================================
export async function loadAllData() {
  try {
    const [personalRes, sistemasRes, proyectosRes, reportesRes, enviosRes, configRes] = await Promise.all([
      supabase.from('personal').select('*').order('nombre'),
      supabase.from('sistemas').select('*'),
      supabase.from('proyectos').select('*').order('created_at', { ascending: false }),
      supabase.from('reportes').select('*').order('fecha', { ascending: false }),
      supabase.from('envios').select('*').order('fecha', { ascending: false }),
      supabase.from('config').select('*').eq('id', 1).single(),
    ]);

    // Transformar personal de BD → formato app
    const personal = (personalRes.data || []).map(p => ({
      id: p.id,
      nombre: p.nombre,
      pin: p.pin || undefined,
      roles: p.roles || [],
      maestroId: p.maestro_id || undefined,
    }));

    // Sistemas vienen como JSON en el campo 'data'
    const sistemas = {};
    (sistemasRes.data || []).forEach(s => {
      sistemas[s.id] = s.data;
    });

    // Proyectos de BD → formato app
    const proyectos = (proyectosRes.data || []).map(p => ({
      id: p.id,
      nombre: p.nombre,
      cliente: p.cliente,
      referenciaOdoo: p.referencia_odoo,
      referenciaProyecto: p.referencia_proyecto,
      sistema: p.sistema_id,
      supervisorId: p.supervisor_id,
      maestroId: p.maestro_id,
      ayudantesIds: p.ayudantes_ids || [],
      fecha_inicio: p.fecha_inicio,
      fecha_entrega: p.fecha_entrega,
      areas: p.areas || [],
      dieta: p.dieta || { habilitada: false },
    }));

    // Reportes
    const reportes = (reportesRes.data || []).map(r => ({
      id: r.id,
      proyectoId: r.proyecto_id,
      areaId: r.area_id,
      tareaId: r.tarea_id,
      fecha: r.fecha,
      m2: r.m2 !== null ? Number(r.m2) : undefined,
      rollos: r.rollos !== null ? Number(r.rollos) : undefined,
      cubetas: r.cubetas !== null ? Number(r.cubetas) : undefined,
      nota: r.nota,
      supervisor: r.supervisor,
      supervisorId: r.supervisor_id,
    }));

    // Envíos
    const envios = (enviosRes.data || []).map(e => ({
      id: e.id,
      proyectoId: e.proyecto_id,
      materialId: e.material_id,
      cantidad: Number(e.cantidad),
      fecha: e.fecha,
      pdfRef: e.pdf_ref,
    }));

    const config = configRes.data ? {
      costos_indirectos_pct: Number(configRes.data.costos_indirectos_pct),
      margen_objetivo_pct: Number(configRes.data.margen_objetivo_pct),
    } : { costos_indirectos_pct: 15, margen_objetivo_pct: 30 };

    return { personal, sistemas, proyectos, reportes, envios, config };
  } catch (error) {
    console.error('Error cargando datos:', error);
    throw error;
  }
}

// ============================================================
// PROYECTOS
// ============================================================
export async function crearProyecto(proy) {
  const { error } = await supabase.from('proyectos').insert({
    id: proy.id,
    nombre: proy.nombre,
    cliente: proy.cliente,
    referencia_odoo: proy.referenciaOdoo,
    referencia_proyecto: proy.referenciaProyecto,
    sistema_id: proy.sistema,
    supervisor_id: proy.supervisorId,
    maestro_id: proy.maestroId,
    ayudantes_ids: proy.ayudantesIds || [],
    fecha_inicio: proy.fecha_inicio,
    fecha_entrega: proy.fecha_entrega,
    areas: proy.areas || [],
    dieta: proy.dieta || { habilitada: false },
  });
  if (error) throw error;
}

export async function actualizarProyecto(proy) {
  const { error } = await supabase.from('proyectos').update({
    nombre: proy.nombre,
    cliente: proy.cliente,
    referencia_odoo: proy.referenciaOdoo,
    referencia_proyecto: proy.referenciaProyecto,
    sistema_id: proy.sistema,
    supervisor_id: proy.supervisorId,
    maestro_id: proy.maestroId,
    ayudantes_ids: proy.ayudantesIds || [],
    fecha_inicio: proy.fecha_inicio,
    fecha_entrega: proy.fecha_entrega,
    areas: proy.areas || [],
    dieta: proy.dieta || { habilitada: false },
    updated_at: new Date().toISOString(),
  }).eq('id', proy.id);
  if (error) throw error;
}

// ============================================================
// REPORTES
// ============================================================
export async function crearReporte(r) {
  const { error } = await supabase.from('reportes').insert({
    id: r.id,
    proyecto_id: r.proyectoId,
    area_id: r.areaId,
    tarea_id: r.tareaId,
    fecha: r.fecha,
    m2: r.m2 ?? null,
    rollos: r.rollos ?? null,
    cubetas: r.cubetas ?? null,
    nota: r.nota || null,
    supervisor: r.supervisor,
    supervisor_id: r.supervisorId,
  });
  if (error) throw error;
}

// ============================================================
// ENVÍOS
// ============================================================
export async function crearEnvio(e) {
  const { error } = await supabase.from('envios').insert({
    id: e.id,
    proyecto_id: e.proyectoId,
    material_id: e.materialId,
    cantidad: e.cantidad,
    fecha: e.fecha,
    pdf_ref: e.pdfRef || null,
  });
  if (error) throw error;
}

export async function crearEnviosLote(envios) {
  const rows = envios.map(e => ({
    id: e.id,
    proyecto_id: e.proyectoId,
    material_id: e.materialId,
    cantidad: e.cantidad,
    fecha: e.fecha,
    pdf_ref: e.pdfRef || null,
  }));
  const { error } = await supabase.from('envios').insert(rows);
  if (error) throw error;
}

// ============================================================
// PERSONAL
// ============================================================
export async function reemplazarPersonal(nuevoPersonal) {
  // Obtener IDs actuales
  const { data: actuales } = await supabase.from('personal').select('id');
  const idsActuales = new Set((actuales || []).map(p => p.id));
  const idsNuevos = new Set(nuevoPersonal.map(p => p.id));

  // Eliminar los que ya no están
  const aEliminar = [...idsActuales].filter(id => !idsNuevos.has(id));
  if (aEliminar.length > 0) {
    await supabase.from('personal').delete().in('id', aEliminar);
  }

  // Upsert (insertar o actualizar) los nuevos/modificados
  const rows = nuevoPersonal.map(p => ({
    id: p.id,
    nombre: p.nombre,
    pin: p.pin || null,
    roles: p.roles || [],
    maestro_id: p.maestroId || null,
  }));
  const { error } = await supabase.from('personal').upsert(rows);
  if (error) throw error;
}

// ============================================================
// SISTEMAS
// ============================================================
export async function guardarSistemas(sistemas) {
  // Obtener IDs actuales
  const { data: actuales } = await supabase.from('sistemas').select('id');
  const idsActuales = new Set((actuales || []).map(s => s.id));
  const idsNuevos = new Set(Object.keys(sistemas));

  // Eliminar sistemas removidos
  const aEliminar = [...idsActuales].filter(id => !idsNuevos.has(id));
  if (aEliminar.length > 0) {
    await supabase.from('sistemas').delete().in('id', aEliminar);
  }

  // Upsert sistemas
  const rows = Object.values(sistemas).map(s => ({
    id: s.id,
    data: s,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('sistemas').upsert(rows);
  if (error) throw error;
}

// ============================================================
// CONFIG
// ============================================================
export async function guardarConfig(config) {
  const { error } = await supabase.from('config').update({
    costos_indirectos_pct: config.costos_indirectos_pct,
    margen_objetivo_pct: config.margen_objetivo_pct,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  if (error) throw error;
}
