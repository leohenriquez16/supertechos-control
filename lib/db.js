import { supabase } from './supabase';

// ============================================================
// v8.9.25: Contexto de audit log
// El frontend llama setAuditContext() al login y al cambiar de usuario
// ============================================================
let _auditContext = { usuarioId: null, usuarioNombre: null };
export function setAuditContext(ctx) {
  _auditContext = { usuarioId: ctx?.usuarioId || null, usuarioNombre: ctx?.usuarioNombre || null };
}
function getAuditContext() {
  return _auditContext;
}

// ============================================================
// CARGAR TODOS LOS DATOS
// ============================================================
export async function loadAllData() {
  try {
    const [personalRes, sistemasRes, proyectosRes, reportesRes, enviosRes, configRes] = await Promise.all([
      // Seleccionamos campos explícitos para evitar cargar blobs pesados (fotos cédula)
      supabase.from('personal').select('id, nombre, pin, roles, maestro_id, telefono, direccion, cedula_numero, fecha_ingreso, recomendado_por, email, foto_2x2, cedula_frente, cedula_reverso').order('nombre'),
      supabase.from('sistemas').select('*'),
      supabase.from('proyectos').select('*').order('created_at', { ascending: false }),
      supabase.from('reportes').select('*').order('fecha', { ascending: false }),
      supabase.from('envios').select('*').order('fecha', { ascending: false }),
      supabase.from('config').select('*').eq('id', 1).single(),
    ]);

    const personal = (personalRes.data || []).map(p => ({
      id: p.id, nombre: p.nombre, pin: p.pin || undefined,
      roles: p.roles || [], maestroId: p.maestro_id || undefined,
      telefono: p.telefono || '',
      direccion: p.direccion || '',
      cedulaNumero: p.cedula_numero || '',
      fechaIngreso: p.fecha_ingreso || '',
      recomendadoPor: p.recomendado_por || '',
      email: p.email || '',
      foto2x2: p.foto_2x2 || '',
      cedulaFrente: p.cedula_frente || '',
      cedulaReverso: p.cedula_reverso || '',
      modoPago: p.modo_pago || 'dia',
      tarifaM2: p.tarifa_m2 !== null ? Number(p.tarifa_m2) : null,
      tarifaDia: p.tarifa_dia !== null ? Number(p.tarifa_dia) : null,
      reporteAudioHabilitado: !!p.reporte_audio_habilitado, // v8.9.11
    }));

    const sistemas = {};
    (sistemasRes.data || []).forEach(s => { sistemas[s.id] = s.data; });

    const proyectos = (proyectosRes.data || []).filter(p => !p.archivado).map(p => ({
      id: p.id, nombre: p.nombre, cliente: p.cliente,
      referenciaOdoo: p.referencia_odoo, referenciaProyecto: p.referencia_proyecto,
      sistema: p.sistema_id, supervisorId: p.supervisor_id, maestroId: p.maestro_id,
      ayudantesIds: p.ayudantes_ids || [], fecha_inicio: p.fecha_inicio, fecha_entrega: p.fecha_entrega,
      // v8.9: cada área puede tener su propio sistemaId. Si no, usa el del proyecto.
      areas: (p.areas || []).map(a => ({ ...a, sistemaId: a.sistemaId || p.sistema_id || null })),
      dieta: p.dieta || { habilitada: false },
      ubicacionLat: p.ubicacion_lat !== null ? Number(p.ubicacion_lat) : null,
      ubicacionLng: p.ubicacion_lng !== null ? Number(p.ubicacion_lng) : null,
      ubicacionRadioM: p.ubicacion_radio_m || 1000,
      ubicacionDireccion: p.ubicacion_direccion || '',
      ubicacionDireccionTexto: p.ubicacion_direccion_texto || '',
      googleMapsLink: p.google_maps_link || '',
      estado: p.estado || 'aprobado',
      fechaCubicacion: p.fecha_cubicacion || null,
      fechaAprobacion: p.fecha_aprobacion || null,
      fechaMedicion: p.fecha_medicion || null,
      fechaFacturacion: p.fecha_facturacion || null,
      fechaCobro: p.fecha_cobro || null,
      montoFinalCubicado: p.monto_final_cubicado !== null ? Number(p.monto_final_cubicado) : null,
      numeroFactura: p.numero_factura || '',
      contactoClienteNombre: p.contacto_cliente_nombre || '',
      contactoClienteTelefono: p.contacto_cliente_telefono || '',
      contactoClienteEmail: p.contacto_cliente_email || '',
      archivado: p.archivado || false,
      modoPagoManoObra: p.modo_pago_mano_obra || 'dia',
      preciosTareasM2: p.precios_tareas_m2 || {},
      preciosManoObraTareas: p.precios_mano_obra_tareas || {},
      precioM2FijoMaestro: Number(p.precio_m2_fijo_maestro || 0),
      productosAdicionales: p.productos_adicionales || [],
      tipoAvance: p.tipo_avance || 'tradicional',
      estructuraUnidades: p.estructura_unidades || [],
      cronogramaVisibleMaestro: p.cronograma_visible_maestro !== false,
      // v8.9.10: relaciones con clientes
      clienteId: p.cliente_id || null,
      contactoPrincipalId: p.contacto_principal_id || null,
      // v8.9.13: pausas
      pausas: p.pausas || [],
    }));

    const reportes = (reportesRes.data || []).map(r => ({
      id: r.id, proyectoId: r.proyecto_id, areaId: r.area_id, tareaId: r.tarea_id,
      fecha: r.fecha,
      m2: r.m2 !== null ? Number(r.m2) : undefined,
      rollos: r.rollos !== null ? Number(r.rollos) : undefined,
      cubetas: r.cubetas !== null ? Number(r.cubetas) : undefined,
      nota: r.nota, supervisor: r.supervisor, supervisorId: r.supervisor_id,
      // v8.9.11: audio + IA
      audioUrl: r.audio_url || null,
      transcripcion: r.transcripcion || null,
      datosIA: r.datos_ia || {},
    }));

    const envios = (enviosRes.data || []).map(e => ({
      id: e.id, proyectoId: e.proyecto_id, materialId: e.material_id,
      cantidad: Number(e.cantidad), fecha: e.fecha, pdfRef: e.pdf_ref,
      costoUnidad: e.costo_unidad !== null ? Number(e.costo_unidad) : null,
      costoTotal: e.costo_total !== null ? Number(e.costo_total) : null,
      areasAsignadas: e.areas_asignadas || [], // v8.9.6
    }));

    const config = configRes.data ? {
      costos_indirectos_pct: Number(configRes.data.costos_indirectos_pct),
      margen_objetivo_pct: Number(configRes.data.margen_objetivo_pct),
    } : { costos_indirectos_pct: 15, margen_objetivo_pct: 30 };

    // v8.8: Cargar permisos configurables
    let permisos = [];
    try {
      permisos = await listarPermisos();
    } catch (e) { console.warn('Permisos no cargados:', e.message); }

    // v8.9.9: Cargar clientes y contactos
    let clientes = [];
    let contactos = [];
    try {
      clientes = await listarClientes(false);
      contactos = await listarContactos();
    } catch (e) { console.warn('Clientes/Contactos no cargados:', e.message); }

    // v8.9.13: Cargar checkins
    let checkins = [];
    try {
      checkins = await listarCheckins();
    } catch (e) { console.warn('Checkins no cargados:', e.message); }

    // v8.9.15: Cargar documentos del proyecto
    let documentos = [];
    try {
      documentos = await listarDocumentosProyecto();
    } catch (e) { console.warn('Documentos no cargados:', e.message); }

    // v8.9.22: Cargar credenciales biometricas
    let credenciales = [];
    try {
      credenciales = await todasCredenciales();
    } catch (e) { console.warn('Credenciales no cargadas:', e.message); }

    // v8.9.23: Cargar planificación estratégica
    let categorias = [], capacidades = [], ausencias = [], equipos = [], equipoAsignaciones = [];
    let estadosArea = [], tiposCredenciales = [], credencialesPersonas = [];
    let clienteRequisitos = [], ubicacionRequisitos = [], autorizaciones = [], brigadasPreferentes = [];
    let asignaciones = []; // v8.9.26
    try {
      categorias = await listarCategorias();
      capacidades = await listarCapacidades();
      ausencias = await listarAusencias();
      equipos = await listarEquipos();
      equipoAsignaciones = await listarEquipoAsignaciones();
      estadosArea = await listarEstadosArea();
      tiposCredenciales = await listarTiposCredenciales();
      credencialesPersonas = await listarCredenciales();
      clienteRequisitos = await listarClienteRequisitos();
      ubicacionRequisitos = await listarUbicacionRequisitos();
      autorizaciones = await listarAutorizaciones();
      brigadasPreferentes = await listarBrigadasPreferentes();
      asignaciones = await listarAsignaciones(); // v8.9.26
    } catch (e) { console.warn('Planificación parcial:', e.message); }

    return {
      personal, sistemas, proyectos, reportes, envios, config, permisos,
      clientes, contactos, checkins, documentos, credenciales,
      categorias, capacidades, ausencias, equipos, equipoAsignaciones,
      estadosArea, tiposCredenciales, credencialesPersonas,
      clienteRequisitos, ubicacionRequisitos, autorizaciones, brigadasPreferentes,
      asignaciones, // v8.9.26
    };
  } catch (error) {
    console.error('Error cargando datos:', error);
    throw error;
  }
}

// ============================================================
// PERFIL DE PERSONAL (v7.2)
// ============================================================
export async function guardarPerfil(personaId, campos) {
  const updates = {};
  if (campos.foto2x2 !== undefined) updates.foto_2x2 = campos.foto2x2;
  if (campos.cedulaNumero !== undefined) updates.cedula_numero = campos.cedulaNumero;
  if (campos.cedulaFrente !== undefined) updates.cedula_frente = campos.cedulaFrente;
  if (campos.cedulaReverso !== undefined) updates.cedula_reverso = campos.cedulaReverso;
  if (campos.telefono !== undefined) updates.telefono = campos.telefono;
  if (campos.direccion !== undefined) updates.direccion = campos.direccion;
  if (campos.fechaIngreso !== undefined) updates.fecha_ingreso = campos.fechaIngreso || null;
  if (campos.recomendadoPor !== undefined) updates.recomendado_por = campos.recomendadoPor;
  if (campos.email !== undefined) updates.email = campos.email;
  if (campos.modoPago !== undefined) updates.modo_pago = campos.modoPago;
  if (campos.tarifaM2 !== undefined) updates.tarifa_m2 = campos.tarifaM2 || null;
  if (campos.tarifaDia !== undefined) updates.tarifa_dia = campos.tarifaDia || null;
  const { error } = await supabase.from('personal').update(updates).eq('id', personaId);
  if (error) throw error;

  // v8.9.25: audit (solo campos no sensibles en el log para privacidad)
  const ctx = getAuditContext();
  const camposAuditables = { ...campos };
  // quitar datos PII sensibles del log
  delete camposAuditables.cedulaFrente;
  delete camposAuditables.cedulaReverso;
  delete camposAuditables.cedulaNumero;
  delete camposAuditables.foto2x2;
  const cambiosSensible = campos.cedulaNumero !== undefined || campos.cedulaFrente !== undefined || campos.cedulaReverso !== undefined;
  registrarAudit({
    usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'persona.perfil_editado',
    recursoTipo: 'persona', recursoId: personaId,
    datosDespues: camposAuditables,
    metadata: { incluyeCambiosSensibles: cambiosSensible },
    severidad: cambiosSensible ? 'warning' : 'info',
  });
}

// ============================================================
// FOTOS DE PROYECTO (v7.1)
// ============================================================
export async function listarFotosProyecto(proyectoId) {
  const { data, error } = await supabase
    .from('fotos')
    .select('id, proyecto_id, fecha, area_id, subida_por, subida_por_id, reporte_id, nota, created_at')
    .eq('proyecto_id', proyectoId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(f => ({
    id: f.id, proyectoId: f.proyecto_id, fecha: f.fecha, areaId: f.area_id,
    subidaPor: f.subida_por, subidaPorId: f.subida_por_id, reporteId: f.reporte_id,
    nota: f.nota, createdAt: f.created_at,
  }));
}

export async function obtenerFoto(fotoId) {
  const { data, error } = await supabase.from('fotos').select('data').eq('id', fotoId).single();
  if (error) throw error;
  return data.data;
}

export async function subirFoto(foto) {
  const { error } = await supabase.from('fotos').insert({
    id: foto.id, proyecto_id: foto.proyectoId, fecha: foto.fecha,
    area_id: foto.areaId || null, data: foto.data,
    subida_por: foto.subidaPor, subida_por_id: foto.subidaPorId,
    reporte_id: foto.reporteId || null, nota: foto.nota || null,
    sistema_id: foto.sistemaId || null,
  });
  if (error) throw error;
}

export async function subirFotosLote(fotos) {
  if (!fotos.length) return;
  const rows = fotos.map(foto => ({
    id: foto.id, proyecto_id: foto.proyectoId, fecha: foto.fecha,
    area_id: foto.areaId || null, data: foto.data,
    subida_por: foto.subidaPor, subida_por_id: foto.subidaPorId,
    reporte_id: foto.reporteId || null, nota: foto.nota || null,
    sistema_id: foto.sistemaId || null,
  }));
  const { error } = await supabase.from('fotos').insert(rows);
  if (error) throw error;
}

export async function eliminarFoto(fotoId) {
  const { error } = await supabase.from('fotos').delete().eq('id', fotoId);
  if (error) throw error;
}

// ============================================================
// PROYECTOS
// ============================================================
export async function crearProyecto(proy) {
  // v8.4: Validar que supervisor_id y maestro_id existan en personal
  let supervisorId = proy.supervisorId || null;
  let maestroId = proy.maestroId || null;
  if (supervisorId || maestroId) {
    const idsAValidar = [supervisorId, maestroId].filter(Boolean);
    const { data: personalValido } = await supabase.from('personal').select('id').in('id', idsAValidar);
    const idsValidos = new Set((personalValido || []).map(p => p.id));
    if (supervisorId && !idsValidos.has(supervisorId)) supervisorId = null;
    if (maestroId && !idsValidos.has(maestroId)) maestroId = null;
  }
  let ayudantesIds = proy.ayudantesIds || [];
  if (ayudantesIds.length > 0) {
    const { data: ayudValidos } = await supabase.from('personal').select('id').in('id', ayudantesIds);
    const idsAyudValidos = new Set((ayudValidos || []).map(p => p.id));
    ayudantesIds = ayudantesIds.filter(id => idsAyudValidos.has(id));
  }

  const { error } = await supabase.from('proyectos').insert({
    id: proy.id, nombre: proy.nombre, cliente: proy.cliente,
    referencia_odoo: proy.referenciaOdoo, referencia_proyecto: proy.referenciaProyecto,
    sistema_id: proy.sistema, supervisor_id: supervisorId, maestro_id: maestroId,
    ayudantes_ids: ayudantesIds,
    fecha_inicio: proy.fecha_inicio, fecha_entrega: proy.fecha_entrega,
    // v8.9: normalizar sistemaId en cada área (si no tiene, usa el del proyecto)
    areas: (proy.areas || []).map(a => ({ ...a, sistemaId: a.sistemaId || proy.sistema || null })),
    dieta: proy.dieta || { habilitada: false },
    ubicacion_lat: proy.ubicacionLat ?? null,
    ubicacion_lng: proy.ubicacionLng ?? null,
    ubicacion_radio_m: proy.ubicacionRadioM ?? 1000,
    ubicacion_direccion: proy.ubicacionDireccion ?? '',
    ubicacion_direccion_texto: proy.ubicacionDireccionTexto ?? '',
    google_maps_link: proy.googleMapsLink ?? '',
    estado: proy.estado || 'aprobado',
    fecha_cubicacion: proy.fechaCubicacion ?? null,
    contacto_cliente_nombre: proy.contactoClienteNombre ?? '',
    contacto_cliente_telefono: proy.contactoClienteTelefono ?? '',
    contacto_cliente_email: proy.contactoClienteEmail ?? '',
    modo_pago_mano_obra: proy.modoPagoManoObra || 'dia',
    precios_tareas_m2: proy.preciosTareasM2 || {},
    precios_mano_obra_tareas: proy.preciosManoObraTareas || {},
    precio_m2_fijo_maestro: proy.precioM2FijoMaestro || 0,
    productos_adicionales: proy.productosAdicionales || [],
    tipo_avance: proy.tipoAvance || 'tradicional',
    estructura_unidades: proy.estructuraUnidades || [],
    cronograma_visible_maestro: proy.cronogramaVisibleMaestro !== false,
    // v8.9.10: relación con clientes
    cliente_id: proy.clienteId || null,
    contacto_principal_id: proy.contactoPrincipalId || null,
    // v8.9.13: pausas
    pausas: proy.pausas || [],
  });
  if (error) throw error;
}

export async function actualizarProyecto(proy) {
  // v8.4: Validar que supervisor_id y maestro_id existan en personal (evita FK constraint error)
  let supervisorId = proy.supervisorId || null;
  let maestroId = proy.maestroId || null;
  if (supervisorId || maestroId) {
    const idsAValidar = [supervisorId, maestroId].filter(Boolean);
    const { data: personalValido } = await supabase.from('personal').select('id').in('id', idsAValidar);
    const idsValidos = new Set((personalValido || []).map(p => p.id));
    if (supervisorId && !idsValidos.has(supervisorId)) supervisorId = null;
    if (maestroId && !idsValidos.has(maestroId)) maestroId = null;
  }
  // Validar ayudantes también
  let ayudantesIds = proy.ayudantesIds || [];
  if (ayudantesIds.length > 0) {
    const { data: ayudValidos } = await supabase.from('personal').select('id').in('id', ayudantesIds);
    const idsAyudValidos = new Set((ayudValidos || []).map(p => p.id));
    ayudantesIds = ayudantesIds.filter(id => idsAyudValidos.has(id));
  }

  const { error } = await supabase.from('proyectos').update({
    nombre: proy.nombre, cliente: proy.cliente,
    referencia_odoo: proy.referenciaOdoo, referencia_proyecto: proy.referenciaProyecto,
    sistema_id: proy.sistema, supervisor_id: supervisorId, maestro_id: maestroId,
    ayudantes_ids: ayudantesIds,
    fecha_inicio: proy.fecha_inicio, fecha_entrega: proy.fecha_entrega,
    // v8.9: normalizar sistemaId en cada área
    areas: (proy.areas || []).map(a => ({ ...a, sistemaId: a.sistemaId || proy.sistema || null })),
    dieta: proy.dieta || { habilitada: false },
    ubicacion_lat: proy.ubicacionLat ?? null,
    ubicacion_lng: proy.ubicacionLng ?? null,
    ubicacion_radio_m: proy.ubicacionRadioM ?? 1000,
    ubicacion_direccion: proy.ubicacionDireccion ?? '',
    ubicacion_direccion_texto: proy.ubicacionDireccionTexto ?? '',
    google_maps_link: proy.googleMapsLink ?? '',
    contacto_cliente_nombre: proy.contactoClienteNombre ?? '',
    contacto_cliente_telefono: proy.contactoClienteTelefono ?? '',
    contacto_cliente_email: proy.contactoClienteEmail ?? '',
    modo_pago_mano_obra: proy.modoPagoManoObra || 'dia',
    precios_tareas_m2: proy.preciosTareasM2 || {},
    precios_mano_obra_tareas: proy.preciosManoObraTareas || {},
    precio_m2_fijo_maestro: proy.precioM2FijoMaestro || 0,
    productos_adicionales: proy.productosAdicionales || [],
    tipo_avance: proy.tipoAvance || 'tradicional',
    estructura_unidades: proy.estructuraUnidades || [],
    cronograma_visible_maestro: proy.cronogramaVisibleMaestro !== false,
    // v8.9.10: relación con clientes
    cliente_id: proy.clienteId || null,
    contacto_principal_id: proy.contactoPrincipalId || null,
    // v8.9.13: pausas
    pausas: proy.pausas || [],
    updated_at: new Date().toISOString(),
  }).eq('id', proy.id);
  if (error) throw error;
}

// Archivar (soft delete) un proyecto
export async function archivarProyecto(proyectoId, usuarioId) {
  const { error } = await supabase.from('proyectos').update({
    archivado: true,
    archivado_at: new Date().toISOString(),
    archivado_por_id: usuarioId,
  }).eq('id', proyectoId);
  if (error) throw error;
}

export async function restaurarProyecto(proyectoId) {
  const { error } = await supabase.from('proyectos').update({
    archivado: false, archivado_at: null, archivado_por_id: null,
  }).eq('id', proyectoId);
  if (error) throw error;
}

// v8.9.12: Eliminar proyecto PERMANENTEMENTE (con todos sus datos asociados)
// ADVERTENCIA: esta operación NO se puede deshacer.
export async function eliminarProyecto(proyectoId) {
  // v8.9.25: capturar data antes de eliminar
  const { data: proyectoAntes } = await supabase.from('proyectos').select('referencia_odoo, cliente, nombre, estado').eq('id', proyectoId).single();

  // Eliminar en orden por dependencias. Si hay foreign keys con CASCADE, algunos son automáticos.
  // Hacemos deletes explícitos para ser seguros con configuraciones variadas.
  const eliminarTabla = async (tabla, columna = 'proyecto_id') => {
    try {
      await supabase.from(tabla).delete().eq(columna, proyectoId);
    } catch (e) { console.warn(`Error eliminando ${tabla}:`, e); }
  };

  // Datos relacionados
  await eliminarTabla('reportes');
  await eliminarTabla('envios');
  await eliminarTabla('jornadas');
  await eliminarTabla('fotos');
  await eliminarTabla('tareas_abiertas');
  await eliminarTabla('costos_dia');
  await eliminarTabla('dieta_dia');
  await eliminarTabla('nominas');
  await eliminarTabla('comentarios_proyecto');

  // Finalmente el proyecto
  const { error } = await supabase.from('proyectos').delete().eq('id', proyectoId);
  if (error) throw error;

  // v8.9.25: audit log - crítico
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'proyecto.eliminado',
    recursoTipo: 'proyecto', recursoId: proyectoId,
    recursoNombre: proyectoAntes ? `${proyectoAntes.referencia_odoo || ''} ${proyectoAntes.cliente || proyectoAntes.nombre || ''}`.trim() : proyectoId,
    datosAntes: proyectoAntes,
    severidad: 'critical',
  });
}

export async function actualizarUbicacionProyecto(proyectoId, lat, lng, direccion) {
  const { error } = await supabase.from('proyectos').update({
    ubicacion_lat: lat,
    ubicacion_lng: lng,
    ubicacion_direccion: direccion || null,
    updated_at: new Date().toISOString(),
  }).eq('id', proyectoId);
  if (error) throw error;
}

// ============================================================
// REPORTES
// ============================================================
export async function crearReporte(r) {
  const { error } = await supabase.from('reportes').insert({
    id: r.id, proyecto_id: r.proyectoId, area_id: r.areaId, tarea_id: r.tareaId,
    fecha: r.fecha,
    m2: r.m2 ?? null, rollos: r.rollos ?? null, cubetas: r.cubetas ?? null,
    nota: r.nota || null, supervisor: r.supervisor, supervisor_id: r.supervisorId,
    // v8.9.11: audio + IA
    audio_url: r.audioUrl || null,
    transcripcion: r.transcripcion || null,
    datos_ia: r.datosIA || {},
  });
  if (error) throw error;

  // v8.9.25: audit
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: r.personaId || ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'reporte.creado',
    recursoTipo: 'reporte', recursoId: r.id,
    datosDespues: { proyectoId: r.proyectoId, fecha: r.fecha, m2: r.m2, areaId: r.areaId },
    severidad: 'info',
  });
}

// ============================================================
// NOTIFICACIÓN POR CORREO
// ============================================================
export async function enviarCorreoReporte(destinatarios, asunto, html) {
  try {
    await fetch('/api/enviar-reporte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatarios, asunto, html }),
    });
  } catch (e) { console.warn('Correo no enviado:', e); }
}

// ============================================================
// ENVÍOS
// ============================================================
export async function crearEnvio(e) {
  const { error } = await supabase.from('envios').insert({
    id: e.id, proyecto_id: e.proyectoId, material_id: e.materialId,
    cantidad: e.cantidad, fecha: e.fecha, pdf_ref: e.pdfRef || null,
    costo_unidad: e.costoUnidad ?? null,
    costo_total: e.costoTotal ?? null,
    areas_asignadas: e.areasAsignadas || [], // v8.9.6
  });
  if (error) throw error;
}

export async function crearEnviosLote(envios) {
  const rows = envios.map(e => ({
    id: e.id, proyecto_id: e.proyectoId, material_id: e.materialId,
    cantidad: e.cantidad, fecha: e.fecha, pdf_ref: e.pdfRef || null,
    costo_unidad: e.costoUnidad ?? null,
    costo_total: e.costoTotal ?? null,
    areas_asignadas: e.areasAsignadas || [], // v8.9.6
  }));
  const { error } = await supabase.from('envios').insert(rows);
  if (error) throw error;
}

export async function eliminarEnvio(envioId) {
  const { error } = await supabase.from('envios').delete().eq('id', envioId);
  if (error) throw error;
}

// v8.9.7: Actualizar costo de un envío ya registrado
export async function actualizarCostoEnvio(envioId, costoUnidad, cantidad) {
  const costoTotal = (parseFloat(costoUnidad) || 0) * (parseFloat(cantidad) || 0);
  const { error } = await supabase.from('envios').update({
    costo_unidad: parseFloat(costoUnidad) || 0,
    costo_total: costoTotal,
  }).eq('id', envioId);
  if (error) throw error;
}

// ============================================================
// PERSONAL
// ============================================================
export async function reemplazarPersonal(nuevoPersonal) {
  const { data: actuales } = await supabase.from('personal').select('id, nombre');
  const idsActuales = new Set((actuales || []).map(p => p.id));
  const idsNuevos = new Set(nuevoPersonal.map(p => p.id));
  const mapActuales = Object.fromEntries((actuales || []).map(p => [p.id, p]));

  const aEliminar = [...idsActuales].filter(id => !idsNuevos.has(id));
  if (aEliminar.length > 0) {
    await supabase.from('personal').delete().in('id', aEliminar);
  }

  // Upsert solo actualiza campos mandados; no borra foto_2x2, cedula, etc.
  const rows = nuevoPersonal.map(p => ({
    id: p.id, nombre: p.nombre, pin: p.pin || null,
    roles: p.roles || [], maestro_id: p.maestroId || null,
    reporte_audio_habilitado: !!p.reporteAudioHabilitado, // v8.9.11
  }));
  const { error } = await supabase.from('personal').upsert(rows);
  if (error) throw error;

  // v8.9.25: audit log
  const ctx = getAuditContext();
  aEliminar.forEach(id => {
    registrarAudit({
      usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
      accion: 'persona.eliminada',
      recursoTipo: 'persona', recursoId: id,
      recursoNombre: mapActuales[id]?.nombre || id,
      severidad: 'critical',
    });
  });
  nuevoPersonal.filter(p => !idsActuales.has(p.id)).forEach(p => {
    registrarAudit({
      usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
      accion: 'persona.creada',
      recursoTipo: 'persona', recursoId: p.id,
      recursoNombre: p.nombre,
      datosDespues: { nombre: p.nombre, roles: p.roles, maestroId: p.maestroId },
      severidad: 'warning',
    });
  });
}

// v8.9.11: Toggle del flag de reporte con audio IA
export async function actualizarFlagAudioPersonal(personaId, habilitado) {
  const { error } = await supabase.from('personal').update({
    reporte_audio_habilitado: !!habilitado,
  }).eq('id', personaId);
  if (error) throw error;
}

// v8.9.11: Subir audio de reporte a Supabase Storage
export async function subirAudioReporte(blob, proyectoId, reporteId) {
  const path = `${proyectoId}/${reporteId}-${Date.now()}.webm`;
  const { error } = await supabase.storage.from('reportes-audio').upload(path, blob, {
    contentType: 'audio/webm',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('reportes-audio').getPublicUrl(path);
  return data.publicUrl;
}

// ============================================================
// SISTEMAS
// ============================================================
export async function guardarSistemas(sistemas) {
  const { data: actuales } = await supabase.from('sistemas').select('id');
  const idsActuales = new Set((actuales || []).map(s => s.id));
  const idsNuevos = new Set(Object.keys(sistemas));

  const aEliminar = [...idsActuales].filter(id => !idsNuevos.has(id));
  if (aEliminar.length > 0) {
    await supabase.from('sistemas').delete().in('id', aEliminar);
  }

  const rows = Object.values(sistemas).map(s => ({
    id: s.id, data: s, updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('sistemas').upsert(rows);
  if (error) throw error;
}

export async function mergeSistemas(sistemasExistentes, sistemasNuevos) {
  const combinado = { ...sistemasExistentes };
  Object.values(sistemasNuevos).forEach(s => { combinado[s.id] = s; });
  await guardarSistemas(combinado);
  return combinado;
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

// ============================================================
// JORNADAS (v7.2b)
// ============================================================
export async function listarJornadasProyecto(proyectoId) {
  const { data, error } = await supabase
    .from('jornadas')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data || []).map(j => ({
    id: j.id, proyectoId: j.proyecto_id, fecha: j.fecha,
    horaInicio: j.hora_inicio, iniciadaPorId: j.iniciada_por_id, iniciadaPorNombre: j.iniciada_por_nombre,
    inicioLat: j.inicio_lat, inicioLng: j.inicio_lng, inicioPrecisionM: j.inicio_precision_m, inicioDistanciaObraM: j.inicio_distancia_obra_m,
    personasPresentesIds: j.personas_presentes_ids || [],
    horaFin: j.hora_fin, finalizadaPorId: j.finalizada_por_id, finalizadaPorNombre: j.finalizada_por_nombre,
    finLat: j.fin_lat, finLng: j.fin_lng, finPrecisionM: j.fin_precision_m, finDistanciaObraM: j.fin_distancia_obra_m,
    nota: j.nota,
    diaDoble: j.dia_doble || false,
    condicionDia: j.condicion_dia || 'normal',
    condicionNota: j.condicion_nota || '',
  }));
}

export async function obtenerJornadaHoy(proyectoId, fecha) {
  const { data, error } = await supabase
    .from('jornadas')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('fecha', fecha)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id, proyectoId: data.proyecto_id, fecha: data.fecha,
    horaInicio: data.hora_inicio, iniciadaPorId: data.iniciada_por_id, iniciadaPorNombre: data.iniciada_por_nombre,
    inicioLat: data.inicio_lat, inicioLng: data.inicio_lng, inicioPrecisionM: data.inicio_precision_m, inicioDistanciaObraM: data.inicio_distancia_obra_m,
    personasPresentesIds: data.personas_presentes_ids || [],
    horaFin: data.hora_fin, finalizadaPorId: data.finalizada_por_id, finalizadaPorNombre: data.finalizada_por_nombre,
    finLat: data.fin_lat, finLng: data.fin_lng, finPrecisionM: data.fin_precision_m, finDistanciaObraM: data.fin_distancia_obra_m,
    nota: data.nota,
    diaDoble: data.dia_doble || false,
    condicionDia: data.condicion_dia || 'normal',
    condicionNota: data.condicion_nota || '',
  };
}

export async function iniciarJornada(j) {
  const row = {
    id: j.id, proyecto_id: j.proyectoId, fecha: j.fecha,
    hora_inicio: j.horaInicio, iniciada_por_id: j.iniciadaPorId, iniciada_por_nombre: j.iniciadaPorNombre,
    inicio_lat: j.inicioLat ?? null, inicio_lng: j.inicioLng ?? null,
    inicio_precision_m: j.inicioPrecisionM ?? null, inicio_distancia_obra_m: j.inicioDistanciaObraM ?? null,
    personas_presentes_ids: j.personasPresentesIds || [],
    nota: j.nota || null,
  };
  const { error } = await supabase.from('jornadas').insert(row);
  if (error) throw error;
}

export async function actualizarPersonasJornada(jornadaId, personasIds) {
  const { error } = await supabase.from('jornadas').update({
    personas_presentes_ids: personasIds,
    updated_at: new Date().toISOString(),
  }).eq('id', jornadaId);
  if (error) throw error;
}

export async function finalizarJornada(jornadaId, datos) {
  const { error } = await supabase.from('jornadas').update({
    hora_fin: datos.horaFin,
    finalizada_por_id: datos.finalizadaPorId,
    finalizada_por_nombre: datos.finalizadaPorNombre,
    fin_lat: datos.finLat ?? null,
    fin_lng: datos.finLng ?? null,
    fin_precision_m: datos.finPrecisionM ?? null,
    fin_distancia_obra_m: datos.finDistanciaObraM ?? null,
    condicion_dia: datos.condicionDia || 'normal',
    condicion_nota: datos.condicionNota || null,
    updated_at: new Date().toISOString(),
  }).eq('id', jornadaId);
  if (error) throw error;
}

// ============================================================
// ESTADOS DE PROYECTO (v8)
// ============================================================
export async function cambiarEstadoProyecto(proyectoId, estadoNuevo, usuario, nota, datosExtra = {}) {
  const { data: actual } = await supabase.from('proyectos').select('estado').eq('id', proyectoId).single();
  const estadoAnterior = actual?.estado;
  const fechaHoy = new Date().toISOString().split('T')[0];
  
  const updates = { estado: estadoNuevo, updated_at: new Date().toISOString(), ...datosExtra };
  if (estadoNuevo === 'cubicando' && !datosExtra.fecha_cubicacion) updates.fecha_cubicacion = fechaHoy;
  if (estadoNuevo === 'aprobado' && !datosExtra.fecha_aprobacion) updates.fecha_aprobacion = fechaHoy;
  if (estadoNuevo === 'medido' && !datosExtra.fecha_medicion) updates.fecha_medicion = fechaHoy;
  if (estadoNuevo === 'facturado' && !datosExtra.fecha_facturacion) updates.fecha_facturacion = fechaHoy;
  if (estadoNuevo === 'cobrado' && !datosExtra.fecha_cobro) updates.fecha_cobro = fechaHoy;
  
  const { error } = await supabase.from('proyectos').update(updates).eq('id', proyectoId);
  if (error) throw error;
  
  await supabase.from('historial_estados').insert({
    id: 'h_' + Date.now() + Math.random(),
    proyecto_id: proyectoId,
    estado_anterior: estadoAnterior, estado_nuevo: estadoNuevo,
    cambiado_por_id: usuario?.id, cambiado_por_nombre: usuario?.nombre,
    nota: nota || null,
  });

  // v8.9.25: Audit log
  const { data: proy } = await supabase.from('proyectos').select('referencia_odoo, cliente').eq('id', proyectoId).single();
  registrarAudit({
    usuarioId: usuario?.id, usuarioNombre: usuario?.nombre,
    accion: 'proyecto.estado_cambiado',
    recursoTipo: 'proyecto', recursoId: proyectoId,
    recursoNombre: proy ? `${proy.referencia_odoo || ''} ${proy.cliente || ''}`.trim() : proyectoId,
    datosAntes: { estado: estadoAnterior },
    datosDespues: { estado: estadoNuevo },
    metadata: { nota },
    severidad: estadoNuevo === 'cancelado' || estadoNuevo === 'facturado' ? 'warning' : 'info',
  });
}

export async function listarHistorialEstados(proyectoId) {
  const { data, error } = await supabase.from('historial_estados').select('*').eq('proyecto_id', proyectoId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ============================================================
// TAREAS (v8)
// ============================================================
export async function listarTareas({ completadas = false, asignadaA = null } = {}) {
  let query = supabase.from('tareas').select('*').eq('completada', completadas).order('fecha_limite', { ascending: true, nullsLast: true });
  if (asignadaA) query = query.eq('asignada_a_id', asignadaA);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(t => ({
    id: t.id, proyectoId: t.proyecto_id, tipo: t.tipo, titulo: t.titulo, descripcion: t.descripcion,
    asignadaAId: t.asignada_a_id, asignadaANombre: t.asignada_a_nombre,
    fechaLimite: t.fecha_limite, completada: t.completada, completadaAt: t.completada_at,
    completadaPorId: t.completada_por_id, createdAt: t.created_at,
  }));
}

export async function crearTarea(t) {
  const { error } = await supabase.from('tareas').insert({
    id: t.id, proyecto_id: t.proyectoId, tipo: t.tipo, titulo: t.titulo, descripcion: t.descripcion || null,
    asignada_a_id: t.asignadaAId || null, asignada_a_nombre: t.asignadaANombre || null,
    fecha_limite: t.fechaLimite || null,
  });
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'tarea.creada',
    recursoTipo: 'tarea', recursoId: t.id, recursoNombre: t.titulo,
    datosDespues: { asignadaA: t.asignadaANombre, fechaLimite: t.fechaLimite },
    severidad: 'info',
  });
}

export async function completarTarea(tareaId, usuarioId) {
  const { error } = await supabase.from('tareas').update({
    completada: true, completada_at: new Date().toISOString(), completada_por_id: usuarioId,
  }).eq('id', tareaId);
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: usuarioId || ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'tarea.completada',
    recursoTipo: 'tarea', recursoId: tareaId,
    severidad: 'info',
  });
}

export async function eliminarTarea(tareaId) {
  const { data: antes } = await supabase.from('tareas').select('titulo, tipo').eq('id', tareaId).single();
  const { error } = await supabase.from('tareas').delete().eq('id', tareaId);
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'tarea.eliminada',
    recursoTipo: 'tarea', recursoId: tareaId, recursoNombre: antes?.titulo || tareaId,
    datosAntes: antes,
    severidad: 'warning',
  });
}

// ============================================================
// TARIFAS POR PROYECTO (v8.3)
// ============================================================
export async function listarTarifasProyecto(proyectoId) {
  const { data, error } = await supabase.from('tarifas_proyecto').select('*').eq('proyecto_id', proyectoId);
  if (error) throw error;
  return (data || []).map(t => ({
    id: t.id, proyectoId: t.proyecto_id, personaId: t.persona_id,
    modoPago: t.modo_pago,
    tarifaM2: t.tarifa_m2 !== null ? Number(t.tarifa_m2) : null,
    tarifaDia: t.tarifa_dia !== null ? Number(t.tarifa_dia) : null,
    montoAjuste: t.monto_ajuste !== null ? Number(t.monto_ajuste) : null,
  }));
}

export async function guardarTarifaProyecto(proyectoId, personaId, config) {
  const row = {
    id: 'tp_' + proyectoId + '_' + personaId,
    proyecto_id: proyectoId, persona_id: personaId,
    modo_pago: config.modoPago,
    tarifa_m2: config.tarifaM2 ?? null,
    tarifa_dia: config.tarifaDia ?? null,
    monto_ajuste: config.montoAjuste ?? null,
  };
  const { error } = await supabase.from('tarifas_proyecto').upsert(row);
  if (error) throw error;
}

// ============================================================
// AJUSTES DE NÓMINA (adelantos, bonos, dieta extra)
// ============================================================
export async function listarAjustes({ personaId = null, sinCorte = false } = {}) {
  let q = supabase.from('ajustes_nomina').select('*').order('fecha', { ascending: false });
  if (personaId) q = q.eq('persona_id', personaId);
  if (sinCorte) q = q.is('aplicado_a_corte_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(a => ({
    id: a.id, personaId: a.persona_id, fecha: a.fecha, tipo: a.tipo, monto: Number(a.monto),
    concepto: a.concepto, aplicadoACorteId: a.aplicado_a_corte_id,
    creadoPorId: a.creado_por_id, createdAt: a.created_at,
  }));
}

export async function crearAjuste(a) {
  const { error } = await supabase.from('ajustes_nomina').insert({
    id: a.id, persona_id: a.personaId, fecha: a.fecha, tipo: a.tipo, monto: a.monto,
    concepto: a.concepto || null, creado_por_id: a.creadoPorId || null,
  });
  if (error) throw error;
}

export async function eliminarAjuste(ajusteId) {
  const { error } = await supabase.from('ajustes_nomina').delete().eq('id', ajusteId);
  if (error) throw error;
}

// ============================================================
// CORTES DE NÓMINA
// ============================================================
export async function listarCortes() {
  const { data, error } = await supabase.from('cortes_nomina').select('*').order('fecha_fin', { ascending: false });
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id, fechaInicio: c.fecha_inicio, fechaFin: c.fecha_fin, estado: c.estado,
    totalMonto: Number(c.total_monto || 0), notas: c.notas,
    cerradoAt: c.cerrado_at, pagadoAt: c.pagado_at, createdAt: c.created_at,
  }));
}

export async function crearCorte(c) {
  const { error } = await supabase.from('cortes_nomina').insert({
    id: c.id, fecha_inicio: c.fechaInicio, fecha_fin: c.fechaFin,
    estado: 'abierto', notas: c.notas || null,
  });
  if (error) throw error;
}

export async function guardarDetalleCorte(detalles) {
  if (!detalles.length) return;
  const rows = detalles.map(d => ({
    id: d.id, corte_id: d.corteId, persona_id: d.personaId, persona_nombre: d.personaNombre,
    modo_pago: d.modoPago, dias_trabajados: d.diasTrabajados || 0, m2_producidos: d.m2Producidos || 0,
    proyectos_ajuste: d.proyectosAjuste || [],
    monto_base: d.montoBase || 0, monto_dieta: d.montoDieta || 0,
    monto_adelantos: d.montoAdelantos || 0, monto_otros: d.montoOtros || 0,
    monto_apoyo: d.montoApoyo || 0, nota_apoyo: d.notaApoyo || null,
    monto_total: d.montoTotal || 0, nota: d.nota || null,
  }));
  // Reemplazar: borrar existentes del corte y reinsertar
  await supabase.from('detalle_nomina').delete().eq('corte_id', detalles[0].corteId);
  const { error } = await supabase.from('detalle_nomina').insert(rows);
  if (error) throw error;
}

export async function obtenerDetalleCorte(corteId) {
  const { data, error } = await supabase.from('detalle_nomina').select('*').eq('corte_id', corteId);
  if (error) throw error;
  return (data || []).map(d => ({
    id: d.id, corteId: d.corte_id, personaId: d.persona_id, personaNombre: d.persona_nombre,
    modoPago: d.modo_pago, diasTrabajados: d.dias_trabajados, m2Producidos: Number(d.m2_producidos || 0),
    proyectosAjuste: d.proyectos_ajuste || [],
    montoBase: Number(d.monto_base || 0), montoDieta: Number(d.monto_dieta || 0),
    montoAdelantos: Number(d.monto_adelantos || 0), montoOtros: Number(d.monto_otros || 0),
    montoApoyo: Number(d.monto_apoyo || 0), notaApoyo: d.nota_apoyo || '',
    montoTotal: Number(d.monto_total || 0), nota: d.nota,
  }));
}

// v8.3: Eliminar un recibo individual (detalle_nomina) por id
export async function eliminarReciboNomina(detalleId) {
  const { error } = await supabase.from('detalle_nomina').delete().eq('id', detalleId);
  if (error) throw error;
}

export async function cerrarCorte(corteId, usuarioId, totalMonto) {
  const { error } = await supabase.from('cortes_nomina').update({
    estado: 'cerrado', cerrado_at: new Date().toISOString(), cerrado_por_id: usuarioId, total_monto: totalMonto,
  }).eq('id', corteId);
  if (error) throw error;
  // Marcar ajustes sin corte como aplicados
  const { data: corte } = await supabase.from('cortes_nomina').select('fecha_inicio, fecha_fin').eq('id', corteId).single();
  if (corte) {
    await supabase.from('ajustes_nomina').update({ aplicado_a_corte_id: corteId })
      .is('aplicado_a_corte_id', null)
      .gte('fecha', corte.fecha_inicio).lte('fecha', corte.fecha_fin);
  }
}

export async function marcarCortePagado(corteId) {
  const { error } = await supabase.from('cortes_nomina').update({
    estado: 'pagado', pagado_at: new Date().toISOString(),
  }).eq('id', corteId);
  if (error) throw error;
}

// v8.5: Reabrir corte (cerrado o pagado) para volver a editarlo
export async function reabrirCorte(corteId) {
  const { error } = await supabase.from('cortes_nomina').update({
    estado: 'abierto',
    cerrado_at: null,
    cerrado_por_id: null,
    pagado_at: null,
  }).eq('id', corteId);
  if (error) throw error;
  // Liberar los ajustes que estaban aplicados a este corte
  await supabase.from('ajustes_nomina').update({ aplicado_a_corte_id: null })
    .eq('aplicado_a_corte_id', corteId);
}

// ============================================================
// v8.1: Eliminación de entradas por admin
// ============================================================
export async function eliminarReporte(reporteId) {
  // v8.9.25: capturar antes
  const { data: antes } = await supabase.from('reportes').select('*').eq('id', reporteId).single();
  const { error } = await supabase.from('reportes').delete().eq('id', reporteId);
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'reporte.eliminado',
    recursoTipo: 'reporte', recursoId: reporteId,
    datosAntes: antes, severidad: 'critical',
  });
}

export async function eliminarJornada(jornadaId) {
  const { error } = await supabase.from('jornadas').delete().eq('id', jornadaId);
  if (error) throw error;
}

export async function eliminarCorteNomina(corteId) {
  const { error } = await supabase.from('cortes_nomina').delete().eq('id', corteId);
  if (error) throw error;
}

export async function marcarDiaDoble(jornadaId, esDoble) {
  const { error } = await supabase.from('jornadas').update({ dia_doble: esDoble }).eq('id', jornadaId);
  if (error) throw error;
}

// ============================================================
// v8.1: Costos de día por persona por proyecto
// ============================================================
export async function listarCostosDia(proyectoId) {
  const { data, error } = await supabase.from('costos_dia_proyecto').select('*').eq('proyecto_id', proyectoId);
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id, proyectoId: c.proyecto_id, personaId: c.persona_id, costoDia: Number(c.costo_dia),
  }));
}

export async function guardarCostoDia(proyectoId, personaId, costoDia) {
  const row = {
    id: 'cd_' + proyectoId + '_' + personaId,
    proyecto_id: proyectoId, persona_id: personaId,
    costo_dia: costoDia,
  };
  const { error } = await supabase.from('costos_dia_proyecto').upsert(row);
  if (error) throw error;
}

export async function eliminarCostoDia(proyectoId, personaId) {
  const { error } = await supabase.from('costos_dia_proyecto').delete()
    .eq('proyecto_id', proyectoId).eq('persona_id', personaId);
  if (error) throw error;
}

// ============================================================
// v8.1: Fotos favoritas y todas (global)
// ============================================================
export async function marcarFotoFavorita(fotoId, favorita) {
  const { error } = await supabase.from('fotos').update({ favorita }).eq('id', fotoId);
  if (error) throw error;
}

export async function listarTodasLasFotos({ sistemaId = null, proyectoId = null, favoritasSolo = false, fechaInicio = null, fechaFin = null } = {}) {
  let q = supabase.from('fotos').select('id, proyecto_id, fecha, area_id, subida_por, subida_por_id, reporte_id, nota, created_at, favorita, sistema_id').order('fecha', { ascending: false });
  if (sistemaId) q = q.eq('sistema_id', sistemaId);
  if (proyectoId) q = q.eq('proyecto_id', proyectoId);
  if (favoritasSolo) q = q.eq('favorita', true);
  if (fechaInicio) q = q.gte('fecha', fechaInicio);
  if (fechaFin) q = q.lte('fecha', fechaFin);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(f => ({
    id: f.id, proyectoId: f.proyecto_id, fecha: f.fecha, areaId: f.area_id,
    subidaPor: f.subida_por, subidaPorId: f.subida_por_id, reporteId: f.reporte_id,
    nota: f.nota, createdAt: f.created_at, favorita: f.favorita || false, sistemaId: f.sistema_id,
  }));
}

// ============================================================
// v8.8: Permisos por rol × módulo × acción
// ============================================================
export async function listarPermisos() {
  const { data, error } = await supabase.from('permisos_roles').select('*');
  if (error) { console.warn('permisos_roles no disponible:', error.message); return []; }
  return (data || []).map(p => ({
    id: p.id, rol: p.rol, modulo: p.modulo, accion: p.accion, permitido: p.permitido,
  }));
}

export async function actualizarPermiso(rol, modulo, accion, permitido) {
  // Upsert: si existe actualiza, si no crea
  const { error } = await supabase.from('permisos_roles').upsert(
    { rol, modulo, accion, permitido },
    { onConflict: 'rol,modulo,accion' }
  );
  if (error) throw error;
}

// ============================================================
// v8.9.9: CLIENTES + CONTACTOS
// ============================================================
export async function listarClientes(incluirArchivados = false) {
  let query = supabase.from('clientes').select('*').order('nombre', { ascending: true });
  if (!incluirArchivados) query = query.eq('archivado', false);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id,
    nombre: c.nombre,
    rnc: c.rnc || '',
    tipo: c.tipo || 'empresa',
    direccion: c.direccion || '',
    telefonoPrincipal: c.telefono_principal || '',
    emailPrincipal: c.email_principal || '',
    nota: c.nota || '',
    archivado: !!c.archivado,
    createdAt: c.created_at,
  }));
}

export async function crearCliente(c) {
  const { error } = await supabase.from('clientes').insert({
    id: c.id,
    nombre: c.nombre,
    rnc: c.rnc || null,
    tipo: c.tipo || 'empresa',
    direccion: c.direccion || null,
    telefono_principal: c.telefonoPrincipal || null,
    email_principal: c.emailPrincipal || null,
    nota: c.nota || null,
  });
  if (error) throw error;
}

export async function actualizarCliente(c) {
  const { error } = await supabase.from('clientes').update({
    nombre: c.nombre,
    rnc: c.rnc || null,
    tipo: c.tipo || 'empresa',
    direccion: c.direccion || null,
    telefono_principal: c.telefonoPrincipal || null,
    email_principal: c.emailPrincipal || null,
    nota: c.nota || null,
  }).eq('id', c.id);
  if (error) throw error;
}

export async function archivarCliente(id) {
  const { error } = await supabase.from('clientes').update({ archivado: true }).eq('id', id);
  if (error) throw error;
}

export async function desarchivarCliente(id) {
  const { error } = await supabase.from('clientes').update({ archivado: false }).eq('id', id);
  if (error) throw error;
}

export async function eliminarCliente(id) {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) throw error;
}

export async function listarContactos(clienteId = null) {
  let query = supabase.from('contactos').select('*').order('es_principal', { ascending: false }).order('nombre', { ascending: true });
  if (clienteId) query = query.eq('cliente_id', clienteId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(ct => ({
    id: ct.id,
    clienteId: ct.cliente_id,
    nombre: ct.nombre,
    cargo: ct.cargo || '',
    telefono: ct.telefono || '',
    whatsapp: ct.whatsapp || '',
    email: ct.email || '',
    esPrincipal: !!ct.es_principal,
    nota: ct.nota || '',
  }));
}

export async function crearContacto(ct) {
  // Si viene como principal, desmarcar los otros del mismo cliente
  if (ct.esPrincipal) {
    await supabase.from('contactos').update({ es_principal: false }).eq('cliente_id', ct.clienteId);
  }
  const { error } = await supabase.from('contactos').insert({
    id: ct.id,
    cliente_id: ct.clienteId,
    nombre: ct.nombre,
    cargo: ct.cargo || null,
    telefono: ct.telefono || null,
    whatsapp: ct.whatsapp || null,
    email: ct.email || null,
    es_principal: !!ct.esPrincipal,
    nota: ct.nota || null,
  });
  if (error) throw error;
}

export async function actualizarContacto(ct) {
  if (ct.esPrincipal) {
    await supabase.from('contactos').update({ es_principal: false }).eq('cliente_id', ct.clienteId).neq('id', ct.id);
  }
  const { error } = await supabase.from('contactos').update({
    nombre: ct.nombre,
    cargo: ct.cargo || null,
    telefono: ct.telefono || null,
    whatsapp: ct.whatsapp || null,
    email: ct.email || null,
    es_principal: !!ct.esPrincipal,
    nota: ct.nota || null,
  }).eq('id', ct.id);
  if (error) throw error;
}

export async function eliminarContacto(id) {
  const { error } = await supabase.from('contactos').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// v8.9.13: PAUSAS DEL PROYECTO
// ============================================================
export async function actualizarPausasProyecto(proyectoId, pausas) {
  const { error } = await supabase.from('proyectos').update({
    pausas: pausas || [],
    updated_at: new Date().toISOString(),
  }).eq('id', proyectoId);
  if (error) throw error;
}

// ============================================================
// v8.9.13: CHECK-INS DE ASISTENCIA
// ============================================================
export async function listarCheckins(proyectoId = null, desde = null, hasta = null) {
  let query = supabase.from('checkins').select('*').order('fecha', { ascending: false });
  if (proyectoId) query = query.eq('proyecto_id', proyectoId);
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id,
    proyectoId: c.proyecto_id,
    personaId: c.persona_id,
    fecha: c.fecha,
    hora: c.hora,
    ubicacionLat: c.ubicacion_lat !== null ? Number(c.ubicacion_lat) : null,
    ubicacionLng: c.ubicacion_lng !== null ? Number(c.ubicacion_lng) : null,
    ubicacionDistanciaM: c.ubicacion_distancia_m !== null ? Number(c.ubicacion_distancia_m) : null,
    nota: c.nota || '',
    createdAt: c.created_at,
  }));
}

export async function crearCheckin(c) {
  const { error } = await supabase.from('checkins').insert({
    id: c.id,
    proyecto_id: c.proyectoId,
    persona_id: c.personaId,
    fecha: c.fecha,
    hora: c.hora || new Date().toISOString(),
    ubicacion_lat: c.ubicacionLat ?? null,
    ubicacion_lng: c.ubicacionLng ?? null,
    ubicacion_distancia_m: c.ubicacionDistanciaM ?? null,
    nota: c.nota || null,
  });
  if (error) throw error;
}

export async function eliminarCheckin(checkinId) {
  const { error } = await supabase.from('checkins').delete().eq('id', checkinId);
  if (error) throw error;
}

// Verifica si una persona ya hizo check-in hoy en un proyecto
export async function yaHizoCheckinHoy(proyectoId, personaId) {
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.from('checkins')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .eq('persona_id', personaId)
    .eq('fecha', hoy)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

// ============================================================
// v8.9.15: DOCUMENTOS DEL PROYECTO (Incidentes + Entregas)
// ============================================================
export async function listarDocumentosProyecto(proyectoId = null) {
  let q = supabase.from('documentos_proyecto').select('*').order('fecha', { ascending: false });
  if (proyectoId) q = q.eq('proyecto_id', proyectoId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(d => ({
    id: d.id,
    proyectoId: d.proyecto_id,
    tipo: d.tipo,
    codigo: d.codigo,
    consecutivo: Number(d.consecutivo),
    fecha: d.fecha,
    areaId: d.area_id || null,
    titulo: d.titulo || '',
    descripcion: d.descripcion || '',
    severidad: d.severidad || null,
    fotos: d.fotos || [],
    m2Entregados: d.m2_entregados !== null ? Number(d.m2_entregados) : null,
    porcentajeAvance: d.porcentaje_avance !== null ? Number(d.porcentaje_avance) : null,
    firmaClienteNombre: d.firma_cliente_nombre || '',
    firmaClienteCedula: d.firma_cliente_cedula || '',
    firmaClienteFecha: d.firma_cliente_fecha || null,
    firmaClienteObservaciones: d.firma_cliente_observaciones || '',
    enviadoAlCliente: !!d.enviado_al_cliente,
    enviadoAt: d.enviado_at || null,
    enviadoPorId: d.enviado_por_id || null,
    enviadoAEmails: d.enviado_a_emails || '',
    creadoPorId: d.creado_por_id,
    creadoPorNombre: d.creado_por_nombre || '',
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));
}

// Calcula el siguiente consecutivo para un proyecto + tipo
export async function siguienteConsecutivoDocumento(proyectoId, tipo) {
  const { data, error } = await supabase.from('documentos_proyecto')
    .select('consecutivo')
    .eq('proyecto_id', proyectoId)
    .eq('tipo', tipo)
    .order('consecutivo', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? Number(data[0].consecutivo) + 1 : 1;
}

export async function crearDocumentoProyecto(d) {
  const { error } = await supabase.from('documentos_proyecto').insert({
    id: d.id,
    proyecto_id: d.proyectoId,
    tipo: d.tipo,
    codigo: d.codigo,
    consecutivo: d.consecutivo,
    fecha: d.fecha,
    area_id: d.areaId || null,
    titulo: d.titulo || null,
    descripcion: d.descripcion || null,
    severidad: d.severidad || null,
    fotos: d.fotos || [],
    m2_entregados: d.m2Entregados ?? null,
    porcentaje_avance: d.porcentajeAvance ?? null,
    firma_cliente_nombre: d.firmaClienteNombre || null,
    firma_cliente_cedula: d.firmaClienteCedula || null,
    firma_cliente_fecha: d.firmaClienteFecha || null,
    firma_cliente_observaciones: d.firmaClienteObservaciones || null,
    creado_por_id: d.creadoPorId,
    creado_por_nombre: d.creadoPorNombre || null,
  });
  if (error) throw error;
}

export async function actualizarDocumentoProyecto(d) {
  const { error } = await supabase.from('documentos_proyecto').update({
    titulo: d.titulo || null,
    descripcion: d.descripcion || null,
    severidad: d.severidad || null,
    fotos: d.fotos || [],
    m2_entregados: d.m2Entregados ?? null,
    porcentaje_avance: d.porcentajeAvance ?? null,
    firma_cliente_nombre: d.firmaClienteNombre || null,
    firma_cliente_cedula: d.firmaClienteCedula || null,
    firma_cliente_fecha: d.firmaClienteFecha || null,
    firma_cliente_observaciones: d.firmaClienteObservaciones || null,
    updated_at: new Date().toISOString(),
  }).eq('id', d.id);
  if (error) throw error;
}

export async function marcarDocumentoEnviado(docId, usuarioId, emails) {
  const { error } = await supabase.from('documentos_proyecto').update({
    enviado_al_cliente: true,
    enviado_at: new Date().toISOString(),
    enviado_por_id: usuarioId,
    enviado_a_emails: emails,
  }).eq('id', docId);
  if (error) throw error;
}

export async function eliminarDocumentoProyecto(docId) {
  const { error } = await supabase.from('documentos_proyecto').delete().eq('id', docId);
  if (error) throw error;
}

// Subir foto de documento a Storage
export async function subirFotoDocumento(dataUrl, proyectoId, docId, index) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${proyectoId}/${docId}/${index}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('documentos-fotos').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('documentos-fotos').getPublicUrl(path);
  return data.publicUrl;
}

// Subir audio de foto
export async function subirAudioFotoDocumento(blob, proyectoId, docId, fotoIndex) {
  const path = `${proyectoId}/${docId}/audio-${fotoIndex}-${Date.now()}.webm`;
  const { error } = await supabase.storage.from('documentos-fotos').upload(path, blob, {
    contentType: 'audio/webm',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('documentos-fotos').getPublicUrl(path);
  return data.publicUrl;
}

// ============================================================
// v8.9.22: WebAuthn / Biometría
// ============================================================
export async function listarCredencialesPersona(personaId) {
  const { data, error } = await supabase.from('webauthn_credentials')
    .select('*')
    .eq('persona_id', personaId)
    .eq('revocado', false)
    .order('created_at', { ascending: false });
  if (error) { console.warn('webauthn no disponible:', error.message); return []; }
  return (data || []).map(c => ({
    id: c.id,
    personaId: c.persona_id,
    credentialId: c.credential_id,
    publicKey: c.public_key,
    counter: Number(c.counter || 0),
    deviceName: c.device_name || '',
    deviceType: c.device_type || 'other',
    transports: c.transports ? JSON.parse(c.transports) : [],
    createdAt: c.created_at,
    lastUsedAt: c.last_used_at,
  }));
}

export async function todasCredenciales() {
  const { data, error } = await supabase.from('webauthn_credentials')
    .select('*')
    .eq('revocado', false);
  if (error) return [];
  return data || [];
}

export async function guardarCredencial(cred) {
  const { error } = await supabase.from('webauthn_credentials').insert({
    id: cred.id,
    persona_id: cred.personaId,
    credential_id: cred.credentialId,
    public_key: cred.publicKey,
    counter: cred.counter || 0,
    device_name: cred.deviceName || null,
    device_type: cred.deviceType || 'other',
    transports: cred.transports ? JSON.stringify(cred.transports) : null,
  });
  if (error) throw error;
}

export async function actualizarContadorCredencial(credentialId, nuevoContador) {
  const { error } = await supabase.from('webauthn_credentials').update({
    counter: nuevoContador,
    last_used_at: new Date().toISOString(),
  }).eq('credential_id', credentialId);
  if (error) throw error;
}

export async function revocarCredencial(id) {
  const { error } = await supabase.from('webauthn_credentials').update({
    revocado: true,
  }).eq('id', id);
  if (error) throw error;
}

export async function buscarCredencialPorId(credentialId) {
  const { data, error } = await supabase.from('webauthn_credentials')
    .select('*')
    .eq('credential_id', credentialId)
    .eq('revocado', false)
    .maybeSingle();
  if (error) return null;
  return data;
}

// Si existe algún credential activo, la persona tiene Face ID habilitado
export async function personaTieneBiometria(personaId) {
  const { data, error } = await supabase.from('webauthn_credentials')
    .select('id')
    .eq('persona_id', personaId)
    .eq('revocado', false)
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

// ============================================================
// v8.9.23: Planificación estratégica
// ============================================================

// --- CATEGORÍAS DE SISTEMAS ---
export async function listarCategorias() {
  const { data, error } = await supabase.from('categorias_sistemas').select('*').order('orden');
  if (error) { console.warn('categorias no disponibles:', error.message); return []; }
  return (data || []).map(c => ({ id: c.id, nombre: c.nombre, icono: c.icono || '📂', orden: c.orden || 0 }));
}
export async function guardarCategoria(cat) {
  const payload = { id: cat.id, nombre: cat.nombre, icono: cat.icono || '📂', orden: cat.orden || 0 };
  const { error } = await supabase.from('categorias_sistemas').upsert(payload);
  if (error) throw error;
}
export async function eliminarCategoria(id) {
  const { error } = await supabase.from('categorias_sistemas').delete().eq('id', id);
  if (error) throw error;
}

// --- CAPACIDADES (persona_categorias) ---
export async function listarCapacidades() {
  const { data, error } = await supabase.from('persona_categorias').select('*');
  if (error) return [];
  return (data || []).map(x => ({ id: x.id, personaId: x.persona_id, categoriaId: x.categoria_id }));
}
export async function asignarCapacidad(personaId, categoriaId) {
  const id = 'pc_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('persona_categorias').insert({
    id, persona_id: personaId, categoria_id: categoriaId,
  });
  if (error && !error.message.includes('duplicate')) throw error;
}
export async function quitarCapacidad(personaId, categoriaId) {
  const { error } = await supabase.from('persona_categorias').delete()
    .eq('persona_id', personaId).eq('categoria_id', categoriaId);
  if (error) throw error;
}

// --- AUSENCIAS ---
export async function listarAusencias() {
  const { data, error } = await supabase.from('ausencias').select('*').order('fecha_desde', { ascending: false });
  if (error) return [];
  return (data || []).map(a => ({
    id: a.id, personaId: a.persona_id,
    fechaDesde: a.fecha_desde, fechaHasta: a.fecha_hasta,
    motivo: a.motivo || 'trabajo_externo', nota: a.nota || '',
    creadoPorId: a.creado_por_id,
  }));
}
export async function crearAusencia(a) {
  const id = 'aus_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('ausencias').insert({
    id, persona_id: a.personaId, fecha_desde: a.fechaDesde, fecha_hasta: a.fechaHasta,
    motivo: a.motivo || 'trabajo_externo', nota: a.nota || null,
    creado_por_id: a.creadoPorId || null,
  });
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: a.creadoPorId || ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'ausencia.creada',
    recursoTipo: 'ausencia', recursoId: id,
    datosDespues: { personaId: a.personaId, fechaDesde: a.fechaDesde, fechaHasta: a.fechaHasta, motivo: a.motivo },
    severidad: 'info',
  });
  return id;
}
export async function actualizarAusencia(id, campos) {
  const payload = {};
  if (campos.fechaDesde !== undefined) payload.fecha_desde = campos.fechaDesde;
  if (campos.fechaHasta !== undefined) payload.fecha_hasta = campos.fechaHasta;
  if (campos.motivo !== undefined) payload.motivo = campos.motivo;
  if (campos.nota !== undefined) payload.nota = campos.nota;
  const { error } = await supabase.from('ausencias').update(payload).eq('id', id);
  if (error) throw error;
}
export async function eliminarAusencia(id) {
  const { data: antes } = await supabase.from('ausencias').select('*').eq('id', id).single();
  const { error } = await supabase.from('ausencias').delete().eq('id', id);
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'ausencia.eliminada',
    recursoTipo: 'ausencia', recursoId: id,
    datosAntes: antes, severidad: 'warning',
  });
}

// --- EQUIPOS / MAQUINARIA ---
export async function listarEquipos() {
  const { data, error } = await supabase.from('equipos_maquinaria').select('*').eq('archivado', false).order('nombre');
  if (error) return [];
  return (data || []).map(e => ({
    id: e.id, nombre: e.nombre, cantidadTotal: e.cantidad_total || 1,
    categoriaId: e.categoria_id, notas: e.notas || '',
  }));
}
export async function guardarEquipo(eq) {
  const id = eq.id || 'eq_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('equipos_maquinaria').upsert({
    id, nombre: eq.nombre, cantidad_total: eq.cantidadTotal || 1,
    categoria_id: eq.categoriaId || null, notas: eq.notas || null,
  });
  if (error) throw error;
  return id;
}
export async function archivarEquipo(id) {
  const { error } = await supabase.from('equipos_maquinaria').update({ archivado: true }).eq('id', id);
  if (error) throw error;
}
export async function listarEquipoAsignaciones() {
  const { data, error } = await supabase.from('equipo_asignaciones').select('*');
  if (error) return [];
  return (data || []).map(x => ({
    id: x.id, equipoId: x.equipo_id, proyectoId: x.proyecto_id, areaId: x.area_id,
    fechaDesde: x.fecha_desde, fechaHasta: x.fecha_hasta,
  }));
}
export async function asignarEquipo(asig) {
  const id = 'ea_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('equipo_asignaciones').insert({
    id, equipo_id: asig.equipoId, proyecto_id: asig.proyectoId, area_id: asig.areaId || null,
    fecha_desde: asig.fechaDesde, fecha_hasta: asig.fechaHasta || null,
  });
  if (error) throw error;
  return id;
}
export async function liberarEquipoAsignacion(id) {
  const { error } = await supabase.from('equipo_asignaciones').delete().eq('id', id);
  if (error) throw error;
}

// --- ESTADOS DE ÁREA ---
export async function listarEstadosArea() {
  const { data, error } = await supabase.from('area_estados').select('*');
  if (error) return [];
  return (data || []).map(a => ({
    id: a.id, proyectoId: a.proyecto_id, areaId: a.area_id,
    estado: a.estado, fechaEstimadaDisponible: a.fecha_estimada_disponible,
    fechaInicioReal: a.fecha_inicio_real, fechaFinEstimada: a.fecha_fin_estimada,
    maestroAsignadoId: a.maestro_asignado_id, notasCliente: a.notas_cliente || '',
    actualizadoPorId: a.actualizado_por_id, updatedAt: a.updated_at,
  }));
}
export async function actualizarEstadoArea(proyectoId, areaId, campos) {
  const existente = await supabase.from('area_estados').select('*')
    .eq('proyecto_id', proyectoId).eq('area_id', areaId).maybeSingle();

  const payload = {
    proyecto_id: proyectoId, area_id: areaId,
    estado: campos.estado,
    fecha_estimada_disponible: campos.fechaEstimadaDisponible || null,
    fecha_inicio_real: campos.fechaInicioReal || null,
    fecha_fin_estimada: campos.fechaFinEstimada || null,
    maestro_asignado_id: campos.maestroAsignadoId || null,
    notas_cliente: campos.notasCliente || null,
    actualizado_por_id: campos.actualizadoPorId || null,
    updated_at: new Date().toISOString(),
  };

  if (existente.data) {
    payload.id = existente.data.id;
  } else {
    payload.id = 'ae_' + Date.now() + Math.random().toString(36).slice(2, 7);
  }

  const { error } = await supabase.from('area_estados').upsert(payload);
  if (error) throw error;

  // v8.9.25: audit
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: campos.actualizadoPorId || ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'area.estado_cambiado',
    recursoTipo: 'area', recursoId: areaId,
    datosAntes: existente.data ? { estado: existente.data.estado, maestroAsignadoId: existente.data.maestro_asignado_id } : null,
    datosDespues: { estado: campos.estado, maestroAsignadoId: campos.maestroAsignadoId },
    metadata: { proyectoId },
    severidad: 'info',
  });
}

// --- TIPOS DE CREDENCIALES ---
export async function listarTiposCredenciales() {
  const { data, error } = await supabase.from('tipos_credenciales').select('*').order('nombre');
  if (error) return [];
  return (data || []).map(t => ({
    id: t.id, nombre: t.nombre, descripcion: t.descripcion || '',
    icono: t.icono || '🔖', tieneVencimiento: t.tiene_vencimiento !== false,
  }));
}
export async function guardarTipoCredencial(t) {
  const id = t.id || 'tc_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('tipos_credenciales').upsert({
    id, nombre: t.nombre, descripcion: t.descripcion || null,
    icono: t.icono || '🔖', tiene_vencimiento: t.tieneVencimiento !== false,
  });
  if (error) throw error;
  return id;
}
export async function eliminarTipoCredencial(id) {
  const { error } = await supabase.from('tipos_credenciales').delete().eq('id', id);
  if (error) throw error;
}

// --- CREDENCIALES DE PERSONAS ---
export async function listarCredenciales() {
  const { data, error } = await supabase.from('credenciales').select('*').eq('activa', true);
  if (error) return [];
  return (data || []).map(c => ({
    id: c.id, personaId: c.persona_id, tipoCredencialId: c.tipo_credencial_id,
    numero: c.numero || '', fechaEmision: c.fecha_emision, fechaVencimiento: c.fecha_vencimiento,
    activa: c.activa, notas: c.notas || '',
  }));
}
export async function guardarCredencialPersona(c) {
  const id = c.id || 'cr_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const esNueva = !c.id;
  const { error } = await supabase.from('credenciales').upsert({
    id, persona_id: c.personaId, tipo_credencial_id: c.tipoCredencialId,
    numero: c.numero || null, fecha_emision: c.fechaEmision || null,
    fecha_vencimiento: c.fechaVencimiento || null, activa: c.activa !== false,
    notas: c.notas || null,
  });
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: esNueva ? 'credencial.registrada' : 'credencial.editada',
    recursoTipo: 'credencial', recursoId: id,
    datosDespues: { personaId: c.personaId, tipoCredencialId: c.tipoCredencialId, fechaVencimiento: c.fechaVencimiento },
    severidad: 'warning',
  });
  return id;
}
export async function revocarCredencialPersona(id) {
  const { data: antes } = await supabase.from('credenciales').select('*').eq('id', id).single();
  const { error } = await supabase.from('credenciales').update({ activa: false }).eq('id', id);
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId, usuarioNombre: ctx.usuarioNombre,
    accion: 'credencial.revocada',
    recursoTipo: 'credencial', recursoId: id,
    datosAntes: antes,
    severidad: 'critical',
  });
}

// --- REQUISITOS POR CLIENTE ---
export async function listarClienteRequisitos() {
  const { data, error } = await supabase.from('cliente_requisitos').select('*');
  if (error) return [];
  return (data || []).map(r => ({
    id: r.id, clienteId: r.cliente_id, tipoCredencialId: r.tipo_credencial_id,
    obligatorio: r.obligatorio !== false, nota: r.nota || '',
  }));
}
export async function agregarClienteRequisito(r) {
  const id = 'crq_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('cliente_requisitos').insert({
    id, cliente_id: r.clienteId, tipo_credencial_id: r.tipoCredencialId,
    obligatorio: r.obligatorio !== false, nota: r.nota || null,
  });
  if (error && !error.message.includes('duplicate')) throw error;
}
export async function quitarClienteRequisito(clienteId, tipoCredencialId) {
  const { error } = await supabase.from('cliente_requisitos').delete()
    .eq('cliente_id', clienteId).eq('tipo_credencial_id', tipoCredencialId);
  if (error) throw error;
}

// --- REQUISITOS POR UBICACIÓN ---
export async function listarUbicacionRequisitos() {
  const { data, error } = await supabase.from('ubicacion_requisitos').select('*');
  if (error) return [];
  return (data || []).map(r => ({
    id: r.id, nombreUbicacion: r.nombre_ubicacion, patronDireccion: r.patron_direccion || '',
    tipoCredencialId: r.tipo_credencial_id, obligatorio: r.obligatorio !== false,
    nota: r.nota || '',
  }));
}
export async function guardarUbicacionRequisito(r) {
  const id = r.id || 'urq_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('ubicacion_requisitos').upsert({
    id, nombre_ubicacion: r.nombreUbicacion, patron_direccion: r.patronDireccion || null,
    tipo_credencial_id: r.tipoCredencialId, obligatorio: r.obligatorio !== false,
    nota: r.nota || null,
  });
  if (error) throw error;
  return id;
}
export async function eliminarUbicacionRequisito(id) {
  const { error } = await supabase.from('ubicacion_requisitos').delete().eq('id', id);
  if (error) throw error;
}

// --- AUTORIZACIONES TEMPORALES ---
export async function listarAutorizaciones() {
  const { data, error } = await supabase.from('autorizaciones_temporales').select('*').order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map(a => ({
    id: a.id, personaId: a.persona_id, clienteId: a.cliente_id, proyectoId: a.proyecto_id,
    tipoCredencialId: a.tipo_credencial_id, estado: a.estado,
    fechaDesde: a.fecha_desde, fechaHasta: a.fecha_hasta,
    notas: a.notas || '', solicitadoPorId: a.solicitado_por_id,
    createdAt: a.created_at, updatedAt: a.updated_at,
  }));
}
export async function crearAutorizacion(a) {
  const id = 'aut_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('autorizaciones_temporales').insert({
    id, persona_id: a.personaId, cliente_id: a.clienteId || null, proyecto_id: a.proyectoId || null,
    tipo_credencial_id: a.tipoCredencialId, estado: a.estado || 'solicitada',
    fecha_desde: a.fechaDesde, fecha_hasta: a.fechaHasta,
    notas: a.notas || null, solicitado_por_id: a.solicitadoPorId || null,
  });
  if (error) throw error;
  return id;
}
export async function actualizarAutorizacion(id, campos) {
  const payload = { updated_at: new Date().toISOString() };
  if (campos.estado !== undefined) payload.estado = campos.estado;
  if (campos.fechaDesde !== undefined) payload.fecha_desde = campos.fechaDesde;
  if (campos.fechaHasta !== undefined) payload.fecha_hasta = campos.fechaHasta;
  if (campos.notas !== undefined) payload.notas = campos.notas;
  const { error } = await supabase.from('autorizaciones_temporales').update(payload).eq('id', id);
  if (error) throw error;
}

// --- BRIGADAS PREFERENTES ---
export async function listarBrigadasPreferentes() {
  const { data, error } = await supabase.from('brigadas_preferentes').select('*').eq('activa', true).order('prioridad');
  if (error) return [];
  return (data || []).map(b => ({
    id: b.id, clienteId: b.cliente_id, ubicacionPatron: b.ubicacion_patron,
    personaId: b.persona_id, rolEnBrigada: b.rol_en_brigada || 'miembro',
    prioridad: b.prioridad || 1, activa: b.activa !== false, nota: b.nota || '',
  }));
}
export async function guardarBrigadaPreferente(b) {
  const id = b.id || 'bp_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('brigadas_preferentes').upsert({
    id, cliente_id: b.clienteId || null, ubicacion_patron: b.ubicacionPatron || null,
    persona_id: b.personaId, rol_en_brigada: b.rolEnBrigada || 'miembro',
    prioridad: b.prioridad || 1, activa: b.activa !== false, nota: b.nota || null,
  });
  if (error) throw error;
  return id;
}
export async function quitarBrigadaPreferente(id) {
  const { error } = await supabase.from('brigadas_preferentes').update({ activa: false }).eq('id', id);
  if (error) throw error;
}

// ============================================================
// v8.9.25: Audit Log
// ============================================================

// Helper central para registrar eventos
export async function registrarAudit(evento) {
  try {
    const id = 'al_' + Date.now() + Math.random().toString(36).slice(2, 7);
    const payload = {
      id,
      timestamp: new Date().toISOString(),
      usuario_id: evento.usuarioId || null,
      usuario_nombre: evento.usuarioNombre || null,
      accion: evento.accion,
      recurso_tipo: evento.recursoTipo || null,
      recurso_id: evento.recursoId || null,
      recurso_nombre: evento.recursoNombre || null,
      datos_antes: evento.datosAntes ? JSON.parse(JSON.stringify(evento.datosAntes)) : null,
      datos_despues: evento.datosDespues ? JSON.parse(JSON.stringify(evento.datosDespues)) : null,
      metadata: evento.metadata ? JSON.parse(JSON.stringify(evento.metadata)) : null,
      severidad: evento.severidad || 'info',
    };
    // Fire and forget - no esperamos ni bloqueamos la UI si falla
    supabase.from('audit_logs').insert(payload).then(({ error }) => {
      if (error) console.warn('Audit log fallo:', error.message);
    });
  } catch (e) {
    console.warn('Error registrando audit:', e.message);
  }
}

// Consultar logs con filtros
export async function consultarAuditLogs({ desde, hasta, usuarioId, accion, recursoTipo, severidad, limite = 200 } = {}) {
  let query = supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(limite);
  if (desde) query = query.gte('timestamp', desde);
  if (hasta) query = query.lte('timestamp', hasta);
  if (usuarioId) query = query.eq('usuario_id', usuarioId);
  if (accion) query = query.eq('accion', accion);
  if (recursoTipo) query = query.eq('recurso_tipo', recursoTipo);
  if (severidad) query = query.eq('severidad', severidad);

  const { data, error } = await query;
  if (error) { console.warn('consultarAuditLogs:', error.message); return []; }
  return (data || []).map(l => ({
    id: l.id,
    timestamp: l.timestamp,
    usuarioId: l.usuario_id,
    usuarioNombre: l.usuario_nombre,
    accion: l.accion,
    recursoTipo: l.recurso_tipo,
    recursoId: l.recurso_id,
    recursoNombre: l.recurso_nombre,
    datosAntes: l.datos_antes,
    datosDespues: l.datos_despues,
    metadata: l.metadata,
    severidad: l.severidad || 'info',
  }));
}

// Listar acciones distintas (para llenar dropdowns de filtros)
export async function listarAccionesAudit() {
  const { data, error } = await supabase.from('audit_logs').select('accion').limit(1000);
  if (error) return [];
  const unicas = [...new Set((data || []).map(r => r.accion))].sort();
  return unicas;
}

// Purga de logs viejos (ejecutar manual o cron)
export async function purgarAuditLogsAntiguos(diasRetencion = 365) {
  const limite = new Date();
  limite.setDate(limite.getDate() - diasRetencion);
  const { error, count } = await supabase.from('audit_logs').delete({ count: 'exact' }).lt('timestamp', limite.toISOString());
  if (error) throw error;
  return count || 0;
}

// ============================================================
// v8.9.26: Asignaciones de personal a proyectos (Gantt)
// ============================================================
export async function listarAsignaciones({ personaId, proyectoId, desde, hasta } = {}) {
  let query = supabase.from('asignaciones_personal').select('*').order('fecha_desde', { ascending: true });
  if (personaId) query = query.eq('persona_id', personaId);
  if (proyectoId) query = query.eq('proyecto_id', proyectoId);
  if (desde) query = query.gte('fecha_hasta', desde);  // asignaciones que terminan después o en "desde"
  if (hasta) query = query.lte('fecha_desde', hasta);  // que empiezan antes o en "hasta"
  const { data, error } = await query;
  if (error) { console.warn('listarAsignaciones:', error.message); return []; }
  return (data || []).map(a => ({
    id: a.id,
    personaId: a.persona_id,
    proyectoId: a.proyecto_id,
    areaId: a.area_id || null,
    fechaDesde: a.fecha_desde,
    fechaHasta: a.fecha_hasta,
    rol: a.rol || 'maestro',
    estado: a.estado || 'planificada',
    notas: a.notas || '',
    creadoPorId: a.creado_por_id,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  }));
}

export async function crearAsignacion(a) {
  const id = 'asig_' + Date.now() + Math.random().toString(36).slice(2, 7);
  const { error } = await supabase.from('asignaciones_personal').insert({
    id,
    persona_id: a.personaId,
    proyecto_id: a.proyectoId,
    area_id: a.areaId || null,
    fecha_desde: a.fechaDesde,
    fecha_hasta: a.fechaHasta,
    rol: a.rol || 'maestro',
    estado: a.estado || 'planificada',
    notas: a.notas || null,
    creado_por_id: a.creadoPorId || null,
  });
  if (error) throw error;

  // Audit
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: a.creadoPorId || ctx.usuarioId,
    usuarioNombre: ctx.usuarioNombre,
    accion: 'asignacion.creada',
    recursoTipo: 'asignacion',
    recursoId: id,
    datosDespues: { personaId: a.personaId, proyectoId: a.proyectoId, fechaDesde: a.fechaDesde, fechaHasta: a.fechaHasta, rol: a.rol },
    severidad: 'info',
  });
  return id;
}

export async function actualizarAsignacion(id, campos) {
  const { data: antes } = await supabase.from('asignaciones_personal').select('*').eq('id', id).single();
  const payload = {};
  if (campos.personaId !== undefined) payload.persona_id = campos.personaId;
  if (campos.proyectoId !== undefined) payload.proyecto_id = campos.proyectoId;
  if (campos.areaId !== undefined) payload.area_id = campos.areaId || null;
  if (campos.fechaDesde !== undefined) payload.fecha_desde = campos.fechaDesde;
  if (campos.fechaHasta !== undefined) payload.fecha_hasta = campos.fechaHasta;
  if (campos.rol !== undefined) payload.rol = campos.rol;
  if (campos.estado !== undefined) payload.estado = campos.estado;
  if (campos.notas !== undefined) payload.notas = campos.notas || null;
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from('asignaciones_personal').update(payload).eq('id', id);
  if (error) throw error;

  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId,
    usuarioNombre: ctx.usuarioNombre,
    accion: 'asignacion.editada',
    recursoTipo: 'asignacion',
    recursoId: id,
    datosAntes: antes,
    datosDespues: campos,
    severidad: 'info',
  });
}

export async function eliminarAsignacion(id) {
  const { data: antes } = await supabase.from('asignaciones_personal').select('*').eq('id', id).single();
  const { error } = await supabase.from('asignaciones_personal').delete().eq('id', id);
  if (error) throw error;
  const ctx = getAuditContext();
  registrarAudit({
    usuarioId: ctx.usuarioId,
    usuarioNombre: ctx.usuarioNombre,
    accion: 'asignacion.eliminada',
    recursoTipo: 'asignacion',
    recursoId: id,
    datosAntes: antes,
    severidad: 'warning',
  });
}

// Detectar conflictos: otras asignaciones que solapen fechas
export async function detectarConflictosAsignacion(personaId, fechaDesde, fechaHasta, excluirId = null) {
  let query = supabase.from('asignaciones_personal').select('*')
    .eq('persona_id', personaId)
    .neq('estado', 'cancelada')
    .lte('fecha_desde', fechaHasta)
    .gte('fecha_hasta', fechaDesde);
  if (excluirId) query = query.neq('id', excluirId);
  const { data } = await query;
  return data || [];
}
