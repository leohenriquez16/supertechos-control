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
export function consultaSalidas(pedidos = [], proyectoDe = () => null) {
  const refs = new Set(), codigos = new Set();
  let desde = null;
  (pedidos || []).forEach(p => {
    if (!p) return;
    const ref = referenciaPedido(p, proyectoDe(p));
    if (ref) refs.add(String(ref).trim());
    if (p.codigo) codigos.add(p.codigo);
    if (!ref && !p.codigo) return;
    const d = diaRD(p.createdAt);
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
// { estado: 'exacta' | 'por_cotizacion' | 'sin_salida' | 'cargando' | 'sin_datos', salidas, nombres, hecha }
// sin_datos = no hay con qué buscarlo (sin código REQ ni cotización ST/PG) o Odoo no respondió.
export function salidaDePedidoVista(pedido, resp, proyecto, { cargando = false } = {}) {
  const nada = (estado) => ({ estado, salidas: [], nombres: [], hecha: false });
  const referencia = referenciaPedido(pedido, proyecto);
  const clave = claveCotizacion(referencia);
  if (!pedido?.codigo && !clave) return nada('sin_datos'); // no hay con qué buscarlo en Odoo
  // ¿La respuesta incluye la búsqueda de este pedido? (si no, todavía no se ha pedido)
  const buscado = resp && ((pedido.codigo && resp.porCodigo && pedido.codigo in resp.porCodigo)
    || (clave && resp.porReferencia && clave in resp.porReferencia));
  if (!buscado) return nada(cargando ? 'cargando' : 'sin_datos');
  const am = salidasDePedido(pedido, resp, { referencia });
  if (!am.salidas.length) return { estado: 'sin_salida', salidas: [], nombres: [], hecha: false };
  const salidas = [...am.salidas].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
  return {
    estado: am.via === 'codigo' ? 'exacta' : 'por_cotizacion',
    salidas,
    nombres: salidas.map(s => s.name),
    hecha: salidas.some(s => s.state === 'done'),
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
