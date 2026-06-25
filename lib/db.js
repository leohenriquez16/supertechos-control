import { supabase } from './supabase';
import { normalizarTelefono, mapPersonaRow } from './helpers/personas';
import { validarFacturaFiscal } from './validacionFiscal';

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
// v8.27.8: caché de avatares (foto_2x2 base64). loadAllData NO los trae para
// aligerar el arranque; cargarAvatares() los baja en 2.º plano y quedan acá para
// mezclarlos en cada loadAllData (incl. recargas) sin volver a pedir el blob.
let _avataresCache = null;
export async function cargarAvatares() {
  try {
    const { data, error } = await supabase.from('personal').select('id, foto_2x2');
    if (error) return _avataresCache || {};
    const map = {};
    (data || []).forEach(r => { if (r.foto_2x2) map[r.id] = r.foto_2x2; });
    _avataresCache = map;
    return map;
  } catch { return _avataresCache || {}; }
}

export async function loadAllData() {
  try {
    const [personalRes, sistemasRes, proyectosRes, reportesRes, enviosRes, configRes, categoriasCajaRes] = await Promise.all([
      // Seleccionamos campos explícitos para evitar cargar blobs pesados (fotos cédula)
      // v8.17.89: `pin` se sigue trayendo (ahora es hash bcrypt) solo para que
      // mapPersonaRow derive `tienePin`. El cliente NUNCA expone el hash en UI
      // — mapPersonaRow lo descarta. Eliminarlo del SELECT requiere migración
      // a columna generada `tiene_pin` (pendiente para PR de hardening posterior).
      // v8.25.36: NO traer cedula_frente/cedula_reverso (base64 ~5MB) en la carga global.
      // v8.27.8: tampoco foto_2x2 (avatares base64 ~1.6MB) — se cargan en 2.º plano con
      // cargarAvatares() y se mezclan desde _avataresCache; aligera el arranque (clave en celular).
      supabase.from('personal').select('id, nombre, pin, roles, maestro_id, telefono, direccion, cedula_numero, fecha_ingreso, recomendado_por, email, reporte_audio_habilitado, modo_pago, tarifa_m2, tarifa_dia, caja_chica_habilitada, levantamiento_habilitado, limite_caja_chica, max_transaccion_caja_chica, pin_temporal, onboarding_completado, invitado_at, invitado_por_id, fecha_nacimiento, whatsapp, tipo_sangre, contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion, banco, banco_tipo_cuenta, banco_numero_cuenta, banco_titular_nombre, banco_titular_cedula, dieta_habilitada, hospedaje_habilitado').order('nombre'),
      supabase.from('sistemas').select('*'),
      supabase.from('proyectos').select('*').order('created_at', { ascending: false }),
      supabase.from('reportes').select('*').order('fecha', { ascending: false }),
      supabase.from('envios').select('*').order('fecha', { ascending: false }),
      supabase.from('config').select('*').eq('id', 1).single(),
      // v8.13.5: categorías de caja chica editables. Catch silencioso para que la app
      // siga funcionando si la migración aún no se aplicó.
      supabase.from('caja_chica_categorias').select('*').order('orden', { ascending: true })
        .then(r => r, () => ({ data: null })),
    ]);

    // v8.17.89: mapPersonaRow es helper compartido con los endpoints /api/auth/*.
    // Garantiza que el cliente nunca recibe el campo `pin` — solo `tienePin`.
    // v8.27.8: mezcla los avatares ya cargados en 2.º plano (si los hay) para que
    // sobrevivan a recargas sin volver a pedir el blob base64.
    const personal = (personalRes.data || []).map(r => {
      const p = mapPersonaRow(r);
      if (_avataresCache && _avataresCache[r.id]) p.foto2x2 = _avataresCache[r.id];
      return p;
    });

    const sistemas = {};
    (sistemasRes.data || []).forEach(s => { sistemas[s.id] = s.data; });

    const proyectos = (proyectosRes.data || []).filter(p => !p.archivado).map(p => ({
      id: p.id, nombre: p.nombre, cliente: p.cliente,
      referenciaOdoo: p.referencia_odoo, referenciaProyecto: p.referencia_proyecto,
      sistema: p.sistema_id, supervisorId: p.supervisor_id, maestroId: p.maestro_id,
      ayudantesIds: p.ayudantes_ids || [], fecha_inicio: p.fecha_inicio, fecha_entrega: p.fecha_entrega,
      // v8.17.59: fecha tentativa que promete el admin al cliente (distinta de fecha_inicio real)
      fechaEstimadaInicio: p.fecha_estimada_inicio || null,
      // v8.9: cada área puede tener su propio sistemaId. Si no, usa el del proyecto.
      areas: (p.areas || []).map(a => ({ ...a, sistemaId: a.sistemaId || p.sistema_id || null })),
      dieta: p.dieta || { habilitada: false }, // legacy
      dietaDiariaRd: Number(p.dieta_diaria_rd || 0),
      dietaModo: p.dieta_modo || 'manual', // 'auto' | 'manual' | 'desactivada'
      // v8.17.29: nuevos toggles a nivel proyecto (sub-tipos desayuno/comida/cena/hotel)
      aplicaDieta: !!p.aplica_dieta,
      // v8.17.41: empresa que ejecuta y factura el proyecto (Super Techos / Prouco)
      empresaEjecutora: p.empresa_ejecutora || null,
      aplicaHospedaje: !!p.aplica_hospedaje,
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
      // v8.17.63: valor que el cliente firmó en la cotización (Odoo). Inmutable salvo edición admin.
      valorCotizacion: p.valor_cotizacion !== null && p.valor_cotizacion !== undefined ? Number(p.valor_cotizacion) : null,
      // v8.17.68: cubicaciones mensuales
      facturacionPorCubicaciones: !!p.facturacion_por_cubicaciones,
      retencionPct: p.retencion_pct != null ? Number(p.retencion_pct) : null,
      proximaCubicacionFecha: p.proxima_cubicacion_fecha || null,
      anticipoMonto: p.anticipo_monto != null ? Number(p.anticipo_monto) : null,
      amortizacionPct: p.amortizacion_pct != null ? Number(p.amortizacion_pct) : null,
      numeroFactura: p.numero_factura || '',
      contactoClienteNombre: p.contacto_cliente_nombre || '',
      contactoClienteTelefono: p.contacto_cliente_telefono || '',
      contactoClienteEmail: p.contacto_cliente_email || '',
      archivado: p.archivado || false,
      modoPagoManoObra: p.modo_pago_mano_obra || 'dia',
      preciosTareasM2: p.precios_tareas_m2 || {},
      preciosManoObraTareas: p.precios_mano_obra_tareas || {},
      maestrosTareas: p.maestros_tareas || {}, // v8.26.9: maestro responsable por tarea
      paquetesPago: p.paquetes_pago || [], // v8.27.17: pago por paquete (agrupa tareas a un precio/m² y un maestro)
      precioM2FijoMaestro: Number(p.precio_m2_fijo_maestro || 0),
      productosAdicionales: p.productos_adicionales || [],
      tipoAvance: p.tipo_avance || 'tradicional',
      estructuraUnidades: p.estructura_unidades || [],
      cronogramaVisibleMaestro: p.cronograma_visible_maestro !== false,
      // v8.9.10: relaciones con clientes
      clienteId: p.cliente_id || null,
      ubicacionId: p.ubicacion_id || null, // v8.19.54
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
      // v8.19.19: toggle global "Mostrar Mi Producción" en dashboard de
      // maestros/admins. Default false hasta que el admin lo prenda.
      mostrarMiProduccionNomina: !!configRes.data.mostrar_mi_produccion_nomina,
      kanbanLevOrden: Array.isArray(configRes.data.kanban_lev_orden) ? configRes.data.kanban_lev_orden : null,
    } : { costos_indirectos_pct: 15, margen_objetivo_pct: 30, mostrarMiProduccionNomina: false, kanbanLevOrden: null };

    // v8.13.5: Categorías de caja chica (con fallback a las 7 default si la tabla aún no existe)
    const categoriasCajaChica = (categoriasCajaRes?.data || []).map(c => ({
      id: c.id, nombre: c.nombre, color: c.color, icono: c.icono || null,
      descripcion: c.descripcion || null, orden: c.orden || 0,
      activa: !!c.activa, isDefault: !!c.is_default,
      // v8.17.29: a qué partida cuenta la categoría ('dieta' | 'hospedaje' | null)
      aplicaA: c.aplica_a || null,
    }));

    // v8.27.9: estas cargas son TODAS independientes → en PARALELO (antes iban en
    // serie, ~9 viajes uno tras otro = lento en celular de alta latencia, podía
    // dispararse el timeout de la carga inicial). Cada una con su propio fallback
    // para tolerar fallas parciales (igual que antes).
    const _safe = (p, def, label) => p.catch(e => { console.warn(`${label} no cargado:`, e?.message); return def; });
    const CONFIG_DIETA_FALLBACK = { desayunoRd: 200, comidaRd: 350, cenaRd: 350, hotelRd: 900, updatedAt: null, updatedPorId: null };
    const [
      permisos, clientes, contactos, checkins, documentos, credenciales,
      configDieta, propiedadesEmpresa, categorias, capacidades, estadosArea, asignaciones,
    ] = await Promise.all([
      _safe(listarPermisos(), [], 'Permisos'),
      _safe(listarClientes(false), [], 'Clientes'),
      _safe(listarContactos(), [], 'Contactos'),
      _safe(listarCheckins(), [], 'Checkins'),
      _safe(listarDocumentosProyecto(), [], 'Documentos'),
      _safe(todasCredenciales(), [], 'Credenciales'),
      _safe(obtenerConfigDieta(), CONFIG_DIETA_FALLBACK, 'Config dieta'),
      _safe(listarPropiedadesEmpresa({ soloActivas: true }), [], 'Propiedades'),
      _safe(listarCategorias(), [], 'Categorías'),
      _safe(listarCapacidades(), [], 'Capacidades'),
      _safe(listarEstadosArea(), [], 'Estados de área'),
      _safe(listarAsignaciones(), [], 'Asignaciones'),
    ]);

    return {
      personal, sistemas, proyectos, reportes, envios, config, permisos,
      clientes, contactos, checkins, documentos, credenciales,
      categorias, capacidades,
      estadosArea,
      asignaciones, // v8.9.26
      categoriasCajaChica, // v8.13.5
      configDieta, // v8.17.29
      propiedadesEmpresa, // v8.17.49
    };
  } catch (error) {
    console.error('Error cargando datos:', error);
    throw error;
  }
}

// ============================================================
// PERFIL DE PERSONAL (v7.2)
// ============================================================

// v8.25.36: imágenes pesadas del perfil (base64) — bajo demanda al abrir el perfil,
// para no cargarlas en cada arranque del app (ver loadAllData).
export async function obtenerImagenesPersona(personaId) {
  if (!personaId) return null;
  const { data, error } = await supabase
    .from('personal')
    .select('foto_2x2, cedula_frente, cedula_reverso, carta_bancaria, buena_conducta')
    .eq('id', personaId)
    .maybeSingle();
  if (error) { console.warn('obtenerImagenesPersona:', error.message); return null; }
  if (!data) return null;
  return {
    foto2x2: data.foto_2x2 || '',
    cedulaFrente: data.cedula_frente || '',
    cedulaReverso: data.cedula_reverso || '',
    cartaBancaria: data.carta_bancaria || '',
    buenaConducta: data.buena_conducta || '',
  };
}

export async function guardarPerfil(personaId, campos) {
  const updates = {};
  if (campos.foto2x2 !== undefined) updates.foto_2x2 = campos.foto2x2;
  if (campos.cedulaNumero !== undefined) updates.cedula_numero = campos.cedulaNumero;
  if (campos.cedulaFrente !== undefined) updates.cedula_frente = campos.cedulaFrente;
  if (campos.cedulaReverso !== undefined) updates.cedula_reverso = campos.cedulaReverso;
  if (campos.cartaBancaria !== undefined) updates.carta_bancaria = campos.cartaBancaria || null;
  if (campos.buenaConducta !== undefined) updates.buena_conducta = campos.buenaConducta || null;
  if (campos.telefono !== undefined) updates.telefono = campos.telefono;
  if (campos.direccion !== undefined) updates.direccion = campos.direccion;
  if (campos.fechaIngreso !== undefined) updates.fecha_ingreso = campos.fechaIngreso || null;
  if (campos.recomendadoPor !== undefined) updates.recomendado_por = campos.recomendadoPor;
  if (campos.email !== undefined) updates.email = campos.email;
  if (campos.modoPago !== undefined) updates.modo_pago = campos.modoPago;
  if (campos.tarifaM2 !== undefined) updates.tarifa_m2 = campos.tarifaM2 || null;
  if (campos.tarifaDia !== undefined) updates.tarifa_dia = campos.tarifaDia || null;
  if (campos.levantamientoHabilitado !== undefined) updates.levantamiento_habilitado = !!campos.levantamientoHabilitado;
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
// v8.17.80: helper para chequear si ya existe un proyecto con esa referencia
// de Odoo. Devuelve el proyecto o null. Usado por crearProyecto (server-side)
// y por NuevoProyecto.jsx (client-side, antes de submit).
export async function buscarProyectoPorReferenciaOdoo(referenciaOdoo) {
  if (!referenciaOdoo || !String(referenciaOdoo).trim()) return null;
  const ref = String(referenciaOdoo).trim();
  const { data, error } = await supabase
    .from('proyectos')
    .select('id, referencia_odoo, cliente, nombre, estado, archivado')
    .eq('referencia_odoo', ref)
    .limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

export async function crearProyecto(proy) {
  // v8.17.80: bloqueo de duplicados por referencia Odoo. Server-side por si
  // el cliente saltó la validación o hay race condition entre dos pestañas.
  if (proy.referenciaOdoo && String(proy.referenciaOdoo).trim()) {
    const existente = await buscarProyectoPorReferenciaOdoo(proy.referenciaOdoo);
    if (existente) {
      const nombre = existente.cliente || existente.nombre || existente.id;
      const sufijo = existente.archivado ? ' (archivado)' : '';
      throw new Error(`Ya existe un proyecto con la referencia Odoo "${String(proy.referenciaOdoo).trim()}": ${nombre}${sufijo}. No se puede crear duplicado.`);
    }
  }
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

  // v8.10.23: la fecha de aprobación siempre es la fecha actual de creación del proyecto.
  // El frontend ya manda new Date() al crear, pero como doble seguridad forzamos hoy si no viene.
  const estadoInicial = proy.estado || 'aprobado';
  const fechaAprobacion = new Date().toISOString().split('T')[0];

  const { error } = await supabase.from('proyectos').insert({
    id: proy.id, nombre: proy.nombre, cliente: proy.cliente,
    referencia_odoo: proy.referenciaOdoo, referencia_proyecto: proy.referenciaProyecto,
    sistema_id: proy.sistema, supervisor_id: supervisorId, maestro_id: maestroId,
    ayudantes_ids: ayudantesIds,
    fecha_inicio: proy.fecha_inicio, fecha_entrega: proy.fecha_entrega,
    fecha_estimada_inicio: proy.fechaEstimadaInicio || null, // v8.17.59
    // v8.10.22: fecha de aprobación (separada de fecha_inicio)
    fecha_aprobacion: fechaAprobacion,
    // v8.17.63: valor de cotización (típicamente viene de Odoo) y cubicado final
    valor_cotizacion: proy.valorCotizacion != null ? Number(proy.valorCotizacion) : null,
    monto_final_cubicado: proy.montoFinalCubicado != null ? Number(proy.montoFinalCubicado) : null,
    // v8.9: normalizar sistemaId en cada área (si no tiene, usa el del proyecto)
    areas: (proy.areas || []).map(a => ({ ...a, sistemaId: a.sistemaId || proy.sistema || null })),
    dieta: proy.dieta || { habilitada: false },
    dieta_diaria_rd: Number(proy.dietaDiariaRd) || 0,
    dieta_modo: proy.dietaModo || 'manual',
    // v8.17.29: nuevos toggles (sub-tipos desayuno/comida/cena/hotel)
    aplica_dieta: !!proy.aplicaDieta,
    aplica_hospedaje: !!proy.aplicaHospedaje,
    // v8.17.41: empresa ejecutora (Super Techos / Prouco) — null hasta que admin la asigne
    empresa_ejecutora: proy.empresaEjecutora || null,
    ubicacion_lat: proy.ubicacionLat ?? null,
    ubicacion_lng: proy.ubicacionLng ?? null,
    ubicacion_radio_m: proy.ubicacionRadioM ?? 1000,
    ubicacion_direccion: proy.ubicacionDireccion ?? '',
    ubicacion_direccion_texto: proy.ubicacionDireccionTexto ?? '',
    google_maps_link: proy.googleMapsLink ?? '',
    estado: estadoInicial,
    fecha_cubicacion: proy.fechaCubicacion ?? null,
    contacto_cliente_nombre: proy.contactoClienteNombre ?? '',
    contacto_cliente_telefono: proy.contactoClienteTelefono ?? '',
    contacto_cliente_email: proy.contactoClienteEmail ?? '',
    modo_pago_mano_obra: proy.modoPagoManoObra || 'dia',
    precios_tareas_m2: proy.preciosTareasM2 || {},
    precios_mano_obra_tareas: proy.preciosManoObraTareas || {},
    maestros_tareas: proy.maestrosTareas || {},
    paquetes_pago: proy.paquetesPago || [],
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

  // v8.10.22: incluir fecha_aprobacion en el update
  const updates = {
    nombre: proy.nombre, cliente: proy.cliente,
    referencia_odoo: proy.referenciaOdoo, referencia_proyecto: proy.referenciaProyecto,
    sistema_id: proy.sistema, supervisor_id: supervisorId, maestro_id: maestroId,
    ayudantes_ids: ayudantesIds,
    fecha_inicio: proy.fecha_inicio, fecha_entrega: proy.fecha_entrega,
    fecha_estimada_inicio: proy.fechaEstimadaInicio || null, // v8.17.59
    // v8.9: normalizar sistemaId en cada área
    areas: (proy.areas || []).map(a => ({ ...a, sistemaId: a.sistemaId || proy.sistema || null })),
    dieta: proy.dieta || { habilitada: false },
    dieta_diaria_rd: Number(proy.dietaDiariaRd) || 0,
    dieta_modo: proy.dietaModo || 'manual',
    // v8.17.29: nuevos toggles (sub-tipos desayuno/comida/cena/hotel)
    aplica_dieta: !!proy.aplicaDieta,
    aplica_hospedaje: !!proy.aplicaHospedaje,
    // v8.17.41: empresa ejecutora (Super Techos / Prouco) — null hasta que admin la asigne
    empresa_ejecutora: proy.empresaEjecutora || null,
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
    maestros_tareas: proy.maestrosTareas || {},
    paquetes_pago: proy.paquetesPago || [],
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
  };
  // v8.10.22: solo actualizar fecha_aprobacion si vino en el payload (no la pisamos con null por accidente)
  if (proy.fechaAprobacion !== undefined) {
    updates.fecha_aprobacion = proy.fechaAprobacion || null;
  }
  // v8.17.63: valor de cotización y cubicado final. Mismo patrón "solo si vino":
  // así no los pisamos con null cuando el caller no los toca.
  if (proy.valorCotizacion !== undefined) {
    updates.valor_cotizacion = proy.valorCotizacion === '' || proy.valorCotizacion == null ? null : Number(proy.valorCotizacion);
  }
  if (proy.montoFinalCubicado !== undefined) {
    updates.monto_final_cubicado = proy.montoFinalCubicado === '' || proy.montoFinalCubicado == null ? null : Number(proy.montoFinalCubicado);
  }
  // v8.17.68: cubicaciones mensuales
  if (proy.facturacionPorCubicaciones !== undefined) {
    updates.facturacion_por_cubicaciones = !!proy.facturacionPorCubicaciones;
  }
  if (proy.retencionPct !== undefined) {
    updates.retencion_pct = proy.retencionPct === '' || proy.retencionPct == null ? null : Number(proy.retencionPct);
  }
  if (proy.proximaCubicacionFecha !== undefined) {
    updates.proxima_cubicacion_fecha = proy.proximaCubicacionFecha || null;
  }
  if (proy.anticipoMonto !== undefined) {
    updates.anticipo_monto = proy.anticipoMonto === '' || proy.anticipoMonto == null ? null : Number(proy.anticipoMonto);
  }
  if (proy.amortizacionPct !== undefined) {
    updates.amortizacion_pct = proy.amortizacionPct === '' || proy.amortizacionPct == null ? null : Number(proy.amortizacionPct);
  }

  const { error } = await supabase.from('proyectos').update(updates).eq('id', proy.id);
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

// v8.19.69: asignar/cambiar la localidad del cliente (cliente_ubicaciones) ligada a un proyecto.
export async function asignarUbicacionProyecto(proyectoId, ubicacionId) {
  const { error } = await supabase.from('proyectos')
    .update({ ubicacion_id: ubicacionId || null, updated_at: new Date().toISOString() })
    .eq('id', proyectoId);
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
  // v8.17.89: el `pin` ya NO se setea aquí. Cambiar PIN va por el endpoint
  // /api/auth/cambiar-pin (server hashea con bcrypt). Si el caller necesita
  // setear el PIN inicial de una persona nueva, debe hacerlo en un paso
  // separado tras este upsert.
  const rows = nuevoPersonal.map(p => ({
    id: p.id, nombre: p.nombre,
    roles: p.roles || [], maestro_id: p.maestroId || null,
    reporte_audio_habilitado: !!p.reporteAudioHabilitado, // v8.9.11
    caja_chica_habilitada: !!p.cajaChicaHabilitada, // v8.12
    levantamiento_habilitado: !!p.levantamientoHabilitado, // v8.19.65
    limite_caja_chica: p.limiteCajaChica != null && p.limiteCajaChica !== '' ? Number(p.limiteCajaChica) : null,
    max_transaccion_caja_chica: p.maxTransaccionCajaChica != null && p.maxTransaccionCajaChica !== '' ? Number(p.maxTransaccionCajaChica) : null,
    // v8.17.29: dieta + hospedaje a nivel persona
    dieta_habilitada: !!p.dietaHabilitada,
    hospedaje_habilitado: !!p.hospedajeHabilitado,
    // v8.19.76: datos RR.HH. (Odoo). Solo se incluyen si vienen definidos para
    // no pisar con null lo que ya exista (p. ej. tras enriquecer desde Odoo).
    ...(p.puesto !== undefined ? { puesto: p.puesto || null } : {}),
    ...(p.departamento !== undefined ? { departamento: p.departamento || null } : {}),
    ...(p.gerenteNombre !== undefined ? { gerente_nombre: p.gerenteNombre || null } : {}),
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
// v8.27.0: GOTERA — tickets de feedback / reporte de errores del ERP
// ============================================================
function ticketRowToObj(t) {
  return {
    id: t.id, tipo: t.tipo || 'error', titulo: t.titulo || '', descripcion: t.descripcion || '',
    modulo: t.modulo || '', pantalla: t.pantalla || '', impacto: t.impacto || 'media',
    estado: t.estado || 'abierto',
    reportadoPorId: t.reportado_por_id || null, reportadoPorNombre: t.reportado_por_nombre || '',
    reportadoPorRol: t.reportado_por_rol || '',
    screenshots: Array.isArray(t.screenshots) ? t.screenshots : [],
    audioUrl: t.audio_url || null, respuesta: t.respuesta || '',
    resueltoPorId: t.resuelto_por_id || null, notificarSolicitante: !!t.notificar_solicitante,
    createdAt: t.created_at, updatedAt: t.updated_at, resueltoAt: t.resuelto_at || null,
  };
}

// soloMios: lista solo los tickets reportados por usuarioId (para no-owner).
export async function listarTicketsSoporte({ soloMios = false, usuarioId = null } = {}) {
  let q = supabase.from('tickets_soporte').select('*').order('created_at', { ascending: false });
  if (soloMios && usuarioId) q = q.eq('reportado_por_id', usuarioId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(ticketRowToObj);
}

export async function crearTicketSoporte(t) {
  const id = t.id || ('tk_' + Date.now() + Math.random().toString(36).slice(2, 6));
  const row = {
    id, tipo: t.tipo || 'error', titulo: t.titulo || null, descripcion: t.descripcion || null,
    modulo: t.modulo || null, pantalla: t.pantalla || null, impacto: t.impacto || 'media',
    estado: 'abierto',
    reportado_por_id: t.reportadoPorId || null, reportado_por_nombre: t.reportadoPorNombre || null,
    reportado_por_rol: t.reportadoPorRol || null,
    screenshots: t.screenshots || [], audio_url: t.audioUrl || null,
  };
  const { data, error } = await supabase.from('tickets_soporte').insert(row).select('*').single();
  if (error) throw error;
  return ticketRowToObj(data);
}

export async function actualizarTicketSoporte(id, campos) {
  const u = { updated_at: new Date().toISOString() };
  if (campos.estado !== undefined) {
    u.estado = campos.estado;
    if (campos.estado === 'resuelto') u.resuelto_at = new Date().toISOString();
  }
  if (campos.impacto !== undefined) u.impacto = campos.impacto;
  if (campos.respuesta !== undefined) u.respuesta = campos.respuesta;
  if (campos.resueltoPorId !== undefined) u.resuelto_por_id = campos.resueltoPorId;
  if (campos.notificarSolicitante !== undefined) u.notificar_solicitante = campos.notificarSolicitante;
  const { data, error } = await supabase.from('tickets_soporte').update(u).eq('id', id).select('*').single();
  if (error) throw error;
  return ticketRowToObj(data);
}

export async function eliminarTicketSoporte(id) {
  const { error } = await supabase.from('tickets_soporte').delete().eq('id', id);
  if (error) throw error;
}

// Screenshots → bucket público soporte-adjuntos
export async function subirScreenshotSoporte(blob, ticketId, idx) {
  const path = `${ticketId}/shot-${idx}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('soporte-adjuntos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg', upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('soporte-adjuntos').getPublicUrl(path);
  return data.publicUrl;
}

// Persistir las URLs de adjuntos (screenshots/audio) tras subirlos a Storage.
export async function guardarAdjuntosTicketSoporte(id, { screenshots, audioUrl } = {}) {
  const u = { updated_at: new Date().toISOString() };
  if (screenshots !== undefined) u.screenshots = screenshots;
  if (audioUrl !== undefined) u.audio_url = audioUrl;
  const { error } = await supabase.from('tickets_soporte').update(u).eq('id', id);
  if (error) throw error;
}

// Nota de voz → bucket público soporte-adjuntos
export async function subirAudioSoporte(blob, ticketId) {
  const path = `${ticketId}/voz-${Date.now()}.webm`;
  const { error } = await supabase.storage.from('soporte-adjuntos').upload(path, blob, {
    contentType: 'audio/webm', upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('soporte-adjuntos').getPublicUrl(path);
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
  const payload = {
    costos_indirectos_pct: config.costos_indirectos_pct,
    margen_objetivo_pct: config.margen_objetivo_pct,
    updated_at: new Date().toISOString(),
  };
  // v8.19.19: solo escribimos el toggle si viene definido en el payload (así
  // guardarConfig sigue siendo retro-compatible con quien solo pase los pct).
  if (typeof config.mostrarMiProduccionNomina !== 'undefined') {
    payload.mostrar_mi_produccion_nomina = !!config.mostrarMiProduccionNomina;
  }
  const { error } = await supabase.from('config').update(payload).eq('id', 1);
  if (error) throw error;
}

// v8.25.0: orden custom de columnas del Kanban de Levantamientos.
export async function setKanbanLevOrden(orden) {
  const { error } = await supabase.from('config').update({ kanban_lev_orden: Array.isArray(orden) ? orden : null, updated_at: new Date().toISOString() }).eq('id', 1);
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

// v8.19.16: Una sola query con todas las jornadas en un rango (cualquier proyecto).
// Útil para calcular el live total del corte actual sin loopear ~60 proyectos.
export async function listarJornadasEnRango(desde, hasta) {
  const { data, error } = await supabase
    .from('jornadas')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (error) throw error;
  return (data || []).map(j => ({
    id: j.id, proyectoId: j.proyecto_id, fecha: j.fecha,
    personasPresentesIds: j.personas_presentes_ids || [],
    diaDoble: j.dia_doble || false,
    condicionDia: j.condicion_dia || 'normal',
  }));
}

// v8.9.30: Listar TODAS las jornadas abiertas (sin horaFin) - para "Personal en Obra Ahora"
export async function listarJornadasAbiertas() {
  const { data, error } = await supabase
    .from('jornadas')
    .select('*')
    .is('hora_fin', null)
    .order('hora_inicio', { ascending: false });
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

  // Auto-debitar dieta de la caja chica del maestro responsable cuando el proyecto
  // tenga dieta_modo='auto'. Idempotente: si ya hay dieta para esta jornada, no duplica.
  try {
    await aplicarDietaAutoSiCorresponde(jornadaId);
  } catch (e) {
    // No bloquea el cierre de la jornada si el debit falla. Lo loggea.
    console.warn('aplicarDietaAuto falló:', e?.message);
  }
}

// Inserta el movimiento de dieta en caja_chica_movimientos si el proyecto está en
// modo 'auto' y aún no se ha cobrado para esa fecha. Devuelve el movimiento creado o null.
export async function aplicarDietaAutoSiCorresponde(jornadaId) {
  const { data: jr } = await supabase.from('jornadas')
    .select('id, fecha, proyecto_id, personas_presentes_ids')
    .eq('id', jornadaId).single();
  if (!jr) return null;

  const { data: proy } = await supabase.from('proyectos')
    .select('id, maestro_id, dieta_diaria_rd, dieta_modo')
    .eq('id', jr.proyecto_id).single();
  if (!proy || proy.dieta_modo !== 'auto') return null;
  const monto = Number(proy.dieta_diaria_rd || 0);
  if (monto <= 0) return null;

  // Titular de la caja: el maestro principal del proyecto. Si no hay, no aplica.
  const titularId = proy.maestro_id;
  if (!titularId) return null;

  // Idempotencia: si ya existe una dieta para este proyecto + persona + fecha, no duplicar.
  const { data: existente } = await supabase.from('caja_chica_movimientos')
    .select('id').eq('persona_id', titularId).eq('proyecto_id', proy.id)
    .eq('fecha', jr.fecha).eq('tipo', 'dieta').limit(1);
  if (existente && existente.length > 0) return null;

  return await crearMovimientoCajaChica({
    personaId: titularId,
    proyectoId: proy.id,
    fecha: jr.fecha,
    tipo: 'dieta',
    monto,
    concepto: 'Dieta diaria automática',
    status: 'aprobado', // automática = pre-aprobada
    aprobadoPorId: null,
    creadoPorId: null,
  });
}

// Versión MANUAL: el maestro/admin marca "consumí dieta de hoy" desde la jornada.
// Hace lo mismo pero sin requerir modo='auto' del proyecto.
export async function registrarDietaManual({ proyectoId, fecha, personaId, creadoPorId = null }) {
  const { data: proy } = await supabase.from('proyectos')
    .select('id, dieta_diaria_rd, dieta_modo').eq('id', proyectoId).single();
  if (!proy) throw new Error('Proyecto no encontrado');
  const monto = Number(proy.dieta_diaria_rd || 0);
  if (monto <= 0) throw new Error('El proyecto no tiene dieta diaria configurada');

  const { data: existente } = await supabase.from('caja_chica_movimientos')
    .select('id').eq('persona_id', personaId).eq('proyecto_id', proy.id)
    .eq('fecha', fecha).eq('tipo', 'dieta').limit(1);
  if (existente && existente.length > 0) {
    throw new Error('Ya hay una dieta registrada para esta fecha en este proyecto');
  }

  return await crearMovimientoCajaChica({
    personaId,
    proyectoId: proy.id,
    fecha,
    tipo: 'dieta',
    monto,
    concepto: 'Dieta diaria (manual)',
    status: 'aprobado',
    creadoPorId,
  });
}

// ============================================================
// v8.17.29 — CONFIG GLOBAL DE DIETA + HOSPEDAJE
// ============================================================
// Una sola fila (id='default') con los montos en RD$ que la empresa paga
// por desayuno/comida/cena/hotel. El admin puede ajustarlos desde
// Configuración → Caja Chica. Si la tabla aún no existe (migración 012 sin
// aplicar), devolvemos defaults para que la UI no truene.
const CONFIG_DIETA_DEFAULTS = {
  desayunoRd: 200,
  comidaRd: 350,
  cenaRd: 350,
  hotelRd: 900,
};

export async function obtenerConfigDieta() {
  try {
    const { data, error } = await supabase
      .from('config_dieta')
      .select('id, desayuno_rd, comida_rd, cena_rd, hotel_rd, updated_at, updated_por_id')
      .eq('id', 'default')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ...CONFIG_DIETA_DEFAULTS, updatedAt: null, updatedPorId: null };
    return {
      desayunoRd: Number(data.desayuno_rd ?? CONFIG_DIETA_DEFAULTS.desayunoRd),
      comidaRd: Number(data.comida_rd ?? CONFIG_DIETA_DEFAULTS.comidaRd),
      cenaRd: Number(data.cena_rd ?? CONFIG_DIETA_DEFAULTS.cenaRd),
      hotelRd: Number(data.hotel_rd ?? CONFIG_DIETA_DEFAULTS.hotelRd),
      updatedAt: data.updated_at || null,
      updatedPorId: data.updated_por_id || null,
    };
  } catch (e) {
    console.warn('obtenerConfigDieta fallback a defaults:', e?.message);
    return { ...CONFIG_DIETA_DEFAULTS, updatedAt: null, updatedPorId: null };
  }
}

export async function actualizarConfigDieta({ desayunoRd, comidaRd, cenaRd, hotelRd, updatedPorId = null }) {
  const updates = {
    id: 'default',
    updated_at: new Date().toISOString(),
    updated_por_id: updatedPorId,
  };
  if (desayunoRd !== undefined) updates.desayuno_rd = Number(desayunoRd) || 0;
  if (comidaRd !== undefined) updates.comida_rd = Number(comidaRd) || 0;
  if (cenaRd !== undefined) updates.cena_rd = Number(cenaRd) || 0;
  if (hotelRd !== undefined) updates.hotel_rd = Number(hotelRd) || 0;
  const { error } = await supabase
    .from('config_dieta')
    .upsert(updates, { onConflict: 'id' });
  if (error) throw error;
  return await obtenerConfigDieta();
}

// ============================================================
// v8.17.49 — PROPIEDADES DE LA EMPRESA (apartamentos, casas)
// ============================================================
// Maestro de propiedades + log de estadías (persona × noche × propiedad).
// Usado para controlar el apartamento de Punta Cana y futuros.

const propiedadRowToObj = (p) => ({
  id: p.id,
  nombre: p.nombre,
  direccion: p.direccion || '',
  ubicacionLat: p.ubicacion_lat !== null ? Number(p.ubicacion_lat) : null,
  ubicacionLng: p.ubicacion_lng !== null ? Number(p.ubicacion_lng) : null,
  ubicacionDireccionTexto: p.ubicacion_direccion_texto || '',
  googleMapsLink: p.google_maps_link || '',
  capacidad: p.capacidad || 0,
  llaveCodigo: p.llave_codigo || '',
  notas: p.notas || '',
  activo: !!p.activo,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

const estadiaRowToObj = (e) => ({
  id: e.id,
  propiedadId: e.propiedad_id,
  personaId: e.persona_id,
  proyectoId: e.proyecto_id || null,
  fecha: e.fecha,
  nota: e.nota || '',
  creadoPorId: e.creado_por_id || null,
  createdAt: e.created_at,
});

export async function listarPropiedadesEmpresa({ soloActivas = false } = {}) {
  try {
    let q = supabase.from('propiedades_empresa').select('*').order('nombre');
    if (soloActivas) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(propiedadRowToObj);
  } catch (e) {
    console.warn('listarPropiedadesEmpresa fallback (sin migration aún?):', e?.message);
    return [];
  }
}

export async function crearPropiedadEmpresa(prop) {
  const id = prop.id || ('prop_' + Date.now() + Math.random().toString(36).slice(2, 6));
  const row = {
    id,
    nombre: prop.nombre,
    direccion: prop.direccion || null,
    ubicacion_lat: prop.ubicacionLat ?? null,
    ubicacion_lng: prop.ubicacionLng ?? null,
    ubicacion_direccion_texto: prop.ubicacionDireccionTexto || null,
    google_maps_link: prop.googleMapsLink || null,
    capacidad: prop.capacidad ? Number(prop.capacidad) : null,
    llave_codigo: prop.llaveCodigo || null,
    notas: prop.notas || null,
    activo: prop.activo !== false,
  };
  const { data, error } = await supabase.from('propiedades_empresa').insert(row).select('*').single();
  if (error) throw error;
  return propiedadRowToObj(data);
}

export async function actualizarPropiedadEmpresa(id, campos) {
  const updates = { updated_at: new Date().toISOString() };
  if (campos.nombre !== undefined) updates.nombre = campos.nombre;
  if (campos.direccion !== undefined) updates.direccion = campos.direccion || null;
  if (campos.ubicacionLat !== undefined) updates.ubicacion_lat = campos.ubicacionLat ?? null;
  if (campos.ubicacionLng !== undefined) updates.ubicacion_lng = campos.ubicacionLng ?? null;
  if (campos.ubicacionDireccionTexto !== undefined) updates.ubicacion_direccion_texto = campos.ubicacionDireccionTexto || null;
  if (campos.googleMapsLink !== undefined) updates.google_maps_link = campos.googleMapsLink || null;
  if (campos.capacidad !== undefined) updates.capacidad = campos.capacidad ? Number(campos.capacidad) : null;
  if (campos.llaveCodigo !== undefined) updates.llave_codigo = campos.llaveCodigo || null;
  if (campos.notas !== undefined) updates.notas = campos.notas || null;
  if (campos.activo !== undefined) updates.activo = !!campos.activo;
  const { error } = await supabase.from('propiedades_empresa').update(updates).eq('id', id);
  if (error) throw error;
}

export async function eliminarPropiedadEmpresa(id) {
  // Hard delete elimina cascada las estadías. Para soft delete usar activo=false.
  const { error } = await supabase.from('propiedades_empresa').delete().eq('id', id);
  if (error) throw error;
}

// Listar estadías. Filtros opcionales: propiedadId, personaId, proyectoId,
// rango de fechas (fechaDesde/fechaHasta).
export async function listarEstadiasEmpresa({ propiedadId = null, personaId = null, proyectoId = null, fechaDesde = null, fechaHasta = null } = {}) {
  try {
    let q = supabase.from('estadias_empresa').select('*').order('fecha', { ascending: false });
    if (propiedadId) q = q.eq('propiedad_id', propiedadId);
    if (personaId) q = q.eq('persona_id', personaId);
    if (proyectoId) q = q.eq('proyecto_id', proyectoId);
    if (fechaDesde) q = q.gte('fecha', fechaDesde);
    if (fechaHasta) q = q.lte('fecha', fechaHasta);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(estadiaRowToObj);
  } catch (e) {
    console.warn('listarEstadiasEmpresa fallback:', e?.message);
    return [];
  }
}

// Crea una o varias estadías. Útil para marcar múltiples noches de varias
// personas al mismo tiempo (ej: lunes-jueves de Juan + Pedro = 6 filas).
export async function crearEstadiaEmpresa({ propiedadId, personaId, proyectoId = null, fecha, nota = null, creadoPorId = null }) {
  const id = 'es_' + Date.now() + Math.random().toString(36).slice(2, 6);
  const row = {
    id,
    propiedad_id: propiedadId,
    persona_id: personaId,
    proyecto_id: proyectoId,
    fecha,
    nota,
    creado_por_id: creadoPorId,
  };
  const { data, error } = await supabase.from('estadias_empresa').insert(row).select('*').single();
  if (error) {
    // Si es violación de uq_estadia_persona_propiedad_fecha, ya existe esa noche → ignorar silencioso.
    if (error.code === '23505') {
      console.log('Estadía ya existe para esta persona+propiedad+fecha — ignorando.');
      return null;
    }
    throw error;
  }
  return estadiaRowToObj(data);
}

export async function eliminarEstadiaEmpresa(id) {
  const { error } = await supabase.from('estadias_empresa').delete().eq('id', id);
  if (error) throw error;
}

// Helper para reservas en rango: crea N noches × M personas en una propiedad.
// Devuelve cuántas se crearon (puede ser menor que N×M si había duplicadas).
export async function crearReservaEnRango({ propiedadId, personasIds, proyectoId = null, fechaDesde, fechaHasta, nota = null, creadoPorId = null }) {
  if (!fechaDesde || !fechaHasta || !Array.isArray(personasIds) || personasIds.length === 0) return 0;
  // Generar todas las fechas en el rango (inclusive)
  const fechas = [];
  const d = new Date(fechaDesde + 'T12:00:00');
  const fin = new Date(fechaHasta + 'T12:00:00');
  while (d <= fin) {
    fechas.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  let creadas = 0;
  for (const fecha of fechas) {
    for (const personaId of personasIds) {
      try {
        const r = await crearEstadiaEmpresa({ propiedadId, personaId, proyectoId, fecha, nota, creadoPorId });
        if (r) creadas++;
      } catch (e) { console.warn('Error creando estadía', personaId, fecha, e?.message); }
    }
  }
  return creadas;
}

// ============================================================
// v8.17.52 — AVANCES DE UNIDADES (log diario por espacio)
// ============================================================
// Para proyectos tipoAvance='unidades' (edificios/torres/niveles/espacios),
// permitir reportar cuántas unidades de cada tipo se completaron cada día.
// El campo `espacio.completadas` (en estructuraUnidades jsonb) se mantiene
// sincronizado con la suma de los registros aquí.

const avanceUnidadRowToObj = (a) => ({
  id: a.id,
  proyectoId: a.proyecto_id,
  torreId: a.torre_id,
  nivelId: a.nivel_id,
  espacioId: a.espacio_id,
  tipo: a.tipo || '',
  fecha: a.fecha,
  cantidad: Number(a.cantidad || 0),
  nota: a.nota || '',
  creadoPorId: a.creado_por_id || null,
  createdAt: a.created_at,
});

// Listar avances con filtros opcionales (rango de fechas, proyecto, etc).
export async function listarAvancesUnidades({ proyectoId = null, espacioId = null, torreId = null, nivelId = null, fechaDesde = null, fechaHasta = null } = {}) {
  try {
    let q = supabase.from('avances_unidades').select('*').order('fecha', { ascending: false });
    if (proyectoId) q = q.eq('proyecto_id', proyectoId);
    if (espacioId) q = q.eq('espacio_id', espacioId);
    if (torreId) q = q.eq('torre_id', torreId);
    if (nivelId) q = q.eq('nivel_id', nivelId);
    if (fechaDesde) q = q.gte('fecha', fechaDesde);
    if (fechaHasta) q = q.lte('fecha', fechaHasta);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(avanceUnidadRowToObj);
  } catch (e) {
    console.warn('listarAvancesUnidades fallback (¿migration 015 sin aplicar?):', e?.message);
    return [];
  }
}

// Crea un registro de avance Y suma al `completadas` del espacio correspondiente.
// Devuelve { avance, proyectoActualizado } para que el caller pueda refrescar.
export async function crearAvanceUnidad({ proyectoId, torreId, nivelId, espacioId, tipo, fecha, cantidad, nota = null, creadoPorId = null }) {
  if (!proyectoId || !torreId || !nivelId || !espacioId || !fecha || !cantidad) {
    throw new Error('crearAvanceUnidad: faltan campos obligatorios');
  }
  const cant = Number(cantidad);
  if (!Number.isFinite(cant) || cant <= 0) throw new Error('cantidad debe ser > 0');

  const id = 'av_' + Date.now() + Math.random().toString(36).slice(2, 6);
  const row = {
    id,
    proyecto_id: proyectoId,
    torre_id: torreId,
    nivel_id: nivelId,
    espacio_id: espacioId,
    tipo: tipo || null,
    fecha,
    cantidad: cant,
    nota,
    creado_por_id: creadoPorId,
  };
  const { data, error } = await supabase.from('avances_unidades').insert(row).select('*').single();
  if (error) throw error;

  // Sumar al `completadas` del espacio en estructuraUnidades del proyecto.
  // No usamos triggers para mantenerlo simple — la sincronización es responsabilidad del caller.
  // Si el espacio ya alcanzó `cantidad` máxima, no la pasamos.
  try {
    const { data: proy } = await supabase.from('proyectos').select('estructura_unidades').eq('id', proyectoId).single();
    const estructura = proy?.estructura_unidades || [];
    const nueva = estructura.map(t => {
      if (t.id !== torreId) return t;
      return {
        ...t,
        niveles: (t.niveles || []).map(n => {
          if (n.id !== nivelId) return n;
          return {
            ...n,
            espacios: (n.espacios || []).map(e => {
              if (e.id !== espacioId) return e;
              const nuevaCompletadas = Math.min((e.completadas || 0) + cant, e.cantidad || Infinity);
              return { ...e, completadas: nuevaCompletadas };
            }),
          };
        }),
      };
    });
    await supabase.from('proyectos').update({ estructura_unidades: nueva, updated_at: new Date().toISOString() }).eq('id', proyectoId);
  } catch (e) {
    console.warn('No se pudo actualizar completadas del espacio:', e?.message);
  }

  return avanceUnidadRowToObj(data);
}

// Eliminar un avance y restar del `completadas` del espacio.
export async function eliminarAvanceUnidad(id) {
  // Leer primero para saber qué restar.
  const { data: av } = await supabase.from('avances_unidades').select('*').eq('id', id).single();
  if (!av) return;
  const { error } = await supabase.from('avances_unidades').delete().eq('id', id);
  if (error) throw error;
  // Restar del espacio
  try {
    const { data: proy } = await supabase.from('proyectos').select('estructura_unidades').eq('id', av.proyecto_id).single();
    const estructura = proy?.estructura_unidades || [];
    const nueva = estructura.map(t => {
      if (t.id !== av.torre_id) return t;
      return {
        ...t,
        niveles: (t.niveles || []).map(n => {
          if (n.id !== av.nivel_id) return n;
          return {
            ...n,
            espacios: (n.espacios || []).map(e => {
              if (e.id !== av.espacio_id) return e;
              const nuevaCompletadas = Math.max((e.completadas || 0) - Number(av.cantidad || 0), 0);
              return { ...e, completadas: nuevaCompletadas };
            }),
          };
        }),
      };
    });
    await supabase.from('proyectos').update({ estructura_unidades: nueva, updated_at: new Date().toISOString() }).eq('id', av.proyecto_id);
  } catch (e) {
    console.warn('No se pudo restar completadas del espacio:', e?.message);
  }
}

// Helper para reportar varios espacios de una sola vez (modal "Reportar avance del día").
// avances = [{ torreId, nivelId, espacioId, tipo, cantidad }, ...]
// Si una entrada tiene cantidad <= 0, se ignora.
export async function reportarAvanceDelDia({ proyectoId, fecha, avances, nota = null, creadoPorId = null }) {
  if (!Array.isArray(avances) || avances.length === 0) return [];
  const resultados = [];
  for (const a of avances) {
    if (!a.cantidad || Number(a.cantidad) <= 0) continue;
    try {
      const r = await crearAvanceUnidad({
        proyectoId,
        torreId: a.torreId,
        nivelId: a.nivelId,
        espacioId: a.espacioId,
        tipo: a.tipo,
        fecha,
        cantidad: a.cantidad,
        nota,
        creadoPorId,
      });
      resultados.push(r);
    } catch (e) {
      console.warn('Error creando avance', a, e?.message);
    }
  }
  return resultados;
}

// ============================================================
// ESTADOS DE PROYECTO (v8)
// ============================================================
// v8.17.58/59: estados que requieren validación de location + al menos un contacto.
// PR E (v8.17.59) suma 'planificado' al set.
const ESTADOS_REQUIEREN_LOCATION_Y_CONTACTO = new Set(['planificado', 'en_ejecucion']);

// v8.17.58: valida que un proyecto tenga location + ≥1 contacto antes de pasar
// a ciertos estados. Tira Error con mensaje legible si no cumple. Exportada
// para que la UI pueda mostrar el motivo concreto.
// v8.17.59: además, valida requisitos específicos por estado destino:
//   - 'planificado': supervisor o maestro asignado + fecha_estimada_inicio.
//   - 'en_ejecucion': modo_pago_mano_obra definido + (si aplicaDieta) dieta_modo.
export async function validarRequisitosCambioEstado(proyectoId, estadoNuevo) {
  if (estadoNuevo !== 'planificado' && estadoNuevo !== 'en_ejecucion' && estadoNuevo !== 'facturado') return;

  const { data: p } = await supabase
    .from('proyectos')
    .select('ubicacion_lat, ubicacion_lng, contacto_principal_id, contacto_cliente_nombre, contacto_cliente_telefono, contacto_cliente_email, supervisor_id, maestro_id, fecha_estimada_inicio, valor_cotizacion, monto_final_cubicado')
    .eq('id', proyectoId).single();

  const faltantes = [];

  // Comunes (location + contacto) — aplican a planificado y en_ejecucion
  if (ESTADOS_REQUIEREN_LOCATION_Y_CONTACTO.has(estadoNuevo)) {
    if (p?.ubicacion_lat == null || p?.ubicacion_lng == null) faltantes.push('ubicación (lat/lng)');
    // v8.17.71: además del FK `contacto_principal_id` (sistema nuevo) y la tabla
    // M:N `proyecto_contactos` (PR D), aceptamos los campos legacy de texto
    // (contacto_cliente_nombre/telefono/email). Antes de PR D los proyectos
    // guardaban el contacto directo como texto plano en la tabla proyectos —
    // el UI sigue mostrándolos como contacto válido (carta de acceso, lista,
    // etc), así que la validación tiene que reconocerlos también.
    let tieneContacto = !!p?.contacto_principal_id;
    if (!tieneContacto) {
      const legacy = `${p?.contacto_cliente_nombre || ''}${p?.contacto_cliente_telefono || ''}${p?.contacto_cliente_email || ''}`.trim();
      tieneContacto = !!legacy;
    }
    if (!tieneContacto) {
      const { count } = await supabase
        .from('proyecto_contactos')
        .select('*', { count: 'exact', head: true })
        .eq('proyecto_id', proyectoId);
      tieneContacto = (count || 0) > 0;
    }
    if (!tieneContacto) faltantes.push('al menos un contacto del cliente');
  }

  // Específicas de 'planificado': supervisor o maestro + fecha estimada de inicio
  if (estadoNuevo === 'planificado') {
    if (!p?.supervisor_id && !p?.maestro_id) faltantes.push('supervisor o maestro asignado');
    if (!p?.fecha_estimada_inicio) faltantes.push('fecha estimada de inicio');
  }

  // Nota: para 'en_ejecucion' originalmente el plan pedía validar `modo_pago_mano_obra`
  // y `dieta_modo`, pero ambos tienen valores default ('dia' / 'manual') desde el alta
  // del proyecto, así que siempre estarían "seteados". Si más adelante queremos forzar
  // que el admin elija explícitamente, hay que invalidar el default y validar aquí.

  // v8.17.63: pasar a 'facturado' requiere tener cargado tanto el valor de la
  // cotización como el monto final cubicado (real). Sin estos dos, no se puede
  // emitir factura ni calcular margen real.
  if (estadoNuevo === 'facturado') {
    if (p?.valor_cotizacion == null) faltantes.push('valor cotizado (RD$) del proyecto');
    if (p?.monto_final_cubicado == null) faltantes.push('monto final cubicado (RD$)');
  }

  if (faltantes.length > 0) {
    throw new Error(`Para pasar a ${estadoNuevo}, falta: ${faltantes.join(', ')}. Edita el proyecto y completa esos datos.`);
  }
}

export async function cambiarEstadoProyecto(proyectoId, estadoNuevo, usuario, nota, datosExtra = {}) {
  // v8.17.58: validar requisitos antes de tocar nada
  await validarRequisitosCambioEstado(proyectoId, estadoNuevo);

  const { data: actual } = await supabase.from('proyectos').select('estado').eq('id', proyectoId).single();
  const estadoAnterior = actual?.estado;
  const fechaHoy = new Date().toISOString().split('T')[0];

  // v8.19.57: _garantia es meta para crear la garantía, NO una columna de proyectos.
  const { _garantia: opcGarantia = null, ...extraLimpio } = datosExtra || {};
  const updates = { estado: estadoNuevo, updated_at: new Date().toISOString(), ...extraLimpio };
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

  // v8.25.46: registrar el cambio de estado en el CHATTER del proyecto (con la razón),
  // para que las explicaciones (sobre todo de "parado") queden visibles en la bitácora.
  try {
    const chatter = await import('./chatter');
    let cuerpo = `Estado → ${estadoNuevo}`;
    if (nota && nota.trim()) cuerpo += `: ${nota.trim()}`;
    await chatter.registrarEvento('proyecto', proyectoId, cuerpo, usuario, { from: estadoAnterior, to: estadoNuevo, evento: 'estado' });
  } catch (e) { console.warn('chatter estado proyecto:', e?.message); }

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

  // v8.19.56: arrancar la garantía al cerrar (CUALQUIER ruta de cambio de estado).
  if (estadoNuevo === 'finalizado_recibido_conforme') {
    try {
      const { data: pFull } = await supabase.from('proyectos')
        .select('id, cliente_id, ubicacion_id, referencia_odoo, sistema_id, valor_cotizacion, areas')
        .eq('id', proyectoId).single();
      if (pFull) {
        const { data: sis } = await supabase.from('sistemas').select('*').eq('id', pFull.sistema_id).maybeSingle();
        await crearGarantiaDesdeProyecto({
          id: pFull.id,
          clienteId: pFull.cliente_id,
          ubicacionId: pFull.ubicacion_id,
          referenciaOdoo: pFull.referencia_odoo,
          sistema: pFull.sistema_id,
          valorCotizacion: pFull.valor_cotizacion,
          areas: pFull.areas || [],
        }, sis, opcGarantia);
      }
    } catch (e) { console.warn('No se pudo crear la garantía:', e?.message); }
  }
}

export async function listarHistorialEstados(proyectoId) {
  const { data, error } = await supabase.from('historial_estados').select('*').eq('proyecto_id', proyectoId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// v8.17.61: batch para Lista de Proyectos. Devuelve un map { proyectoId: [...rows asc por fecha] }.
// Ascending (más antiguo primero) facilita el cálculo de duraciones por etapa.
export async function listarHistorialEstadosBatch(proyectoIds = null) {
  let q = supabase.from('historial_estados').select('proyecto_id, estado_anterior, estado_nuevo, created_at').order('created_at', { ascending: true });
  if (Array.isArray(proyectoIds) && proyectoIds.length > 0) q = q.in('proyecto_id', proyectoIds);
  const { data, error } = await q;
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => {
    if (!map[r.proyecto_id]) map[r.proyecto_id] = [];
    map[r.proyecto_id].push(r);
  });
  return map;
}

// ============================================================
// v8.17.68: CUBICACIONES MENSUALES (proyectos largos)
// ============================================================
// Cada cubicación = "este mes ejecutamos X m² por área", se factura y el
// cliente retiene un % como garantía. Vinculadas al proyecto.

const cubicacionRowToObj = (c) => ({
  id: c.id,
  proyectoId: c.proyecto_id,
  numero: c.numero,
  fechaCubicacion: c.fecha_cubicacion,
  areasCubicadas: c.areas_cubicadas || [],
  subtotalGeneral: Number(c.subtotal_general || 0),
  retencionPct: Number(c.retencion_pct || 0),
  retencionMonto: Number(c.retencion_monto || 0),
  amortizacionMonto: Number(c.amortizacion_monto || 0),
  itbisPct: Number(c.itbis_pct ?? 18),
  itbisMonto: Number(c.itbis_monto || 0),
  total: Number(c.total || 0),
  facturaOdooId: c.factura_odoo_id || null,
  facturaOdooNumero: c.factura_odoo_numero || null,
  fechaFactura: c.fecha_factura || null,
  notas: c.notas || null,
  creadoPorId: c.creado_por_id || null,
  creadoPorNombre: c.creado_por_nombre || null,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

export async function listarCubicaciones(proyectoId = null) {
  let q = supabase.from('cubicaciones').select('*').order('numero', { ascending: true });
  if (proyectoId) q = q.eq('proyecto_id', proyectoId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(cubicacionRowToObj);
}

export async function crearCubicacion(c) {
  // Calcular siguiente número correlativo del proyecto
  const { data: prev } = await supabase
    .from('cubicaciones')
    .select('numero')
    .eq('proyecto_id', c.proyectoId)
    .order('numero', { ascending: false })
    .limit(1);
  const numero = (prev && prev[0] ? Number(prev[0].numero) : 0) + 1;

  const id = c.id || ('cub_' + Date.now() + Math.random().toString(36).slice(2, 6));
  const row = {
    id,
    proyecto_id: c.proyectoId,
    numero,
    fecha_cubicacion: c.fechaCubicacion || new Date().toISOString().split('T')[0],
    areas_cubicadas: c.areasCubicadas || [],
    subtotal_general: Number(c.subtotalGeneral || 0),
    retencion_pct: Number(c.retencionPct || 0),
    retencion_monto: Number(c.retencionMonto || 0),
    amortizacion_monto: Number(c.amortizacionMonto || 0),
    itbis_pct: c.itbisPct != null ? Number(c.itbisPct) : 18,
    itbis_monto: Number(c.itbisMonto || 0),
    total: Number(c.total || 0),
    factura_odoo_id: c.facturaOdooId || null,
    factura_odoo_numero: c.facturaOdooNumero || null,
    fecha_factura: c.fechaFactura || null,
    notas: c.notas || null,
    creado_por_id: c.creadoPorId || null,
    creado_por_nombre: c.creadoPorNombre || null,
  };
  const { data, error } = await supabase.from('cubicaciones').insert(row).select('*').single();
  if (error) throw error;
  return cubicacionRowToObj(data);
}

export async function actualizarCubicacion(id, campos) {
  const updates = { updated_at: new Date().toISOString() };
  if (campos.fechaCubicacion !== undefined) updates.fecha_cubicacion = campos.fechaCubicacion;
  if (campos.areasCubicadas !== undefined) updates.areas_cubicadas = campos.areasCubicadas;
  if (campos.subtotalGeneral !== undefined) updates.subtotal_general = Number(campos.subtotalGeneral);
  if (campos.retencionPct !== undefined) updates.retencion_pct = Number(campos.retencionPct);
  if (campos.retencionMonto !== undefined) updates.retencion_monto = Number(campos.retencionMonto);
  if (campos.amortizacionMonto !== undefined) updates.amortizacion_monto = Number(campos.amortizacionMonto);
  if (campos.itbisPct !== undefined) updates.itbis_pct = Number(campos.itbisPct);
  if (campos.itbisMonto !== undefined) updates.itbis_monto = Number(campos.itbisMonto);
  if (campos.total !== undefined) updates.total = Number(campos.total);
  if (campos.facturaOdooId !== undefined) updates.factura_odoo_id = campos.facturaOdooId;
  if (campos.facturaOdooNumero !== undefined) updates.factura_odoo_numero = campos.facturaOdooNumero;
  if (campos.fechaFactura !== undefined) updates.fecha_factura = campos.fechaFactura;
  if (campos.notas !== undefined) updates.notas = campos.notas;
  const { error } = await supabase.from('cubicaciones').update(updates).eq('id', id);
  if (error) throw error;
}

export async function eliminarCubicacion(id) {
  const { error } = await supabase.from('cubicaciones').delete().eq('id', id);
  if (error) throw error;
}

// v8.19.98: configuración de cubicaciones del proyecto (toggle + retención +
// anticipo + amortización + próxima fecha). Update puntual (no toca el resto).
export async function setConfigCubicaciones(proyectoId, cfg) {
  const u = { updated_at: new Date().toISOString() };
  if (cfg.facturacionPorCubicaciones !== undefined) u.facturacion_por_cubicaciones = !!cfg.facturacionPorCubicaciones;
  if (cfg.retencionPct !== undefined) u.retencion_pct = cfg.retencionPct === '' || cfg.retencionPct == null ? null : Number(cfg.retencionPct);
  if (cfg.anticipoMonto !== undefined) u.anticipo_monto = cfg.anticipoMonto === '' || cfg.anticipoMonto == null ? null : Number(cfg.anticipoMonto);
  if (cfg.amortizacionPct !== undefined) u.amortizacion_pct = cfg.amortizacionPct === '' || cfg.amortizacionPct == null ? null : Number(cfg.amortizacionPct);
  if (cfg.proximaCubicacionFecha !== undefined) u.proxima_cubicacion_fecha = cfg.proximaCubicacionFecha || null;
  const { error } = await supabase.from('proyectos').update(u).eq('id', proyectoId);
  if (error) throw error;
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
export async function listarAjustes({ personaId = null, sinCorte = false, proyectoId = null, reclamacionId = null } = {}) {
  let q = supabase.from('ajustes_nomina').select('*').order('fecha', { ascending: false });
  if (personaId) q = q.eq('persona_id', personaId);
  if (proyectoId) q = q.eq('proyecto_id', proyectoId);
  if (reclamacionId) q = q.eq('reclamacion_id', reclamacionId);
  if (sinCorte) q = q.is('aplicado_a_corte_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(a => ({
    id: a.id, personaId: a.persona_id, fecha: a.fecha, tipo: a.tipo, monto: Number(a.monto),
    concepto: a.concepto, aplicadoACorteId: a.aplicado_a_corte_id,
    proyectoId: a.proyecto_id || null,
    reclamacionId: a.reclamacion_id || null,
    esReclamacion: !!a.es_reclamacion, // v8.27.4: reclamación genérica (sin reclamación específica todavía)
    lineaAparte: !!a.linea_aparte, // v8.27.17: forzar fila propia en la nómina (ajuste por tarea definido en el proyecto)
    creadoPorId: a.creado_por_id, createdAt: a.created_at,
  }));
}

export async function crearAjuste(a) {
  const row = {
    id: a.id, persona_id: a.personaId, fecha: a.fecha, tipo: a.tipo, monto: a.monto,
    concepto: a.concepto || null, creado_por_id: a.creadoPorId || null,
  };
  if (a.proyectoId) row.proyecto_id = a.proyectoId;
  if (a.reclamacionId) row.reclamacion_id = a.reclamacionId;
  if (a.esReclamacion) row.es_reclamacion = true;
  if (a.lineaAparte) row.linea_aparte = true;
  const { error } = await supabase.from('ajustes_nomina').insert(row);
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
  const rows = detalles.map(d => {
    const row = {
      id: d.id, corte_id: d.corteId, persona_id: d.personaId, persona_nombre: d.personaNombre,
      modo_pago: d.modoPago, dias_trabajados: d.diasTrabajados || 0, m2_producidos: d.m2Producidos || 0,
      proyectos_ajuste: d.proyectosAjuste || [],
      monto_base: d.montoBase || 0, monto_dieta: d.montoDieta || 0,
      monto_adelantos: d.montoAdelantos || 0, monto_otros: d.montoOtros || 0,
      monto_apoyo: d.montoApoyo || 0, nota_apoyo: d.notaApoyo || null,
      monto_total: d.montoTotal || 0, nota: d.nota || null,
    };
    if (d.proyectoId) row.proyecto_id = d.proyectoId;
    return row;
  });
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
    proyectoId: d.proyecto_id || null,
    montoBase: Number(d.monto_base || 0), montoDieta: Number(d.monto_dieta || 0),
    montoAdelantos: Number(d.monto_adelantos || 0), montoOtros: Number(d.monto_otros || 0),
    montoApoyo: Number(d.monto_apoyo || 0), notaApoyo: d.nota_apoyo || '',
    montoTotal: Number(d.monto_total || 0), nota: d.nota,
  }));
}

// Devuelve TODOS los detalles guardados, opcionalmente filtrando por proyecto.
// Útil para: estado de pago por proyecto, históricos, dashboard de nómina global.
export async function listarTodosDetalles({ proyectoId = null, personaId = null } = {}) {
  let q = supabase.from('detalle_nomina').select('*');
  if (proyectoId) q = q.eq('proyecto_id', proyectoId);
  if (personaId) q = q.eq('persona_id', personaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(d => ({
    id: d.id, corteId: d.corte_id, personaId: d.persona_id, personaNombre: d.persona_nombre,
    modoPago: d.modo_pago, diasTrabajados: d.dias_trabajados, m2Producidos: Number(d.m2_producidos || 0),
    proyectoId: d.proyecto_id || null,
    montoBase: Number(d.monto_base || 0), montoDieta: Number(d.monto_dieta || 0),
    montoAdelantos: Number(d.monto_adelantos || 0), montoOtros: Number(d.monto_otros || 0),
    montoApoyo: Number(d.monto_apoyo || 0),
    montoTotal: Number(d.monto_total || 0),
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

// v8.10.23: Actualizar un reporte existente
export async function actualizarReporte(r) {
  const { error } = await supabase.from('reportes').update({
    area_id: r.areaId,
    tarea_id: r.tareaId,
    fecha: r.fecha,
    m2: r.m2 ?? null,
    rollos: r.rollos ?? null,
    cubetas: r.cubetas ?? null,
    nota: r.nota || null,
    supervisor: r.supervisor,
    supervisor_id: r.supervisorId,
  }).eq('id', r.id);
  if (error) throw error;
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
    // v8.26.7: overrides de pago por persona dentro del proyecto
    precioM2: c.precio_m2 != null ? Number(c.precio_m2) : null,
    modoPago: c.modo_pago || null,
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

// v8.26.7: override de pago por (proyecto, persona) — para obras con 2 maestros con
// sistemas/precios distintos. Upsert PARCIAL: solo pisa los campos que se pasan.
// modoPago: 'dia' | 'm2_fijo' | null (null = hereda el modo del proyecto).
export async function guardarPagoPersonaProyecto(proyectoId, personaId, { costoDia, precioM2, modoPago } = {}) {
  const row = { id: 'cd_' + proyectoId + '_' + personaId, proyecto_id: proyectoId, persona_id: personaId };
  if (costoDia !== undefined) row.costo_dia = costoDia;
  if (precioM2 !== undefined) row.precio_m2 = precioM2;
  if (modoPago !== undefined) row.modo_pago = modoPago;
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
    odooPartnerId: c.odoo_partner_id || null,
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
    odoo_partner_id: c.odooPartnerId || null,
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
    odoo_partner_id: c.odooPartnerId || null,
  }).eq('id', c.id);
  if (error) throw error;
}

export async function buscarClientePorOdooId(odooPartnerId) {
  if (!odooPartnerId) return null;
  const { data, error } = await supabase.from('clientes').select('*').eq('odoo_partner_id', odooPartnerId).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, nombre: data.nombre, odooPartnerId: data.odoo_partner_id } : null;
}

export async function findOrCreateClienteDesdeOdoo(partnerData) {
  if (!partnerData?.odooPartnerId) throw new Error('Falta odooPartnerId');
  const existente = await buscarClientePorOdooId(partnerData.odooPartnerId);
  if (existente) return { id: existente.id, creado: false };
  const id = 'c_' + Date.now();
  await crearCliente({ ...partnerData, id });
  return { id, creado: true };
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

// ============================================================
// v8.19.54: Ubicaciones/localidades por cliente (Cliente 360)
// ============================================================
function ubicacionRowToObj(u) {
  return {
    id: u.id,
    clienteId: u.cliente_id,
    nombre: u.nombre,
    direccion: u.direccion || '',
    sector: u.sector || '',
    ciudad: u.ciudad || '',
    provincia: u.provincia || '',
    pais: u.pais || '',
    latitud: u.latitud != null ? Number(u.latitud) : null,
    longitud: u.longitud != null ? Number(u.longitud) : null,
    contactoNombre: u.contacto_nombre || '',
    contactoTelefono: u.contacto_telefono || '',
    notas: u.notas || '',
    areas: Array.isArray(u.areas) ? u.areas : [],
    archivado: !!u.archivado,
    createdAt: u.created_at,
  };
}

export async function listarUbicacionesCliente(clienteId = null, incluirArchivadas = false) {
  let q = supabase.from('cliente_ubicaciones').select('*').order('nombre', { ascending: true });
  if (clienteId) q = q.eq('cliente_id', clienteId);
  if (!incluirArchivadas) q = q.eq('archivado', false);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(ubicacionRowToObj);
}

export async function crearUbicacionCliente(u) {
  const id = u.id || ('ub_' + Date.now() + Math.random().toString(36).slice(2, 7));
  const { data, error } = await supabase.from('cliente_ubicaciones').insert({
    id,
    cliente_id: u.clienteId,
    nombre: u.nombre,
    direccion: u.direccion || null,
    sector: u.sector || null,
    ciudad: u.ciudad || null,
    provincia: u.provincia || null,
    pais: u.pais || null,
    latitud: u.latitud != null && u.latitud !== '' ? Number(u.latitud) : null,
    longitud: u.longitud != null && u.longitud !== '' ? Number(u.longitud) : null,
    contacto_nombre: u.contactoNombre || null,
    contacto_telefono: u.contactoTelefono || null,
    notas: u.notas || null,
    areas: Array.isArray(u.areas) ? u.areas : [],
  }).select('*').single();
  if (error) throw error;
  return ubicacionRowToObj(data);
}

export async function actualizarUbicacionCliente(u) {
  const { error } = await supabase.from('cliente_ubicaciones').update({
    nombre: u.nombre,
    direccion: u.direccion || null,
    sector: u.sector || null,
    ciudad: u.ciudad || null,
    provincia: u.provincia || null,
    pais: u.pais || null,
    latitud: u.latitud != null && u.latitud !== '' ? Number(u.latitud) : null,
    longitud: u.longitud != null && u.longitud !== '' ? Number(u.longitud) : null,
    contacto_nombre: u.contactoNombre || null,
    contacto_telefono: u.contactoTelefono || null,
    notas: u.notas || null,
    ...(u.areas !== undefined ? { areas: Array.isArray(u.areas) ? u.areas : [] } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', u.id);
  if (error) throw error;
}

export async function eliminarUbicacionCliente(id) {
  const { error } = await supabase.from('cliente_ubicaciones').update({ archivado: true }).eq('id', id);
  if (error) throw error;
}

// v8.20.3: actualizar SOLO las áreas de una locación (sin tocar el resto).
export async function setAreasUbicacionCliente(id, areas) {
  const { error } = await supabase.from('cliente_ubicaciones')
    .update({ areas: Array.isArray(areas) ? areas : [], updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// v8.19.55: Garantías + Mantenimientos
// ============================================================
function sumarMeses(fechaStr, n) {
  if (!fechaStr) return null;
  const d = new Date(fechaStr + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split('T')[0];
}
// Estado derivado de la fecha de vencimiento (umbral "por vencer": 60 días).
function estadoGarantiaPorFecha(fechaVencimiento) {
  if (!fechaVencimiento) return 'vigente';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T12:00:00');
  const dias = Math.round((venc - hoy) / 86400000);
  if (dias < 0) return 'vencida';
  if (dias <= 60) return 'por_vencer';
  return 'vigente';
}
function garantiaRowToObj(g) {
  return {
    id: g.id, codigo: g.codigo, clienteId: g.cliente_id, ubicacionId: g.ubicacion_id,
    proyectoId: g.proyecto_id, referenciaCotizacion: g.referencia_cotizacion,
    sistemaId: g.sistema_id, sistemaNombre: g.sistema_nombre,
    tipo: g.tipo || null, condicion: g.condicion || '',
    fechaInicio: g.fecha_inicio, duracionMeses: g.duracion_meses, fechaVencimiento: g.fecha_vencimiento,
    estado: g.estado, estadoCalc: estadoGarantiaPorFecha(g.fecha_vencimiento),
    cobertura: g.cobertura || '', m2: g.m2 != null ? Number(g.m2) : null, monto: g.monto != null ? Number(g.monto) : null,
    notas: g.notas || '', origen: g.origen, archivado: !!g.archivado, createdAt: g.created_at,
  };
}
function mantenimientoRowToObj(m) {
  return {
    id: m.id, garantiaId: m.garantia_id, clienteId: m.cliente_id, ubicacionId: m.ubicacion_id,
    tipo: m.tipo, fechaProgramada: m.fecha_programada, estado: m.estado,
    obligatorio: m.obligatorio !== false,
    responsableId: m.responsable_id, resultado: m.resultado || '', notas: m.notas || '',
    realizadoAt: m.realizado_at, createdAt: m.created_at,
  };
}

export async function listarGarantias({ incluirArchivadas = false } = {}) {
  let q = supabase.from('garantias').select('*').order('fecha_vencimiento', { ascending: true });
  if (!incluirArchivadas) q = q.eq('archivado', false);
  const { data, error } = await q;
  if (error) throw error;
  const garantias = (data || []).map(garantiaRowToObj);
  // v8.19.70: suspensión por mantenimiento OBLIGATORIO vencido. Se reactiva sola
  // cuando ese mantenimiento se marca realizado (se recalcula en cada lectura).
  const hoy = new Date().toISOString().split('T')[0];
  const { data: vencidos } = await supabase.from('mantenimientos')
    .select('garantia_id')
    .eq('obligatorio', true)
    .lt('fecha_programada', hoy)
    .in('estado', ['pendiente', 'agendado', 'vencido']);
  const suspIds = new Set((vencidos || []).map(m => m.garantia_id));
  return garantias.map(g => {
    // 'anulada' y 'vencida' (garantía expirada) mandan sobre la suspensión.
    if (suspIds.has(g.id) && g.estado !== 'anulada' && g.estadoCalc !== 'vencida') {
      return { ...g, suspendida: true, estado: 'suspendida', estadoCalc: 'suspendida' };
    }
    return { ...g, suspendida: false };
  });
}

export async function listarMantenimientos({ garantiaId = null, desde = null, hasta = null } = {}) {
  let q = supabase.from('mantenimientos').select('*').order('fecha_programada', { ascending: true });
  if (garantiaId) q = q.eq('garantia_id', garantiaId);
  if (desde) q = q.gte('fecha_programada', desde);
  if (hasta) q = q.lte('fecha_programada', hasta);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mantenimientoRowToObj);
}

// Genera el calendario de mantenimientos desde fecha_inicio hasta vencimiento,
// cada `cadaMeses`. Marca como 'vencido' los que ya pasaron (backfill retroactivo).
function calcularMantenimientos(garantia, cadaMeses) {
  if (!cadaMeses || cadaMeses <= 0 || !garantia.fechaInicio) return [];
  const hoy = new Date().toISOString().split('T')[0];
  const out = [];
  let n = cadaMeses;
  while (true) {
    const fecha = sumarMeses(garantia.fechaInicio, n);
    if (!fecha || (garantia.fechaVencimiento && fecha > garantia.fechaVencimiento)) break;
    out.push({ fecha, estado: fecha < hoy ? 'vencido' : 'pendiente' });
    n += cadaMeses;
    if (out.length > 120) break; // tope defensivo
  }
  return out;
}

export async function crearGarantia(g, { cadaMeses = null } = {}) {
  const id = g.id || ('gar_' + Date.now() + Math.random().toString(36).slice(2, 6));
  const fechaVencimiento = g.fechaVencimiento || (g.fechaInicio && g.duracionMeses ? sumarMeses(g.fechaInicio, g.duracionMeses) : null);
  const estado = estadoGarantiaPorFecha(fechaVencimiento);
  const row = {
    id, codigo: g.codigo || null, cliente_id: g.clienteId || null, ubicacion_id: g.ubicacionId || null,
    proyecto_id: g.proyectoId || null, referencia_cotizacion: g.referenciaCotizacion || null,
    sistema_id: g.sistemaId || null, sistema_nombre: g.sistemaNombre || null,
    tipo: g.tipo || null, condicion: g.condicion || null,
    fecha_inicio: g.fechaInicio || null, duracion_meses: g.duracionMeses || null, fecha_vencimiento: fechaVencimiento,
    estado, cobertura: g.cobertura || null, m2: g.m2 ?? null, monto: g.monto ?? null,
    notas: g.notas || null, origen: g.origen || 'manual',
  };
  const { data, error } = await supabase.from('garantias').insert(row).select('*').single();
  if (error) throw error;
  const garantia = garantiaRowToObj(data);
  // Generar calendario de mantenimientos OBLIGATORIOS (condición de la garantía).
  if (cadaMeses) {
    const ms = calcularMantenimientos(garantia, cadaMeses).map((m, i) => ({
      id: 'man_' + Date.now() + i + Math.random().toString(36).slice(2, 6),
      garantia_id: garantia.id, cliente_id: garantia.clienteId, ubicacion_id: garantia.ubicacionId,
      tipo: 'inspeccion', obligatorio: true, fecha_programada: m.fecha, estado: m.estado,
    }));
    if (ms.length > 0) { const { error: e2 } = await supabase.from('mantenimientos').insert(ms); if (e2) console.warn('mantenimientos:', e2.message); }
  }
  return garantia;
}

// Crea la garantía a partir de un proyecto cerrado (auto, al pasar a recibido conforme).
export async function crearGarantiaDesdeProyecto(proyecto, sistema, opc = null) {
  if (!proyecto) return null;
  // Evitar duplicar si ya existe garantía para este proyecto.
  const { data: existe } = await supabase.from('garantias').select('id').eq('proyecto_id', proyecto.id).limit(1);
  if (existe && existe.length > 0) return null;
  const m2 = (proyecto.areas || []).reduce((a, ar) => a + (Number(ar.m2) || 0), 0);
  // v8.19.57: las opciones elegidas al entregar (opc) mandan sobre el default del sistema.
  const duracion = (opc?.duracionMeses ?? null) || sistema?.garantia_meses || sistema?.garantiaMeses || null;
  const sistemaNombre = sistema?.data?.nombre || sistema?.nombre || null;
  const cadaMeses = (opc?.cadaMeses ?? null) || sistema?.mantenimiento_cada_meses || sistema?.mantenimientoCadaMeses || null;
  const fechaInicio = new Date().toISOString().split('T')[0];
  return crearGarantia({
    clienteId: proyecto.clienteId || null, ubicacionId: proyecto.ubicacionId || null,
    proyectoId: proyecto.id, referenciaCotizacion: proyecto.referenciaOdoo || null,
    sistemaId: proyecto.sistema, sistemaNombre, cobertura: opc?.cobertura || null,
    tipo: opc?.tipo || null, condicion: opc?.condicion || null,
    fechaInicio, duracionMeses: duracion, m2, monto: proyecto.valorCotizacion ?? null,
    origen: 'erp',
  }, { cadaMeses });
}

export async function actualizarMantenimiento(id, campos) {
  const updates = {};
  if (campos.estado !== undefined) updates.estado = campos.estado;
  if (campos.fechaProgramada !== undefined) updates.fecha_programada = campos.fechaProgramada;
  if (campos.responsableId !== undefined) updates.responsable_id = campos.responsableId;
  if (campos.resultado !== undefined) updates.resultado = campos.resultado;
  if (campos.notas !== undefined) updates.notas = campos.notas;
  if (campos.estado === 'realizado') updates.realizado_at = new Date().toISOString();
  const { error } = await supabase.from('mantenimientos').update(updates).eq('id', id);
  if (error) throw error;
}

export async function anularGarantia(id) {
  const { error } = await supabase.from('garantias').update({ archivado: true, estado: 'anulada' }).eq('id', id);
  if (error) throw error;
}

// ============================================================
// v8.19.60: Reclamaciones
// ============================================================
function reclamacionRowToObj(r) {
  return {
    id: r.id, codigo: r.codigo, clienteId: r.cliente_id, ubicacionId: r.ubicacion_id,
    garantiaId: r.garantia_id, proyectoId: r.proyecto_id, referenciaCotizacion: r.referencia_cotizacion,
    canal: r.canal, descripcion: r.descripcion || '', estado: r.estado, severidad: r.severidad,
    odooStage: r.odoo_stage || null, odooTicketId: r.odoo_ticket_id || null, clienteNombre: r.cliente_nombre || '',
    cubiertaPorGarantia: r.cubierta_por_garantia, asignadoA: r.asignado_a,
    fechaApertura: r.fecha_apertura, fechaResuelta: r.fecha_resuelta, notas: r.notas || '',
    trabajoRealizado: r.trabajo_realizado || '',
    fechaVisitaProgramada: r.fecha_visita_programada || null,
    eliminacionSolicitadaPor: r.eliminacion_solicitada_por || null,
    eliminacionSolicitadaPorNombre: r.eliminacion_solicitada_por_nombre || null,
    archivado: !!r.archivado, createdAt: r.created_at,
  };
}
export async function listarReclamaciones({ incluirArchivadas = false } = {}) {
  let q = supabase.from('reclamaciones').select('*').order('fecha_apertura', { ascending: false });
  if (!incluirArchivadas) q = q.eq('archivado', false);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(reclamacionRowToObj);
}
export async function crearReclamacion(r) {
  const id = r.id || ('rec_' + Date.now() + Math.random().toString(36).slice(2, 6));
  const { data, error } = await supabase.from('reclamaciones').insert({
    id, codigo: r.codigo || null, cliente_id: r.clienteId || null, ubicacion_id: r.ubicacionId || null,
    garantia_id: r.garantiaId || null, proyecto_id: r.proyectoId || null, referencia_cotizacion: r.referenciaCotizacion || null,
    canal: r.canal || 'interno', descripcion: r.descripcion || null, estado: r.estado || 'abierta',
    severidad: r.severidad || 'media', asignado_a: r.asignadoA || null, notas: r.notas || null,
  }).select('*').single();
  if (error) throw error;
  return reclamacionRowToObj(data);
}
// v8.19.91: borrado de reclamaciones con autorización del owner del app.
export async function eliminarReclamacion(id) {
  const { error } = await supabase.from('reclamaciones').delete().eq('id', id);
  if (error) throw error;
}
export async function solicitarEliminacionReclamacion(id, persona) {
  const { error } = await supabase.from('reclamaciones').update({
    eliminacion_solicitada_por: persona?.id || null,
    eliminacion_solicitada_por_nombre: persona?.nombre || null,
    eliminacion_solicitada_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}
export async function cancelarSolicitudEliminacionReclamacion(id) {
  const { error } = await supabase.from('reclamaciones').update({
    eliminacion_solicitada_por: null, eliminacion_solicitada_por_nombre: null, eliminacion_solicitada_at: null,
  }).eq('id', id);
  if (error) throw error;
}

export async function actualizarReclamacion(id, campos) {
  const u = { updated_at: new Date().toISOString() };
  if (campos.estado !== undefined) { u.estado = campos.estado; if (campos.estado === 'resuelta' || campos.estado === 'cerrada') u.fecha_resuelta = new Date().toISOString().split('T')[0]; }
  if (campos.severidad !== undefined) u.severidad = campos.severidad;
  if (campos.asignadoA !== undefined) u.asignado_a = campos.asignadoA;
  if (campos.notas !== undefined) u.notas = campos.notas;
  if (campos.trabajoRealizado !== undefined) u.trabajo_realizado = campos.trabajoRealizado;
  if (campos.fechaResuelta !== undefined) u.fecha_resuelta = campos.fechaResuelta || null;
  if (campos.fechaVisitaProgramada !== undefined) u.fecha_visita_programada = campos.fechaVisitaProgramada || null;
  if (campos.descripcion !== undefined) u.descripcion = campos.descripcion;
  const { error } = await supabase.from('reclamaciones').update(u).eq('id', id);
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
// v8.17.58: CONTACTOS DEL PROYECTO (tabla M:N proyecto_contactos)
// ============================================================
// Un proyecto puede asociar varios contactos del cliente. El "principal" sigue
// siendo `proyecto.contacto_principal_id` (compat con código existente: carta
// de acceso, cache denormalizado, etc). Los contactos adicionales viven aquí.

// Devuelve los contactos vinculados a un proyecto, ya enriquecidos con los datos
// del contacto (nombre, telefono, etc) — para que la UI no tenga que hacer un
// join extra.
export async function listarContactosProyecto(proyectoId) {
  const { data, error } = await supabase
    .from('proyecto_contactos')
    .select('id, proyecto_id, contacto_id, rol, notas, created_at')
    .eq('proyecto_id', proyectoId);
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id,
    proyectoId: r.proyecto_id,
    contactoId: r.contacto_id,
    rol: r.rol || null,
    notas: r.notas || null,
    createdAt: r.created_at,
  }));
}

// Reemplaza la lista completa de contactos asociados al proyecto.
// `contactoIds` es un array de IDs de contactos. Borra los que no estén y
// agrega los nuevos. Idempotente para los que ya estaban.
export async function asignarContactosProyecto(proyectoId, contactoIds, usuarioId = null) {
  const ids = Array.isArray(contactoIds) ? Array.from(new Set(contactoIds.filter(Boolean))) : [];
  const actuales = await listarContactosProyecto(proyectoId);
  const actualesSet = new Set(actuales.map(c => c.contactoId));
  const nuevosSet = new Set(ids);

  // Borrar los que ya no están
  const aBorrar = actuales.filter(c => !nuevosSet.has(c.contactoId)).map(c => c.id);
  if (aBorrar.length > 0) {
    const { error } = await supabase.from('proyecto_contactos').delete().in('id', aBorrar);
    if (error) throw error;
  }

  // Insertar los que faltan
  const aAgregar = ids.filter(cid => !actualesSet.has(cid));
  if (aAgregar.length > 0) {
    const rows = aAgregar.map(contactoId => ({
      id: 'pc_' + proyectoId + '_' + contactoId,
      proyecto_id: proyectoId,
      contacto_id: contactoId,
      creado_por_id: usuarioId,
    }));
    const { error } = await supabase.from('proyecto_contactos').upsert(rows, { onConflict: 'proyecto_id,contacto_id' });
    if (error) throw error;
  }
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

// ============================================================
// CAJA CHICA + DIETA (módulo nuevo v8.12)
// ============================================================
// Tabla `caja_chica_movimientos` con tipos: entrega | gasto_factura | dieta | ajuste
// Vista `caja_chica_saldos` para balances rápidos.

const cajaChicaRowToObj = (m) => ({
  id: m.id,
  personaId: m.persona_id,
  proyectoId: m.proyecto_id || null,
  fecha: m.fecha,
  tipo: m.tipo,
  monto: Number(m.monto || 0),
  signoAjuste: m.signo_ajuste != null ? Number(m.signo_ajuste) : 1,
  // foto_path = path en bucket de Storage. La URL firmada se obtiene con
  // obtenerUrlFirmadaFotoFactura(path) cuando se quiera mostrar.
  fotoPath: m.foto_path || null,
  tieneFoto: !!m.foto_path,
  proveedor: m.proveedor || null,
  rnc: m.rnc || null,
  concepto: m.concepto || null,
  datosIA: m.datos_ia || {},
  status: m.status,
  motivoRechazo: m.motivo_rechazo || null,
  aprobadoPorId: m.aprobado_por_id || null,
  aprobadoAt: m.aprobado_at || null,
  creadoPorId: m.creado_por_id || null,
  createdAt: m.created_at,
  rotacionGrados: m.rotacion_grados ?? 0, // v8.17.15: rotación persistente de foto
  empresaReceptora: m.empresa_receptora || null, // v8.17.25: 'super_techos' | 'prouco' | null (sin factura)
  // v8.17.29: si el movimiento descuenta de partida (dieta/hospedaje) y sub-tipo (desayuno/comida/cena/hotel)
  aplicaA: m.aplica_a || null,
  subTipo: m.sub_tipo || null,
  // v8.17.56: audit log embebido
  historialCambios: Array.isArray(m.historial_cambios) ? m.historial_cambios : [],
});

const SELECT_CAJA = 'id, persona_id, proyecto_id, fecha, tipo, monto, signo_ajuste, foto_path, proveedor, rnc, concepto, datos_ia, status, motivo_rechazo, aprobado_por_id, aprobado_at, creado_por_id, created_at, rotacion_grados, empresa_receptora, aplica_a, sub_tipo, historial_cambios';
const BUCKET_CAJA = 'caja-chica-facturas';

// Listar movimientos con filtros opcionales.
export async function listarMovimientosCajaChica({
  personaId = null, proyectoId = null, status = null, tipo = null, fechaDesde = null, fechaHasta = null,
  // v8.17.73: filtro por RNC del proveedor — usado en la vista de detalle de proveedor.
  // Filtra por igualdad exacta del campo `rnc`; pasa el RNC ya formateado (ej: '130-77433-1').
  rnc = null,
} = {}) {
  let q = supabase.from('caja_chica_movimientos').select(SELECT_CAJA).order('fecha', { ascending: false });
  if (personaId) q = q.eq('persona_id', personaId);
  if (proyectoId) q = q.eq('proyecto_id', proyectoId);
  if (status) q = q.eq('status', status);
  if (tipo) q = q.eq('tipo', tipo);
  if (fechaDesde) q = q.gte('fecha', fechaDesde);
  if (fechaHasta) q = q.lte('fecha', fechaHasta);
  if (rnc) q = q.eq('rnc', rnc);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(cajaChicaRowToObj);
}

// Crea un movimiento. Para gasto_factura con foto, pasa fotoBlob (Blob) o
// fotoDataUrl (string base64); el helper sube a Storage y guarda foto_path.
// v8.25.41: busca un gasto existente con el mismo NCF (para no duplicar la factura).
// Ignora los rechazados (su NCF se puede volver a usar). Devuelve el mov o null.
export async function buscarGastoConNcf(ncf, excluirId = null) {
  const n = (ncf || '').trim();
  if (!n) return null;
  let q = supabase.from('caja_chica_movimientos')
    .select('id, fecha, monto, proveedor, persona_id, status')
    .eq('datos_ia->>ncf', n)
    .neq('status', 'rechazado')
    .limit(1);
  if (excluirId) q = q.neq('id', excluirId);
  const { data, error } = await q;
  if (error) { console.warn('buscarGastoConNcf:', error.message); return null; }
  return (data && data[0]) || null;
}

export async function crearMovimientoCajaChica(mov) {
  // v8.25.41: NCF duplicado → la misma factura subida dos veces duplica el gasto.
  // Se valida ANTES de subir la foto para no dejar archivos huérfanos.
  const ncfNuevo = (mov.datosIA?.ncf || '').trim();
  if (mov.tipo === 'gasto_factura' && ncfNuevo && !mov.datosIA?.sin_factura) {
    const dup = await buscarGastoConNcf(ncfNuevo, mov.id || null);
    if (dup) {
      const err = new Error(`Ya hay un gasto registrado con el NCF ${ncfNuevo} (del ${dup.fecha}, RD$${new Intl.NumberFormat('es-DO').format(dup.monto)}). No se puede duplicar la factura.`);
      err.code = 'NCF_DUPLICADO';
      throw err;
    }
  }
  // v8.19.11: defensa en profundidad — para tipo='ajuste' el caller DEBE
  // pasar signoAjuste explícitamente (-1 = resta, +1 = suma). Sin esto
  // se grababa con default +1 y los gastos sin factura sumaban al saldo
  // en lugar de restar (bug histórico de 169 movs, RD$248,089).
  if (mov.tipo === 'ajuste') {
    const s = Number(mov.signoAjuste);
    if (s !== -1 && s !== 1) {
      throw new Error(
        'crearMovimientoCajaChica: tipo=\"ajuste\" requiere signoAjuste explícito (-1 o +1). ' +
        'Para gastos sin factura usa tipo=\"gasto_factura\" con datosIA.sin_factura=true.'
      );
    }
  }
  const id = mov.id || ('cc_' + Date.now() + Math.random().toString(36).slice(2, 6));
  let fotoPath = mov.fotoPath || null;

  // Si vino una imagen nueva, subirla a Storage primero.
  if (!fotoPath && (mov.fotoBlob || mov.fotoDataUrl)) {
    fotoPath = await subirFotoFacturaStorage({
      blobOrDataUrl: mov.fotoBlob || mov.fotoDataUrl,
      personaId: mov.personaId,
      fecha: mov.fecha || new Date().toISOString().split('T')[0],
      movId: id,
    });
  }

  const row = {
    id,
    persona_id: mov.personaId,
    proyecto_id: mov.proyectoId || null,
    fecha: mov.fecha || new Date().toISOString().split('T')[0],
    tipo: mov.tipo,
    monto: mov.monto,
    signo_ajuste: mov.signoAjuste != null ? mov.signoAjuste : 1,
    foto_path: fotoPath,
    proveedor: mov.proveedor || null,
    rnc: mov.rnc || null,
    concepto: mov.concepto || null,
    datos_ia: mov.datosIA || {},
    status: mov.status || (mov.tipo === 'entrega' ? 'aprobado' : 'pendiente_revision'),
    aprobado_por_id: mov.aprobadoPorId || null,
    aprobado_at: mov.status === 'aprobado' ? new Date().toISOString() : null,
    creado_por_id: mov.creadoPorId || null,
    empresa_receptora: mov.empresaReceptora || null, // v8.17.25
    // v8.17.29: si descuenta de presupuesto de dieta/hospedaje y a qué sub-tipo aplica.
    aplica_a: mov.aplicaA || null,
    sub_tipo: mov.subTipo || null,
  };
  const { data, error } = await supabase.from('caja_chica_movimientos').insert(row).select(SELECT_CAJA).single();
  if (error) throw error;
  return cajaChicaRowToObj(data);
}

// Aprobar / rechazar. Cuando se aprueba un gasto_factura con RNC, hacemos
// upsert en caja_chica_proveedores para que la AI tenga memoria en futuras facturas.
export async function actualizarStatusMovimientoCajaChica(id, { status, motivoRechazo = null, aprobadoPorId = null, aprobadoPorNombre = null }) {
  // v8.27.16: gate de control fiscal — no se puede APROBAR un gasto_factura cuyo
  // RNC o NCF/e-CF esté PRESENTE pero mal formado. (Un campo vacío no bloquea: hay
  // gastos en efectivo sin comprobante.) Defensa en servidor, además de la UI.
  if (status === 'aprobado') {
    const { data: m } = await supabase.from('caja_chica_movimientos')
      .select('tipo, rnc, datos_ia').eq('id', id).single();
    const esFactura = m?.tipo === 'gasto_factura' && !m?.datos_ia?.sin_factura;
    if (esFactura) {
      const v = validarFacturaFiscal({ rnc: m.rnc, ncf: m.datos_ia?.ncf });
      if (!v.ok) {
        const err = new Error('No se puede aprobar: ' + v.errores.map(e => `${e.campo} — ${e.mensaje}`).join('; ') + '. Corrige el dato antes de aprobar.');
        err.code = 'VALIDACION_FISCAL';
        throw err;
      }
    }
  }
  const updates = {
    status,
    motivo_rechazo: status === 'rechazado' ? motivoRechazo : null,
    aprobado_por_id: status === 'aprobado' ? aprobadoPorId : null,
    aprobado_at: status === 'aprobado' ? new Date().toISOString() : null,
  };

  // v8.17.56: registrar cambio de status en historial.
  try {
    const { data: prev } = await supabase
      .from('caja_chica_movimientos')
      .select('status, historial_cambios')
      .eq('id', id)
      .single();
    if (prev && prev.status !== status && aprobadoPorId) {
      const hist = Array.isArray(prev.historial_cambios) ? prev.historial_cambios : [];
      updates.historial_cambios = [
        ...hist,
        {
          fecha: new Date().toISOString(),
          usuarioId: aprobadoPorId,
          usuarioNombre: aprobadoPorNombre || aprobadoPorId,
          campo: 'Status',
          campoKey: 'status',
          antes: prev.status,
          despues: status,
          ...(status === 'rechazado' && motivoRechazo ? { motivoRechazo } : {}),
        },
      ];
    }
  } catch (e) {
    console.warn('No se pudo registrar historial de status:', e?.message);
  }

  const { error } = await supabase.from('caja_chica_movimientos').update(updates).eq('id', id);
  if (error) throw error;

  // Memoria de proveedores: solo cuando se aprueba un gasto_factura con RNC.
  if (status === 'aprobado') {
    try {
      const { data: mov } = await supabase.from('caja_chica_movimientos')
        .select('tipo, rnc, proveedor, monto, fecha, datos_ia')
        .eq('id', id).single();
      if (mov?.tipo === 'gasto_factura' && mov.rnc) {
        await upsertProveedorCajaChica({
          rnc: mov.rnc,
          nombre: mov.proveedor || mov.rnc,
          categoria: mov.datos_ia?.categoria_sugerida || null,
          monto: Number(mov.monto || 0),
          fecha: mov.fecha,
        });
      }
    } catch (e) {
      console.warn('upsertProveedorCajaChica falló (no bloquea aprobación):', e?.message);
    }
  }
}

// Editar campos de un movimiento. Útil cuando el maestro corrige datos que la
// AI extrajo mal, o cuando admin edita después de aprobado.
// Si pasas `usuarioId` y `usuarioNombre`, se registran los cambios diff-style
// en `historial_cambios` (audit log v8.17.56).
export async function actualizarMovimientoCajaChica(id, campos, audit = null) {
  // Mapeo campoJS → { col, label }
  const MAPA = {
    fecha:            { col: 'fecha',              label: 'Fecha' },
    monto:            { col: 'monto',              label: 'Monto' },
    proyectoId:       { col: 'proyecto_id',        label: 'Proyecto' },
    proveedor:        { col: 'proveedor',          label: 'Proveedor' },
    rnc:              { col: 'rnc',                label: 'RNC' },
    concepto:         { col: 'concepto',           label: 'Concepto' },
    empresaReceptora: { col: 'empresa_receptora',  label: 'Empresa receptora' },
    aplicaA:          { col: 'aplica_a',           label: 'Aplica a' },
    subTipo:          { col: 'sub_tipo',           label: 'Sub-tipo' },
  };

  const updates = {};
  for (const [key, def] of Object.entries(MAPA)) {
    if (campos[key] === undefined) continue;
    let val = campos[key];
    // Normalizar strings vacíos a null para campos opcionales
    if (typeof val === 'string' && val === '' && key !== 'fecha') val = null;
    updates[def.col] = val;
  }
  // datosIA tiene tratamiento aparte (no diff fino, solo persiste)
  if (campos.datosIA !== undefined) updates.datos_ia = campos.datosIA;

  if (Object.keys(updates).length === 0) return;

  // Si nos dieron audit info, comparar con valores previos antes de actualizar.
  let entradasHistorial = [];
  if (audit?.usuarioId) {
    const cols = Object.keys(updates).filter(c => c !== 'datos_ia');
    if (cols.length > 0) {
      const { data: prev } = await supabase
        .from('caja_chica_movimientos')
        .select(cols.join(',') + ', historial_cambios')
        .eq('id', id)
        .single();
      const ahora = new Date().toISOString();
      for (const [key, def] of Object.entries(MAPA)) {
        if (campos[key] === undefined) continue;
        const antes = prev?.[def.col];
        const despues = updates[def.col];
        // Comparar con strict equality (null != ''); skip si son iguales.
        const antesNorm = antes ?? null;
        const despuesNorm = despues ?? null;
        if (antesNorm === despuesNorm) continue;
        // Para monto, comparar como número
        if (key === 'monto' && Number(antesNorm) === Number(despuesNorm)) continue;
        entradasHistorial.push({
          fecha: ahora,
          usuarioId: audit.usuarioId,
          usuarioNombre: audit.usuarioNombre || audit.usuarioId,
          campo: def.label,
          campoKey: key,
          antes: antesNorm,
          despues: despuesNorm,
        });
      }
      if (entradasHistorial.length > 0) {
        const hist = Array.isArray(prev?.historial_cambios) ? prev.historial_cambios : [];
        updates.historial_cambios = [...hist, ...entradasHistorial];
      }
    }
  }

  const { error } = await supabase.from('caja_chica_movimientos').update(updates).eq('id', id);
  if (error) throw error;
}

// v8.17.70: Marca un movimiento de tipo gasto_factura como "sin factura"
// (compra informal sin comprobante fiscal). Limpia proveedor y RNC (porque
// dejan de tener sentido), pone datosIA.sin_factura=true y limpia NCF.
// Esto libera la validación al aprobar (RNC ya no es requerido) y deja el
// banner correcto en el modal.
// El cambio queda en historial_cambios si nos pasan audit.
export async function marcarMovimientoSinFactura(id, audit = null) {
  const { data: prev, error: errSel } = await supabase
    .from('caja_chica_movimientos')
    .select('proveedor, rnc, datos_ia, historial_cambios')
    .eq('id', id)
    .single();
  if (errSel) throw errSel;

  const datosIAprev = prev?.datos_ia || {};
  // Ya estaba marcado: no-op.
  if (datosIAprev.sin_factura === true) return;

  const datosIA = { ...datosIAprev, sin_factura: true };
  if ('ncf' in datosIA) datosIA.ncf = null;

  const updates = {
    proveedor: null,
    rnc: null,
    datos_ia: datosIA,
  };

  if (audit?.usuarioId) {
    const hist = Array.isArray(prev?.historial_cambios) ? prev.historial_cambios : [];
    const ahora = new Date().toISOString();
    hist.push({
      fecha: ahora,
      usuarioId: audit.usuarioId,
      usuarioNombre: audit.usuarioNombre || audit.usuarioId,
      campo: 'Tipo de gasto',
      campoKey: 'sinFactura',
      antes: 'Con factura',
      despues: 'Sin factura (compra informal)',
    });
    updates.historial_cambios = hist;
  }

  const { error } = await supabase.from('caja_chica_movimientos').update(updates).eq('id', id);
  if (error) throw error;
}

export async function eliminarMovimientoCajaChica(id) {
  // Eliminar también la foto del bucket si existe.
  const { data: mov } = await supabase.from('caja_chica_movimientos').select('foto_path').eq('id', id).single();
  const { error } = await supabase.from('caja_chica_movimientos').delete().eq('id', id);
  if (error) throw error;
  if (mov?.foto_path) {
    try { await eliminarFotoFacturaStorage(mov.foto_path); }
    catch (e) { console.warn('No se pudo eliminar foto de Storage:', e?.message); }
  }
}

// Saldos por persona desde la vista `caja_chica_saldos`.
// Si pasas personaId, devuelve uno; sin él, devuelve un map { personaId: saldo }.
export async function obtenerSaldoCajaChica(personaId = null) {
  let q = supabase.from('caja_chica_saldos').select('*');
  if (personaId) q = q.eq('persona_id', personaId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []).map(r => ({
    personaId: r.persona_id,
    saldo: Number(r.saldo || 0),
    saldoProyectado: Number(r.saldo_proyectado || 0),
    pendientes: Number(r.pendientes || 0),
    ultimoMovimientoFecha: r.ultimo_movimiento_fecha || null,
  }));
  if (personaId) return rows[0] || { personaId, saldo: 0, saldoProyectado: 0, pendientes: 0, ultimoMovimientoFecha: null };
  const map = {};
  rows.forEach(r => { map[r.personaId] = r; });
  return map;
}

// Devuelve URL firmada (1h) para ver la foto del movimiento. null si no tiene foto.
export async function obtenerFotoFacturaCajaChica(id) {
  const { data, error } = await supabase.from('caja_chica_movimientos').select('foto_path').eq('id', id).single();
  if (error) throw error;
  if (!data?.foto_path) return null;
  return await obtenerUrlFirmadaFotoFactura(data.foto_path);
}

// ============================================================
// CAJA CHICA — Storage de fotos
// ============================================================
// Path: {año}/{mes}/{personaId}/{fecha}_{movId}.{ext}
// Esto facilita el browsing en Supabase Storage UI por año/mes y por persona.

const dataUrlToBlob = (dataUrl) => {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const bytes = atob(m[2]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const extFromMime = (mime) => {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
};

// Sube una foto al bucket. Devuelve el path guardado.
// Acepta Blob o dataURL base64.
export async function subirFotoFacturaStorage({ blobOrDataUrl, personaId, fecha, movId }) {
  let blob = blobOrDataUrl;
  if (typeof blobOrDataUrl === 'string') {
    blob = dataUrlToBlob(blobOrDataUrl);
    if (!blob) throw new Error('dataURL inválido');
  }
  if (!(blob instanceof Blob)) throw new Error('Foto no es Blob ni dataURL');

  // fecha formato YYYY-MM-DD → año, mes
  const [anio, mes] = (fecha || new Date().toISOString().split('T')[0]).split('-');
  const ext = extFromMime(blob.type);
  const path = `${anio}/${mes}/${personaId}/${fecha}_${movId}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET_CAJA).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// URL firmada por defecto 1 hora.
export async function obtenerUrlFirmadaFotoFactura(path, expiraSegundos = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET_CAJA).createSignedUrl(path, expiraSegundos);
  if (error) throw error;
  return data?.signedUrl || null;
}

// Eliminar foto del bucket (lo llamamos al eliminar el movimiento).
export async function eliminarFotoFacturaStorage(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET_CAJA).remove([path]);
}

// ============================================================
// v8.17.64: PROYECTO_ARCHIVOS — blobs crudos por proyecto
// ============================================================
// Cotizaciones, listados de envíos, reportes de avance, etc. Guardados
// como respaldo. Distinto de `documentos_proyecto` (que tiene flujo de
// firma para incidentes/entregas formales).

const BUCKET_ARCHIVOS = 'proyecto-archivos';

const proyectoArchivoRowToObj = (r) => ({
  id: r.id,
  proyectoId: r.proyecto_id,
  tipo: r.tipo,
  nombre: r.nombre,
  path: r.path,
  mime: r.mime || null,
  tamanoBytes: r.tamano_bytes != null ? Number(r.tamano_bytes) : null,
  vinculadoA: r.vinculado_a || null,
  descripcion: r.descripcion || null,
  creadoPorId: r.creado_por_id || null,
  createdAt: r.created_at,
});

// Sube un archivo al bucket + crea la fila en `proyecto_archivos`.
// `file` puede ser un File del browser o un Blob. Devuelve el objeto creado.
export async function subirArchivoProyecto({ proyectoId, tipo, file, vinculadoA = null, descripcion = null, usuarioId = null }) {
  if (!proyectoId) throw new Error('proyectoId requerido');
  if (!tipo) throw new Error('tipo requerido');
  if (!(file instanceof Blob)) throw new Error('file debe ser File o Blob');

  const id = 'pa_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const nombreOriginal = (file.name || `archivo.${extFromMime(file.type) || 'bin'}`).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const path = `${proyectoId}/${tipo}/${id}_${nombreOriginal}`;

  const { error: upErr } = await supabase.storage.from(BUCKET_ARCHIVOS).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase.from('proyecto_archivos').insert({
    id,
    proyecto_id: proyectoId,
    tipo,
    nombre: file.name || nombreOriginal,
    path,
    mime: file.type || null,
    tamano_bytes: file.size || null,
    vinculado_a: vinculadoA,
    descripcion,
    creado_por_id: usuarioId,
  }).select('*').single();
  if (error) {
    // best effort: si falló la fila, intentar borrar el blob para no dejar huérfanos
    try { await supabase.storage.from(BUCKET_ARCHIVOS).remove([path]); } catch {}
    throw error;
  }
  return proyectoArchivoRowToObj(data);
}

// Lista archivos de un proyecto, opcionalmente filtrado por tipo y/o vinculadoA.
export async function listarArchivosProyecto({ proyectoId, tipo = null, vinculadoA = null } = {}) {
  if (!proyectoId) throw new Error('proyectoId requerido');
  let q = supabase.from('proyecto_archivos').select('*').eq('proyecto_id', proyectoId).order('created_at', { ascending: false });
  if (tipo) q = q.eq('tipo', tipo);
  if (vinculadoA) q = q.eq('vinculado_a', vinculadoA);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(proyectoArchivoRowToObj);
}

// URL firmada (1h) para descargar/visualizar el archivo.
export async function obtenerUrlArchivoProyecto(pathOrId, expiraSegundos = 3600) {
  if (!pathOrId) return null;
  // Si parece un id (empieza con 'pa_'), buscar el path primero.
  let path = pathOrId;
  if (pathOrId.startsWith('pa_')) {
    const { data } = await supabase.from('proyecto_archivos').select('path').eq('id', pathOrId).single();
    if (!data?.path) return null;
    path = data.path;
  }
  const { data, error } = await supabase.storage.from(BUCKET_ARCHIVOS).createSignedUrl(path, expiraSegundos);
  if (error) throw error;
  return data?.signedUrl || null;
}

// Borrar archivo (DB + Storage).
export async function eliminarArchivoProyecto(id) {
  const { data: row } = await supabase.from('proyecto_archivos').select('path').eq('id', id).single();
  const { error } = await supabase.from('proyecto_archivos').delete().eq('id', id);
  if (error) throw error;
  if (row?.path) {
    try { await supabase.storage.from(BUCKET_ARCHIVOS).remove([row.path]); }
    catch (e) { console.warn('No se pudo borrar blob de Storage:', e?.message); }
  }
}

// Adjuntar foto a un movimiento existente (caso: gasto reportado sin foto, llega
// v8.17.15: actualizar la rotación persistente de la foto (0|90|180|270).
// Idempotente. Devuelve los grados guardados.
export async function actualizarRotacionFotoCajaChica(movId, grados) {
  const normalizada = ((Number(grados) % 360) + 360) % 360;
  // Solo aceptamos múltiplos de 90 — la migración tiene un CHECK que lo valida
  const validos = [0, 90, 180, 270];
  const final = validos.includes(normalizada) ? normalizada : 0;
  const { error } = await supabase
    .from('caja_chica_movimientos')
    .update({ rotacion_grados: final })
    .eq('id', movId);
  if (error) throw error;
  return final;
}

// la foto por WhatsApp después y el admin la sube).
export async function adjuntarFotoAMovimiento(movId, blobOrDataUrl) {
  const { data: mov } = await supabase.from('caja_chica_movimientos')
    .select('persona_id, fecha, foto_path, datos_ia').eq('id', movId).single();
  if (!mov) throw new Error('Movimiento no encontrado');
  // Si ya tiene foto, la reemplazamos (borramos la vieja después)
  const oldPath = mov.foto_path;
  const newPath = await subirFotoFacturaStorage({
    blobOrDataUrl,
    personaId: mov.persona_id,
    fecha: mov.fecha,
    movId,
  });
  // Limpiar flag foto_por_ws si lo tenía
  const datosIA = { ...(mov.datos_ia || {}) };
  delete datosIA.foto_por_ws;
  const { error } = await supabase.from('caja_chica_movimientos')
    .update({ foto_path: newPath, datos_ia: datosIA })
    .eq('id', movId);
  if (error) throw error;
  if (oldPath) {
    try { await eliminarFotoFacturaStorage(oldPath); } catch {}
  }
  return newPath;
}

// ============================================================
// CAJA CHICA — Proveedores (memoria viva para mejorar la AI)
// ============================================================

// Normaliza RNC: solo dígitos.
const normalizarRnc = (rnc) => String(rnc || '').replace(/\D/g, '');

const proveedorRowToObj = (p) => ({
  id: p.id,
  rnc: p.rnc,
  nombre: p.nombre,
  categoria: p.categoria || null,
  notas: p.notas || null,
  totalFacturas: Number(p.total_facturas || 0),
  totalMonto: Number(p.total_monto || 0),
  primeraFacturaAt: p.primera_factura_at,
  ultimaFacturaAt: p.ultima_factura_at,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

export async function listarProveedoresCajaChica({ orden = 'ultimaFactura' } = {}) {
  let q = supabase.from('caja_chica_proveedores').select('*');
  if (orden === 'ultimaFactura') q = q.order('ultima_factura_at', { ascending: false, nullsFirst: false });
  else if (orden === 'totalMonto') q = q.order('total_monto', { ascending: false });
  else if (orden === 'nombre') q = q.order('nombre', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(proveedorRowToObj);
}

// Busca por RNC normalizado. Si no existe, devuelve null.
export async function buscarProveedorCajaChicaPorRnc(rnc) {
  const r = normalizarRnc(rnc);
  if (!r) return null;
  const { data } = await supabase.from('caja_chica_proveedores').select('*').eq('rnc', r).maybeSingle();
  return data ? proveedorRowToObj(data) : null;
}

// v8.27.16: busca proveedor por nombre (normalizado) para cruzar el RNC cuando la
// IA pudo leerlo mal. Devuelve el proveedor conocido con ese nombre, o null.
export async function buscarProveedorCajaChicaPorNombre(nombre) {
  const n = String(nombre || '').trim();
  if (n.length < 4) return null;
  const { data } = await supabase.from('caja_chica_proveedores')
    .select('*').ilike('nombre', n).limit(1);
  return (data && data[0]) ? proveedorRowToObj(data[0]) : null;
}

// Upsert por RNC: crea o actualiza estadísticas. Llamado al aprobar gasto_factura.
export async function upsertProveedorCajaChica({ rnc, nombre, categoria, monto, fecha }) {
  const r = normalizarRnc(rnc);
  if (!r) return null;
  const existente = await buscarProveedorCajaChicaPorRnc(r);
  const ahora = new Date().toISOString();

  if (existente) {
    const updates = {
      // No sobreescribir nombre canónico si el admin lo editó manualmente — solo si era el RNC crudo
      nombre: existente.nombre === existente.rnc && nombre ? nombre : existente.nombre,
      categoria: existente.categoria || categoria || null,
      total_facturas: (existente.totalFacturas || 0) + 1,
      total_monto: (existente.totalMonto || 0) + Number(monto || 0),
      ultima_factura_at: ahora,
    };
    const { error } = await supabase.from('caja_chica_proveedores').update(updates).eq('id', existente.id);
    if (error) throw error;
    return { ...existente, ...updates };
  } else {
    const id = 'pv_' + Date.now() + Math.random().toString(36).slice(2, 6);
    const row = {
      id, rnc: r,
      nombre: nombre || r,
      categoria: categoria || null,
      total_facturas: 1,
      total_monto: Number(monto || 0),
      primera_factura_at: ahora,
      ultima_factura_at: ahora,
    };
    const { error } = await supabase.from('caja_chica_proveedores').insert(row);
    if (error) throw error;
    return proveedorRowToObj(row);
  }
}

// Edición admin del proveedor: nombre canónico, categoría, notas.
export async function actualizarProveedorCajaChica(id, campos) {
  const updates = {};
  if (campos.nombre !== undefined) updates.nombre = campos.nombre;
  if (campos.categoria !== undefined) updates.categoria = campos.categoria || null;
  if (campos.notas !== undefined) updates.notas = campos.notas || null;
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from('caja_chica_proveedores').update(updates).eq('id', id);
  if (error) throw error;
}

export async function eliminarProveedorCajaChica(id) {
  const { error } = await supabase.from('caja_chica_proveedores').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// CAJA CHICA — Categorías editables
// ============================================================

export async function listarCategoriasCajaChica({ soloActivas = false } = {}) {
  let q = supabase.from('caja_chica_categorias').select('*').order('orden', { ascending: true });
  if (soloActivas) q = q.eq('activa', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id, nombre: c.nombre, color: c.color, icono: c.icono || null,
    descripcion: c.descripcion || null, orden: c.orden || 0,
    activa: !!c.activa, isDefault: !!c.is_default,
    aplicaA: c.aplica_a || null, // v8.17.29
  }));
}

// Genera un slug seguro a partir de un nombre: minúsculas, sin tildes, sin
// espacios. Si ya existe, agrega sufijo numérico.
const slugify = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export async function crearCategoriaCajaChica({ nombre, color, icono, descripcion, orden, aplicaA = null }) {
  const baseSlug = slugify(nombre) || ('cat_' + Date.now());
  // Asegurar unicidad
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const { data: existe } = await supabase.from('caja_chica_categorias').select('id').eq('id', slug).maybeSingle();
    if (!existe) break;
    slug = `${baseSlug}_${suffix++}`;
  }
  const row = {
    id: slug,
    nombre,
    color: color || '#71717a',
    icono: icono || null,
    descripcion: descripcion || null,
    orden: orden ?? 50,
    activa: true,
    is_default: false,
    aplica_a: aplicaA || null, // v8.17.29
  };
  const { error } = await supabase.from('caja_chica_categorias').insert(row);
  if (error) throw error;
  return row;
}

export async function actualizarCategoriaCajaChica(id, campos) {
  const updates = {};
  if (campos.nombre !== undefined) updates.nombre = campos.nombre;
  if (campos.color !== undefined) updates.color = campos.color;
  if (campos.icono !== undefined) updates.icono = campos.icono || null;
  if (campos.descripcion !== undefined) updates.descripcion = campos.descripcion || null;
  if (campos.orden !== undefined) updates.orden = campos.orden;
  if (campos.activa !== undefined) updates.activa = !!campos.activa;
  if (campos.aplicaA !== undefined) updates.aplica_a = campos.aplicaA || null; // v8.17.29
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from('caja_chica_categorias').update(updates).eq('id', id);
  if (error) throw error;
}

// Eliminar SOLO categorías no-default (las default solo se desactivan).
export async function eliminarCategoriaCajaChica(id) {
  const { data: cat } = await supabase.from('caja_chica_categorias').select('is_default').eq('id', id).single();
  if (cat?.is_default) {
    throw new Error('Las categorías por defecto no se pueden eliminar; desactívalas en su lugar.');
  }
  const { error } = await supabase.from('caja_chica_categorias').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// v8.14: Onboarding de maestros — invitar / login con teléfono /
// cambio de PIN obligatorio / wizard de datos personales / log de accesos
// ============================================================

// v8.17.89: normalizarTelefono y mapPersonaRow ahora viven en
// lib/helpers/personas.js y se importan en la cabecera de este archivo.
// Eso permite compartirlos con los endpoints /api/auth/* sin duplicar
// código.

// v8.17.89: Invita a un maestro al app — server hashea el PIN con bcrypt.
//
// El endpoint genera el PIN aleatorio, lo hashea y persiste. Devuelve el
// PIN plaintext UNA SOLA VEZ para que el admin lo comparta por WhatsApp.
//
// Modos (idénticos al comportamiento previo):
//   - `personaIdExistente` definido → activa esa persona específica
//   - sin `personaIdExistente` → match por teléfono o crea persona nueva
//     con rol maestro.
export async function invitarMaestroAlApp({ nombre, telefono, invitadoPorId, pinTemporal = null, rolesExtra = [], personaIdExistente = null }) {
  if (!nombre || !nombre.trim()) throw new Error('Nombre obligatorio');
  const tel = normalizarTelefono(telefono);
  if (tel.length !== 10) throw new Error('Teléfono debe ser de 10 dígitos (RD)');

  const resp = await fetch('/api/auth/invitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: nombre.trim(),
      telefono: tel,
      invitadoPorId: invitadoPorId || null,
      pinTemporal: pinTemporal || null,
      rolesExtra: rolesExtra || [],
      personaIdExistente: personaIdExistente || null,
    }),
  });
  let data;
  try { data = await resp.json(); } catch { data = null; }
  if (!resp.ok) {
    throw new Error(data?.error || 'No se pudo invitar a la persona');
  }

  // Audit log client-side — preserva el patrón actual (contexto + actor).
  const accion = data.modo === 'activacion_existente'
    ? 'persona.activada_para_app'
    : data.modo === 'reinvitacion'
      ? 'persona.reinvitada'
      : 'persona.invitada';
  registrarAudit({
    ...getAuditContext(),
    accion,
    recursoTipo: 'persona',
    recursoId: data.id,
    recursoNombre: data.nombre,
    datosDespues: data.modo === 'nueva' ? { telefono: tel, roles: data.roles } : undefined,
    severidad: 'warning',
  });

  return {
    id: data.id,
    nombre: data.nombre,
    telefono: data.telefono,
    pin: data.pin,
    esNueva: data.esNueva,
  };
}

// v8.17.91: Login server-side con PIN hash bcrypt + emisión de sesión Supabase.
// /api/auth/login devuelve { persona, otp? }. Si trae OTP, el cliente lo
// canjea por sesión Supabase via verifyOtp. Si NO trae OTP (porque la
// persona aún no tiene auth_user_id, o el backfill no se ha corrido, o
// Admin API falló server-side), el login sigue funcionando como en PR 2
// — solo sin sesión Supabase. Defense in depth: la app no se rompe.
export async function loginConTelefono(telefono, pin) {
  const tel = normalizarTelefono(telefono);
  if (tel.length !== 10) throw new Error('Teléfono o PIN incorrecto');
  if (!pin) throw new Error('Teléfono o PIN incorrecto');

  let resp;
  try {
    resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono: tel, pin: String(pin) }),
    });
  } catch (e) {
    throw new Error('No se pudo conectar al servidor');
  }
  let data;
  try { data = await resp.json(); } catch { data = null; }
  if (!resp.ok || !data?.persona) {
    throw new Error('Teléfono o PIN incorrecto');
  }

  await aplicarSesionSupabaseSiAplica(data.otp);
  return data.persona;
}

// v8.17.91: Si el server emitió un OTP de magiclink, canjéalo por sesión
// Supabase via supabase.auth.verifyOtp. Si falla, log warning pero NUNCA
// bloquea — el cliente sigue funcionando con state local + localStorage.
//
// Exportada para que lib/biometria.js la use tras el login WebAuthn.
export async function aplicarSesionSupabaseSiAplica(otp) {
  if (!otp || !otp.token_hash || !otp.type) return false;
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: otp.token_hash,
      type: otp.type,
    });
    if (error) {
      console.warn('verifyOtp falló — login sigue sin sesión Supabase:', error.message);
      return false;
    }
    return !!data?.session;
  } catch (e) {
    console.warn('verifyOtp lanzó excepción:', e?.message || e);
    return false;
  }
}

// v8.17.91: Logout — cierra sesión Supabase (si hay) + limpia localStorage.
// El frontend además limpia el state del usuario tras llamar a esta función.
export async function logout() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('supabase.auth.signOut() falló:', e?.message || e);
  }
  try {
    localStorage.removeItem('supertechos_usuario_id');
  } catch {}
  // Limpiar audit context — la persona ya no está logueada.
  setAuditContext({ usuarioId: null, usuarioNombre: null });
}

// v8.17.86: re-fetch puntual del estado de onboarding/pin temporal.
// Sirve como guard defensivo en el cliente: antes de montar el wizard o
// la pantalla de cambio de PIN, confirma contra DB que realmente hace
// falta mostrarlas. Resuelve el caso reportado donde un supervisor
// veía el wizard una y otra vez aunque la DB ya tenía
// onboarding_completado=true (cache stale / race en el cliente).
export async function obtenerEstadoOnboardingPersona(personaId) {
  if (!personaId) return null;
  const { data, error } = await supabase
    .from('personal')
    .select('onboarding_completado, pin_temporal')
    .eq('id', personaId)
    .maybeSingle();
  if (error) {
    console.warn('obtenerEstadoOnboardingPersona falló:', error?.message);
    return null;
  }
  if (!data) return null;
  return {
    onboardingCompletado: data.onboarding_completado !== false,
    pinTemporal: !!data.pin_temporal,
  };
}

// v8.17.89: Cambio de PIN server-side (hashea con bcrypt).
// Validaciones: 4-6 dígitos numéricos. Si `marcarPinTemporal` es true,
// la persona será forzada a cambiar el PIN en el próximo login (lo usa
// admin cuando setea/resetea un PIN para alguien más).
export async function cambiarPin(personaId, nuevoPin, { marcarPinTemporal = false } = {}) {
  if (!/^\d{4,6}$/.test(String(nuevoPin || ''))) {
    throw new Error('El PIN debe tener entre 4 y 6 dígitos');
  }
  const resp = await fetch('/api/auth/cambiar-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaId, nuevoPin: String(nuevoPin), marcarPinTemporal }),
  });
  let data;
  try { data = await resp.json(); } catch { data = null; }
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || 'No se pudo cambiar el PIN');
  }
  registrarAudit({
    ...getAuditContext(), accion: 'persona.pin_cambiado',
    recursoTipo: 'persona', recursoId: personaId,
    severidad: 'info',
  });
}

// Marca el onboarding como completado y guarda los datos personales
// recopilados en el wizard. Recibe el objeto del wizard ya validado
// (camelCase desde el frontend).
export async function completarOnboarding(personaId, datos) {
  const updates = {
    onboarding_completado: true,
  };
  if (datos.cedulaNumero != null) updates.cedula_numero = datos.cedulaNumero;
  if (datos.fechaNacimiento != null) updates.fecha_nacimiento = datos.fechaNacimiento || null;
  if (datos.direccion != null) updates.direccion = datos.direccion;
  if (datos.whatsapp != null) updates.whatsapp = normalizarTelefono(datos.whatsapp);
  if (datos.email != null) updates.email = datos.email;
  if (datos.tipoSangre != null) updates.tipo_sangre = datos.tipoSangre || null;
  if (datos.contactoEmergenciaNombre != null) updates.contacto_emergencia_nombre = datos.contactoEmergenciaNombre;
  if (datos.contactoEmergenciaTelefono != null) updates.contacto_emergencia_telefono = normalizarTelefono(datos.contactoEmergenciaTelefono);
  if (datos.contactoEmergenciaRelacion != null) updates.contacto_emergencia_relacion = datos.contactoEmergenciaRelacion;
  if (datos.banco != null) updates.banco = datos.banco;
  if (datos.bancoTipoCuenta != null) updates.banco_tipo_cuenta = datos.bancoTipoCuenta;
  if (datos.bancoNumeroCuenta != null) updates.banco_numero_cuenta = datos.bancoNumeroCuenta;
  if (datos.bancoTitularNombre != null) updates.banco_titular_nombre = datos.bancoTitularNombre;
  if (datos.bancoTitularCedula != null) updates.banco_titular_cedula = datos.bancoTitularCedula;
  if (datos.cartaBancaria != null) updates.carta_bancaria = datos.cartaBancaria || null;
  if (datos.foto2x2 != null) updates.foto_2x2 = datos.foto2x2;
  if (datos.cedulaFrente != null) updates.cedula_frente = datos.cedulaFrente;
  if (datos.cedulaReverso != null) updates.cedula_reverso = datos.cedulaReverso;

  const { error } = await supabase.from('personal').update(updates).eq('id', personaId);
  if (error) throw error;

  registrarAudit({
    ...getAuditContext(), accion: 'persona.onboarding_completado',
    recursoTipo: 'persona', recursoId: personaId,
    severidad: 'info',
  });
}

// Registra un evento de acceso o acción georreferenciada.
// Si la geolocalización falla o el usuario la deniega, se registra igualmente
// con geo_denegada=true y el mensaje de error en geo_error.
export async function registrarAcceso({ personaId, tipo, lat = null, lng = null, precisionM = null, geoDenegada = false, geoError = null, metadata = null }) {
  if (!personaId || !tipo) return;
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
  const row = {
    id: 'acc_' + Date.now() + Math.random().toString(36).slice(2, 7),
    persona_id: personaId,
    tipo,
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
    precision_m: precisionM != null ? Math.round(precisionM) : null,
    geo_denegada: !!geoDenegada,
    geo_error: geoError || null,
    user_agent: userAgent,
    metadata: metadata || null,
  };
  // No bloqueamos el flujo si falla el log de acceso — solo lo dejamos en consola
  const { error } = await supabase.from('personal_accesos_log').insert(row);
  if (error) console.warn('registrarAcceso falló:', error.message);
}

// Sube una foto (selfie o cédula) al bucket personal-fotos.
// Para cédula: tipo = 'cedula_frente' | 'cedula_reverso'. Para selfie: 'selfie'.
// Devuelve un signed URL de 1h. El path se puede guardar también en la columna
// correspondiente como referencia.
export async function subirFotoPersonal({ personaId, tipo, blob, contentType = 'image/jpeg' }) {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${personaId}/${tipo}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('personal-fotos').upload(path, blob, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data: signed } = await supabase.storage.from('personal-fotos').createSignedUrl(path, 3600);
  return { path, signedUrl: signed?.signedUrl || null };
}

// ============================================================
// v8.17.78: Cotizaciones de Odoo ocultas del modal de importación
// ============================================================
// El admin marca cotizaciones de Odoo (típicamente ventas de materiales,
// no obras) como "ocultas" para que no aparezcan en el modal de importar.
// Persistido en DB para que sea consistente entre devices/usuarios.

export async function listarCotizacionesOdooOcultas() {
  const { data, error } = await supabase
    .from('odoo_cotizaciones_ocultas')
    .select('referencia, odoo_order_id, cliente, monto_total, fecha_orden, motivo, ocultado_por_id, ocultado_at');
  if (error) throw error;
  return (data || []).map(r => ({
    referencia: r.referencia,
    odooOrderId: r.odoo_order_id,
    cliente: r.cliente,
    montoTotal: r.monto_total != null ? Number(r.monto_total) : null,
    fechaOrden: r.fecha_orden,
    motivo: r.motivo,
    ocultadoPorId: r.ocultado_por_id,
    ocultadoAt: r.ocultado_at,
  }));
}

export async function ocultarCotizacionOdoo({ referencia, odooOrderId = null, cliente = null, montoTotal = null, fechaOrden = null, motivo = null, usuarioId = null }) {
  if (!referencia) throw new Error('Falta referencia');
  const { error } = await supabase.from('odoo_cotizaciones_ocultas').upsert({
    referencia,
    odoo_order_id: odooOrderId,
    cliente,
    monto_total: montoTotal,
    fecha_orden: fechaOrden,
    motivo: motivo || null,
    ocultado_por_id: usuarioId,
  }, { onConflict: 'referencia' });
  if (error) throw error;
}

export async function mostrarCotizacionOdoo(referencia) {
  if (!referencia) throw new Error('Falta referencia');
  const { error } = await supabase.from('odoo_cotizaciones_ocultas').delete().eq('referencia', referencia);
  if (error) throw error;
}

// ============================================================
// CONTABILIDAD — Fase 1 (DGII: 606/607/608, NCF)
// ============================================================
// v8.26.0. Las COMPRAS (606) salen de caja_chica_movimientos; las VENTAS
// (607) de Odoo (vía /api/contabilidad/ventas-odoo); los NCF anulados (608)
// y las secuencias de NCF viven en tablas nuevas (migración 086).

// Rango [primer día, último día] de un mes, en formato YYYY-MM-DD.
function rangoMes(anio, mes) {
  const m = String(mes).padStart(2, '0');
  const ultimo = new Date(anio, mes, 0).getDate();
  return { desde: `${anio}-${m}-01`, hasta: `${anio}-${m}-${String(ultimo).padStart(2, '0')}` };
}

// Compras válidas para el 606: gasto_factura aprobados, de la empresa, en el
// mes, CON comprobante fiscal (NCF) y RNC. Devuelve objetos de movimiento.
export async function listarComprasMes(empresa, anio, mes) {
  const { desde, hasta } = rangoMes(anio, mes);
  const { data, error } = await supabase
    .from('caja_chica_movimientos')
    .select(SELECT_CAJA)
    .eq('tipo', 'gasto_factura')
    .eq('status', 'aprobado')
    .eq('empresa_receptora', empresa)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true });
  if (error) throw error;
  return (data || [])
    .map(cajaChicaRowToObj)
    .filter(m => !m.datosIA?.sin_factura && m.datosIA?.ncf && m.rnc);
}

// Gastos aprobados del mes (de la empresa) que NO entran al 606 por faltar
// NCF o RNC — para el banner de advertencia de completitud.
export async function comprasSinNcfMes(empresa, anio, mes) {
  const { desde, hasta } = rangoMes(anio, mes);
  const { data, error } = await supabase
    .from('caja_chica_movimientos')
    .select(SELECT_CAJA)
    .eq('tipo', 'gasto_factura')
    .eq('status', 'aprobado')
    .eq('empresa_receptora', empresa)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true });
  if (error) throw error;
  return (data || [])
    .map(cajaChicaRowToObj)
    .filter(m => !m.datosIA?.sin_factura && (!m.datosIA?.ncf || !m.rnc));
}

// Ventas del mes desde Odoo (607). Tolerante a Odoo caído: devuelve
// { ok, ventas, error } sin lanzar.
export async function listarFacturasVentaOdoo(empresa, anio, mes) {
  try {
    const res = await fetch(`/api/contabilidad/ventas-odoo?empresa=${empresa}&anio=${anio}&mes=${mes}`);
    const json = await res.json();
    if (!res.ok || !json.ok) return { ok: false, ventas: [], error: json?.error || 'Error consultando Odoo' };
    return { ok: true, ventas: json.ventas || [], error: null };
  } catch (e) {
    return { ok: false, ventas: [], error: e?.message || 'Odoo no disponible' };
  }
}

// ── NCF anulados (608) ──
const ncfAnuladoRowToObj = (r) => ({
  id: r.id,
  empresa: r.empresa,
  ncf: r.ncf,
  fechaAnulacion: r.fecha_anulacion,
  tipoAnulacion: r.tipo_anulacion,
  motivo: r.motivo || null,
  createdAt: r.created_at,
  creadoPorId: r.creado_por_id || null,
});

export async function listarNcfAnulados(empresa, anio = null, mes = null) {
  let q = supabase.from('cont_ncf_anulados').select('*').eq('empresa', empresa)
    .order('fecha_anulacion', { ascending: false });
  if (anio && mes) {
    const { desde, hasta } = rangoMes(anio, mes);
    q = q.gte('fecha_anulacion', desde).lte('fecha_anulacion', hasta);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(ncfAnuladoRowToObj);
}

export async function crearNcfAnulado(a, usuarioId = null) {
  if (!a?.empresa || !a?.ncf || !a?.fechaAnulacion || !a?.tipoAnulacion) {
    throw new Error('crearNcfAnulado: faltan empresa, ncf, fechaAnulacion o tipoAnulacion');
  }
  const id = a.id || ('ncfa_' + Date.now() + Math.random().toString(36).slice(2, 6));
  const { data, error } = await supabase.from('cont_ncf_anulados').insert({
    id,
    empresa: a.empresa,
    ncf: a.ncf,
    fecha_anulacion: a.fechaAnulacion,
    tipo_anulacion: a.tipoAnulacion,
    motivo: a.motivo || null,
    creado_por_id: usuarioId,
  }).select('*').single();
  if (error) throw error;
  return ncfAnuladoRowToObj(data);
}

export async function eliminarNcfAnulado(id) {
  const { error } = await supabase.from('cont_ncf_anulados').delete().eq('id', id);
  if (error) throw error;
}

// ── Secuencias de NCF (se usan para emitir en Fase 3) ──
const ncfSecuenciaRowToObj = (r) => ({
  id: r.id,
  empresa: r.empresa,
  tipoNcf: r.tipo_ncf,
  prefijo: r.prefijo,
  desde: Number(r.desde),
  hasta: Number(r.hasta),
  proximo: Number(r.proximo),
  vencimiento: r.vencimiento || null,
  activa: r.activa,
  notas: r.notas || null,
  createdAt: r.created_at,
});

export async function listarNcfSecuencias(empresa) {
  const { data, error } = await supabase.from('cont_ncf_secuencias').select('*')
    .eq('empresa', empresa).order('tipo_ncf', { ascending: true });
  if (error) throw error;
  return (data || []).map(ncfSecuenciaRowToObj);
}

export async function crearNcfSecuencia(s, usuarioId = null) {
  if (!s?.empresa || !s?.tipoNcf || s?.desde == null || s?.hasta == null) {
    throw new Error('crearNcfSecuencia: faltan empresa, tipoNcf, desde o hasta');
  }
  const id = s.id || ('ncfs_' + Date.now() + Math.random().toString(36).slice(2, 6));
  const { data, error } = await supabase.from('cont_ncf_secuencias').insert({
    id,
    empresa: s.empresa,
    tipo_ncf: s.tipoNcf,
    prefijo: s.prefijo || 'B',
    desde: s.desde,
    hasta: s.hasta,
    proximo: s.proximo != null ? s.proximo : s.desde,
    vencimiento: s.vencimiento || null,
    activa: s.activa !== false,
    notas: s.notas || null,
    creado_por_id: usuarioId,
  }).select('*').single();
  if (error) throw error;
  return ncfSecuenciaRowToObj(data);
}

export async function eliminarNcfSecuencia(id) {
  const { error } = await supabase.from('cont_ncf_secuencias').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// CONTABILIDAD — Fase 2 arranque: catálogo de cuentas + diarios (réplica de Odoo)
// ============================================================
export async function listarCatalogoContable(empresa) {
  const [cuentasRes, diariosRes] = await Promise.all([
    supabase.from('cont_cuentas').select('*').eq('empresa', empresa).order('codigo'),
    supabase.from('cont_diarios').select('*').eq('empresa', empresa).order('tipo').order('codigo'),
  ]);
  if (cuentasRes.error) throw cuentasRes.error;
  if (diariosRes.error) throw diariosRes.error;
  const mapC = (c) => ({ id: c.id, empresa: c.empresa, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, odooId: c.odoo_id, activa: c.activa });
  return { cuentas: (cuentasRes.data || []).map(mapC), diarios: (diariosRes.data || []).map(mapC) };
}

// Importa (reemplaza) el catálogo de la empresa con lo leído de Odoo. Idempotente:
// borra lo de la empresa y re-inserta — el catálogo aún no tiene asientos colgando
// (cuando exista el GL en Fase 2 completa, esto pasará a ser un upsert por codigo).
export async function reemplazarCatalogoContable(empresa, cuentas = [], diarios = []) {
  const ts = Date.now();
  const rowsC = cuentas.map((c, i) => ({
    id: `ccta_${empresa}_${c.odooId || (ts + i)}`,
    empresa, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo || null,
    odoo_id: c.odooId || null, activa: c.activa !== false,
  }));
  const rowsD = diarios.map((d, i) => ({
    id: `cdia_${empresa}_${d.odooId || (ts + i)}`,
    empresa, codigo: d.codigo, nombre: d.nombre, tipo: d.tipo || null,
    odoo_id: d.odooId || null, activa: true,
  }));
  const del1 = await supabase.from('cont_cuentas').delete().eq('empresa', empresa);
  if (del1.error) throw del1.error;
  const del2 = await supabase.from('cont_diarios').delete().eq('empresa', empresa);
  if (del2.error) throw del2.error;
  // Insertar en lotes de 500 (PostgREST limita el payload).
  for (let i = 0; i < rowsC.length; i += 500) {
    const { error } = await supabase.from('cont_cuentas').insert(rowsC.slice(i, i + 500));
    if (error) throw error;
  }
  for (let i = 0; i < rowsD.length; i += 500) {
    const { error } = await supabase.from('cont_diarios').insert(rowsD.slice(i, i + 500));
    if (error) throw error;
  }
  return { cuentas: rowsC.length, diarios: rowsD.length };
}

// ============================================================
// CONTABILIDAD — Conciliación bancaria v1 (v8.26.2)
// ============================================================
const bancoMovRowToObj = (m) => ({
  id: m.id, bancoId: m.banco_id, fecha: m.fecha, descripcion: m.descripcion || '',
  referencia: m.referencia || '', monto: Number(m.monto || 0), balance: m.balance != null ? Number(m.balance) : null,
  conciliadoTipo: m.conciliado_tipo || null, conciliadoId: m.conciliado_id || null,
  conciliadoNota: m.conciliado_nota || null, conciliadoAt: m.conciliado_at || null,
});

export async function listarBancos(empresa) {
  const { data, error } = await supabase.from('cont_bancos').select('*').eq('empresa', empresa).eq('activa', true).order('nombre');
  if (error) throw error;
  return (data || []).map(b => ({ id: b.id, empresa: b.empresa, nombre: b.nombre, numeroCuenta: b.numero_cuenta || '', moneda: b.moneda }));
}

export async function crearBanco({ empresa, nombre, numeroCuenta }) {
  const id = 'bco_' + Date.now() + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase.from('cont_bancos').insert({ id, empresa, nombre, numero_cuenta: numeroCuenta || null });
  if (error) throw error;
  return id;
}

export async function listarMovimientosBanco(bancoId) {
  const { data, error } = await supabase.from('cont_banco_movimientos').select('*')
    .eq('banco_id', bancoId).order('fecha', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data || []).map(bancoMovRowToObj);
}

// Importa líneas parseadas del estado; el hash (fecha|monto|descripcion) evita
// duplicados al re-importar (upsert ignorando conflictos por banco+hash).
export async function importarMovimientosBanco(bancoId, movimientos = []) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const rows = movimientos.map((m, i) => ({
    id: 'bmv_' + Date.now() + '_' + i + Math.random().toString(36).slice(2, 5),
    banco_id: bancoId,
    fecha: m.fecha,
    descripcion: m.descripcion || null,
    referencia: m.referencia || null,
    monto: Number(m.monto) || 0,
    balance: m.balance != null ? Number(m.balance) : null,
    hash: `${m.fecha}|${(Number(m.monto) || 0).toFixed(2)}|${norm(m.descripcion).slice(0, 120)}`,
  }));
  const { count: antes } = await supabase.from('cont_banco_movimientos').select('id', { count: 'exact', head: true }).eq('banco_id', bancoId);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('cont_banco_movimientos')
      .upsert(rows.slice(i, i + 500), { onConflict: 'banco_id,hash', ignoreDuplicates: true });
    if (error) throw error;
  }
  const { count: despues } = await supabase.from('cont_banco_movimientos').select('id', { count: 'exact', head: true }).eq('banco_id', bancoId);
  const nuevos = (despues || 0) - (antes || 0);
  return { recibidos: rows.length, nuevos, duplicados: rows.length - nuevos };
}

export async function conciliarMovimientoBanco(id, { tipo, refId = null, nota = null, usuarioId = null }) {
  const { error } = await supabase.from('cont_banco_movimientos').update({
    conciliado_tipo: tipo, conciliado_id: refId, conciliado_nota: nota,
    conciliado_at: new Date().toISOString(), conciliado_por_id: usuarioId,
  }).eq('id', id);
  if (error) throw error;
}

export async function desconciliarMovimientoBanco(id) {
  const { error } = await supabase.from('cont_banco_movimientos').update({
    conciliado_tipo: null, conciliado_id: null, conciliado_nota: null,
    conciliado_at: null, conciliado_por_id: null,
  }).eq('id', id);
  if (error) throw error;
}

// ============================================================
// CONTABILIDAD — Fase 2 GL: asientos, balanza, libro mayor, períodos (v8.26.3)
// Las garantías (balanceo, período abierto, inmutabilidad) viven en la BD
// (RPCs cont_crear_asiento / cont_reversar_asiento + triggers) — ver migración 089.
// ============================================================
export async function crearAsientoContable({ empresa, fecha, descripcion, diarioId, lineas, usuarioId, origenTipo, origenId }) {
  const { data, error } = await supabase.rpc('cont_crear_asiento', {
    p: {
      empresa, fecha, descripcion: descripcion || null, diario_id: diarioId || null,
      origen_tipo: origenTipo || 'manual', origen_id: origenId || null, creado_por_id: usuarioId || null,
      lineas: (lineas || []).map(l => ({
        cuenta_id: l.cuentaId, debe: Number(l.debe) || 0, haber: Number(l.haber) || 0,
        descripcion: l.descripcion || null, proyecto_id: l.proyectoId || null,
      })),
    },
  });
  if (error) throw new Error(error.message || 'Error creando asiento');
  return data; // id del asiento
}

export async function reversarAsientoContable(asientoId, usuarioId) {
  const { data, error } = await supabase.rpc('cont_reversar_asiento', { p_id: asientoId, p_usuario: usuarioId || null });
  if (error) throw new Error(error.message || 'Error reversando asiento');
  return data; // id del reverso
}

export async function listarAsientosContables(empresa, { desde = null, hasta = null, limite = 200 } = {}) {
  let q = supabase.from('cont_asientos').select('*').eq('empresa', empresa).order('numero', { ascending: false }).limit(limite);
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data: asientos, error } = await q;
  if (error) throw error;
  const ids = (asientos || []).map(a => a.id);
  let lineasPor = {};
  if (ids.length > 0) {
    const { data: lineas, error: e2 } = await supabase.from('cont_asiento_lineas')
      .select('*, cont_cuentas(codigo, nombre)').in('asiento_id', ids).order('orden');
    if (e2) throw e2;
    for (const l of lineas || []) {
      (lineasPor[l.asiento_id] ||= []).push({
        id: l.id, cuentaId: l.cuenta_id, codigo: l.cont_cuentas?.codigo || '', cuentaNombre: l.cont_cuentas?.nombre || '',
        debe: Number(l.debe || 0), haber: Number(l.haber || 0), descripcion: l.descripcion || '', proyectoId: l.proyecto_id || null,
      });
    }
  }
  return (asientos || []).map(a => ({
    id: a.id, empresa: a.empresa, numero: a.numero, fecha: a.fecha, diarioId: a.diario_id,
    descripcion: a.descripcion || '', origenTipo: a.origen_tipo, origenId: a.origen_id,
    estado: a.estado, reversoDe: a.reverso_de, creadoPorId: a.creado_por_id,
    lineas: lineasPor[a.id] || [],
    totalDebe: (lineasPor[a.id] || []).reduce((s, l) => s + l.debe, 0),
  }));
}

export async function balanzaContable(empresa, desde, hasta) {
  const { data, error } = await supabase.rpc('cont_balanza', { p_empresa: empresa, p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message || 'Error generando balanza');
  return (data || []).map(r => ({ cuentaId: r.cuenta_id, codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, debe: Number(r.debe || 0), haber: Number(r.haber || 0) }));
}

export async function libroMayorCuenta(empresa, cuentaId, desde, hasta) {
  const { data, error } = await supabase.from('cont_asiento_lineas')
    .select('*, cont_asientos!inner(numero, fecha, descripcion, empresa, estado)')
    .eq('cuenta_id', cuentaId)
    .eq('cont_asientos.empresa', empresa)
    .gte('cont_asientos.fecha', desde)
    .lte('cont_asientos.fecha', hasta)
    .order('orden');
  if (error) throw error;
  return (data || [])
    .map(l => ({
      id: l.id, asientoNumero: l.cont_asientos?.numero, fecha: l.cont_asientos?.fecha,
      asientoDesc: l.cont_asientos?.descripcion || '', lineaDesc: l.descripcion || '',
      debe: Number(l.debe || 0), haber: Number(l.haber || 0), proyectoId: l.proyecto_id || null,
    }))
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.asientoNumero - b.asientoNumero));
}

export async function listarPeriodosContables(empresa) {
  const { data, error } = await supabase.from('cont_periodos').select('*').eq('empresa', empresa).order('anio', { ascending: false }).order('mes', { ascending: false });
  if (error) throw error;
  return (data || []).map(p => ({ id: p.id, empresa: p.empresa, anio: p.anio, mes: p.mes, estado: p.estado }));
}

export async function setPeriodoContable(empresa, anio, mes, estado, usuarioId = null) {
  const id = `per_${empresa}_${anio}_${String(mes).padStart(2, '0')}`;
  const { error } = await supabase.from('cont_periodos').upsert({
    id, empresa, anio, mes, estado,
    cerrado_por_id: estado === 'cerrado' ? usuarioId : null,
    cerrado_at: estado === 'cerrado' ? new Date().toISOString() : null,
  }, { onConflict: 'empresa,anio,mes' });
  if (error) throw error;
}
