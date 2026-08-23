// v8.28.3: Motor de "Mis Pendientes" — el task manager del ERP.
// Las tareas DIARIAS no se guardan en ninguna tabla: se DERIVAN en vivo del estado
// real de proyectos, jornadas, reportes, levantamientos, reclamaciones y nómina.
// Así aparecen solas cada día para cada responsable y desaparecen solas cuando la
// cosa de verdad se hizo (no cuando alguien marcó un checkbox).
// Las tareas MANUALES (tabla `tareas`) se integran a la misma lista.
//
// Cada pendiente: { id, grupo, titulo, detalle, urgente, accion? }
//   accion = { tipo: 'proyecto'|'reportar'|'vista', proyectoId?, tab?, vista? }

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

const diasDesde = (iso) => {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
};

export const GRUPOS = {
  jornadas: { label: 'Jornadas', orden: 1 },
  reportes: { label: 'Reportes de avance', orden: 2 },
  levantamientos: { label: 'Levantamientos', orden: 3 },
  reclamaciones: { label: 'Reclamaciones', orden: 4 },
  gerencia: { label: 'Gerencia', orden: 5 },
  tareas: { label: 'Tareas asignadas', orden: 6 },
};

// ctx = { usuario, data, jornadas7d, surveys, reclamaciones, tareas, cortes, esAdmin }
export function generarPendientes(ctx) {
  const { usuario, data, jornadas7d = [], surveys = [], reclamaciones = [], tareas = [], cortes = [], esAdmin = false } = ctx;
  const hoy = hoyRD();
  const out = [];
  const push = (p) => out.push(p);

  // ---- Obras donde este usuario opera (supervisor o maestro titular) ----
  const misObras = (data.proyectos || []).filter(p => !p.archivado && (p.estado || '') === 'en_ejecucion' &&
    (p.supervisorId === usuario.id || p.maestroId === usuario.id));
  const jornadasHoy = jornadas7d.filter(j => j.fecha === hoy);
  const reportesHoy = (data.reportes || []).filter(r => (r.fecha || '').slice(0, 10) === hoy);
  const etiqueta = (p) => p.cliente || p.nombre || p.referenciaOdoo || p.id;

  misObras.forEach(p => {
    const j = jornadasHoy.find(x => x.proyectoId === p.id);
    if (!j) {
      push({ id: 'jor_abrir_' + p.id, grupo: 'jornadas', titulo: `Abrir la jornada de ${etiqueta(p)}`,
        detalle: 'La brigada aún no tiene jornada hoy', urgente: false,
        accion: { tipo: 'proyecto', proyectoId: p.id, tab: 'asistencia' } });
    }
    if (!reportesHoy.some(r => r.proyectoId === p.id)) {
      push({ id: 'rep_' + p.id, grupo: 'reportes', titulo: `Reportar el avance de ${etiqueta(p)}`,
        detalle: 'Sin reporte de avance hoy', urgente: false,
        accion: { tipo: 'reportar', proyectoId: p.id } });
    }
  });

  // Jornadas viejas sin cerrar (de cualquier obra donde opera) — urgente: afecta nómina.
  jornadas7d.filter(j => j.fecha < hoy && j.horaInicio && !j.horaFin).forEach(j => {
    const p = (data.proyectos || []).find(x => x.id === j.proyectoId);
    if (!p) return;
    const mia = p.supervisorId === usuario.id || p.maestroId === usuario.id;
    if (!mia && !esAdmin) return;
    push({ id: 'jor_cerrar_' + j.id, grupo: 'jornadas', titulo: `Cerrar la jornada del ${j.fecha} en ${etiqueta(p)}`,
      detalle: 'Quedó abierta — afecta la nómina', urgente: true,
      accion: { tipo: 'proyecto', proyectoId: p.id, tab: 'asistencia' } });
  });

  // ---- Levantamientos asignados a mí ----
  surveys.filter(s => s.asignado_a_id === usuario.id && (s.status === 'planning' || s.status === 'survey_in_progress'))
    .forEach(s => {
      const dias = diasDesde(s.created_at) ?? 0;
      const citaVencida = s.fecha_visita_programada && s.fecha_visita_programada.slice(0, 10) < hoy;
      push({ id: 'lev_' + s.id, grupo: 'levantamientos', titulo: `Levantamiento: ${s.client_name || '(sin cliente)'}`,
        detalle: citaVencida ? `Cita vencida (${s.fecha_visita_programada.slice(0, 10)})` : `Solicitado hace ${dias} día${dias !== 1 ? 's' : ''}`,
        urgente: citaVencida || dias > 7,
        accion: { tipo: 'vista', vista: 'inicio' } });
    });

  // ---- Reclamaciones asignadas a mí ----
  reclamaciones.filter(r => !r.archivado && r.asignadoA === usuario.id && r.estado !== 'resuelta' && r.estado !== 'cerrada')
    .forEach(r => {
      const dias = diasDesde(r.fechaApertura) ?? 0;
      push({ id: 'rec_' + r.id, grupo: 'reclamaciones', titulo: `Reclamación de ${r.clienteNombre || 'cliente'}`,
        detalle: `${r.estado === 'en_proceso' ? 'En proceso' : 'Abierta'} hace ${dias} día${dias !== 1 ? 's' : ''}${dias > 14 ? ' — envejeciendo' : ''}`,
        urgente: dias > 14,
        accion: { tipo: 'vista', vista: 'reclamaciones' } });
    });

  // ---- Tareas manuales asignadas a mí ----
  tareas.filter(t => !t.completada && t.asignadaAId === usuario.id).forEach(t => {
    const vencida = t.fechaLimite && t.fechaLimite.slice(0, 10) < hoy;
    push({ id: 'tar_' + t.id, grupo: 'tareas', titulo: t.titulo,
      detalle: t.fechaLimite ? `Límite: ${t.fechaLimite.slice(0, 10)}${vencida ? ' — vencida' : ''}` : (t.descripcion || '').slice(0, 80),
      urgente: !!vencida, tareaId: t.id,
      accion: { tipo: 'vista', vista: 'tareas' } });
  });

  // ---- Reglas de gerencia (solo admin) ----
  if (esAdmin) {
    surveys.filter(s => s.status === 'planning' && !s.asignado_a_id).forEach(s => {
      push({ id: 'ger_lev_' + s.id, grupo: 'gerencia', titulo: `Asignar levantamiento: ${s.client_name || '(sin cliente)'}`,
        detalle: `Sin responsable hace ${diasDesde(s.created_at) ?? 0} días`, urgente: (diasDesde(s.created_at) ?? 0) > 3,
        accion: { tipo: 'vista', vista: 'surveys' } });
    });
    reclamaciones.filter(r => !r.archivado && !r.asignadoA && r.estado !== 'resuelta' && r.estado !== 'cerrada').forEach(r => {
      push({ id: 'ger_rec_' + r.id, grupo: 'gerencia', titulo: `Asignar reclamación de ${r.clienteNombre || 'cliente'}`,
        detalle: `Sin responsable hace ${diasDesde(r.fechaApertura) ?? 0} días`, urgente: (diasDesde(r.fechaApertura) ?? 0) > 3,
        accion: { tipo: 'vista', vista: 'reclamaciones' } });
    });
    (data.proyectos || []).filter(p => !p.archivado && p.estado === 'aprobado' && (!p.supervisorId || !p.maestroId)).forEach(p => {
      push({ id: 'ger_equipo_' + p.id, grupo: 'gerencia', titulo: `Asignar ${!p.supervisorId ? 'supervisor' : 'maestro'} a ${etiqueta(p)}`,
        detalle: 'Obra aprobada sin equipo completo', urgente: false,
        accion: { tipo: 'proyecto', proyectoId: p.id } });
    });
    const corteVencido = (cortes || []).find(c => c.estado === 'abierto' && c.fechaFin && c.fechaFin < hoy);
    if (corteVencido) {
      push({ id: 'ger_corte_' + corteVencido.id, grupo: 'gerencia', titulo: 'Cerrar el corte de nómina',
        detalle: `El corte venció el ${corteVencido.fechaFin}`, urgente: true,
        accion: { tipo: 'vista', vista: 'nomina' } });
    }
  }

  // Orden: urgentes primero, luego por grupo.
  return out.sort((a, b) => (b.urgente - a.urgente) || ((GRUPOS[a.grupo]?.orden || 9) - (GRUPOS[b.grupo]?.orden || 9)));
}
