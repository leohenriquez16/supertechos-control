// v8.80.0: salidas de almacén — fase 2 (lógica pura, se prueba en tests/salidas-almacen.test.mjs).
//
// Lo que mostraron los datos (19-nov-2026): el almacén despachaba todos los renglones pero
// no tocaba "Marcar LISTA" (29 de 45 pedidos en Preparando), y más de la mitad de los viajes
// los llevaba un supervisor o un maestro, no el chofer. Por eso:
//   - el pedido avanza SOLO al marcar los renglones (pendiente → preparando → lista);
//   - "Salió": el almacén o la oficina registra cuándo salió y QUIÉN lo lleva (cualquier
//     persona), con foto opcional. Sirve con ruta o sin ruta;
//   - el conductor de una ruta puede ser cualquier persona activa;
//   - panel de tiempos para medir cada paso.

const ABIERTOS_ALMACEN = ['pendiente', 'preparando', 'lista'];

// Estado al que pasa el pedido después de marcar/desmarcar un renglón como despachado.
// null = no cambia. Nunca toca un pedido que ya salió, está en ruta, entregado o cancelado.
export function estadoTrasMarcarItem(pedido, itemId, despachado) {
  if (!pedido || !ABIERTOS_ALMACEN.includes(pedido.estado) || pedido.salidaAt) return null;
  const items = (pedido.items || []).map(i => (i.id === itemId ? { ...i, despachado: !!despachado } : i));
  if (!items.length) return null;
  const todos = items.every(i => i.despachado);
  const alguno = items.some(i => i.despachado);
  if (todos) return pedido.estado === 'lista' ? null : 'lista';
  if (pedido.estado === 'lista') return 'preparando'; // se desmarcó algo: vuelve a preparación
  if (pedido.estado === 'pendiente' && alguno) return 'preparando';
  return null;
}

// ¿Se puede registrar "Salió"? Pedidos de envío (no retiro en mostrador) que están listos o
// ya montados en una ruta, y que no tienen salida registrada.
export function puedeMarcarSalio(pedido) {
  if (!pedido || pedido.tipo === 'compra' || pedido.modoEntrega === 'retiro' || pedido.salidaAt) return false;
  return ['lista', 'en_ruta'].includes(pedido.estado);
}

// Personas que pueden llevar el material o manejar una ruta: TODO el personal activo.
// Primero choferes y responsables de vehículo, luego supervisores, luego el resto.
export function personasConductor(personal = [], vehiculos = []) {
  const resp = new Set((vehiculos || []).filter(v => v && v.activo !== false && v.responsableId).map(v => v.responsableId));
  const rango = (p) => {
    const r = p.roles || [];
    if (r.includes('chofer') || resp.has(p.id)) return 0;
    if (r.includes('supervisor')) return 1;
    if (r.includes('maestro')) return 2;
    if (r.includes('almacen')) return 3;
    return 4;
  };
  const GRUPO = ['Choferes', 'Supervisores', 'Maestros', 'Almacén', 'Otros'];
  return (personal || [])
    .filter(p => p && p.id && p.activo !== false && (p.nombre || '').trim())
    .map(p => ({ id: p.id, nombre: p.nombre.trim(), rango: rango(p), grupo: GRUPO[rango(p)] }))
    .sort((a, b) => a.rango - b.rango || a.nombre.localeCompare(b.nombre, 'es'));
}

// Al quitar una parada o cancelar una ruta, ¿el pedido vuelve a "lista"? Solo si estaba
// en ruta por la ruta (no si ya salió de verdad, ni si ya se entregó).
export function vuelveALista(pedido) {
  return !!pedido && pedido.estado === 'en_ruta' && !pedido.salidaAt;
}

// ---------- tiempos ----------
const horas = (a, b) => {
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  return Number.isFinite(ta) && Number.isFinite(tb) && tb >= ta ? (tb - ta) / 3600000 : null;
};
const mediana = (xs) => {
  const v = xs.filter(x => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Mediana de horas de cada paso para los pedidos creados desde `desde` (YYYY-MM-DD).
// Excluye compras internas y los cierres administrativos (cancelados).
export function tiemposPedidos(pedidos = [], { desde = null } = {}) {
  const ps = (pedidos || []).filter(p => p && p.tipo !== 'compra' && p.modoEntrega !== 'retiro' && p.estado !== 'cancelada'
    && (!desde || String(p.createdAt || '').slice(0, 10) >= desde));
  const listo = ps.map(p => horas(p.createdAt, p.listaAt));
  const salio = ps.map(p => (p.salidaAt ? horas(p.listaAt || p.createdAt, p.salidaAt) : null));
  const entregado = ps.map(p => (p.entregadaAt && p.salidaAt ? horas(p.salidaAt, p.entregadaAt) : null));
  const conSalida = ps.filter(p => p.salidaAt);
  return {
    pedidos: ps.length,
    abiertos: ps.filter(p => ['pendiente', 'preparando', 'lista', 'en_ruta'].includes(p.estado)).length,
    horasHastaListo: mediana(listo), nListo: listo.filter(x => x != null).length,
    horasHastaSalida: mediana(salio), nSalida: salio.filter(x => x != null).length,
    horasHastaEntrega: mediana(entregado), nEntrega: entregado.filter(x => x != null).length,
    conQuienLleva: conSalida.filter(p => p.llevadoPorNombre).length,
    conFoto: conSalida.filter(p => p.salidaFotoUrl).length,
    salidasPorOdoo: conSalida.filter(p => p.salidaOrigen === 'odoo').length,
    recepcionConfirmada: ps.filter(p => p.recepcionConfirmadaAt).length,
    entregados: ps.filter(p => p.estado === 'entregada').length,
  };
}

// "3 h", "2 días", "—"
export function textoHoras(h) {
  if (h == null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} días`;
}
