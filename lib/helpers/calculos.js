// lib/helpers/calculos.js
// Helpers de cálculo de avance, materiales, costos, suplementos

// ============================================================
// HELPERS DE M² Y PRECIOS
// ============================================================

export const getM2Reporte = (reporte, sistema) => {
  if (reporte.m2 !== undefined && reporte.m2 !== null) return reporte.m2;
  const tarea = sistema.tareas.find(t => t.id === reporte.tareaId);
  if (tarea?.reporta === 'rollos' && reporte.rollos) return reporte.rollos * 8.5;
  return 0;
};

// v8.9.27: precio de venta por m² de un área — usa el override del área si existe, si no el del sistema
export const getPrecioVentaArea = (area, sistema) => {
  if (area && area.precioVentaM2 !== undefined && area.precioVentaM2 !== null && area.precioVentaM2 !== '') {
    const n = Number(area.precioVentaM2);
    if (!isNaN(n) && n > 0) return n;
  }
  return Number(sistema?.precio_m2) || 0;
};

// ============================================================
// SISTEMAS SUPLEMENTARIOS (v8.9.33)
// ============================================================
// Un área puede tener 0+ suplementos. Cada suplemento referencia un sistema y tiene su propio precio/m².
// Comparte los m² del área (no los duplica en el total del proyecto).
// Estructura: area.suplementos = [{ sistemaId, precioM2 }, ...]

// Devuelve el array de suplementos de un área (siempre array, nunca null)
export const getSuplementosArea = (area) => {
  if (!area || !Array.isArray(area.suplementos)) return [];
  return area.suplementos.filter(s => s && s.sistemaId);
};

// Devuelve el precio/m² efectivo de un suplemento (su override o el del sistema)
export const getPrecioSuplemento = (suplemento, sistemas) => {
  if (!suplemento) return 0;
  if (suplemento.precioM2 !== undefined && suplemento.precioM2 !== null && suplemento.precioM2 !== '') {
    const n = Number(suplemento.precioM2);
    if (!isNaN(n) && n > 0) return n;
  }
  const sis = sistemas && sistemas[suplemento.sistemaId];
  return Number(sis?.precio_m2) || 0;
};

// Devuelve la suma del precio/m² del principal + todos los suplementos de un área
export const getPrecioTotalM2Area = (area, sistemaPrincipal, sistemas) => {
  const precioPrincipal = getPrecioVentaArea(area, sistemaPrincipal);
  const suplementos = getSuplementosArea(area);
  const sumaSuplementos = suplementos.reduce((acc, s) => acc + getPrecioSuplemento(s, sistemas), 0);
  return precioPrincipal + sumaSuplementos;
};

// Devuelve array de TODOS los sistemas usados en un área: [{ sistemaId, precioM2, esPrincipal }]
export const getSistemasDeArea = (area, sistemaPrincipalId, sistemas) => {
  const resultado = [];
  const idPrincipal = area?.sistemaId || sistemaPrincipalId;
  if (idPrincipal) {
    const sis = sistemas && sistemas[idPrincipal];
    resultado.push({
      sistemaId: idPrincipal,
      sistema: sis,
      precioM2: getPrecioVentaArea(area, sis),
      esPrincipal: true,
    });
  }
  getSuplementosArea(area).forEach(s => {
    const sis = sistemas && sistemas[s.sistemaId];
    resultado.push({
      sistemaId: s.sistemaId,
      sistema: sis,
      precioM2: getPrecioSuplemento(s, sistemas),
      esPrincipal: false,
      suplemento: s,
    });
  });
  return resultado;
};

// ============================================================
// CÁLCULO DE AVANCE
// ============================================================

export const calcAvanceArea = (proyecto, areaId, reportes, sistema) => {
  const area = proyecto.areas.find(a => a.id === areaId);
  const reportesArea = reportes.filter(r => r.proyectoId === proyecto.id && r.areaId === areaId);
  const m2PorTarea = {};
  sistema.tareas.forEach(t => { m2PorTarea[t.id] = 0; });
  reportesArea.forEach(r => { m2PorTarea[r.tareaId] = (m2PorTarea[r.tareaId] || 0) + getM2Reporte(r, sistema); });
  let avancePonderado = 0;
  sistema.tareas.forEach(t => {
    const m2 = Math.min(m2PorTarea[t.id] || 0, area.m2);
    avancePonderado += (m2 / area.m2) * t.peso;
  });
  const produccionRD = sistema.tareas.reduce((acc, t) => {
    const m2 = Math.min(m2PorTarea[t.id] || 0, area.m2);
    return acc + m2 * getPrecioVentaArea(area, sistema) * (t.peso / 100);
  }, 0);
  return { porcentaje: avancePonderado, produccionRD, m2PorTarea };
};

export const calcAvanceProyecto = (proyecto, reportes, sistema, sistemas) => {
  const m2Total = proyecto.areas.reduce((a, ar) => a + ar.m2, 0);
  let valorContrato = 0;
  let avanceTotal = 0, produccionTotal = 0;
  proyecto.areas.forEach(area => {
    // v8.9.2: sistema por área si sistemas está disponible
    const sistemaIdArea = area.sistemaId || proyecto.sistema;
    const sistemaArea = (sistemas && sistemas[sistemaIdArea]) || sistema;
    if (!sistemaArea) return;
    // v8.9.33: valorContrato suma principal + suplementos (sin duplicar m²)
    valorContrato += area.m2 * getPrecioTotalM2Area(area, sistemaArea, sistemas);
    const { porcentaje, produccionRD } = calcAvanceArea(proyecto, area.id, reportes, sistemaArea);
    if (m2Total > 0) avanceTotal += (area.m2 / m2Total) * porcentaje;
    produccionTotal += produccionRD;
  });
  return { porcentaje: avanceTotal, produccionRD: produccionTotal, valorContrato, m2Total };
};

// ============================================================
// CÁLCULO DE MATERIALES
// ============================================================

export const calcMateriales = (proyecto, reportes, envios, sistema) => {
  const m2Total = proyecto.areas.reduce((a, ar) => a + ar.m2, 0);
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id);
  const enviosProy = envios.filter(e => e.proyectoId === proyecto.id);
  return sistema.materiales.map(mat => {
    const requerido = m2Total / mat.rinde_m2;
    const enviado = enviosProy.filter(e => e.materialId === mat.id).reduce((acc, e) => acc + e.cantidad, 0);
    let usado = 0;
    if (mat.modo_consumo === 'reportado') {
      reportesProy.forEach(r => {
        if (mat.id === 'membrana' && r.rollos) usado += r.rollos;
        if (mat.id === 'primer' && r.cubetas) usado += r.cubetas;
      });
    } else if (mat.modo_consumo === 'calculado') {
      reportesProy.filter(r => r.tareaId === mat.tarea_asociada).forEach(r => {
        usado += getM2Reporte(r, sistema) / mat.rinde_m2;
      });
    }
    const m2EjTarea = reportesProy.filter(r => r.tareaId === mat.tarea_asociada).reduce((acc, r) => acc + getM2Reporte(r, sistema), 0);
    const desviacion = m2EjTarea > 0 ? ((usado - (m2EjTarea / mat.rinde_m2)) / (m2EjTarea / mat.rinde_m2)) * 100 : 0;
    return { ...mat, requerido, enviado, usado, enObra: enviado - usado, m2EjecutadosTarea: m2EjTarea, desviacion };
  });
};

// v8.9.3: Agrupa áreas del proyecto por su sistema. Devuelve array de grupos.
export const agruparAreasPorSistema = (proyecto, sistemas) => {
  const grupos = {};
  (proyecto.areas || []).forEach(area => {
    const sisId = area.sistemaId || proyecto.sistema;
    if (!sisId) return;
    if (!grupos[sisId]) {
      grupos[sisId] = {
        sistemaId: sisId,
        sistema: sistemas[sisId] || null,
        areas: [],
        m2Total: 0,
      };
    }
    grupos[sisId].areas.push(area);
    grupos[sisId].m2Total += area.m2;
  });
  return Object.values(grupos);
};

// v8.9.3: Calcula materiales requeridos por grupo (sistema + sus áreas)
export const calcMaterialesGrupo = (grupo, proyecto, reportes, envios) => {
  if (!grupo.sistema || !grupo.sistema.materiales || grupo.sistema.materiales.length === 0) {
    return [];
  }
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id);
  const enviosProy = envios.filter(e => e.proyectoId === proyecto.id);
  const areaIds = new Set(grupo.areas.map(a => a.id));
  // Reportes solo de ESAS áreas
  const reportesGrupo = reportesProy.filter(r => areaIds.has(r.areaId));

  return grupo.sistema.materiales.map(mat => {
    const requerido = mat.rinde_m2 > 0 ? grupo.m2Total / mat.rinde_m2 : 0;
    const enviado = enviosProy.filter(e => e.materialId === mat.id).reduce((acc, e) => acc + e.cantidad, 0);
    let usado = 0;
    if (mat.modo_consumo === 'reportado') {
      reportesGrupo.forEach(r => {
        if (mat.id === 'membrana' && r.rollos) usado += r.rollos;
        if (mat.id === 'primer' && r.cubetas) usado += r.cubetas;
      });
    } else if (mat.modo_consumo === 'calculado') {
      reportesGrupo.filter(r => r.tareaId === mat.tarea_asociada).forEach(r => {
        usado += getM2Reporte(r, grupo.sistema) / mat.rinde_m2;
      });
    }
    // Desglose por área
    const porArea = grupo.areas.map(area => ({
      id: area.id,
      nombre: area.nombre,
      m2: area.m2,
      requerido: mat.rinde_m2 > 0 ? area.m2 / mat.rinde_m2 : 0,
    }));
    return { ...mat, requerido, enviado, usado, enObra: enviado - usado, porArea };
  });
};

// ============================================================
// DIETA Y ANÁLISIS DE COSTO
// ============================================================

export const calcDieta = (proyecto, reportes) => {
  if (!proyecto.dieta?.habilitada) return null;
  const { tarifa_dia_persona, dias_hombre_presupuestados, personasIds = [] } = proyecto.dieta;
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id);
  const diasTrabajados = new Set(reportesProy.map(r => r.fecha));
  const diasHombreConsumidos = diasTrabajados.size * personasIds.length;
  const montoPresupuestado = dias_hombre_presupuestados * tarifa_dia_persona;
  const montoConsumido = diasHombreConsumidos * tarifa_dia_persona;
  const pctConsumido = montoPresupuestado > 0 ? (montoConsumido / montoPresupuestado) * 100 : 0;
  return {
    diasTrabajados: diasTrabajados.size, personasPorDia: personasIds.length,
    diasHombreConsumidos, diasHombrePresupuestados: dias_hombre_presupuestados,
    montoConsumido, montoPresupuestado,
    disponible: montoPresupuestado - montoConsumido,
    pctConsumido, tarifa: tarifa_dia_persona,
  };
};

export const calcAnalisisCosto = (proyecto, reportes, envios, sistema, config, sistemas) => {
  const m2Total = proyecto.areas.reduce((a, ar) => a + ar.m2, 0);
  // v8.9.27: respetar precio custom por área si existe
  // v8.9.33: incluir suplementos si sistemas está disponible
  const valorContrato = proyecto.areas.reduce((acc, ar) => {
    if (sistemas) {
      const sistemaIdArea = ar.sistemaId || proyecto.sistema;
      const sistemaArea = sistemas[sistemaIdArea] || sistema;
      return acc + ar.m2 * getPrecioTotalM2Area(ar, sistemaArea, sistemas);
    }
    return acc + ar.m2 * getPrecioVentaArea(ar, sistema);
  }, 0);
  const costoMaterialesTeorico = sistema.materiales.reduce((acc, mat) => acc + (m2Total / mat.rinde_m2) * (mat.costo_unidad || 0), 0);
  const enviosProy = envios.filter(e => e.proyectoId === proyecto.id);
  const costoMaterialesReal = sistema.materiales.reduce((acc, mat) => {
    const enviado = enviosProy.filter(e => e.materialId === mat.id).reduce((a, e) => a + e.cantidad, 0);
    return acc + enviado * (mat.costo_unidad || 0);
  }, 0);
  const costoMO = m2Total * (sistema.costo_mo_m2 || 0);
  const dieta = calcDieta(proyecto, reportes);
  const costoDietaPresupuestado = dieta?.montoPresupuestado || 0;
  const costoDietaReal = dieta?.montoConsumido || 0;
  const costoDirectoTeorico = costoMaterialesTeorico + costoMO + costoDietaPresupuestado;
  const costoDirectoReal = costoMaterialesReal + costoMO + costoDietaReal;
  const costoIndirectoTeorico = costoDirectoTeorico * (config.costos_indirectos_pct / 100);
  const costoIndirectoReal = costoDirectoReal * (config.costos_indirectos_pct / 100);
  const costoTotalTeorico = costoDirectoTeorico + costoIndirectoTeorico;
  const costoTotalReal = costoDirectoReal + costoIndirectoReal;
  const margenTeorico = valorContrato - costoTotalTeorico;
  const margenReal = valorContrato - costoTotalReal;
  const margenPctTeorico = valorContrato > 0 ? (margenTeorico / valorContrato) * 100 : 0;
  const margenPctReal = valorContrato > 0 ? (margenReal / valorContrato) * 100 : 0;
  return { valorContrato, m2Total, costoMaterialesTeorico, costoMaterialesReal, costoMO, costoDietaPresupuestado, costoDietaReal, costoIndirectoTeorico, costoIndirectoReal, costoTotalTeorico, costoTotalReal, margenTeorico, margenReal, margenPctTeorico, margenPctReal };
};

// ============================================================
// PRODUCCIÓN POR DÍA (para charts y reportes)
// ============================================================

export const produccionPorDia = (reportes, proyectos, sistemas) => {
  const porDia = {};
  reportes.forEach(r => {
    const proy = proyectos.find(p => p.id === r.proyectoId);
    if (!proy) return;
    // v8.9.27: buscar área y usar su sistema/precio si aplica
    const area = (proy.areas || []).find(a => a.id === r.areaId);
    const sistemaIdUsado = (area && area.sistemaId) || proy.sistema;
    const sistema = sistemas[sistemaIdUsado];
    if (!sistema) return;
    const tarea = sistema.tareas.find(t => t.id === r.tareaId);
    if (!tarea) return;
    const m2 = getM2Reporte(r, sistema);
    const precio = getPrecioVentaArea(area, sistema);
    porDia[r.fecha] = (porDia[r.fecha] || 0) + m2 * precio * (tarea.peso / 100);
  });
  return porDia;
};
