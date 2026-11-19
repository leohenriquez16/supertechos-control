// lib/helpers/porMontar.js
// v8.76: lógica pura de la bandeja "Por montar" (Rutas) y de la salida de Odoo que se
// muestra en cada pedido (Almacén). Sin React ni Supabase; se prueba en tests/porMontar.test.mjs.
//
// - referenciaPedido: la cotización con la que se busca la salida en Odoo (la de la obra,
//   o la referencia del despacho si trae ST/PG).
// - consultaSalidas: refs, códigos REQ y fecha "desde" para GET /api/odoo/salidas-pedidos.
// - salidaDePedidoVista: el amarre (salidasDePedido) listo para pintar.
// - resumenItems / antiguedadPedido / filtrarPorMontar / ordenarPorMontar: la lista.
import { claveCotizacion, salidasDePedido, diaRD } from './requisiciones.js';
import { pedidoAmarraPorCotizacion, coberturaPedido, AMARRE_COT_DESDE } from './amarreSalidas.js';

// Solo sirve una cotización con prefijo ST/PG: un número suelto ("3430 PISSA") amarraría
// salidas de cualquier empresa.
export const conPrefijo = (ref) => { const k = claveCotizacion(ref); return k && /^(ST|PG)\d+$/.test(k) ? ref : null; };

export function referenciaPedido(pedido, proyecto) {
  if (!pedido) return null;
  return conPrefijo(proyecto?.referenciaOdoo) || conPrefijo(pedido.referencia) || null;
}

// Datos para mostrar: obra (o cliente del despacho), cliente y cotización.
export function datosPedido(pedido, proyecto) {
  if (!pedido) return { obra: '', cliente: '', referencia: null };
  const referencia = referenciaPedido(pedido, proyecto);
  if (proyecto) {
    const obra = proyecto.nombre || proyecto.cliente || pedido.proyectoId || 'Obra';
    const cliente = proyecto.cliente && proyecto.cliente !== obra ? proyecto.cliente : '';
    return { obra, cliente, referencia: proyecto.referenciaOdoo || referencia };
  }
  if (pedido.tipo === 'compra') return { obra: 'Compra interna', cliente: pedido.referencia || '', referencia };
  return { obra: pedido.clienteNombre || (pedido.tipo === 'despacho' ? 'Despacho' : 'Sin obra'), cliente: '', referencia: pedido.referencia || referencia };
}

// Parámetros de GET /api/odoo/salidas-pedidos para una lista de pedidos.
// proyectoDe(pedido) → proyecto | undefined. null si no hay nada que buscar.
// v8.84.0: por código REQ (todos) y por cotización de la obra (solo pedidos desde
// AMARRE_COT_DESDE: nunca el histórico). `desde` = el pedido más viejo que se busca.
export function consultaSalidas(pedidos = [], proyectoDe = () => null) {
  const refs = new Set(), codigos = new Set();
  let desde = null;
  (pedidos || []).forEach(p => {
    if (!p || p.tipo === 'compra') return;
    let busca = false;
    if (p.codigo) { codigos.add(p.codigo); busca = true; }
    const ref = pedidoAmarraPorCotizacion(p) ? referenciaPedido(p, proyectoDe(p)) : null;
    if (ref) { refs.add(ref); busca = true; }
    if (!busca) return;
    // por cotización se trae TODO desde el corte (no solo desde el pedido visible más viejo):
    // así el reparto ve las mismas salidas en Almacén y en Rutas
    const d = ref ? AMARRE_COT_DESDE : diaRD(p.createdAt);
    if (d && (!desde || d < desde)) desde = d;
  });
  if (!refs.size && !codigos.size) return null;
  return { refs: [...refs].sort(), codigos: [...codigos].sort(), desde };
}

export function urlSalidasPedidos(q) {
  if (!q) return null;
  const sp = new URLSearchParams();
  if (q.refs?.length) sp.set('refs', q.refs.join(','));
  if (q.codigos?.length) sp.set('codigos', q.codigos.join(','));
  if (q.desde) sp.set('desde', q.desde);
  return '/api/odoo/salidas-pedidos?' + sp.toString();
}

// Amarre listo para pintar:
// { estado: 'exacta' | 'por_cotizacion' | 'dudosa' | 'sin_salida' | 'cargando' | 'sin_datos',
//   salidas, nombres, hecha, todasHechas, fechaHecha, dudas, cobertura, automatica }
// automatica = se puede registrar "Salió" sola: SOLO si todas sus salidas traen el REQ del
// pedido ('codigo') y están hechas (como v8.80). Por cotización o elegida por la oficina NO:
// esa salida puede ser parcial o de la venta completa; "Salió" lo marca una persona.
// validadaEnOdoo = todas sus salidas hechas (para avisar "Odoo ya la validó").
// v8.84.0: si resp.amarre viene (useSalidasPedidos lo calcula con TODOS los pedidos de la obra,
// amarrarSalidas), manda: exacta = REQ o elegida por la oficina; por_cotizacion = amarrada sola
// por la cotización y los productos; dudosa = hay salidas que pueden ser de este pedido y la
// oficina tiene que elegir. Sin resp.amarre: solo por código REQ (como v8.80).
// sin_datos = no hay con qué buscarlo (sin REQ ni cotización ST/PG) o Odoo no respondió.
export function salidaDePedidoVista(pedido, resp, proyecto, { cargando = false } = {}) {
  const nada = (estado) => ({ estado, salidas: [], nombres: [], hecha: false, todasHechas: false, fechaHecha: null, dudas: [], cobertura: 0, automatica: false });
  if (!pedido) return nada('sin_datos');
  const referencia = pedidoAmarraPorCotizacion(pedido) ? referenciaPedido(pedido, proyecto) : null;
  const clave = referencia ? claveCotizacion(referencia) : null;
  if (!pedido.codigo && !clave && pedido.odooPickingId == null) return nada('sin_datos');
  // ¿La respuesta incluye la búsqueda de este pedido? (si no, todavía no se ha pedido)
  const buscado = !!resp && ((pedido.codigo && resp.porCodigo && pedido.codigo in resp.porCodigo)
    || (clave && resp.porReferencia && clave in resp.porReferencia));
  if (!buscado) return nada(cargando ? 'cargando' : 'sin_datos');
  let salidas, via, dudas = [];
  const am = resp.amarre?.[pedido.id];
  if (am) { salidas = am.salidas; via = am.via; dudas = am.dudas || []; }
  else { const r = salidasDePedido(pedido, resp, {}); salidas = r.salidas; via = r.via; }
  if (!salidas.length) return { ...nada(dudas.length ? 'dudosa' : 'sin_salida'), dudas };
  salidas = [...salidas].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
  const estado = via === 'cotizacion' ? 'por_cotizacion' : 'exacta';
  const todasHechas = salidas.every(s => s.state === 'done');
  const cobertura = coberturaPedido(pedido, salidas);
  const des = new Set((pedido.odooPickingsDescartados || []).map(String));
  // solo cuentan las salidas con el REQ (las demás o las dudas de la obra no la frenan, como v8.80)
  const conReq = salidas.filter(s => (s.via || via) === 'codigo');
  const automatica = conReq.length > 0 && conReq.every(s => s.state === 'done') && !conReq.some(s => des.has(String(s.id)));
  return {
    estado, cobertura, automatica, validadaEnOdoo: todasHechas,
    salidas,
    nombres: salidas.map(s => s.name),
    hecha: salidas.some(s => s.state === 'done'),
    // todas sus salidas hechas (sin backorder abierto) → salió completo
    todasHechas,
    fechaHecha: salidas.filter(s => s.state === 'done').map(s => s.fechaHecha || s.fecha).filter(Boolean).sort().slice(-1)[0] || null,
    dudas,
  };
}

// Como los ve el almacén en Odoo (Borrador / En espera / Listo / Hecho).
export const ESTADO_SALIDA_ODOO = { done: 'hecha', assigned: 'lista para salir', confirmed: 'en espera', waiting: 'en espera', draft: 'borrador' };

// "3 artículos · Lona Insugrand 4KG ×12, Primer ×4…" (corto) + la lista completa (para el title).
const cant = (c) => {
  if (c === null || c === undefined || c === '') return '';
  const n = Number(c);
  return Number.isFinite(n) ? ` ×${Math.round(n * 100) / 100}` : ` ×${c}`;
};
export function resumenItems(items = [], { max = 2 } = {}) {
  const lista = (items || []).filter(i => i && (i.descripcion || '').trim());
  if (!lista.length) return { corto: 'Sin artículos', completo: '' };
  const linea = (i) => `${String(i.descripcion).trim()}${cant(i.cantidad)}${i.unidad && cant(i.cantidad) ? ' ' + i.unidad : ''}`;
  const n = lista.length;
  const primeros = lista.slice(0, max).map(linea).join(', ');
  return {
    corto: `${n} artículo${n === 1 ? '' : 's'} · ${primeros}${n > max ? '…' : ''}`,
    completo: lista.map(i => '• ' + linea(i)).join('\n'),
  };
}

// Antigüedad desde que quedó LISTA (o desde que se pidió si no hay lista_at).
// ahoraISO: para probar. → { dias, texto, vieja }  (vieja = más de 7 días)
export function antiguedadPedido(pedido, ahoraISO = new Date().toISOString()) {
  const base = pedido?.estado === 'lista' && pedido?.listaAt ? pedido.listaAt : pedido?.createdAt;
  const dBase = diaRD(base), dHoy = diaRD(ahoraISO);
  if (!dBase || !dHoy) return { dias: null, texto: '', vieja: false };
  const dias = Math.max(0, Math.round((new Date(dHoy + 'T12:00:00Z') - new Date(dBase + 'T12:00:00Z')) / 864e5));
  const verbo = pedido?.estado === 'lista' && pedido?.listaAt ? 'listo' : 'pedido';
  const texto = dias === 0 ? `${verbo} hoy` : dias === 1 ? `${verbo} ayer` : `${verbo} hace ${dias} días`;
  return { dias, texto, vieja: dias > 7 };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// filas: [{ pedido, datos, salida }] (datos de datosPedido, salida de salidaDePedidoVista).
export function filtrarPorMontar(filas = [], texto = '') {
  const palabras = norm(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return filas || [];
  return (filas || []).filter(f => {
    const p = f.pedido || {};
    const heno = norm([
      p.codigo, f.datos?.obra, f.datos?.cliente, f.datos?.referencia, p.clienteNombre, p.referencia,
      ...(p.items || []).map(i => i.descripcion), ...(f.salida?.nombres || []),
    ].filter(Boolean).join(' '));
    return palabras.every(w => heno.includes(w));
  });
}

// modo: 'viejo' (más viejo primero) | 'urgente' (urgentes primero, luego más viejo) | 'obra' (por nombre de obra)
const fechaBase = (p) => String((p?.estado === 'lista' && p?.listaAt) || p?.createdAt || '');
export function ordenarPorMontar(filas = [], modo = 'viejo') {
  const porFecha = (a, b) => fechaBase(a.pedido).localeCompare(fechaBase(b.pedido));
  const arr = [...(filas || [])];
  if (modo === 'urgente') return arr.sort((a, b) => (Number(!!b.pedido?.urgente) - Number(!!a.pedido?.urgente)) || porFecha(a, b));
  if (modo === 'obra') return arr.sort((a, b) => norm(a.datos?.obra).localeCompare(norm(b.datos?.obra)) || porFecha(a, b));
  return arr.sort(porFecha);
}

// Lo que el almacén escribe en el "Documento origen" de la salida en Odoo: "ST 5867 REQ-0142"
// (cotización de la obra + número del pedido). Solo "REQ-0142" si no hay cotización ST/PG.
export function textoOrigenOdoo(pedido, proyecto) {
  if (!pedido?.codigo) return null;
  const k = claveCotizacion(referenciaPedido(pedido, proyecto));
  const m = /^(ST|PG)(\d+)$/.exec(k || '');
  return m ? `${m[1]} ${m[2]} ${pedido.codigo}` : pedido.codigo;
}
