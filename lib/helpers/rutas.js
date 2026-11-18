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

// ============================================================
// Cruce de paradas con el historial del GPS (Pressto / GPSWOX).
// ============================================================

// Distancia en metros entre dos coordenadas (haversine).
export function distanciaM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const num = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));
const msDe = (t) => (t instanceof Date ? t.getTime() : typeof t === 'number' ? t : Date.parse(t));

// ¿El camión visitó cada parada? Busca, por parada, el PRIMER tramo continuo de
// puntos del GPS dentro del radio que dure al menos minPermanenciaS y tenga al
// menos un punto casi detenido (velocidad ≤ velMaxKmh). Pasar de largo no cuenta.
// Las paradas de obra (con proyectoId) usan un radio más amplio: la obra es grande
// y el pin suele estar en el centro. Paradas sin lat/lng se ignoran.
// Devuelve { [paradaId]: { llegada, salida, permanenciaS, distanciaM } } (ISO).
export function cruzarParadasConGps(paradas, puntos, { radioM = 150, radioObraM = 250, minPermanenciaS = 180, velMaxKmh = 5 } = {}) {
  const out = {};
  const pts = (puntos || [])
    .map(p => ({ lat: num(p.lat), lng: num(p.lng), ms: msDe(p.t), speed: num(p.speed) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);
  if (!pts.length) return out;

  (paradas || []).forEach(par => {
    const lat = num(par?.lat), lng = num(par?.lng);
    if (!par?.id || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const radio = par.proyectoId ? radioObraM : radioM;
    let tramo = null; // { ini, fin, lento, dMin }
    const evaluar = () => {
      if (!tramo) return null;
      const dur = (tramo.fin - tramo.ini) / 1000;
      if (dur >= minPermanenciaS && tramo.lento) {
        return { llegada: new Date(tramo.ini).toISOString(), salida: new Date(tramo.fin).toISOString(), permanenciaS: Math.round(dur), distanciaM: Math.round(tramo.dMin) };
      }
      return null;
    };
    for (const p of pts) {
      const d = distanciaM(lat, lng, p.lat, p.lng);
      if (d <= radio) {
        const lento = Number.isFinite(p.speed) && p.speed <= velMaxKmh; // sin velocidad no cuenta como detenido
        if (!tramo) tramo = { ini: p.ms, fin: p.ms, lento, dMin: d };
        else { tramo.fin = p.ms; tramo.lento = tramo.lento || lento; tramo.dMin = Math.min(tramo.dMin, d); }
      } else if (tramo) {
        const v = evaluar();
        if (v) { out[par.id] = v; return; }
        tramo = null;
      }
    }
    const v = evaluar();
    if (v) out[par.id] = v;
  });
  return out;
}
