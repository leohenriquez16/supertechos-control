// tests de lib/helpers/porMontar.js (v8.76: bandeja "Por montar" + salida de Odoo por pedido)
import {
  referenciaPedido, datosPedido, consultaSalidas, urlSalidasPedidos, salidaDePedidoVista,
  resumenItems, antiguedadPedido, filtrarPorMontar, ordenarPorMontar, textoOrigenOdoo,
} from '../lib/helpers/porMontar.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const prjST = { id: 'p1', nombre: 'Torre Piantini', cliente: 'CINTER', referenciaOdoo: 'ST-C5867' };
const prjPG = { id: 'p2', nombre: 'Hermida La Sirena', cliente: 'Hermida', referenciaOdoo: 'PG-C1269' };
const prjSinRef = { id: 'p3', nombre: 'Obra vieja', cliente: 'Cliente X', referenciaOdoo: '' };
const proyectos = { p1: prjST, p2: prjPG, p3: prjSinRef };
const proyectoDe = (r) => proyectos[r.proyectoId];

// --- referencia / datos ---
t('ref de la obra', referenciaPedido({ proyectoId: 'p1' }, prjST) === 'ST-C5867');
t('ref PG', referenciaPedido({ proyectoId: 'p2' }, prjPG) === 'PG-C1269');
t('ref despacho con ST', referenciaPedido({ tipo: 'despacho', referencia: 'ST-C5615' }, null) === 'ST-C5615');
t('ref despacho sin prefijo no sirve', referenciaPedido({ tipo: 'despacho', referencia: '3430 PISSA' }, null) === null);
t('ref obra sin cotización', referenciaPedido({ proyectoId: 'p3' }, prjSinRef) === null);
t('ref null', referenciaPedido(null, prjST) === null);
t('datos obra', eq(datosPedido({ proyectoId: 'p1' }, prjST), { obra: 'Torre Piantini', cliente: 'CINTER', referencia: 'ST-C5867' }));
t('datos cliente = obra no se repite', datosPedido({ proyectoId: 'x' }, { nombre: 'ACME', cliente: 'ACME' }).cliente === '');
t('datos despacho', datosPedido({ tipo: 'despacho', clienteNombre: 'PISSA', referencia: '3430' }, null).obra === 'PISSA');
t('datos compra', datosPedido({ tipo: 'compra' }, null).obra === 'Compra interna');

// --- consulta a la API ---
const pedidos = [
  { id: 'a', proyectoId: 'p1', codigo: 'REQ-0150', createdAt: '2026-11-10T15:00:00Z' },
  { id: 'b', proyectoId: 'p1', codigo: 'REQ-0142', createdAt: '2026-11-03T02:00:00Z' }, // 2-nov en RD
  { id: 'c', proyectoId: 'p2', codigo: null, createdAt: '2026-11-05T12:00:00Z' },
  { id: 'd', proyectoId: 'p3', codigo: null, createdAt: '2026-01-01T12:00:00Z' }, // sin nada: no cuenta para "desde"
];
const q = consultaSalidas(pedidos, proyectoDe);
t('consulta refs', eq(q.refs, ['PG-C1269', 'ST-C5867']));
t('consulta códigos', eq(q.codigos, ['REQ-0142', 'REQ-0150']));
t('consulta desde = el más viejo (día RD)', q.desde === '2026-11-02');
t('consulta vacía', consultaSalidas([{ id: 'd', proyectoId: 'p3' }], proyectoDe) === null && consultaSalidas([], proyectoDe) === null);
t('url', urlSalidasPedidos(q) === '/api/odoo/salidas-pedidos?refs=PG-C1269%2CST-C5867&codigos=REQ-0142%2CREQ-0150&desde=2026-11-02');
t('url null', urlSalidasPedidos(null) === null);

// --- amarre para pintar ---
const sal = (name, origin, fecha, state = 'done') => ({ id: name, name, origin, fecha, state, productos: [{ producto: 'Lona', cantidad: 2 }] });
const resp = {
  porReferencia: {
    ST5867: [sal('AL/OUT/01700', 'ST 5867 REQ-0142', '2026-11-04T14:00:00Z'), sal('AL/OUT/01710', 'ST 5867', '2026-11-11T14:00:00Z', 'assigned'), sal('AL/OUT/01600', 'ST 5867', '2026-10-01T14:00:00Z')],
    PG1269: [],
  },
  porCodigo: { 'REQ-0142': [sal('AL/OUT/01700', 'ST 5867 REQ-0142', '2026-11-04T14:00:00Z')], 'REQ-0150': [] },
};
const vB = salidaDePedidoVista(pedidos[1], resp, prjST);
t('exacta por código', vB.estado === 'exacta' && eq(vB.nombres, ['AL/OUT/01700']) && vB.hecha);
const vA = salidaDePedidoVista(pedidos[0], resp, prjST);
t('por cotización desde la fecha del pedido', vA.estado === 'por_cotizacion' && eq(vA.nombres, ['AL/OUT/01710']) && !vA.hecha);
t('por cotización no usa la de otro REQ ni las viejas', !vA.nombres.includes('AL/OUT/01700') && !vA.nombres.includes('AL/OUT/01600'));
const vC = salidaDePedidoVista(pedidos[2], resp, prjPG);
t('sin salida', vC.estado === 'sin_salida' && vC.salidas.length === 0);
t('sin datos para buscar', salidaDePedidoVista(pedidos[3], resp, prjSinRef).estado === 'sin_datos');
t('sin respuesta + cargando', salidaDePedidoVista(pedidos[0], null, prjST, { cargando: true }).estado === 'cargando');
t('sin respuesta (Odoo caído)', salidaDePedidoVista(pedidos[0], null, prjST).estado === 'sin_datos');
const pNuevo = { id: 'n', proyectoId: 'p9', codigo: 'REQ-0999', createdAt: '2026-11-12T12:00:00Z' };
t('pedido que la respuesta no buscó → cargando, no "sin salida"', salidaDePedidoVista(pNuevo, resp, { referenciaOdoo: 'ST-C9999' }, { cargando: true }).estado === 'cargando');
const vOrden = salidaDePedidoVista({ id: 'x', proyectoId: 'p1', codigo: null, createdAt: '2026-11-01T12:00:00Z' },
  { porReferencia: { ST5867: [sal('AL/OUT/2', 'ST 5867', '2026-11-09T12:00:00Z'), sal('AL/OUT/1', 'ST 5867', '2026-11-02T12:00:00Z')] }, porCodigo: {} }, prjST);
t('salidas en orden de fecha', eq(vOrden.nombres, ['AL/OUT/1', 'AL/OUT/2']));
t('canceladas no cuentan', salidaDePedidoVista({ id: 'y', proyectoId: 'p1', codigo: 'REQ-0001', createdAt: '2026-11-01T12:00:00Z' },
  { porReferencia: { ST5867: [] }, porCodigo: { 'REQ-0001': [sal('AL/OUT/9', 'REQ-0001', '2026-11-02T12:00:00Z', 'cancel')] } }, prjST).estado === 'sin_salida');

// --- artículos ---
const its = [{ descripcion: 'Lona Insugrand 4KG', cantidad: 12, unidad: 'rollos' }, { descripcion: 'Primer', cantidad: '4' }, { descripcion: 'Brochas', cantidad: null }];
const ri = resumenItems(its);
t('resumen corto', ri.corto === '3 artículos · Lona Insugrand 4KG ×12 rollos, Primer ×4…');
t('resumen completo', ri.completo === '• Lona Insugrand 4KG ×12 rollos\n• Primer ×4\n• Brochas');
t('resumen 1 artículo', resumenItems([{ descripcion: 'Escalera' }]).corto === '1 artículo · Escalera');
t('resumen vacío', resumenItems([]).corto === 'Sin artículos' && resumenItems(null).completo === '');
t('resumen ignora renglones en blanco', resumenItems([{ descripcion: '  ' }, { descripcion: 'Gas', cantidad: 3 }]).corto === '1 artículo · Gas ×3');

// --- antigüedad ---
const ahora = '2026-11-18T16:00:00Z';
t('lista hoy', antiguedadPedido({ estado: 'lista', listaAt: '2026-11-18T13:00:00Z', createdAt: '2026-11-01T12:00:00Z' }, ahora).texto === 'lista hoy');
t('lista ayer', antiguedadPedido({ estado: 'lista', listaAt: '2026-11-17T13:00:00Z' }, ahora).texto === 'lista ayer');
const a3 = antiguedadPedido({ estado: 'lista', listaAt: '2026-11-15T13:00:00Z' }, ahora);
t('lista hace 3 días', a3.texto === 'lista hace 3 días' && a3.dias === 3 && !a3.vieja);
t('más de 7 días = vieja', antiguedadPedido({ estado: 'lista', listaAt: '2026-11-10T13:00:00Z' }, ahora).vieja === true);
t('7 días justos no es vieja', antiguedadPedido({ estado: 'lista', listaAt: '2026-11-11T13:00:00Z' }, ahora).vieja === false);
t('sin lista_at usa la fecha del pedido', antiguedadPedido({ estado: 'lista', createdAt: '2026-11-08T13:00:00Z' }, ahora).texto === 'pedida hace 10 días');
t('día RD (madrugada UTC)', antiguedadPedido({ estado: 'lista', listaAt: '2026-11-18T02:00:00Z' }, ahora).texto === 'lista ayer');
t('sin fecha', antiguedadPedido({}, ahora).texto === '');

// --- filtrar / ordenar ---
const filas = [
  { pedido: { id: '1', codigo: 'REQ-0150', urgente: false, estado: 'lista', listaAt: '2026-11-15T12:00:00Z', items: [{ descripcion: 'Lona granular' }] }, datos: { obra: 'Torre Piantini', cliente: 'CINTER', referencia: 'ST-C5867' }, salida: { nombres: ['AL/OUT/01710'] } },
  { pedido: { id: '2', codigo: 'REQ-0142', urgente: true, estado: 'lista', listaAt: '2026-11-16T12:00:00Z', items: [{ descripcion: 'Sikalastic' }] }, datos: { obra: 'Cárcel Las Parras', cliente: '', referencia: 'ST-C5700' }, salida: { nombres: [] } },
  { pedido: { id: '3', codigo: null, urgente: false, estado: 'lista', listaAt: '2026-11-01T12:00:00Z', items: [] }, datos: { obra: 'Alma Iglesias', cliente: 'Alma', referencia: null }, salida: { nombres: [] } },
];
t('buscar por código', eq(filtrarPorMontar(filas, 'req-0142').map(f => f.pedido.id), ['2']));
t('buscar sin acentos', eq(filtrarPorMontar(filas, 'carcel').map(f => f.pedido.id), ['2']));
t('buscar por artículo', eq(filtrarPorMontar(filas, 'lona').map(f => f.pedido.id), ['1']));
t('buscar por salida', eq(filtrarPorMontar(filas, '01710').map(f => f.pedido.id), ['1']));
t('buscar varias palabras (todas)', eq(filtrarPorMontar(filas, 'torre cinter').map(f => f.pedido.id), ['1']) && filtrarPorMontar(filas, 'torre alma').length === 0);
t('buscar vacío = todo', filtrarPorMontar(filas, '  ').length === 3);
t('orden viejo', eq(ordenarPorMontar(filas, 'viejo').map(f => f.pedido.id), ['3', '1', '2']));
t('orden urgente', eq(ordenarPorMontar(filas, 'urgente').map(f => f.pedido.id), ['2', '3', '1']));
t('orden obra', eq(ordenarPorMontar(filas, 'obra').map(f => f.pedido.id), ['3', '2', '1']));
t('ordenar no muta', filas[0].pedido.id === '1');

// --- origen para Odoo ---
t('origen ST', textoOrigenOdoo({ codigo: 'REQ-0142', proyectoId: 'p1' }, prjST) === 'ST 5867 REQ-0142');
t('origen PG', textoOrigenOdoo({ codigo: 'REQ-0007', proyectoId: 'p2' }, prjPG) === 'PG 1269 REQ-0007');
t('origen sin cotización', textoOrigenOdoo({ codigo: 'REQ-0009' }, prjSinRef) === 'REQ-0009');
t('origen sin código', textoOrigenOdoo({ codigo: null }, prjST) === null);

console.log(`porMontar: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
