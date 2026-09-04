// lib/helpers/presupuestoObra.js
// v8.46.0: Presupuesto de costos por obra POR PARTIDA + rentabilidad (ppto / real / proyección).
//
// El presupuesto es un SNAPSHOT editable (jsonb en presupuestos_obra): se genera desde
// la configuración del proyecto + los costos por sistema, se ajusta a mano (precios
// cuadrados con maestros, % de bote, líneas manuales) y se congela al aprobar.
// El costo de materiales se alimenta de sistemas.data.materiales (rinde_m2 / costo_unidad);
// si un material NO tiene costo cargado la línea queda con costoUnidad null ("por definir")
// y se excluye de los totales con aviso — se coloca manual hasta que Odoo esté a la par.
//
// Todo en RD$ SIN ITBIS. `venta.valorCotizacionRd` (proyecto.valorCotizacion) suele venir
// CON ITBIS desde Odoo → se netea con incluyeItbis/itbisPct en el snapshot.

import { getM2Reporte, agruparAreasPorSistema, getValorDerivadoProyecto } from './calculos';

// Umbral de avance bajo el cual NO se proyecta por regla de tres (evita divisiones absurdas).
export const UMBRAL_PROYECCION_PCT = 10;

// v8.46.2: semáforo de margen en 4 bandas, ancladas al objetivo (rojo = debajo del
// objetivo). Con el global de 30% da exactamente: <30 rojo · 30-35 naranja ·
// 35-45 verde · +45 estrella. Si un sistema fija su objetivo, las bandas se
// desplazan igual (objetivo+5 / objetivo+15).
export const semaforoDe = (margenPct, objetivoPct = 30) => {
  const d = (Number(margenPct) || 0) - (Number(objetivoPct) || 30);
  if (d >= 15) return 'estrella';
  if (d >= 5) return 'verde';
  if (d >= 0) return 'ambar';
  return 'rojo';
};

// ============================================================
// CLASIFICACIÓN DE CAJA CHICA (movida desde app/page.jsx v8.19.32)
// ============================================================
export const clasificarCajaChica = (mov) => {
  // v8.47.0: el mapper de db.js entrega `datosIA` (IA mayúscula) — se aceptan ambos.
  // + keywords reales de los conceptos de campo: "gasoil", "avitacion" (hospedaje).
  const txt = `${mov.concepto || ''} ${mov.subTipo || ''} ${JSON.stringify(mov.datosIa || mov.datosIA || {})}`.toLowerCase();
  if (/desayuno|comida|almuerzo|cena|merienda|agua\s|hielo|alimento|bebida/i.test(txt)) return 'dieta';
  if (/hotel|habitaci[oó]n|avitaci|abitaci|hospedaje|alojamiento|estad[ií]a|airbnb|cuarto|cabaña/i.test(txt)) return 'hospedaje';
  if (/gasolina|gasoil|combustible|diesel|peaje|taxi|uber|transporte|pasaje|grua|grúa/i.test(txt)) return 'transporte';
  // v8.46.0: gas propano (soplete) es material de obra, no "otros"
  if (/ferreter[ií]a|tornillo|cemento|herramient|brocha|clavo|pintura|saco|cable|pvc|propano|\bgas\b|glp/i.test(txt)) return 'materiales_extra';
  return 'otros';
};

export const CATEGORIAS_GASTO = {
  dieta:            { label: '🍽️ Dieta · comida y agua', color: 'border-orange-700/50' },
  hospedaje:        { label: '🏨 Hospedaje',              color: 'border-purple-700/50' },
  transporte:       { label: '🚛 Transporte y combustible', color: 'border-blue-700/50' },
  materiales_extra: { label: '🛠️ Materiales / herramientas extra', color: 'border-cyan-700/50' },
  otros:            { label: '📋 Otros gastos',           color: 'border-zinc-700' },
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const normTxt = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// v8.47.0: ¿el producto de Odoo corresponde a esta línea de material del presupuesto?
// 1º por keywords_odoo del material del sistema; 2º por tokens del nombre (≥2 coincidencias).
export const matcheaProductoOdoo = (linea, productoNombre) => {
  const p = normTxt(productoNombre);
  const kws = (linea.keywordsOdoo || []).map(normTxt).filter(Boolean);
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (kws.some(k => new RegExp(`\\b${esc(k)}\\b`).test(p))) return true;
  const toks = normTxt(linea.nombre).split(/[^a-z0-9]+/)
    .filter(t => t.length > 3 && !['mineral', 'sobre', 'para', 'extra'].includes(t));
  const hits = toks.filter(t => p.includes(t)).length;
  return hits >= 2 || (toks.length === 1 && hits === 1);
};
const num = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? null : Number(n);

// ============================================================
// GENERADOR: presupuesto borrador desde el proyecto + costos por sistema
// ============================================================
export function generarPresupuestoDesdeProyecto({ proyecto, sistemas, config, usuarioId, version = 1 }) {
  const warnings = [];
  const tasa = Number(proyecto.tasaUsd) || null;
  const esUSD = proyecto.monedaOrigen === 'USD' && tasa;

  // --- Venta (snapshot) ---
  const sistemaPrincipal = sistemas?.[proyecto.sistema] || null;
  const derivado = getValorDerivadoProyecto(proyecto, sistemaPrincipal, sistemas || {});
  const cotizada = num(proyecto.valorCotizacion) != null && Number(proyecto.valorCotizacion) > 0;
  const valorCotizacionRd = cotizada ? Number(proyecto.valorCotizacion) : r2(derivado);
  const itbisPct = 18;
  // valorCotizacion importado de Odoo es el total CON ITBIS; el derivado m²×precio es s/ITBIS.
  const incluyeItbis = cotizada;
  const ventaSinItbisRd = r2(incluyeItbis ? valorCotizacionRd / (1 + itbisPct / 100) : valorCotizacionRd);
  if (!cotizada) warnings.push('Sin valor cotizado: la venta usa el valor derivado (m² × precio del sistema).');

  const venta = {
    valorCotizacionRd: r2(valorCotizacionRd), incluyeItbis, itbisPct, ventaSinItbisRd,
    monedaOrigen: proyecto.monedaOrigen || null, tasaUsd: tasa,
    fuente: cotizada ? 'cotizacion' : 'derivado',
  };

  // --- Líneas de costo de un grupo de sistema (materiales + MDO) ---
  const lineasDeGrupo = (grupo) => {
    const costos = [];
    const sis = grupo.sistema;
    const m2 = r2(grupo.m2Total);
    // Materiales: desde costos por sistema. Sin costo cargado → costoUnidad null (por definir).
    const mats = (sis?.materiales || []);
    if (!mats.length) warnings.push(`"${sis?.nombre || grupo.sistemaId}": sistema sin materiales configurados — agrega los materiales al sistema o líneas manuales.`);
    mats.forEach(mat => {
      const rinde = Number(mat.rinde_m2) || 0;
      const costo = Number(mat.costo_unidad) > 0 ? r2(mat.costo_unidad) : null;
      if (costo == null) warnings.push(`Material "${mat.nombre}" sin costo en el sistema — colócalo manual en el presupuesto.`);
      costos.push({
        id: `c_${grupo.sistemaId}_${mat.id}`, tipo: 'material', materialId: mat.id,
        nombre: mat.nombre, unidad: mat.unidad || '', rindeM2: rinde,
        cantidad: rinde > 0 ? r2(m2 / rinde) : null, costoUnidad: costo,
        keywordsOdoo: mat.keywords_odoo || [],
        totalRd: (costo != null && rinde > 0) ? r2((m2 / rinde) * costo) : null,
      });
    });
    // MDO según modo de pago del proyecto (los precios cuadrados con el maestro).
    const modo = proyecto.modoPagoManoObra || 'dia';
    const tareasSis = sis?.tareas || [];
    if (modo === 'm2' || modo === 'tarea') {
      const precios = (modo === 'tarea' ? proyecto.preciosManoObraTareas : proyecto.preciosTareasM2) || {};
      tareasSis.forEach(t => {
        const precio = Number(precios[t.id]) || 0;
        if (precio > 0) costos.push({
          id: `c_${grupo.sistemaId}_mdo_${t.id}`, tipo: 'mdo_tarea', tareaId: t.id,
          nombre: `MDO · ${t.nombre}`, precioM2: precio, m2, totalRd: r2(m2 * precio),
        });
      });
      const sinPrecio = tareasSis.filter(t => !(Number(precios[t.id]) > 0)).map(t => t.nombre);
      if (sinPrecio.length) warnings.push(`Tareas sin precio de MDO (no se presupuestan): ${sinPrecio.join(', ')}.`);
    } else if (modo === 'm2_fijo') {
      const precio = Number(proyecto.precioM2FijoMaestro) || 0;
      if (precio > 0) costos.push({
        id: `c_${grupo.sistemaId}_mdo_fijo`, tipo: 'mdo_tarea', tareaId: null,
        nombre: 'MDO · precio fijo por m²', precioM2: precio, m2, totalRd: r2(m2 * precio),
      });
      else warnings.push('Modo m² fijo sin precio de maestro configurado.');
    } else {
      // 'dia' / 'paquete': estimado desde el costo estándar del sistema, si existe.
      const costoStd = Number(sis?.costo_mo_m2) || 0;
      costos.push({
        id: `c_${grupo.sistemaId}_mdo_est`, tipo: 'monto_fijo', esMdo: true,
        nombre: `MDO (estimado${costoStd > 0 ? ` ${costoStd}/m² del sistema` : ' — por definir'})`,
        monto: costoStd > 0 ? r2(m2 * costoStd) : null,
        totalRd: costoStd > 0 ? r2(m2 * costoStd) : null,
      });
      if (!(costoStd > 0)) warnings.push(`MDO en modo "${modo}" sin costo estándar del sistema — presupuéstala manual.`);
    }
    return costos;
  };

  // --- Partidas ---
  const grupos = agruparAreasPorSistema(proyecto, sistemas || {});
  const gruposUsados = new Set();
  const partidas = [];

  // 1) Adicionales (productos_adicionales), con vinculación a grupo de sistema por m² (±1%)
  (proyecto.productosAdicionales || []).forEach((prod, i) => {
    const cantidad = Number(prod.cantidad) || 0;
    // precio exacto (sin redondear) para que el total no pierda centavos; se redondea solo el total
    const precioExacto = (Number(prod.precioVenta) || 0) * (esUSD ? tasa : 1);
    const precioRd = r2(precioExacto);
    const grupoVinc = grupos.find(g =>
      g.sistemaId !== proyecto.sistema && !gruposUsados.has(g.sistemaId) &&
      cantidad > 0 && Math.abs(g.m2Total - cantidad) <= cantidad * 0.01);
    if (grupoVinc) gruposUsados.add(grupoVinc.sistemaId);
    const costos = grupoVinc ? lineasDeGrupo(grupoVinc) : [];
    const ventaTotal = r2(cantidad * precioExacto);
    if (/bote|escombro|limpieza/i.test(prod.nombre || '')) {
      costos.push({
        id: `c_ad${i}_bote`, tipo: 'pct_venta', nombre: 'Bote de escombros (estimado)',
        pct: 20, totalRd: r2(ventaTotal * 0.20),
      });
    }
    partidas.push({
      id: `pt_ad_${prod.id || i}`, tipo: 'adicional', productoId: prod.id || null,
      sistemaVinculadoId: grupoVinc?.sistemaId || null,
      nombre: prod.nombre || `Adicional ${i + 1}`, m2: cantidad, unidad: prod.unidad || 'm²',
      venta: { modo: 'm2', precioM2Rd: precioRd, totalRd: ventaTotal },
      costos,
    });
  });

  // 2) Partidas de sistema (grupos no vinculados a un adicional)
  const gruposSistema = grupos.filter(g => !gruposUsados.has(g.sistemaId));
  const ventaAdicionales = partidas.reduce((s, p) => s + (p.venta?.totalRd || 0), 0);
  const ventaResidual = Math.max(0, r2(ventaSinItbisRd - ventaAdicionales));
  const m2Sistemas = gruposSistema.reduce((s, g) => s + g.m2Total, 0);
  gruposSistema.forEach(g => {
    const proporcion = m2Sistemas > 0 ? g.m2Total / m2Sistemas : 1 / (gruposSistema.length || 1);
    const totalRd = r2(ventaResidual * proporcion);
    partidas.push({
      id: `pt_sis_${g.sistemaId}`, tipo: 'sistema', sistemaId: g.sistemaId,
      nombre: g.sistema?.nombre || g.sistemaId, m2: r2(g.m2Total), unidad: 'm²',
      venta: { modo: 'm2', precioM2Rd: g.m2Total > 0 ? r2(totalRd / g.m2Total) : 0, totalRd },
      costos: lineasDeGrupo(g),
    });
  });
  if (!partidas.length) warnings.push('Proyecto sin áreas/sistema: agrega partidas manuales.');

  // --- Gastos comunes de obra (semilla en 0; el real llega de caja chica) ---
  const gastos = Object.keys(CATEGORIAS_GASTO).map(cat => ({
    id: `g_${cat}`, categoria: cat, nombre: CATEGORIAS_GASTO[cat].label.replace(/^\S+\s/, ''),
    modo: 'monto', totalRd: 0,
  }));

  return {
    id: `ppto_${Date.now()}`, proyectoId: proyecto.id, version, estado: 'borrador',
    venta, partidas, gastos, notas: '', creadoPorId: usuarioId || null, warnings,
  };
}

// ============================================================
// RENTABILIDAD: presupuesto vs real vs proyección
// ============================================================
// estadoPago (calcEstadoPagoProyecto) es opcional: sin él (modo ligero del portafolio)
// la MDO real sale de reportes × precios; con él se muestran además pagado/devengado.
export function calcRentabilidadObra({
  presupuesto, proyecto, sistemas, reportes = [], envios = [],
  movimientosCajaChica = [], estadoPago = null, mdoPagadoRd = null, config = {},
  salidasOdoo = null,   // { productos: [{producto, cantidad}] } de /api/odoo/salidas-almacen
}) {
  const productosOdoo = (salidasOdoo?.productos || []).map(x => ({ ...x }));
  const odooMatcheados = new Set();

  // v8.47.0: gastos de caja chica que corresponden a un MATERIAL del presupuesto
  // (ej. gas propano comprado en obra) se asignan a esa línea y NO se cuentan
  // también en "materiales extra" — evita doble conteo material + gasto.
  const cajaMaterialPorLinea = {};
  const movsAsignadosAMaterial = new Set();
  (movimientosCajaChica || []).forEach(m => {
    if (m.proyectoId !== proyecto.id || m.status === 'rechazado' || m.tipo !== 'gasto_factura') return;
    if (clasificarCajaChica(m) !== 'materiales_extra') return;
    const texto = `${m.concepto || ''} ${m.proveedor || ''}`;
    for (const pt of (presupuesto.partidas || [])) {
      for (const l of (pt.costos || [])) {
        if (l.tipo === 'material' && matcheaProductoOdoo(l, texto)) {
          cajaMaterialPorLinea[l.id] = r2((cajaMaterialPorLinea[l.id] || 0) + (Number(m.monto) || 0));
          movsAsignadosAMaterial.add(m.id);
          return;
        }
      }
    }
  });
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id && !r.reparacion); // v8.50.0: retoques no cuentan avance
  const enviosProy = envios.filter(e => e.proyectoId === proyecto.id);

  // --- avance ponderado (0..1) de un conjunto de áreas de un sistema ---
  const avanceDeGrupo = (sistemaId) => {
    const areas = (proyecto.areas || []).filter(a => (a.sistemaId || proyecto.sistema) === sistemaId);
    const sis = sistemas?.[sistemaId];
    if (!areas.length || !sis?.tareas?.length) return null;
    const m2Tot = areas.reduce((s, a) => s + (Number(a.m2) || 0), 0);
    if (m2Tot <= 0) return null;
    let pond = 0;
    areas.forEach(area => {
      const reps = reportesProy.filter(r => r.areaId === area.id);
      const porTarea = {};
      reps.forEach(r => { porTarea[r.tareaId] = (porTarea[r.tareaId] || 0) + getM2Reporte(r, sis); });
      sis.tareas.forEach(t => {
        const m2 = Math.min(porTarea[t.id] || 0, area.m2);
        pond += m2 * ((Number(t.peso) || 0) / 100);
      });
    });
    return Math.min(1, pond / m2Tot);
  };

  // m² reales por tarea (capeados por área) para MDO real — dentro de un sistema
  const m2RealTarea = (sistemaId, tareaId) => {
    const areas = (proyecto.areas || []).filter(a => (a.sistemaId || proyecto.sistema) === sistemaId);
    const sis = sistemas?.[sistemaId];
    if (!sis) return 0;
    let total = 0;
    areas.forEach(area => {
      const m2 = reportesProy
        .filter(r => r.areaId === area.id && r.tareaId === tareaId)
        .reduce((s, r) => s + getM2Reporte(r, sis), 0);
      total += Math.min(m2, Number(area.m2) || 0);
    });
    return total;
  };

  const proyectar = (ppto, real, avance) => {
    // v8.47.0: sin gasto real registrado NO se proyecta 0 — se mantiene el presupuesto.
    // (los materiales de Dalan salieron por Odoo, no por envíos del ERP, y la
    // proyección caía a 0 inflando el margen)
    if (real == null || real === 0) return ppto ?? 0;
    const av = avance == null ? null : Math.max(0, Math.min(1, avance));
    if (av != null && av * 100 >= UMBRAL_PROYECCION_PCT) return Math.max(r2(real / av), r2(real));
    return Math.max(ppto ?? 0, r2(real));
  };

  const sinCosto = [];
  let avanceGlobalPondM2 = 0, m2TotalPartidas = 0;

  // v8.46.1: margen objetivo POR SISTEMA (sistema.margen_objetivo_pct); el global
  // de Configuración es el fallback cuando el sistema no fija el suyo.
  const objetivoGlobal = Number(config.margen_objetivo_pct) || 30;
  const objetivoDe = (sisId) => {
    const propio = Number(sistemas?.[sisId]?.margen_objetivo_pct);
    return propio > 0 ? propio : objetivoGlobal;
  };

  const partidas = (presupuesto.partidas || []).map(p => {
    const sisId = p.sistemaId || p.sistemaVinculadoId;
    const avance = sisId ? avanceDeGrupo(sisId) : null;
    const objetivoPct = sisId ? objetivoDe(sisId) : objetivoGlobal;
    const ventaRd = p.venta?.totalRd || 0;
    const ventaDevengada = avance != null ? r2(ventaRd * avance) : null;

    const lineas = (p.costos || []).map(l => {
      let real = null, ppto = l.totalRd;
      if (l.tipo === 'material') {
        const cantErp = enviosProy.filter(e => e.materialId === l.materialId)
          .reduce((s, e) => s + (Number(e.cantidad) || 0), 0);
        // v8.47.0: + salidas de almacén de Odoo (delivery orders por referencia)
        let cantOdoo = 0;
        productosOdoo.forEach(pr => {
          if (!odooMatcheados.has(pr.producto) && matcheaProductoOdoo(l, pr.producto)) {
            odooMatcheados.add(pr.producto);
            cantOdoo += pr.cantidad;
          }
        });
        const cant = r2(cantErp + cantOdoo);
        const realCajaRd = cajaMaterialPorLinea[l.id] || 0;
        real = l.costoUnidad != null ? r2(cant * l.costoUnidad + realCajaRd) : (realCajaRd > 0 ? realCajaRd : null);
        if (l.costoUnidad == null) sinCosto.push(l.nombre);
        // Materiales: la proyección tiene PISO en el presupuesto (consumo por debajo de lo
        // teórico suele ser sub-registro, no ahorro) y sube si el despacho real va por encima.
        let proyMat = null;
        if (l.costoUnidad != null || (cajaMaterialPorLinea[l.id] || 0) > 0) {
          const av = avance == null ? null : Math.max(0, Math.min(1, avance));
          const porRitmo = (real > 0 && av != null && av * 100 >= UMBRAL_PROYECCION_PCT) ? r2(real / av) : 0;
          proyMat = Math.max(ppto ?? 0, porRitmo, real || 0);
        }
        return { ...l, cantidadReal: cant, cantidadOdoo: r2(cantOdoo), realCajaRd, real, proyeccion: proyMat };
      }
      if (l.tipo === 'mdo_tarea') {
        const m2 = l.tareaId && sisId ? m2RealTarea(sisId, l.tareaId)
          : (avance != null ? (p.m2 || 0) * avance : 0); // m2_fijo: avance ponderado
        real = r2(Math.min(m2, l.m2 || m2) * (l.precioM2 || 0));
        // la MDO es contractual por m²: al completar cuesta el presupuesto (o más si hubo extras)
        return { ...l, m2Real: r2(m2), real, proyeccion: Math.max(ppto ?? 0, real) };
      }
      if (l.tipo === 'pct_venta') {
        real = ventaDevengada != null ? r2(ventaDevengada * ((l.pct || 0) / 100)) : 0;
        // el % es un estimado: la proyección es el ppto (no se infla por regla de tres)
        return { ...l, real, estimado: true, proyeccion: Math.max(ppto ?? 0, real) };
      }
      // monto_fijo (incl. MDO estimada en modo día): real solo si viene de nómina
      if (l.esMdo && mdoPagadoRd != null) real = r2(mdoPagadoRd);
      return { ...l, real, proyeccion: l.totalRd != null ? Math.max(l.totalRd, real || 0) : null };
    });

    const suma = (k) => r2(lineas.reduce((s, l) => s + (l[k] ?? 0), 0));
    const costoPpto = suma('totalRd'), costoReal = suma('real'), costoProyectado = suma('proyeccion');
    if (p.m2 > 0 && avance != null) { avanceGlobalPondM2 += avance * p.m2; m2TotalPartidas += p.m2; }
    const margenPctProyPartida = ventaRd > 0 ? ((ventaRd - costoProyectado) / ventaRd) * 100 : 0;
    return {
      ...p, avance, ventaRd, ventaDevengada, lineas, objetivoPct,
      semaforo: semaforoDe(margenPctProyPartida, objetivoPct),
      costoPpto, costoReal, costoProyectado,
      margenPpto: r2(ventaRd - costoPpto), margenProyectado: r2(ventaRd - costoProyectado),
      margenPctPpto: ventaRd > 0 ? ((ventaRd - costoPpto) / ventaRd) * 100 : 0,
      margenPctProyectado: ventaRd > 0 ? ((ventaRd - costoProyectado) / ventaRd) * 100 : 0,
    };
  });

  const avanceGlobal = m2TotalPartidas > 0 ? avanceGlobalPondM2 / m2TotalPartidas : null;

  // --- Gastos de obra: real desde caja chica clasificada ---
  const realPorCat = { dieta: 0, hospedaje: 0, transporte: 0, materiales_extra: 0, otros: 0 };
  const movsPorCat = { dieta: [], hospedaje: [], transporte: [], materiales_extra: [], otros: [] };
  (movimientosCajaChica || []).forEach(m => {
    if (m.proyectoId !== proyecto.id || m.status === 'rechazado') return;
    if (movsAsignadosAMaterial.has(m.id)) return; // ya contado en la línea de material
    let cat = null;
    if (m.tipo === 'gasto_factura') cat = clasificarCajaChica(m);
    else if (m.tipo === 'dieta') cat = 'dieta';
    else if (m.tipo === 'hospedaje') cat = 'hospedaje';
    if (!cat) return;
    realPorCat[cat] += Number(m.monto) || 0;
    movsPorCat[cat].push(m);
  });
  const gastos = (presupuesto.gastos || []).map(g => {
    const ppto = g.modo === 'por_dia' ? r2((Number(g.dias) || 0) * (Number(g.montoDia) || 0)) : (Number(g.totalRd) || 0);
    const real = r2(realPorCat[g.categoria] ?? 0);
    return { ...g, ppto, real, proyeccion: proyectar(ppto, real, avanceGlobal), movimientos: movsPorCat[g.categoria] || [] };
  });

  const sum = (arr, k) => r2(arr.reduce((s, x) => s + (x[k] ?? 0), 0));
  const ventaTotal = presupuesto.venta?.ventaSinItbisRd || sum(partidas, 'ventaRd');
  const ventaDevengada = r2(partidas.reduce((s, p) => s + (p.ventaDevengada ?? 0), 0));
  const costoPpto = sum(partidas, 'costoPpto') + sum(gastos, 'ppto');
  const costoReal = sum(partidas, 'costoReal') + sum(gastos, 'real');
  const costoProyectado = sum(partidas, 'costoProyectado') + sum(gastos, 'proyeccion');
  const margenPpto = r2(ventaTotal - costoPpto);
  const margenReal = r2(ventaDevengada - costoReal);
  const margenProyectado = r2(ventaTotal - costoProyectado);
  const margenPctPpto = ventaTotal > 0 ? (margenPpto / ventaTotal) * 100 : 0;
  const margenPctProyectado = ventaTotal > 0 ? (margenProyectado / ventaTotal) * 100 : 0;
  // Objetivo de la obra = promedio de los objetivos por sistema ponderado por la venta de cada partida
  const ventaPond = partidas.reduce((s, p) => s + (p.ventaRd || 0), 0);
  const objetivo = ventaPond > 0
    ? partidas.reduce((s, p) => s + (p.ventaRd || 0) * (p.objetivoPct || objetivoGlobal), 0) / ventaPond
    : objetivoGlobal;
  const semaforo = semaforoDe(margenPctProyectado, objetivo);

  const salidasOdooNoMatch = productosOdoo.filter(pr => !odooMatcheados.has(pr.producto));

  return {
    partidas, gastos, salidasOdooNoMatch,
    totales: {
      objetivoPct: r2(objetivo),
      ventaSinItbisRd: r2(ventaTotal), ventaDevengada,
      costoPpto: r2(costoPpto), costoReal: r2(costoReal), costoProyectado: r2(costoProyectado),
      margenPpto, margenReal, margenProyectado, margenPctPpto, margenPctProyectado,
      avanceGlobalPct: avanceGlobal != null ? avanceGlobal * 100 : null,
      mdoDevengadoNomina: estadoPago?.montoDevengado ?? null,
      mdoPagadoNomina: estadoPago?.montoPagado ?? (mdoPagadoRd != null ? r2(mdoPagadoRd) : null),
    },
    sinCosto, semaforo,
  };
}
