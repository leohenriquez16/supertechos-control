// lib/helpers/compras.js
// v8.67.0: lógica pura de la vista "Compras" — aplanar los renglones de las
// requisiciones que están en el flujo de compras, normalizar el nombre del
// artículo, agrupar por artículo y calcular días en espera. Sin React ni Supabase
// (se prueba en tests/compras.test.mjs).

// Orden del flujo: lo más atrasado primero.
export const ESTADOS_FLUJO_COMPRAS = ['solicitado', 'cotizado', 'esperando_aprobacion', 'comprado'];
// No pasan por Compras (se compran en la ruta o los compra el maestro).
export const ESTADOS_FUERA_COMPRAS = ['comprar_en_ruta', 'compra_maestro'];
const REQ_CERRADAS = ['cancelada', 'entregada'];

const DIA_MS = 86400000;

// Días completos entre una fecha ISO y "ahora". null si no hay fecha válida.
export function diasEnEspera(fechaIso, ahora = new Date()) {
  if (!fechaIso) return null;
  const t = new Date(fechaIso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((new Date(ahora).getTime() - t) / DIA_MS));
}

// Unidades frecuentes que la gente escribe pegadas al nombre ("Cubeta pintura 5 gal").
const UNIDADES = ['galones', 'galon', 'gal', 'gls', 'gl', 'cubetas', 'cubeta', 'cub', 'cajas', 'caja',
  'unidades', 'unidad', 'und', 'uds', 'ud', 'u', 'rollos', 'rollo', 'sacos', 'saco', 'fundas', 'funda',
  'libras', 'libra', 'lbs', 'lb', 'kilos', 'kilo', 'kg', 'metros', 'metro', 'mts', 'mt', 'm', 'm2', 'm²',
  'pies', 'pie', 'pulgadas', 'pulg', 'litros', 'litro', 'lts', 'lt', 'l', 'pares', 'par', 'paquetes', 'paquete',
  'cubos', 'cubo', 'tanques', 'tanque', 'tubos', 'tubo', 'pliegos', 'pliego', 'pzas', 'pza', 'piezas', 'pieza'];

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Nombre normalizado para agrupar: minúsculas, sin acentos, espacios colapsados,
// sin la unidad del renglón (ni al inicio ni al final) y sin cantidad suelta al inicio.
export function normalizarNombreArticulo(descripcion, unidad = '') {
  let s = sinAcentos(descripcion).toLowerCase().replace(/[.,;:]+$/g, '').replace(/\s+/g, ' ').trim();
  const u = sinAcentos(unidad).toLowerCase().trim();
  const quitar = new Set(UNIDADES);
  if (u) quitar.add(u);
  // cantidad + unidad al inicio ("2 gal pintura", "10 sacos de cemento")
  s = s.replace(/^\d+([.,]\d+)?\s*/, '');
  let cambio = true;
  while (cambio && s) {
    cambio = false;
    const pal = s.split(' ');
    if (pal.length > 1 && quitar.has(pal[0])) { pal.shift(); if (pal[0] === 'de') pal.shift(); s = pal.join(' '); cambio = true; continue; }
    if (pal.length > 1 && quitar.has(pal[pal.length - 1])) {
      pal.pop();
      if (pal.length > 1 && /^\d+([.,]\d+)?$/.test(pal[pal.length - 1])) pal.pop();
      s = pal.join(' '); cambio = true;
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

// Aplana requisiciones → renglones de Compras.
// - Excluye requisiciones canceladas; las entregadas tampoco (incluye 'comprado' solo
//   mientras la requisición no esté entregada).
// - Devuelve { renglones, fuera } — "fuera" = comprar_en_ruta / compra_maestro.
export function aplanarRenglonesCompras(requisiciones, { ahora = new Date() } = {}) {
  const renglones = [];
  const fuera = [];
  for (const r of requisiciones || []) {
    if (!r || REQ_CERRADAS.includes(r.estado)) continue;
    for (const it of r.items || []) {
      const ec = it.estadoCompra;
      if (!ec) continue;
      const desde = it.createdAt || r.createdAt || null;
      const fila = {
        itemId: it.id, requisicionId: r.id, requisicion: r,
        descripcion: it.descripcion || '', cantidad: it.cantidad, unidad: it.unidad || '',
        estadoCompra: ec, urgente: !!r.urgente,
        proyectoId: r.proyectoId || null, tipo: r.tipo || 'obra',
        clienteNombre: r.clienteNombre || '', referencia: r.referencia || '',
        pedidoPor: r.solicitadoPorNombre || '', fecha: desde,
        dias: diasEnEspera(desde, ahora), ocOdooName: r.ocOdooName || null, ocOdooId: r.ocOdooId || null,
      };
      if (ESTADOS_FLUJO_COMPRAS.includes(ec)) renglones.push(fila);
      else if (ESTADOS_FUERA_COMPRAS.includes(ec)) fuera.push(fila);
    }
  }
  return { renglones, fuera };
}

// Clave de "obra" del renglón: el proyecto, o el cliente/referencia si es venta/alisto/compra interna.
export const claveObra = (f) => f.proyectoId || `${f.tipo}:${f.clienteNombre || f.referencia || f.requisicionId}`;

const rangoEstado = (e) => { const i = ESTADOS_FLUJO_COMPRAS.indexOf(e); return i < 0 ? 99 : i; };

// Conteo por estado + el renglón más viejo esperando (excluye 'comprado').
export function kpisCompras(renglones) {
  const porEstado = Object.fromEntries(ESTADOS_FLUJO_COMPRAS.map(e => [e, 0]));
  let masViejo = null;
  for (const f of renglones || []) {
    if (porEstado[f.estadoCompra] != null) porEstado[f.estadoCompra]++;
    if (f.estadoCompra !== 'comprado' && f.dias != null && (!masViejo || f.dias > masViejo.dias)) masViejo = f;
  }
  return { porEstado, total: (renglones || []).length, masViejo };
}

// Agrupa por nombre normalizado. Cantidades sumadas por unidad (unidad normalizada
// a minúsculas; vacía = "sin unidad"). estadoMasAtrasado = el más temprano del flujo.
export function agruparPorArticulo(renglones) {
  const mapa = new Map();
  for (const f of renglones || []) {
    const clave = normalizarNombreArticulo(f.descripcion, f.unidad) || '(sin nombre)';
    let g = mapa.get(clave);
    if (!g) { g = { clave, nombre: f.descripcion, cantidades: {}, obras: new Set(), renglones: [], estadoMasAtrasado: f.estadoCompra, urgente: false, diasMax: null }; mapa.set(clave, g); }
    const u = sinAcentos(f.unidad).toLowerCase().trim();
    const n = Number(f.cantidad);
    if (Number.isFinite(n) && f.cantidad !== null && f.cantidad !== '') g.cantidades[u] = (g.cantidades[u] || 0) + n;
    g.obras.add(claveObra(f));
    g.renglones.push(f);
    if (rangoEstado(f.estadoCompra) < rangoEstado(g.estadoMasAtrasado)) g.estadoMasAtrasado = f.estadoCompra;
    if (f.urgente) g.urgente = true;
    if (f.dias != null && (g.diasMax == null || f.dias > g.diasMax)) g.diasMax = f.dias;
  }
  return [...mapa.values()].map(g => ({ ...g, numObras: g.obras.size, obras: [...g.obras] }))
    .sort((a, b) => rangoEstado(a.estadoMasAtrasado) - rangoEstado(b.estadoMasAtrasado)
      || (b.urgente - a.urgente) || ((b.diasMax ?? -1) - (a.diasMax ?? -1)) || a.clave.localeCompare(b.clave));
}

// Texto buscable / filtro
export function filtrarRenglones(renglones, { texto = '', obraId = '', soloUrgentes = false, etiquetaObra = () => '' } = {}) {
  const q = sinAcentos(texto).toLowerCase().trim();
  return (renglones || []).filter(f => {
    if (soloUrgentes && !f.urgente) return false;
    if (obraId && claveObra(f) !== obraId) return false;
    if (q) {
      const hay = sinAcentos(`${f.descripcion} ${etiquetaObra(f)} ${f.pedidoPor}`).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
