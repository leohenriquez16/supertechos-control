// v8.77.0: metros ejecutados por encima de lo contratado (cotizado + órdenes de cambio).
//
// Hoy el avance, la producción y la cubicación se topan en el m² del área, así que si en
// obra salen 180 m² donde se cotizaron 150, los 30 de más no aparecen en ninguna parte
// (pero la nómina sí los paga). Este helper los saca a la luz para Rentabilidad.
//
// Decisiones de Leo (19-nov-2026):
//   - El exceso SE PAGA al maestro (cuenta como costo real) aunque el cliente no lo apruebe.
//   - Tolerancia: hasta 5% por encima se absorbe sin orden de cambio.
//   - Se cobra al MISMO precio por m² del área (el de la orden de cambio).
//   - Lo ejecutado de más ANTES del corte se da por perdido (no se persigue).
//   - Aplican órdenes de cambio: el owner y el rol 'ordenes_cambio' (Miguel, Erisdania).
//
// El exceso se mide por tarea del sistema (lona, topcoat…) y se pondera por el peso de
// cada tarea, igual que el avance: si solo la lona va por 180 m², cuenta la parte de la
// lona. Así el RD$ coincide con la producción que hoy se pierde por el tope.

export const TOLERANCIA_EXCESO = 0.05;
export const FECHA_CORTE_EXCESO = '2026-11-20'; // antes de esta fecha: dado por perdido
export const ESTADOS_OC_ABIERTA = ['borrador', 'enviada', 'aprobada_cliente'];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// m² de un reporte (rollos × 8.5 si la tarea se reporta en rollos) — igual que calculos.getM2Reporte
export const m2DeReporte = (r, sistema) => {
  if (r.m2 !== undefined && r.m2 !== null && r.m2 !== '') return Number(r.m2) || 0;
  const tarea = (sistema?.tareas || []).find(t => t.id === r.tareaId);
  if (tarea?.reporta === 'rollos' && r.rollos) return Number(r.rollos) * 8.5;
  return 0;
};

// Reportes que cuentan como trabajo ejecutado: sin retoques, sin rechazados y sin los
// excluidos de nómina (duplicados ya marcados por la oficina).
export const reporteCuenta = (r) => !r.reparacion && r.atrasoEstado !== 'rechazado' && !r.excluirNomina;

// Precio de venta por m² del área: el del área si tiene uno propio, si no el del sistema.
// Es el mismo que pone la orden de cambio (TabCambios) — "mismo precio por m²".
export const precioM2Area = (area, sistema) => {
  const propio = Number(area?.precioVentaM2);
  if (area && area.precioVentaM2 !== '' && area.precioVentaM2 != null && propio > 0) return propio;
  return Number(sistema?.precio_m2) || 0;
};

// m² que trae una orden de cambio para un área
const m2DeOcEnArea = (oc, areaId) => (oc?.lineas || [])
  .filter(l => l.areaId === areaId)
  .reduce((s, l) => s + (Number(l.m2) || 0), 0);

// Reportes posiblemente duplicados: misma área, tarea y fecha con m² iguales (±1%).
export const esMismoM2 = (a, b) => {
  const x = Number(a) || 0, y = Number(b) || 0;
  if (x <= 0 || y <= 0) return false;
  return Math.abs(x - y) <= Math.max(x, y) * 0.01;
};
export function duplicadosDeReportes(reportes, sistema) {
  const grupos = {};
  for (const r of reportes) {
    if (!reporteCuenta(r)) continue;
    const k = `${r.areaId}|${r.tareaId}|${String(r.fecha || '').slice(0, 10)}`;
    (grupos[k] = grupos[k] || []).push(r);
  }
  const dup = [];
  for (const lista of Object.values(grupos)) {
    for (let i = 1; i < lista.length; i++) {
      const previo = lista.slice(0, i).find(p => esMismoM2(m2DeReporte(p, sistema), m2DeReporte(lista[i], sistema)));
      if (previo) dup.push({ reporte: lista[i], igualA: previo });
    }
  }
  return dup;
}

// Para el formulario de avance: ¿ya hay un reporte igual hoy? (misma área, tarea, fecha y m² ±1%)
export function reporteParecido(reportes, { proyectoId, areaId, tareaId, fecha, m2 }) {
  const f = String(fecha || '').slice(0, 10);
  return (reportes || []).find(r => r.proyectoId === proyectoId && r.areaId === areaId && r.tareaId === tareaId
    && String(r.fecha || '').slice(0, 10) === f && reporteCuenta(r) && esMismoM2(r.m2 ?? (r.rollos ? r.rollos * 8.5 : 0), m2)) || null;
}

// Exceso de UN área.
//   contratado = area.m2 (incluye las órdenes de cambio ya aplicadas, que suman m² al área)
//   cotizado   = area.m2Cotizado (se congela al primer guardado desde v8.77; null en áreas viejas)
export function excesoDeArea({ area, sistema, reportes = [], ordenesCambio = [], fechaCorte = FECHA_CORTE_EXCESO, tolerancia = TOLERANCIA_EXCESO }) {
  const contratado = Number(area?.m2) || 0;
  const tareas = (sistema?.tareas || []).filter(t => t.reporta !== 'unidades');
  const pesoTotal = tareas.reduce((s, t) => s + (Number(t.peso) || 0), 0);
  const reps = reportes.filter(r => r.areaId === area.id && reporteCuenta(r));
  const precio = precioM2Area(area, sistema);

  let m2Total = 0, m2Previo = 0, maxTarea = null;
  for (const t of tareas) {
    const w = pesoTotal > 0 ? (Number(t.peso) || 0) / pesoTotal : 1 / (tareas.length || 1);
    const deTarea = reps.filter(r => r.tareaId === t.id);
    const ej = deTarea.reduce((s, r) => s + m2DeReporte(r, sistema), 0);
    const ejPrevio = deTarea.filter(r => String(r.fecha || '').slice(0, 10) < fechaCorte).reduce((s, r) => s + m2DeReporte(r, sistema), 0);
    const exc = Math.max(0, ej - contratado), excPrevio = Math.max(0, ejPrevio - contratado);
    m2Total += exc * w; m2Previo += excPrevio * w;
    if (!maxTarea || ej > maxTarea.m2) maxTarea = { tareaId: t.id, nombre: t.nombre, m2: r2(ej) };
  }
  const m2Nuevo = Math.max(0, m2Total - m2Previo); // lo de después del corte
  const pct = contratado > 0 ? m2Total / contratado : (m2Total > 0 ? 1 : 0);
  const dentroTolerancia = pct <= tolerancia;

  const abiertas = ordenesCambio.filter(oc => ESTADOS_OC_ABIERTA.includes(oc.estado));
  const m2EnOc = abiertas.reduce((s, oc) => s + m2DeOcEnArea(oc, area.id), 0);
  const m2OcAplicadas = ordenesCambio.filter(oc => oc.estado === 'aplicada').reduce((s, oc) => s + m2DeOcEnArea(oc, area.id), 0);

  const m2PorCobrar = dentroTolerancia ? 0 : m2Nuevo;
  const m2ConOc = Math.min(m2PorCobrar, m2EnOc);
  const m2SinOc = Math.max(0, m2PorCobrar - m2EnOc);

  // m² subidos a mano en la ficha (sin orden de cambio) después de congelar lo cotizado
  const cotizado = area?.m2Cotizado != null && area.m2Cotizado !== '' ? Number(area.m2Cotizado) : null;
  const ajusteManual = cotizado != null ? r2(contratado - cotizado - m2OcAplicadas) : 0;

  let estado = 'ok';
  if (m2Total > 0.01) {
    if (dentroTolerancia) estado = 'tolerancia';
    else if (m2Nuevo <= 0.01) estado = 'perdido';
    else if (m2SinOc > 0.01) estado = 'sin_oc';
    else estado = 'con_oc';
  }

  return {
    areaId: area.id, nombre: area.nombre || 'Área', sistemaId: area.sistemaId || null,
    contratado: r2(contratado), cotizado, ajusteManual: Math.abs(ajusteManual) > 0.5 ? ajusteManual : 0,
    m2Exceso: r2(m2Total), pct, maxTarea, precioM2: precio,
    m2Perdido: dentroTolerancia ? 0 : r2(m2Previo), m2Nuevo: r2(m2Nuevo),
    m2SinOc: r2(m2SinOc), m2ConOc: r2(m2ConOc),
    rdSinOc: r2(m2SinOc * precio), rdConOc: r2(m2ConOc * precio),
    rdPerdido: dentroTolerancia ? 0 : r2(m2Previo * precio),
    estado,
  };
}

// Exceso de toda la obra (áreas de cualquier sistema). `sistemas` es el mapa id → sistema.
export function excesoDeProyecto({ proyecto, sistemas = {}, reportes = [], ordenesCambio = [], fechaCorte, tolerancia }) {
  const repsProy = reportes.filter(r => r.proyectoId === proyecto.id);
  const ocsProy = ordenesCambio.filter(oc => oc.proyectoId === proyecto.id);
  const areas = (proyecto.areas || []).map(area => {
    const sistema = sistemas?.[area.sistemaId || proyecto.sistema];
    if (!sistema || !(Number(area.m2) > 0)) return null;
    const ex = excesoDeArea({ area, sistema, reportes: repsProy, ordenesCambio: ocsProy, fechaCorte, tolerancia });
    const dups = duplicadosDeReportes(repsProy.filter(r => r.areaId === area.id), sistema);
    return { ...ex, duplicados: dups.length };
  }).filter(Boolean);

  const sum = (k) => r2(areas.reduce((s, a) => s + (a[k] || 0), 0));
  const conAlgo = areas.filter(a => a.estado !== 'ok' || a.ajusteManual || a.duplicados);
  return {
    areas: conAlgo,
    m2SinOc: sum('m2SinOc'), rdSinOc: sum('rdSinOc'),
    m2ConOc: sum('m2ConOc'), rdConOc: sum('rdConOc'),
    rdPerdido: sum('rdPerdido'),
    duplicados: areas.reduce((s, a) => s + a.duplicados, 0),
    ajustesManuales: areas.filter(a => a.ajusteManual > 0).length,
    hayExceso: areas.some(a => a.estado === 'sin_oc' || a.estado === 'con_oc'),
  };
}

// Líneas para una orden de cambio borrador con el exceso sin orden (mismo precio por m²)
export function lineasOcDesdeExceso(exceso) {
  return (exceso?.areas || [])
    .filter(a => a.estado === 'sin_oc' && a.m2SinOc > 0)
    .map(a => ({
      areaId: a.areaId, nombreArea: a.nombre, m2: Math.ceil(a.m2SinOc * 100) / 100,
      precioM2: a.precioM2, sistemaId: a.sistemaId,
      monto: r2((Math.ceil(a.m2SinOc * 100) / 100) * a.precioM2),
    }));
}

// Quién puede crear desde Rentabilidad y aplicar órdenes de cambio
export const puedeGestionarOC = (u) => !!(u?.roles?.includes('owner') || u?.roles?.includes('ordenes_cambio'));

// Al guardar el proyecto: congela el m² cotizado de cada área la primera vez.
//   - área que ya existía sin m2Cotizado → toma el m² que tenía ANTES de este guardado
//   - área nueva → su m² (las que crea una orden de cambio traen m2Cotizado: 0)
export function congelarM2Cotizado(areasNuevas = [], areasAntes = []) {
  const antes = {};
  (areasAntes || []).forEach(a => { if (a?.id) antes[a.id] = a; });
  return (areasNuevas || []).map(a => {
    if (a.m2Cotizado != null && a.m2Cotizado !== '') return a;
    const prev = antes[a.id];
    if (prev) {
      const congelado = prev.m2Cotizado != null && prev.m2Cotizado !== '' ? prev.m2Cotizado : (Number(prev.m2) || 0);
      return { ...a, m2Cotizado: Number(congelado) };
    }
    return { ...a, m2Cotizado: Number(a.m2) || 0 };
  });
}
