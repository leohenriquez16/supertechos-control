// Planificación tipo RUTA DE DISTRIBUCIÓN — 60 días, 2 brigadas, base Santo Domingo.
//
// Modelo:
//  - Brigadas operan en CIRCUITOS (trips), no en idas y vueltas diarias
//  - Trip = 1-N días consecutivos cubriendo un área geográfica
//  - Pernoctan en la región hasta completar el cluster
//  - Presupuesto: 12 noches/mes por brigada (compatible con políticas hoteleras)
//  - Sucursales cercanas a SD (<60 km) se hacen como trips diarios round-trip
//
// Cálculo de km por vehículo/mes basado en suma de km diarios.

import { sucursales } from '../data/banreservas-mock';

const SD = { lat: 18.4861, lng: -69.9312, label: 'Santo Domingo' };
const ROAD_FACTOR = 1.4;
const SPEED_KMH = 50;
const VISIT_MIN = 75;
const INTER_VISIT_MIN = 20;
const VISITS_PER_INTERIOR_DAY = 5;
const VISITS_PER_EDGE_DAY = 3;
const MAX_OVERNIGHTS_PER_MONTH = 12;
const UMBRAL_TRIP_KM = 60; // distancia SD → cluster para decidir si es multi-día

// Reglas horarias: sucursales abren 8 AM, regreso SD antes de 2 PM (12 PM Sáb)
const HORA_APERTURA = 8;             // 8:00 AM — primera visita NUNCA antes de esta hora
const HORA_LIMITE_REGRESO = 14;      // 2:00 PM L-V
const HORA_LIMITE_REGRESO_SAB = 12;  // mediodía Sáb (regresar antes de 2pm)
const HORA_MIN_SALIDA = 5;           // no salir antes de 5 AM (descanso)

const BRIGADAS_REGIONALES = {
  1: ['Metro Oeste', 'Metro Oriental', 'Metro Central', 'Sureste', 'Suroeste', 'Este Nordeste', 'Este Oeste'],
  2: ['Metro Norte', 'Nordeste', 'Norcentral', 'Noroeste', 'Santiago Este', 'Santiago Oeste'],
};

// ════════════ GEOMETRY ════════════
function distKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const roadKm = (a, b) => distKm(a, b) * ROAD_FACTOR;
const travelMin = (km) => Math.round((km / SPEED_KMH) * 60);

function asignarBrigada(s) {
  if (BRIGADAS_REGIONALES[1].includes(s.regional)) return 1;
  if (BRIGADAS_REGIONALES[2].includes(s.regional)) return 2;
  return 1;
}

function orderNN(start, candidatos) {
  const remaining = [...candidatos];
  const order = [];
  let curr = start;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distKm(curr, { lat: remaining[i].latitud, lng: remaining[i].longitud });
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    order.push(next);
    curr = { lat: next.latitud, lng: next.longitud };
  }
  return order;
}

// FAR-FIRST: arrancar manejando hacia la sucursal MÁS LEJANA desde SD,
// luego recorrer las demás por proximidad. Así la primera visita se hace
// llegando a las 8 AM tras manejar 1-2h, y el resto del día se vuelve hacia SD.
function orderFarFirstThenNN(start, candidatos) {
  if (candidatos.length === 0) return [];
  const remaining = [...candidatos];
  // Encontrar la más lejana desde el punto de partida (SD)
  let farIdx = 0;
  let farDist = -1;
  for (let i = 0; i < remaining.length; i++) {
    const d = distKm(start, { lat: remaining[i].latitud, lng: remaining[i].longitud });
    if (d > farDist) { farDist = d; farIdx = i; }
  }
  const first = remaining.splice(farIdx, 1)[0];
  const order = [first];
  let curr = { lat: first.latitud, lng: first.longitud };
  // NN encadenado hacia las restantes
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distKm(curr, { lat: remaining[i].latitud, lng: remaining[i].longitud });
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    order.push(next);
    curr = { lat: next.latitud, lng: next.longitud };
  }
  return order;
}

// Calcular horarios del día dado el orden de visitas
function calcHorariosDia(visits, esPrimerDiaTrip, esUltimoDiaTrip, isSaturday) {
  if (visits.length === 0) return { salidaSD: null, primeraVisita: null, ultimaVisita: null, regresoSD: null };

  // Tiempo hasta la primera visita (desde SD si primer día de trip, sino mínimo)
  const first = { lat: visits[0].latitud, lng: visits[0].longitud };
  const minHastaPrimera = esPrimerDiaTrip ? travelMin(roadKm(SD, first)) : 15;

  // Llegada primera visita debe ser >= 8:00 AM
  const aperturaMin = HORA_APERTURA * 60;
  const llegadaPrimera = aperturaMin; // siempre 8:00 AM o después
  const salidaCalc = llegadaPrimera - minHastaPrimera;
  // Si el cálculo da una hora muy temprana (< 5 AM), arrancar a las 5 y aceptar llegada después
  const salida = Math.max(salidaCalc, HORA_MIN_SALIDA * 60);
  const arribo = Math.max(llegadaPrimera, salida + minHastaPrimera);

  // Cadena de visitas: 75 min visita + INTER_VISIT_MIN entre cada una
  let curr = arribo;
  let lastVisitEnd = curr;
  let prevCoord = first;
  visits.forEach((v, i) => {
    if (i === 0) {
      lastVisitEnd = curr + VISIT_MIN;
      prevCoord = { lat: v.latitud, lng: v.longitud };
    } else {
      const interMin = Math.max(INTER_VISIT_MIN, travelMin(roadKm(prevCoord, { lat: v.latitud, lng: v.longitud })));
      curr = lastVisitEnd + interMin;
      lastVisitEnd = curr + VISIT_MIN;
      prevCoord = { lat: v.latitud, lng: v.longitud };
    }
  });

  // Regreso a SD si es último día
  let regresoSD = null;
  if (esUltimoDiaTrip) {
    const ultimoCoord = { lat: visits[visits.length - 1].latitud, lng: visits[visits.length - 1].longitud };
    regresoSD = lastVisitEnd + travelMin(roadKm(ultimoCoord, SD));
  }

  return {
    salidaSD: esPrimerDiaTrip ? salida : null,
    primeraVisita: arribo,
    ultimaVisita: lastVisitEnd,
    regresoSD,
    isSaturday,
  };
}

function fmtHoraMin(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function generarDiasLaborables(start, calendarDays) {
  const dias = [];
  for (let i = 0; i < calendarDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0) dias.push({ date: d, isSaturday: dow === 6, dow });
  }
  return dias;
}

// ════════════ CLUSTERING POR PROVINCIA ════════════
function formClusters(sucs) {
  const byProv = {};
  sucs.forEach((s) => {
    const k = s.provincia || s.regional || 'sin_zona';
    if (!byProv[k]) byProv[k] = [];
    byProv[k].push(s);
  });
  return Object.entries(byProv).map(([prov, sucs]) => {
    const lat = sucs.reduce((a, s) => a + s.latitud, 0) / sucs.length;
    const lng = sucs.reduce((a, s) => a + s.longitud, 0) / sucs.length;
    return {
      nombre: prov,
      sucursales: sucs,
      centro: { lat, lng },
      distSD: distKm({ lat, lng }, SD),
    };
  });
}

// Combina provincias cercanas (<100 km entre centroides) en un solo trip
function combinarVecinos(clusters, umbral = 100) {
  const usados = new Set();
  const combinados = [];
  for (const c of clusters) {
    if (usados.has(c.nombre)) continue;
    usados.add(c.nombre);
    const merged = {
      provincias: [c.nombre],
      sucursales: [...c.sucursales],
      centro: c.centro,
      distSD: c.distSD,
    };
    for (const otro of clusters) {
      if (usados.has(otro.nombre)) continue;
      if (distKm(c.centro, otro.centro) <= umbral) {
        merged.provincias.push(otro.nombre);
        merged.sucursales.push(...otro.sucursales);
        usados.add(otro.nombre);
      }
    }
    // recalcular centroide del cluster combinado
    const lat = merged.sucursales.reduce((a, s) => a + s.latitud, 0) / merged.sucursales.length;
    const lng = merged.sucursales.reduce((a, s) => a + s.longitud, 0) / merged.sucursales.length;
    merged.centro = { lat, lng };
    merged.distSD = distKm({ lat, lng }, SD);
    combinados.push(merged);
  }
  return combinados;
}

// ════════════ TRIP DURATION ESTIMATE ════════════
function estimateTripDays(nSucursales, distSD) {
  if (distSD <= UMBRAL_TRIP_KM && nSucursales <= 4) return 1;
  if (nSucursales <= 2) return distSD > 120 ? 2 : 1;
  if (nSucursales <= 4) return 2;
  // Trips hasta 7 días para clusters grandes (presupuesto noches lo permite)
  return Math.min(7, Math.ceil((nSucursales - 4) / VISITS_PER_INTERIOR_DAY) + 2);
}

// ════════════ TRIP PLAN — FAR-FIRST + horarios 8 AM ════════════
function planTrip(cluster, startDate, brigadaId, durationDays) {
  // FAR-FIRST: la sucursal más lejana de SD se visita PRIMERA (el día 1, manejando)
  // Para multi-día: ordenamos TODAS por distancia descendente a SD, día 1 toma las más lejanas,
  // día N las más cercanas a SD (para regreso corto), y dentro de cada día NN.
  const n = cluster.sucursales.length;
  const dayPlans = [];

  // Cuántas visitas por día
  const visitasPorDia = [];
  for (let d = 1; d <= durationDays; d++) {
    if (durationDays === 1) visitasPorDia.push(n);
    else if (d === 1 || d === durationDays) visitasPorDia.push(VISITS_PER_EDGE_DAY);
    else visitasPorDia.push(VISITS_PER_INTERIOR_DAY);
  }
  // Ajustar excesos
  const totalAsignado = visitasPorDia.reduce((a, b) => a + b, 0);
  if (totalAsignado > n) {
    let exceso = totalAsignado - n;
    for (let d = durationDays - 1; d >= 0 && exceso > 0; d--) {
      const reducir = Math.min(visitasPorDia[d], exceso);
      visitasPorDia[d] -= reducir;
      exceso -= reducir;
    }
  }

  // Si es 1 día: usar FAR-FIRST simple
  // Si es multi-día: ordenar todas por dist a SD desc, asignar las más lejanas al día 1
  let bloques;
  if (durationDays === 1) {
    bloques = [orderFarFirstThenNN(SD, cluster.sucursales)];
  } else {
    // Sucursales ordenadas por distancia a SD DESCENDENTE
    const porDistSD = [...cluster.sucursales]
      .map((s) => ({ s, dist: distKm(SD, { lat: s.latitud, lng: s.longitud }) }))
      .sort((a, b) => b.dist - a.dist)
      .map((x) => x.s);
    // Tomar slices: día 1 (lejanas) → día N (cercanas)
    bloques = [];
    let idx = 0;
    for (let d = 0; d < durationDays; d++) {
      const cap = visitasPorDia[d];
      const slice = porDistSD.slice(idx, idx + cap);
      idx += cap;
      // Dentro del día, ordenar por NN — pero arrancando desde el más lejano de SD del bloque
      // (la primera visita es la "anchor" lejana, luego NN)
      bloques.push(orderFarFirstThenNN(SD, slice));
    }
  }

  // Construir dayPlans con horarios y km
  for (let d = 0; d < durationDays; d++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + d);
    const isSaturday = dayDate.getDay() === 6;
    const visits = bloques[d];
    const esPrimero = d === 0;
    const esUltimo = d === durationDays - 1;

    // km del día
    let kmDia = 0;
    if (visits.length > 0) {
      let prev = esPrimero ? SD : { lat: visits[0].latitud, lng: visits[0].longitud };
      let firstStep = true;
      for (const v of visits) {
        const coord = { lat: v.latitud, lng: v.longitud };
        if (firstStep && esPrimero) {
          kmDia += roadKm(SD, coord);
          firstStep = false;
        } else if (firstStep && !esPrimero) {
          firstStep = false;
        } else {
          kmDia += roadKm(prev, coord);
        }
        prev = coord;
      }
      if (esUltimo) kmDia += roadKm(prev, SD);
    }

    // Horarios
    const horarios = calcHorariosDia(visits, esPrimero, esUltimo, isSaturday);

    dayPlans.push({
      date: dayDate,
      visits,
      esPrimerDia: esPrimero,
      esUltimoDia: esUltimo,
      diaN: d + 1,
      kmDia: Math.round(kmDia),
      horarios,
      salidaSD: horarios.salidaSD ? fmtHoraMin(horarios.salidaSD) : null,
      primeraVisita: fmtHoraMin(horarios.primeraVisita),
      ultimaVisita: fmtHoraMin(horarios.ultimaVisita),
      regresoSD: horarios.regresoSD ? fmtHoraMin(horarios.regresoSD) : null,
    });
  }

  const kmTotal = dayPlans.reduce((a, dp) => a + dp.kmDia, 0);
  const visitasReales = dayPlans.reduce((a, dp) => a + dp.visits.length, 0);

  return {
    id: `trip_${brigadaId}_${cluster.provincias.join('_').slice(0, 30)}_${startDate.toISOString().slice(0, 10)}`,
    brigada: brigadaId,
    region: cluster.provincias.join(' + '),
    startDate,
    endDate: dayPlans[dayPlans.length - 1].date,
    totalDays: durationDays,
    noches: durationDays - 1,
    dayPlans,
    sucursalesTotal: visitasReales,
    sucursalesPlanificadas: n,
    kmTotal,
    esMultiDia: durationDays > 1,
    distSD: cluster.distSD,
    hotelHospedaje: durationDays > 1 ? `Hotel ${cluster.provincias[0]}` : null,
  };
}

// Devuelve el "mes operativo" relativo al inicio del plan (1 o 2 en un plan de 60 días)
function opMonthFromStart(date, startPlan) {
  const daysFromStart = Math.floor((date - startPlan) / (1000 * 60 * 60 * 24));
  return Math.floor(daysFromStart / 30) + 1;
}

// ════════════ SCHEDULER POR BRIGADA ════════════
function scheduleBrigada(brigadaId, sucs, workingDays, startPlan) {
  const clustersBase = formClusters(sucs);
  const clustersCombinados = combinarVecinos(clustersBase);

  // Separar: cerca → daily, lejos → multi-día
  const farClusters = clustersCombinados.filter((c) => c.distSD > UMBRAL_TRIP_KM);
  const closeClusters = clustersCombinados.filter((c) => c.distSD <= UMBRAL_TRIP_KM);

  // Sort far clusters: más lejos primero (cubre lo difícil al inicio)
  farClusters.sort((a, b) => b.distSD - a.distSD);

  // Calendario de ocupación por brigada
  const calendar = workingDays.map((wd) => ({
    ...wd,
    ocupado: false,
    trip: null,
    dayInTrip: 0,
  }));

  // Trips planificados
  const trips = [];
  // Presupuesto de pernoctas por mes
  const overnightsByMonth = {};

  // ── Plan multi-day trips primero ──
  // Si un cluster tiene más sucursales de las que caben en un trip, se hacen múltiples viajes
  for (const cluster of farClusters) {
    let pendientesCluster = [...cluster.sucursales];
    let intentos = 0;
    while (pendientesCluster.length > 0 && intentos < 5) {
      intentos++;
      const subCluster = { ...cluster, sucursales: pendientesCluster };
      let estDays = estimateTripDays(pendientesCluster.length, cluster.distSD);

      // Buscar primer slot de N días CONSECUTIVOS sin saltar domingo
      let slot = -1;
      for (let i = 0; i <= calendar.length - estDays; i++) {
        let fits = true;
        for (let j = 0; j < estDays; j++) {
          if (calendar[i + j].ocupado) { fits = false; break; }
          if (j > 0) {
            const diff = (calendar[i + j].date - calendar[i + j - 1].date) / (1000 * 60 * 60 * 24);
            if (diff > 1) { fits = false; break; }
          }
        }
        if (!fits) continue;
        const month = opMonthFromStart(calendar[i].date, startPlan);
        const nochesEsteTrip = estDays - 1;
        const consumidas = overnightsByMonth[month] || 0;
        if (consumidas + nochesEsteTrip > MAX_OVERNIGHTS_PER_MONTH) continue;
        slot = i;
        break;
      }

      if (slot === -1) {
        // No hay espacio para este cluster — intentar con duración menor
        if (estDays > 2) {
          estDays = estDays - 1;
          for (let i = 0; i <= calendar.length - estDays; i++) {
            let fits = true;
            for (let j = 0; j < estDays; j++) {
              if (calendar[i + j].ocupado) { fits = false; break; }
              if (j > 0) {
                const diff = (calendar[i + j].date - calendar[i + j - 1].date) / (1000 * 60 * 60 * 24);
                if (diff > 1) { fits = false; break; }
              }
            }
            if (!fits) continue;
            const month = opMonthFromStart(calendar[i].date, startPlan);
            const nochesEsteTrip = estDays - 1;
            const consumidas = overnightsByMonth[month] || 0;
            if (consumidas + nochesEsteTrip > MAX_OVERNIGHTS_PER_MONTH) continue;
            slot = i;
            break;
          }
        }
        if (slot === -1) break; // no hay forma de meter ya — dejar pendientes
      }

      const startDate = calendar[slot].date;
      const trip = planTrip(subCluster, startDate, brigadaId, estDays);

      for (let j = 0; j < estDays; j++) {
        calendar[slot + j].ocupado = true;
        calendar[slot + j].trip = trip;
        calendar[slot + j].dayInTrip = j + 1;
      }

      const month = opMonthFromStart(startDate, startPlan);
      overnightsByMonth[month] = (overnightsByMonth[month] || 0) + trip.noches;

      trips.push(trip);

      // Remover sucursales planificadas del cluster pendiente
      const visitadosEsteTrip = new Set(trip.dayPlans.flatMap((dp) => dp.visits.map((v) => v.id)));
      pendientesCluster = pendientesCluster.filter((s) => !visitadosEsteTrip.has(s.id));
    }
  }

  // ── Plan daily trips en huecos ──
  // Encolar todas las sucursales cercanas, agrupadas por provincia para mantener rutas coherentes
  const closeSucs = closeClusters.flatMap((c) => c.sucursales);

  for (const dayCell of calendar) {
    if (dayCell.ocupado) continue;
    if (closeSucs.length === 0) break;

    const cap = dayCell.isSaturday ? 3 : 4;

    // Tomar 'cap' sucursales: arrancar con la más lejana de SD aún sin visitar,
    // luego NN encadenando — esto materializa la regla FAR-FIRST
    let farIdx = 0;
    let farDist = -1;
    for (let i = 0; i < closeSucs.length; i++) {
      const d = distKm(SD, { lat: closeSucs[i].latitud, lng: closeSucs[i].longitud });
      if (d > farDist) { farDist = d; farIdx = i; }
    }
    const first = closeSucs.splice(farIdx, 1)[0];
    const dayVisits = [first];
    let curr = { lat: first.latitud, lng: first.longitud };

    while (dayVisits.length < cap && closeSucs.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < closeSucs.length; i++) {
        const d = distKm(curr, { lat: closeSucs[i].latitud, lng: closeSucs[i].longitud });
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      // Si el siguiente más cercano está a >40km, mejor dejarlo para otro día
      if (bestDist > 40 && dayVisits.length >= 2) break;
      const next = closeSucs.splice(bestIdx, 1)[0];
      dayVisits.push(next);
      curr = { lat: next.latitud, lng: next.longitud };
    }

    // Calcular km del día (SD → lejana → ... → SD)
    let km = 0;
    let prev = SD;
    for (const v of dayVisits) {
      km += roadKm(prev, { lat: v.latitud, lng: v.longitud });
      prev = { lat: v.latitud, lng: v.longitud };
    }
    km += roadKm(prev, SD);

    const horarios = calcHorariosDia(dayVisits, true, true, dayCell.isSaturday);

    const trip = {
      id: `daily_${brigadaId}_${dayCell.date.toISOString().slice(0, 10)}`,
      brigada: brigadaId,
      region: dayVisits[0]?.provincia || 'Metro',
      startDate: dayCell.date,
      endDate: dayCell.date,
      totalDays: 1,
      noches: 0,
      esMultiDia: false,
      distSD: dayVisits[0] ? distKm(SD, { lat: dayVisits[0].latitud, lng: dayVisits[0].longitud }) : 0,
      dayPlans: [{
        date: dayCell.date,
        visits: dayVisits,
        esPrimerDia: true,
        esUltimoDia: true,
        diaN: 1,
        kmDia: Math.round(km),
        horarios,
        salidaSD: horarios.salidaSD ? fmtHoraMin(horarios.salidaSD) : null,
        primeraVisita: fmtHoraMin(horarios.primeraVisita),
        ultimaVisita: fmtHoraMin(horarios.ultimaVisita),
        regresoSD: horarios.regresoSD ? fmtHoraMin(horarios.regresoSD) : null,
      }],
      sucursalesTotal: dayVisits.length,
      sucursalesPlanificadas: dayVisits.length,
      kmTotal: Math.round(km),
      hotelHospedaje: null,
    };

    dayCell.ocupado = true;
    dayCell.trip = trip;
    dayCell.dayInTrip = 1;
    trips.push(trip);
  }

  // Si quedaron sucursales sin visitar en farClusters (porque no había budget de pernocta)
  // intentar acomodarlas en slots restantes como visitas múltiples
  // ... (por ahora dejamos como pendientes en la métrica)

  // Stats
  const totalVisitados = trips.reduce((a, t) => a + t.sucursalesTotal, 0);
  const totalKm = trips.reduce((a, t) => a + t.kmTotal, 0);
  const totalNoches = trips.reduce((a, t) => a + t.noches, 0);

  // km por mes y noches por mes
  const kmByMonth = {};
  const tripsByMonth = {};
  trips.forEach((t) => {
    t.dayPlans.forEach((dp) => {
      const month = opMonthFromStart(dp.date, startPlan);
      kmByMonth[month] = (kmByMonth[month] || 0) + dp.kmDia;
    });
    const m = opMonthFromStart(t.startDate, startPlan);
    if (!tripsByMonth[m]) tripsByMonth[m] = { trips: 0, noches: 0 };
    tripsByMonth[m].trips++;
    tripsByMonth[m].noches += t.noches;
  });

  return {
    brigada: brigadaId,
    calendar,
    trips,
    totalSucursales: sucs.length,
    totalVisitados,
    pendientes: sucs.length - totalVisitados,
    totalKm,
    totalNoches,
    overnightsByMonth,
    kmByMonth,
    tripsByMonth,
  };
}

// ════════════ ENTRY POINT ════════════
export function planificar(startDateStr = '2026-05-25') {
  const start = new Date(startDateStr);
  const workingDays = generarDiasLaborables(start, 60);

  const b1Sucs = sucursales.filter((s) => asignarBrigada(s) === 1);
  const b2Sucs = sucursales.filter((s) => asignarBrigada(s) === 2);

  const b1 = scheduleBrigada(1, b1Sucs, workingDays, start);
  const b2 = scheduleBrigada(2, b2Sucs, workingDays, start);

  // km/mes promedio por vehículo — el plan opera en 2 meses operativos (60 días / 30)
  const monthsCount = 2;
  const kmMesPromB1 = Math.round(b1.totalKm / monthsCount);
  const kmMesPromB2 = Math.round(b2.totalKm / monthsCount);

  return {
    startDate: start,
    workingDays,
    b1,
    b2,
    stats: {
      totalSucursales: b1.totalSucursales + b2.totalSucursales,
      totalVisitas: b1.totalVisitados + b2.totalVisitados,
      coberturaPct: ((b1.totalVisitados + b2.totalVisitados) / (b1.totalSucursales + b2.totalSucursales)) * 100,
      totalKm: b1.totalKm + b2.totalKm,
      totalNoches: b1.totalNoches + b2.totalNoches,
      kmMesPromB1,
      kmMesPromB2,
      mesesPlan: monthsCount,
      diasDisponibles: workingDays.length,
      tripsB1: b1.trips.length,
      tripsB2: b2.trips.length,
      maxNochesMes: MAX_OVERNIGHTS_PER_MONTH,
    },
  };
}

export { distKm, roadKm, travelMin, asignarBrigada, MAX_OVERNIGHTS_PER_MONTH };
