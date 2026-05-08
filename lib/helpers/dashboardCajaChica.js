// Cálculos agregados para el dashboard de Caja Chica.
// Recibe TODOS los movimientos del período y devuelve estructuras listas
// para alimentar gráficos y KPIs.

import { CATEGORIA_LABEL } from './cuadreCajaChica';

// Paleta consistente para categorías
export const COLOR_CATEGORIA = {
  ferreteria:    '#3b82f6', // azul
  combustible:   '#ef4444', // rojo
  comida:        '#f97316', // naranja
  peaje:         '#eab308', // amarillo
  transporte:    '#06b6d4', // cyan
  herramientas:  '#a855f7', // morado
  otros:         '#71717a', // gris
  sin_categoria: '#52525b', // zinc
};

// Paleta para personas (ciclo de colores agradables)
const COLORES_PERSONAS = [
  '#dc2626', '#16a34a', '#0891b2', '#ca8a04',
  '#7c3aed', '#db2777', '#0d9488', '#ea580c',
];

const colorPersona = (idx) => COLORES_PERSONAS[idx % COLORES_PERSONAS.length];

// Convierte el array data.categoriasCajaChica a un mapa { id: {nombre, color, icono} }.
// Si no viene, usa los defaults del sistema (compat).
const buildCategoriasMap = (data) => {
  const map = {};
  (data?.categoriasCajaChica || []).forEach(c => {
    map[c.id] = { nombre: c.nombre, color: c.color, icono: c.icono };
  });
  // Fallback con defaults si la migración aún no se aplicó
  if (Object.keys(map).length === 0) {
    Object.entries(COLOR_CATEGORIA).forEach(([id, color]) => {
      map[id] = { nombre: CATEGORIA_LABEL[id] || id, color, icono: null };
    });
  }
  return map;
};

export function calcDashboard({ movimientos, data, fechaInicio, fechaFin }) {
  const catMap = buildCategoriasMap(data);
  const enRango = (movimientos || []).filter(
    m => m.fecha >= fechaInicio && m.fecha <= fechaFin
  );

  const aprobados = enRango.filter(m => m.tipo === 'gasto_factura' && m.status === 'aprobado');
  const dietas = enRango.filter(m => m.tipo === 'dieta' && m.status === 'aprobado');
  const entregas = enRango.filter(m => m.tipo === 'entrega');
  const pendientes = enRango.filter(m => m.status === 'pendiente_revision');

  const totalEntregado = entregas.reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalGastosAprob = aprobados.reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalDietas = dietas.reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalPendientes = pendientes.reduce((s, m) => s + Number(m.monto || 0), 0);

  // 1. Donut por categoría (solo gastos aprobados)
  const porCategoria = {};
  aprobados.forEach(m => {
    const cat = m.datosIA?.categoria_sugerida || 'sin_categoria';
    if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, total: 0, count: 0 };
    porCategoria[cat].total += Number(m.monto || 0);
    porCategoria[cat].count += 1;
  });
  const donutCategorias = Object.values(porCategoria).map(c => {
    const meta = catMap[c.categoria];
    return {
      label: meta?.nombre || CATEGORIA_LABEL[c.categoria] || c.categoria,
      value: c.total,
      color: meta?.color || COLOR_CATEGORIA[c.categoria] || COLOR_CATEGORIA.sin_categoria,
      count: c.count,
    };
  });

  // 2. Top proveedores por monto (gastos aprobados con proveedor identificado)
  const porProveedor = {};
  aprobados.forEach(m => {
    if (!m.proveedor) return;
    const key = m.rnc || m.proveedor;
    if (!porProveedor[key]) {
      porProveedor[key] = { proveedor: m.proveedor, rnc: m.rnc || null, total: 0, count: 0 };
    }
    porProveedor[key].total += Number(m.monto || 0);
    porProveedor[key].count += 1;
  });
  const topProveedores = Object.values(porProveedor).map(p => ({
    label: p.proveedor,
    sub: p.rnc ? `RNC ${p.rnc} · ${p.count} factura${p.count !== 1 ? 's' : ''}` : `${p.count} factura${p.count !== 1 ? 's' : ''}`,
    value: p.total,
    color: '#ec4899',
  }));

  // 3. Por persona (gastos + dietas, todo egreso aprobado)
  const porPersona = {};
  aprobados.forEach(m => {
    if (!porPersona[m.personaId]) porPersona[m.personaId] = { personaId: m.personaId, gastos: 0, dietas: 0, count: 0 };
    porPersona[m.personaId].gastos += Number(m.monto || 0);
    porPersona[m.personaId].count += 1;
  });
  dietas.forEach(m => {
    if (!porPersona[m.personaId]) porPersona[m.personaId] = { personaId: m.personaId, gastos: 0, dietas: 0, count: 0 };
    porPersona[m.personaId].dietas += Number(m.monto || 0);
  });
  const personasArr = Object.values(porPersona);
  const barrasPersonas = personasArr.map((p, i) => {
    const persona = data.personal.find(x => x.id === p.personaId);
    return {
      label: persona?.nombre || p.personaId,
      sub: `${p.count} factura${p.count !== 1 ? 's' : ''} · ${p.dietas > 0 ? 'incl. dietas' : 'solo facturas'}`,
      value: p.gastos + p.dietas,
      color: colorPersona(i),
    };
  });

  // 4. Tendencia diaria (gastos aprobados por día)
  const porDia = {};
  aprobados.forEach(m => {
    porDia[m.fecha] = (porDia[m.fecha] || 0) + Number(m.monto || 0);
  });
  const tendenciaDiaria = Object.entries(porDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, monto]) => ({ fecha, monto }));

  // 5. KPIs de operación
  const ticketPromedio = aprobados.length > 0 ? totalGastosAprob / aprobados.length : 0;
  const proveedoresUnicos = Object.keys(porProveedor).length;
  const proveedoresSinRNC = aprobados.filter(m => m.proveedor && !m.rnc).length;

  // 6. Por proyecto (gastos asociados a un proyecto)
  const porProyecto = {};
  [...aprobados, ...dietas].forEach(m => {
    if (!m.proyectoId) return;
    if (!porProyecto[m.proyectoId]) porProyecto[m.proyectoId] = { proyectoId: m.proyectoId, total: 0, count: 0 };
    porProyecto[m.proyectoId].total += Number(m.monto || 0);
    porProyecto[m.proyectoId].count += 1;
  });
  const barrasProyectos = Object.values(porProyecto).map((p, i) => {
    const proy = data.proyectos.find(x => x.id === p.proyectoId);
    const nombre = proy ? (proy.referenciaOdoo ? `${proy.referenciaOdoo} · ${proy.cliente}` : (proy.cliente || proy.nombre)) : p.proyectoId;
    return {
      label: nombre,
      sub: `${p.count} movimiento${p.count !== 1 ? 's' : ''}`,
      value: p.total,
      color: colorPersona(i + 3), // offset del set anterior
    };
  });

  return {
    // KPIs
    totalEntregado, totalGastosAprob, totalDietas, totalPendientes,
    countAprobados: aprobados.length,
    countPendientes: pendientes.length,
    ticketPromedio,
    proveedoresUnicos,
    proveedoresSinRNC,
    sinAsignarAProyecto: aprobados.filter(m => !m.proyectoId).length,
    // Datos para gráficos
    donutCategorias,
    topProveedores,
    barrasPersonas,
    barrasProyectos,
    tendenciaDiaria,
  };
}

// Mini sparkline de tendencia diaria (SVG line, sin dependencias)
export function generarPathSparkline(puntos, width, height, padding = 2) {
  if (!puntos || puntos.length === 0) return '';
  const max = Math.max(...puntos.map(p => p.monto), 1);
  const stepX = (width - padding * 2) / Math.max(puntos.length - 1, 1);
  return puntos
    .map((p, i) => {
      const x = padding + i * stepX;
      const y = height - padding - (p.monto / max) * (height - padding * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
