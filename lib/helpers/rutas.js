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

// ¿El camión visitó cada parada? Por parada busca un tramo continuo de puntos
// del GPS dentro del radio en el que el camión estuvo LENTO (velocidad ≤ velMaxKmh
// en los dos extremos de cada intervalo) un tiempo ACUMULADO ≥ minPermanenciaS.
// Un solo punto lento en un tapón no basta; pasar de largo no cuenta; un punto
// sin velocidad no cuenta como detenido.
//
// Ventana y orden (para no marcar "Regresar a oficina" con la madrugada en que el
// camión durmió allí, ni paradas de otro viaje del mismo camión):
//  - Solo se miran puntos dentro de [desde, hasta] (ISO o ms; null = sin límite).
//  - Las paradas se recorren en su `orden` (o en el orden del arreglo); cada una
//    busca su visita DESPUÉS de la llegada de la anterior visitada y, si está en
//    el mismo sitio que una parada anterior ya visitada, después de su salida.
//  - La ÚLTIMA parada, si es la base (par.esBase, p. ej. la oficina) o el mismo
//    sitio que una anterior (regreso), toma la visita posterior a la salida de
//    todas las demás y nunca el rato inicial antes de que el camión saliera de allí.
//
// Radio: 150 m si la parada tiene coordenada propia; 250 m solo si usa el pin
// aproximado del proyecto (par.usaPinObra) porque la obra es grande.
// Paradas sin lat/lng se ignoran.
// Devuelve { [paradaId]: { llegada, salida, permanenciaS, lentoS, distanciaM } } (ISO).
export function cruzarParadasConGps(paradas, puntos, {
  radioM = 150, radioObraM = 250, minPermanenciaS = 180, velMaxKmh = 5, desde = null, hasta = null,
} = {}) {
  const out = {};
  const lim = (x, def) => { const m = x == null ? NaN : msDe(x); return Number.isFinite(m) ? m : def; };
  const dMs = lim(desde, -Infinity), hMs = lim(hasta, Infinity);
  const pts = (puntos || [])
    .map(p => ({ lat: num(p.lat), lng: num(p.lng), ms: msDe(p.t), speed: num(p.speed) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.ms))
    .filter(p => p.ms >= dMs && p.ms <= hMs)
    .sort((a, b) => a.ms - b.ms);
  if (!pts.length) return out;

  const lista = (paradas || [])
    .map((par, i) => ({ par, i, lat: num(par?.lat), lng: num(par?.lng) }))
    .filter(x => x.par?.id && Number.isFinite(x.lat) && Number.isFinite(x.lng))
    .sort((a, b) => (num(a.par.orden) || 0) - (num(b.par.orden) || 0) || a.i - b.i);

  // Busca la primera visita válida con puntos posteriores a minMs.
  const buscar = (x, minMs) => {
    const radio = x.par.usaPinObra ? radioObraM : radioM;
    let tramo = null; // { ini, fin, lentoS, dMin, prev }
    const evaluar = () => {
      if (!tramo || tramo.lentoS < minPermanenciaS) return null;
      return {
        llegada: new Date(tramo.ini).toISOString(), salida: new Date(tramo.fin).toISOString(),
        permanenciaS: Math.round((tramo.fin - tramo.ini) / 1000), lentoS: Math.round(tramo.lentoS),
        distanciaM: Math.round(tramo.dMin),
      };
    };
    for (const p of pts) {
      if (p.ms <= minMs) continue;
      const d = distanciaM(x.lat, x.lng, p.lat, p.lng);
      if (d <= radio) {
        const lento = Number.isFinite(p.speed) && p.speed <= velMaxKmh;
        if (!tramo) tramo = { ini: p.ms, fin: p.ms, lentoS: 0, dMin: d, prev: { ms: p.ms, lento } };
        else {
          if (tramo.prev.lento && lento) tramo.lentoS += (p.ms - tramo.prev.ms) / 1000;
          tramo.fin = p.ms; tramo.dMin = Math.min(tramo.dMin, d); tramo.prev = { ms: p.ms, lento };
        }
      } else if (tramo) {
        const v = evaluar();
        if (v) return v;
        tramo = null;
      }
    }
    return evaluar();
  };

  const visitadas = []; // { x, v }
  const mismoSitio = (a, b) => distanciaM(a.lat, a.lng, b.lat, b.lng) <= Math.max(radioM, (a.par.usaPinObra || b.par.usaPinObra) ? radioObraM : radioM);
  lista.forEach((x, k) => {
    const ultima = k === lista.length - 1 && lista.length > 1;
    const anteriores = lista.slice(0, k);
    const esRegreso = ultima && (!!x.par.esBase || anteriores.some(a => mismoSitio(a, x)));
    let minMs = -Infinity;
    if (esRegreso) {
      visitadas.forEach(({ v }) => { minMs = Math.max(minMs, Date.parse(v.salida)); });
      // Y nunca el rato en que el camión todavía no había salido de allí: la
      // visita de regreso empieza después de que salió del radio por primera vez.
      const radio = x.par.usaPinObra ? radioObraM : radioM;
      const fuera = pts.find(p => distanciaM(x.lat, x.lng, p.lat, p.lng) > radio);
      minMs = Math.max(minMs, fuera ? fuera.ms - 1 : Infinity);
    } else {
      const prev = visitadas[visitadas.length - 1];
      if (prev) minMs = Date.parse(prev.v.llegada);
      visitadas.forEach(({ x: a, v }) => { if (mismoSitio(a, x)) minMs = Math.max(minMs, Date.parse(v.salida)); });
    }
    const v = buscar(x, minMs);
    if (v) { out[x.par.id] = v; visitadas.push({ x, v }); }
  });
  return out;
}

// Ventana del viaje para el cruce: desde la hora en que el chofer inició la
// jornada hasta que la terminó (+ tolerancia por si la cerró antes de llegar a
// la base) o ahora. Sin hora_inicio (viaje 'planificado') NO se auto-marca: se
// devuelve puedeMarcar=false y la ventana del día completo (solo datos GPS).
export function ventanaViajeGps(viaje, { ahoraMs = Date.now(), toleranciaFinS = 1800 } = {}) {
  const ini = viaje?.hora_inicio ?? viaje?.horaInicio ?? null;
  const fin = viaje?.hora_fin ?? viaje?.horaFin ?? null;
  const iniMs = ini ? msDe(ini) : NaN;
  if (!Number.isFinite(iniMs)) return { desde: null, hasta: ahoraMs, puedeMarcar: false };
  const finMs = fin ? msDe(fin) : NaN;
  const hasta = Number.isFinite(finMs) ? Math.min(ahoraMs, finMs + toleranciaFinS * 1000) : ahoraMs;
  return { desde: iniMs, hasta, puedeMarcar: hasta > iniMs };
}

// ¿Cambiaron los datos GPS de una parada (fila de la base) respecto a la visita?
// Para no reescribir en cada corrida lo que no cambió.
export function cambioDatosGps(fila, vis) {
  const iso = (x) => (x ? new Date(x).toISOString() : null);
  if (!vis) return fila?.llegada_gps_at != null;
  return iso(fila?.llegada_gps_at) !== iso(vis.llegada) || iso(fila?.salida_gps_at) !== iso(vis.salida)
    || Number(fila?.permanencia_gps_s) !== vis.permanenciaS || Number(fila?.distancia_gps_m) !== vis.distanciaM;
}

// ¿La parada es la base (oficina/almacén de donde sale y a donde vuelve el
// camión)? Por coordenada (≤ radioM de la base) o, si no tiene, por el nombre.
export function esParadaBase(par, base, { radioM = 120 } = {}) {
  const lat = num(par?.lat), lng = num(par?.lng);
  if (base && Number.isFinite(lat) && Number.isFinite(lng)) return distanciaM(lat, lng, Number(base.lat), Number(base.lng)) <= radioM;
  return /\boficina\b/i.test(String(par?.lugar || ''));
}
