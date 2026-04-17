import { supabase } from './supabase';

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
      // Fotos: guardamos inline porque así podemos mostrar miniaturas directo (comprimidas 400px).
      foto2x2: p.foto_2x2 || '',
      cedulaFrente: p.cedula_frente || '',
      cedulaReverso: p.cedula_reverso || '',
      modoPago: p.modo_pago || 'dia',
      tarifaM2: p.tarifa_m2 !== null ? Number(p.tarifa_m2) : null,
      tarifaDia: p.tarifa_dia !== null ? Number(p.tarifa_dia) : null,
    }));

    const sistemas = {};
    (sistemasRes.data || []).forEach(s => { sistemas[s.id] = s.data; });

    const proyectos = (proyectosRes.data || []).map(p => ({
      id: p.id, nombre: p.nombre, cliente: p.cliente,
      referenciaOdoo: p.referencia_odoo, referenciaProyecto: p.referencia_proyecto,
      sistema: p.sistema_id, supervisorId: p.supervisor_id, maestroId: p.maestro_id,
      ayudantesIds: p.ayudantes_ids || [], fecha_inicio: p.fecha_inicio, fecha_entrega: p.fecha_entrega,
      areas: p.areas || [], dieta: p.dieta || { habilitada: false },
      ubicacionLat: p.ubicacion_lat !== null ? Number(p.ubicacion_lat) : null,
      ubicacionLng: p.ubicacion_lng !== null ? Number(p.ubicacion_lng) : null,
      ubicacionRadioM: p.ubicacion_radio_m || 1000,
      ubicacionDireccion: p.ubicacion_direccion || '',
      estado: p.estado || 'en_ejecucion',
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
    }));

    const reportes = (reportesRes.data || []).map(r => ({
      id: r.id, proyectoId: r.proyecto_id, areaId: r.area_id, tareaId: r.tarea_id,
      fecha: r.fecha,
      m2: r.m2 !== null ? Number(r.m2) : undefined,
      rollos: r.rollos !== null ? Number(r.rollos) : undefined,
      cubetas: r.cubetas !== null ? Number(r.cubetas) : undefined,
      nota: r.nota, supervisor: r.supervisor, supervisorId: r.supervisor_id,
    }));

    const envios = (enviosRes.data || []).map(e => ({
      id: e.id, proyectoId: e.proyecto_id, materialId: e.material_id,
      cantidad: Number(e.cantidad), fecha: e.fecha, pdfRef: e.pdf_ref,
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
  const { error } = await supabase.from('proyectos').insert({
    id: proy.id, nombre: proy.nombre, cliente: proy.cliente,
    referencia_odoo: proy.referenciaOdoo, referencia_proyecto: proy.referenciaProyecto,
    sistema_id: proy.sistema, supervisor_id: proy.supervisorId, maestro_id: proy.maestroId,
    ayudantes_ids: proy.ayudantesIds || [],
    fecha_inicio: proy.fecha_inicio, fecha_entrega: proy.fecha_entrega,
    areas: proy.areas || [], dieta: proy.dieta || { habilitada: false },
    ubicacion_lat: proy.ubicacionLat ?? null,
    ubicacion_lng: proy.ubicacionLng ?? null,
    ubicacion_radio_m: proy.ubicacionRadioM ?? 1000,
    ubicacion_direccion: proy.ubicacionDireccion ?? '',
    estado: proy.estado || 'en_ejecucion',
    fecha_cubicacion: proy.fechaCubicacion ?? null,
    contacto_cliente_nombre: proy.contactoClienteNombre ?? '',
    contacto_cliente_telefono: proy.contactoClienteTelefono ?? '',
    contacto_cliente_email: proy.contactoClienteEmail ?? '',
  });
  if (error) throw error;
}

export async function actualizarProyecto(proy) {
  const { error } = await supabase.from('proyectos').update({
    nombre: proy.nombre, cliente: proy.cliente,
    referencia_odoo: proy.referenciaOdoo, referencia_proyecto: proy.referenciaProyecto,
    sistema_id: proy.sistema, supervisor_id: proy.supervisorId, maestro_id: proy.maestroId,
    ayudantes_ids: proy.ayudantesIds || [],
    fecha_inicio: proy.fecha_inicio, fecha_entrega: proy.fecha_entrega,
    areas: proy.areas || [], dieta: proy.dieta || { habilitada: false },
    ubicacion_lat: proy.ubicacionLat ?? null,
    ubicacion_lng: proy.ubicacionLng ?? null,
    ubicacion_radio_m: proy.ubicacionRadioM ?? 1000,
    ubicacion_direccion: proy.ubicacionDireccion ?? '',
    updated_at: new Date().toISOString(),
  }).eq('id', proy.id);
  if (error) throw error;
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
  });
  if (error) throw error;
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
  });
  if (error) throw error;
}

export async function crearEnviosLote(envios) {
  const rows = envios.map(e => ({
    id: e.id, proyecto_id: e.proyectoId, material_id: e.materialId,
    cantidad: e.cantidad, fecha: e.fecha, pdf_ref: e.pdfRef || null,
  }));
  const { error } = await supabase.from('envios').insert(rows);
  if (error) throw error;
}

// ============================================================
// PERSONAL
// ============================================================
export async function reemplazarPersonal(nuevoPersonal) {
  const { data: actuales } = await supabase.from('personal').select('id');
  const idsActuales = new Set((actuales || []).map(p => p.id));
  const idsNuevos = new Set(nuevoPersonal.map(p => p.id));

  const aEliminar = [...idsActuales].filter(id => !idsNuevos.has(id));
  if (aEliminar.length > 0) {
    await supabase.from('personal').delete().in('id', aEliminar);
  }

  // Upsert solo actualiza campos mandados; no borra foto_2x2, cedula, etc.
  const rows = nuevoPersonal.map(p => ({
    id: p.id, nombre: p.nombre, pin: p.pin || null,
    roles: p.roles || [], maestro_id: p.maestroId || null,
  }));
  const { error } = await supabase.from('personal').upsert(rows);
  if (error) throw error;
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
}

export async function completarTarea(tareaId, usuarioId) {
  const { error } = await supabase.from('tareas').update({
    completada: true, completada_at: new Date().toISOString(), completada_por_id: usuarioId,
  }).eq('id', tareaId);
  if (error) throw error;
}

export async function eliminarTarea(tareaId) {
  const { error } = await supabase.from('tareas').delete().eq('id', tareaId);
  if (error) throw error;
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
    montoTotal: Number(d.monto_total || 0), nota: d.nota,
  }));
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
