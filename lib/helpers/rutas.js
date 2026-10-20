// v8.68.0: lógica pura de Rutas — cancelar viajes viejos y marcar paradas
// hechas desde la oficina (ticket Erisdania). Sin dependencias: testeable.

export const VIAJE_CANCELADO = 'cancelado';
export const PARADA_CANCELADA = 'cancelada';

export const esViajeCancelado = (v) => v?.estado === VIAJE_CANCELADO;

// Un viaje se puede cancelar mientras no esté completado ni cancelado ya.
export const puedeCancelarViaje = (v) => !!v && v.estado !== 'completado' && v.estado !== VIAJE_CANCELADO;

// Qué hacer al cancelar: las paradas PENDIENTES pasan a canceladas (no se borra
// nada); sus requisiciones vuelven a 'lista' y sus diligencias a 'sin_planificar'
// — exactamente lo mismo que hace "quitar parada". Las completadas no se tocan.
export function planCancelacionViaje(viaje) {
  const pendientes = (viaje?.paradas || []).filter(p => p.estado !== 'completada' && p.estado !== PARADA_CANCELADA);
  return {
    paradasACancelar: pendientes.map(p => p.id),
    requisicionesADevolver: [...new Set(pendientes.map(p => p.requisicionId).filter(Boolean))],
    diligenciasADevolver: [...new Set(pendientes.map(p => p.diligenciaId).filter(Boolean))],
  };
}

// Nota que queda en el viaje al cancelarlo (se agrega a la nota existente).
export function notaCancelacion(notaPrev, { motivo, nombre, fechaISO }) {
  const f = (fechaISO || '').slice(0, 10);
  const linea = `Cancelado${f ? ` el ${f}` : ''}${nombre ? ` por ${nombre}` : ''}: ${String(motivo || '').trim()}`;
  return [String(notaPrev || '').trim(), linea].filter(Boolean).join('\n');
}

// Nota de la parada marcada hecha desde la oficina (quién y que fue en oficina).
export function notaHechaDesdeOficina(notaPrev, { nombre, fechaISO }) {
  const f = (fechaISO || '').slice(0, 16).replace('T', ' ');
  const linea = `Marcada hecha desde oficina${nombre ? ` por ${nombre}` : ''}${f ? ` (${f})` : ''}`;
  return [String(notaPrev || '').trim(), linea].filter(Boolean).join('\n');
}

// Filtro de la lista: 'activos' (todo menos cancelados) | 'cancelados'.
export function filtrarViajes(viajes, filtro = 'activos') {
  return (viajes || []).filter(v => filtro === 'cancelados' ? esViajeCancelado(v) : !esViajeCancelado(v));
}

// Viejos sin cerrar: fecha anterior a hoy, ni completado ni cancelado.
export function viajesViejosSinCerrar(viajes, hoy) {
  return (viajes || []).filter(v => v.fecha < hoy && v.estado !== 'completado' && !esViajeCancelado(v));
}

// Requisiciones ya montadas (para no ofrecerlas otra vez): ignora viajes y
// paradas cancelados — su requisición volvió a estar disponible.
export function requisicionesMontadas(viajes) {
  const s = new Set();
  (viajes || []).forEach(v => {
    if (esViajeCancelado(v)) return;
    (v.paradas || []).forEach(p => { if (p.requisicionId && p.estado !== PARADA_CANCELADA) s.add(p.requisicionId); });
  });
  return s;
}
