// v8.77.0: metros ejecutados por encima de lo contratado (cotizado + órdenes de cambio).
//
// Hoy el avance, la producción y la cubicación se topan en el m² del área, así que si en
// obra salen 180 m² donde se cotizaron 150, los 30 de más no aparecen en ninguna parte
// (pero la nómina sí los paga). Este helper los saca a la luz para Rentabilidad.
//
// Decisiones de Leo (19-nov-2026):
//   - El exceso SE PAGA al maestro (cuenta como costo real) aunque el cliente no lo apruebe.
//   - Tolerancia: si lo nuevo de más es hasta 5% del área, se absorbe; si pasa, se cobra todo.
//   - Se cobra al MISMO precio por m² del área (el de la orden de cambio).
//   - Lo ejecutado de más ANTES del corte se da por perdido (no se persigue).
//   - Aplican órdenes de cambio: el owner y el rol 'ordenes_cambio' (Miguel, Erisdania).
//
// El exceso se mide en m² FÍSICOS del área (la tarea que más lleva), no ponderado por
// peso: la orden de cambio suma m² reales al área y así no vuelve a pedirse cobrarlos.

export const TOLERANCIA_EXCESO = 0.05;
export const FECHA_CORTE_EXCESO = '2026-11-20'; // antes de esta fecha: dado por perdido
export const ESTADOS_OC_ABIERTA = ['borrador', 'enviada', 'aprobada_cliente'];
// Obra terminada pero sin facturar: ahí un área con menos m² que lo contratado es venta de menos.
// (facturado = ya se cobró: no hay nada que ajustar)
export const ESTADOS_OBRA_TERMINADA = ['finalizado_no_entregado', 'finalizado_recibido_conforme'];

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

// m² que trae una orden de cambio para un área (con signo: las rebajas son negativas)
const m2DeOcEnArea = (oc, areaId) => (oc?.lineas || [])
  .filter(l => l.areaId === areaId)
  .reduce((s, l) => s + (Number(l.m2) || 0), 0);
const m2MasDeOc = (oc, areaId) => Math.max(0, m2DeOcEnArea(oc, areaId));
const m2MenosDeOc = (oc, areaId) => Math.max(0, -m2DeOcEnArea(oc, areaId));

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

// Exceso de UN área, en m² FÍSICOS: lo que la tarea que más lleva reportó por encima de lo
// contratado. Si se cotizaron 150 y la lona va por 180, el techo mide 180: son 30 m² de más
// (las demás tareas llegarán ahí). Así la orden de cambio lleva m² reales del techo y, al
// aplicarla (el área pasa a 180), el exceso queda en 0 sin volver a pedir cobrarlo.
//
//   contratado hoy  = area.m2 (incluye las órdenes de cambio aplicadas)
//   contratado al corte = contratado hoy − m² de órdenes aplicadas desde el corte
//   perdido = lo que ya pasaba al corte (no se persigue)
//   nuevo   = exceso total − perdido − m² ya cobrados por órdenes aplicadas desde el corte
//   tolerancia: si lo nuevo es ≤ 5% del contratado, se absorbe; si pasa, se cobra todo lo nuevo.
//
// Metros DE MENOS: solo si el área está terminada (obra finalizada o área marcada
// "Completada"). Si lo ejecutado queda más de 5% por debajo de lo contratado, la diferencia
// es venta que no se puede facturar (al mismo precio por m²). Mientras la obra avanza,
// tener menos m² es normal y no se marca.
export function excesoDeArea({ area, sistema, reportes = [], ordenesCambio = [], fechaCorte = FECHA_CORTE_EXCESO, tolerancia = TOLERANCIA_EXCESO, terminada = false }) {
  const contratado = Number(area?.m2) || 0;
  const tareas = (sistema?.tareas || []).filter(t => t.reporta !== 'unidades');
  const reps = reportes.filter(r => r.areaId === area.id && reporteCuenta(r));
  const precio = precioM2Area(area, sistema);
  const desdeCorte = (iso) => String(iso || '').slice(0, 10) >= fechaCorte;

  let maxTarea = null, maxPrevio = 0;
  for (const t of tareas) {
    const deTarea = reps.filter(r => r.tareaId === t.id);
    const ej = deTarea.reduce((s, r) => s + m2DeReporte(r, sistema), 0);
    const ejPrevio = deTarea.filter(r => String(r.fecha || '').slice(0, 10) < fechaCorte).reduce((s, r) => s + m2DeReporte(r, sistema), 0);
    if (!maxTarea || ej > maxTarea.m2) maxTarea = { tareaId: t.id, nombre: t.nombre, m2: r2(ej) };
    maxPrevio = Math.max(maxPrevio, ejPrevio);
  }
  const ejecutado = maxTarea?.m2 || 0;

  const aplicadas = ordenesCambio.filter(oc => oc.estado === 'aplicada');
  const m2OcAplicadas = aplicadas.reduce((s, oc) => s + m2DeOcEnArea(oc, area.id), 0); // con signo
  // Aumentos aplicados desde el corte (sin fecha: se asume que es reciente)
  const m2OcPostCorte = aplicadas.filter(oc => !oc.aplicadaAt || desdeCorte(oc.aplicadaAt)).reduce((s, oc) => s + m2MasDeOc(oc, area.id), 0);
  const contratadoCorte = Math.max(0, contratado - m2OcPostCorte);

  const m2Total = Math.max(0, ejecutado - contratado);               // por encima de lo contratado hoy
  const m2Perdido = Math.max(0, maxPrevio - contratadoCorte);         // ya pasaba antes del corte
  const m2Nuevo = Math.max(0, Math.max(0, ejecutado - contratadoCorte) - m2Perdido - m2OcPostCorte);
  const pct = contratado > 0 ? m2Total / contratado : (ejecutado > 0 ? 1 : 0);
  const baseTol = Math.max(contratadoCorte, contratado); // áreas nacidas de OC: contratadoCorte = 0
  const pctNuevo = baseTol > 0 ? m2Nuevo / baseTol : (m2Nuevo > 0 ? 1 : 0);
  const dentroTolerancia = pctNuevo <= tolerancia;

  const abiertas = ordenesCambio.filter(oc => ESTADOS_OC_ABIERTA.includes(oc.estado));
  const m2EnOc = abiertas.reduce((s, oc) => s + m2MasDeOc(oc, area.id), 0);
  // área con 0 m²: no hay precio contra qué medir → solo se pide revisar la medida
  const m2PorCobrar = dentroTolerancia || contratado <= 0 ? 0 : m2Nuevo;
  const m2ConOc = Math.min(m2PorCobrar, m2EnOc);
  const m2SinOc = Math.max(0, m2PorCobrar - m2EnOc);

  // m² subidos a mano en la ficha (sin orden de cambio) después de congelar lo cotizado.
  // Las áreas nacidas de una orden de cambio (origenOc) no cuentan.
  const cotizado = area?.m2Cotizado != null && area.m2Cotizado !== '' ? Number(area.m2Cotizado) : null;
  const ajuste = cotizado != null && !area?.origenOc ? r2(contratado - cotizado - m2OcAplicadas) : 0;

  // De menos (área terminada)
  const m2Faltante = terminada && contratado > 0 ? Math.max(0, contratado - ejecutado) : 0;
  const pctMenos = contratado > 0 ? m2Faltante / contratado : 0;
  const m2MenosACobrar = pctMenos > tolerancia ? m2Faltante : 0;
  const m2RebajaEnOc = abiertas.reduce((s, oc) => s + m2MenosDeOc(oc, area.id), 0);
  const m2MenosConOc = Math.min(m2MenosACobrar, m2RebajaEnOc);
  const m2MenosSinOc = Math.max(0, m2MenosACobrar - m2RebajaEnOc);

  let estado = 'ok';
  if (contratado <= 0 && ejecutado > 0) estado = 'sin_m2';
  else if (m2MenosACobrar > 0.01) estado = m2MenosSinOc > 0.01 ? 'de_menos' : 'de_menos_oc';
  else if (m2PorCobrar > 0.01) estado = m2SinOc > 0.01 ? 'sin_oc' : 'con_oc';
  else if (m2Nuevo > 0.01) estado = 'tolerancia';
  else if (m2Perdido > 0.01 && m2Total > 0.01) estado = 'perdido';

  return {
    areaId: area.id, nombre: area.nombre || 'Área', sistemaId: area.sistemaId || null,
    contratado: r2(contratado), cotizado, ajusteManual: ajuste > 0.5 ? ajuste : 0,
    ejecutado: r2(ejecutado), m2Exceso: r2(m2Total), pct, pctNuevo, maxTarea, precioM2: precio,
    m2Perdido: r2(Math.min(m2Perdido, m2Total)), m2Nuevo: r2(m2Nuevo),
    m2SinOc: r2(m2SinOc), m2ConOc: r2(m2ConOc),
    rdSinOc: r2(m2SinOc * precio), rdConOc: r2(m2ConOc * precio),
    rdPerdido: r2(Math.min(m2Perdido, m2Total) * precio),
    terminada: !!terminada, m2Faltante: r2(m2Faltante), pctMenos,
    m2MenosSinOc: r2(m2MenosSinOc), m2MenosConOc: r2(m2MenosConOc),
    rdMenosSinOc: r2(m2MenosSinOc * precio), rdMenosConOc: r2(m2MenosConOc * precio),
    estado,
  };
}

// Exceso de toda la obra (áreas de cualquier sistema). `sistemas` es el mapa id → sistema.
export function excesoDeProyecto({ proyecto, sistemas = {}, reportes = [], ordenesCambio = [], fechaCorte, tolerancia, estadosArea = [] }) {
  const obraTerminada = ESTADOS_OBRA_TERMINADA.includes(proyecto.estado);
  const areaCompletada = (areaId) => (estadosArea || []).some(e => e.proyectoId === proyecto.id && e.areaId === areaId && e.estado === 'completada');
  const repsProy = reportes.filter(r => r.proyectoId === proyecto.id);
  const ocsProy = ordenesCambio.filter(oc => oc.proyectoId === proyecto.id);
  const areas = (proyecto.areas || []).map(area => {
    const sistema = sistemas?.[area.sistemaId || proyecto.sistema];
    if (!sistema) return null;
    const ex = excesoDeArea({ area, sistema, reportes: repsProy, ordenesCambio: ocsProy, terminada: obraTerminada || areaCompletada(area.id), ...(fechaCorte ? { fechaCorte } : {}), ...(tolerancia != null ? { tolerancia } : {}) });
    // duplicados solo desde el corte (lo viejo ya se dio por perdido)
    const corte = fechaCorte || FECHA_CORTE_EXCESO;
    const dups = duplicadosDeReportes(repsProy.filter(r => r.areaId === area.id && String(r.fecha || '').slice(0, 10) >= corte), sistema);
    return { ...ex, duplicados: dups.length };
  }).filter(Boolean);

  const sum = (k) => r2(areas.reduce((s, a) => s + (a[k] || 0), 0));
  const conAlgo = areas.filter(a => a.estado !== 'ok' || a.ajusteManual > 0 || a.duplicados > 0);
  return {
    areas: conAlgo,
    m2SinOc: sum('m2SinOc'), rdSinOc: sum('rdSinOc'),
    m2ConOc: sum('m2ConOc'), rdConOc: sum('rdConOc'),
    rdPerdido: sum('rdPerdido'),
    m2MenosSinOc: sum('m2MenosSinOc'), rdMenosSinOc: sum('rdMenosSinOc'), rdMenosConOc: sum('rdMenosConOc'),
    duplicados: areas.reduce((s, a) => s + a.duplicados, 0),
    ajustesManuales: areas.filter(a => a.ajusteManual > 0).length,
    hayExceso: areas.some(a => a.estado === 'sin_oc' || a.estado === 'con_oc'),
    // algo que pide acción: cobrar, revisar un aumento a mano o un posible duplicado
    hayMenos: areas.some(a => a.estado === 'de_menos' || a.estado === 'de_menos_oc'),
    pideAccion: areas.some(a => ['sin_oc', 'con_oc', 'de_menos', 'de_menos_oc', 'sin_m2'].includes(a.estado) || a.ajusteManual > 0 || a.duplicados > 0),
  };
}

// Líneas para una orden de cambio de REBAJA con los metros de menos (m² negativos)
export function lineasOcDesdeFaltante(exceso) {
  return (exceso?.areas || [])
    .filter(a => a.estado === 'de_menos' && a.m2MenosSinOc > 0)
    .map(a => ({
      areaId: a.areaId, nombreArea: a.nombre, m2: -r2(a.m2MenosSinOc),
      precioM2: a.precioM2, sistemaId: a.sistemaId,
      monto: -r2(r2(a.m2MenosSinOc) * a.precioM2),
    }));
}

// Líneas para una orden de cambio borrador con el exceso sin orden (mismo precio por m²)
export function lineasOcDesdeExceso(exceso) {
  return (exceso?.areas || [])
    .filter(a => a.estado === 'sin_oc' && a.m2SinOc > 0)
    .map(a => ({
      areaId: a.areaId, nombreArea: a.nombre, m2: r2(a.m2SinOc),
      precioM2: a.precioM2, sistemaId: a.sistemaId,
      monto: r2(r2(a.m2SinOc) * a.precioM2),
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

// Venta de las órdenes de cambio aplicadas DESPUÉS de hacer el presupuesto (el presupuesto
// es una foto: no las trae). Sin esto, al aplicar una orden la venta no subiría y el margen
// bajaría justo cuando se cobra el extra.
export function ventaOcPosteriores(ordenesCambio = [], proyectoId, presupuesto) {
  // fecha de la foto de venta: la de la versión original si es un clon ("Nueva versión")
  const desde = String(presupuesto?.venta?.fotoAt || presupuesto?.createdAt || '');
  return r2((ordenesCambio || [])
    .filter(oc => oc.proyectoId === proyectoId && oc.estado === 'aplicada' && (!desde || String(oc.aplicadaAt || '9999') > desde))
    .reduce((s, oc) => s + (Number(oc.montoTotal) || 0), 0));
}
