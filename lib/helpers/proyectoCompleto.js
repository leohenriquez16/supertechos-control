// v8.31.1: ¿Está COMPLETO un proyecto en el ERP? — la definición operativa de
// "creación correcta" (regla de Leonardo: un proyecto aprobado en Odoo debe quedar
// completo en el ERP EL MISMO DÍA, con áreas, tareas, cliente, contacto y ubicación;
// idealmente auto-llenado desde el levantamiento).
// Se usa en: el KPI de creación de Miguel/Erisdania, la notificación inmediata al
// aprobar, y el correo diario de las 10:30.

export function faltantesProyecto(p, sistemas = {}) {
  const faltantes = [];
  if (!p) return ['proyecto no encontrado'];

  // Cliente y contacto
  if (!(p.cliente || p.nombre || '').trim()) faltantes.push('nombre del cliente');
  const contactoLegacy = `${p.contactoClienteNombre || ''}${p.contactoClienteTelefono || ''}${p.contactoClienteEmail || ''}`.trim();
  if (!p.contactoPrincipalId && !contactoLegacy) faltantes.push('contacto del cliente');

  // Ubicación (location del proyecto)
  if (p.ubicacionLat == null || p.ubicacionLng == null) faltantes.push('ubicación GPS');

  // Áreas con m² y sistema
  const areas = p.areas || [];
  if (areas.length === 0) faltantes.push('áreas del proyecto');
  else {
    if (areas.some(a => !(Number(a.m2) > 0))) faltantes.push('m² en todas las áreas');
    if (areas.some(a => !(a.sistemaId || p.sistema))) faltantes.push('sistema en todas las áreas');
  }

  // Tareas del sistema (sin tareas no hay avance ni nómina por m²)
  const sids = [...new Set([p.sistema, ...areas.map(a => a.sistemaId)].filter(Boolean))];
  if (sids.length === 0) faltantes.push('sistema del proyecto');
  else if (sids.some(sid => !(sistemas?.[sid]?.tareas?.length > 0))) faltantes.push('tareas del sistema');

  // Valor y equipo
  if (!(Number(p.valorCotizacion) > 0)) faltantes.push('valor de la cotización');
  if (!p.supervisorId) faltantes.push('supervisor asignado');
  if (!p.maestroId) faltantes.push('maestro asignado');

  return faltantes;
}
