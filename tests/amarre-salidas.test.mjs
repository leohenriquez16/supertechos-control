// tests de lib/helpers/amarreSalidas.js (v8.84: amarre pedido ↔ salida de Odoo por cotización)
import { amarrarSalidas, coincidenciaProductos, coberturaPedido, pedidoAmarraPorCotizacion, idsSalidasEnAmarre, AMARRE_COT_DESDE } from '../lib/helpers/amarreSalidas.js';
import { salidaDePedidoVista, consultaSalidas } from '../lib/helpers/porMontar.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const prj = { id: 'p1', referenciaOdoo: 'ST-C5867' };
const refDe = (p) => (p.proyectoId === 'p1' ? 'ST-C5867' : p.referencia || null);
const LONA = 'INSUGRAND 4KG MINERAL GRIS';
const PRIMER = 'PRIMER ASFALTICO INSUPRIMER CUBETA 5 GL';
const SELLADOR = 'SELLADOR POLIURETANO SIKAFLEX 1A';
const ped = (id, createdAt, items, extra = {}) => ({ id, proyectoId: 'p1', tipo: 'obra', estado: 'lista', createdAt,
  items: items.map((d, i) => ({ id: id + i, descripcion: d, cantidad: 1 })), ...extra });
const sal = (id, origin, fecha, prods, extra = {}) => ({ id, name: 'AL/OUT/' + id, origin, state: 'done', fecha, fechaHecha: fecha,
  productos: prods.map(p => ({ producto: p, cantidad: 1 })), ...extra });
const resp = (salidas, codigos = {}) => ({ porReferencia: { ST5867: salidas }, porCodigo: codigos });

// --- elegibilidad ---
t('desde = 19-nov', AMARRE_COT_DESDE === '2026-11-19');
t('pedido de hoy amarra por cot', pedidoAmarraPorCotizacion(ped('a', '2026-11-19T14:00:00Z', [])));
t('pedido 18-nov 23:00 RD no (histórico)', !pedidoAmarraPorCotizacion(ped('a', '2026-11-19T03:00:00Z', [])));
t('compra no', !pedidoAmarraPorCotizacion(ped('a', '2026-11-20T14:00:00Z', [], { tipo: 'compra' })));
t('cancelada no', !pedidoAmarraPorCotizacion(ped('a', '2026-11-20T14:00:00Z', [], { estado: 'cancelada' })));

// --- productos ---
t('coincidencia total', coincidenciaProductos(ped('a', '', ['Lona Insugrand 4KG Mineral Gris']), sal(1, '', '', [LONA])) === 1);
t('coincidencia media', coincidenciaProductos(ped('a', '', ['Lona Insugrand 4KG Mineral Gris']), sal(1, '', '', [LONA, SELLADOR])) === 0.5);
t('sin productos = null', coincidenciaProductos(ped('a', '', ['Lona']), sal(1, '', '', [])) === null);

// --- 1. un solo pedido, productos coinciden → solo ---
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris', 'Primer asfáltico Insuprimer']);
  const r = amarrarSalidas([a], resp([sal(10, 'ST 5867', '2026-11-20T18:00:00Z', [LONA, PRIMER])]), refDe);
  t('único pedido → amarrada por cotización', r.a.via === 'cotizacion' && r.a.salidas.length === 1 && !r.a.dudas.length);
  const v = salidaDePedidoVista(a, { ...resp([sal(10, 'ST 5867', '2026-11-20T18:00:00Z', [LONA, PRIMER])]), amarre: r }, prj);
  t('vista por_cotizacion con todasHechas', v.estado === 'por_cotizacion' && v.todasHechas && v.fechaHecha === '2026-11-20T18:00:00Z');
}
// --- un solo pedido, productos NO coinciden → duda (puede ser una venta suelta) ---
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const r = amarrarSalidas([a], resp([sal(11, 'ST 5867', '2026-11-20T18:00:00Z', [SELLADOR])]), refDe);
  t('productos distintos → duda, no amarre', r.a.via === null && r.a.dudas.length === 1);
  const v = salidaDePedidoVista(a, { ...resp([]), amarre: r }, prj);
  t('vista dudosa', v.estado === 'dudosa' && v.dudas[0].salida.id === 11 && !v.todasHechas);
}
// --- nunca antes del pedido (histórico) ---
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const r = amarrarSalidas([a], resp([sal(12, 'ST 5867', '2026-11-15T18:00:00Z', [LONA])]), refDe);
  t('salida anterior al pedido no cuenta', r.a.via === null && !r.a.dudas.length);
  // AL/OUT creada al confirmar la venta (antes) pero validada después: sí
  const r2 = amarrarSalidas([a], resp([sal(13, 'ST 5867', '2026-11-01T10:00:00Z', [LONA], { fechaHecha: '2026-11-21T10:00:00Z' })]), refDe);
  t('creada antes, validada después: sí', r2.a.via === 'cotizacion');
}
// --- pedidos viejos no participan ---
{
  const viejo = ped('v', '2026-11-10T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { estado: 'entregada' });
  const r = amarrarSalidas([viejo], resp([sal(14, 'ST 5867', '2026-11-20T18:00:00Z', [LONA])]), refDe);
  t('pedido anterior al corte no se amarra por cot', r.v.via === null && !r.v.dudas.length);
}
// --- 2. varios pedidos: gana el de los productos ---
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const b = ped('b', '2026-11-20T14:00:00Z', ['Sellador poliuretano Sikaflex 1A']);
  const r = amarrarSalidas([a, b], resp([
    sal(20, 'ST 5867', '2026-11-21T10:00:00Z', [SELLADOR]),
    sal(21, 'ST 5867', '2026-11-21T11:00:00Z', [LONA]),
  ]), refDe);
  t('sellador → b', r.b.salidas.map(s => s.id).join() === '20' && r.b.via === 'cotizacion');
  t('lona → a', r.a.salidas.map(s => s.id).join() === '21');
  t('sin dudas', !r.a.dudas.length && !r.b.dudas.length);
}
// --- varios pedidos con los mismos productos → duda en los dos ---
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const b = ped('b', '2026-11-20T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const r = amarrarSalidas([a, b], resp([sal(22, 'ST 5867', '2026-11-21T10:00:00Z', [LONA])]), refDe);
  t('empate → duda en ambos', r.a.via === null && r.b.via === null && r.a.dudas.length === 1 && r.b.dudas.length === 1 && r.a.dudas[0].candidatos === 2);
  // la salida es posterior solo al pedido a → no hay empate
  const r2 = amarrarSalidas([a, { ...b, createdAt: '2026-11-22T10:00:00Z' }], resp([sal(22, 'ST 5867', '2026-11-21T10:00:00Z', [LONA])]), refDe);
  t('el pedido posterior a la salida no compite', r2.a.via === 'cotizacion' && !r2.b.dudas.length);
}
// --- 3. REQ manda; con REQ ajeno no va por cotización ---
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { codigo: 'REQ-0200' });
  const b = ped('b', '2026-11-20T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { codigo: 'REQ-0201' });
  const s1 = sal(30, 'ST 5867 REQ-0201', '2026-11-21T10:00:00Z', [LONA]);
  const s2 = sal(31, 'ST 5867', '2026-11-21T12:00:00Z', [LONA]);
  const r = amarrarSalidas([a, b], resp([s1, s2], { 'REQ-0200': [], 'REQ-0201': [s1] }), refDe);
  t('REQ exacto → b', r.b.via === 'codigo' && r.b.salidas[0].id === 30);
  t('la otra (mismos productos en a y b) queda en duda', r.a.via === null && r.a.dudas.some(d => d.salida.id === 31) && r.b.dudas.some(d => d.salida.id === 31));
  const r2 = amarrarSalidas([a], resp([sal(32, 'ST 5867 REQ-0999', '2026-11-21T10:00:00Z', [LONA])]), refDe);
  t('REQ de otro pedido no se amarra por cotización', r2.a.via === null && !r2.a.dudas.length);
  const v = salidaDePedidoVista(b, { ...resp([s1, s2], { 'REQ-0200': [], 'REQ-0201': [s1] }), amarre: r }, prj);
  t('vista exacta por REQ', v.estado === 'exacta');
}
// --- 4. elegida por la oficina / descartada ---
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const b = ped('b', '2026-11-20T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { odooPickingId: 40 });
  const r = amarrarSalidas([a, b], resp([sal(40, 'ST 5867', '2026-11-21T10:00:00Z', [LONA])]), refDe);
  t('fija → b, sin duda en a', r.b.via === 'fija' && !r.a.dudas.length && r.a.via === null);
  t('vista fija = exacta', salidaDePedidoVista(b, { ...resp([]), amarre: r }, prj).estado === 'exacta');
  const a2 = { ...a, odooPickingsDescartados: [41] };
  const r2 = amarrarSalidas([a2], resp([sal(41, 'ST 5867', '2026-11-21T10:00:00Z', [LONA])]), refDe);
  t('descartada no se sugiere', r2.a.via === null && !r2.a.dudas.length);
  // con dos pedidos y uno descartó → la toma el otro
  const r3 = amarrarSalidas([a2, { ...b, odooPickingId: null }], resp([sal(41, 'ST 5867', '2026-11-21T10:00:00Z', [LONA])]), refDe);
  t('descartada por a → va a b', r3.b.via === 'cotizacion' && !r3.a.dudas.length);
  // v8.84 (revisión): un pedido con salida fija sigue siendo candidato (su 2da salida no se va a otro)
  const r4 = amarrarSalidas([b], resp([sal(40, 'ST 5867', '2026-11-21T10:00:00Z', [LONA]), sal(42, 'ST 5867', '2026-11-22T10:00:00Z', [LONA])]), refDe);
  t('fijo recibe su 2da salida', r4.b.salidas.length === 2 && r4.b.via === 'fija');
}
// --- backorders siguen a la madre ---
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const b = ped('b', '2026-11-20T14:00:00Z', ['Sellador poliuretano Sikaflex 1A']);
  const madre = sal(50, 'ST 5867', '2026-11-21T10:00:00Z', [LONA]);
  const hija = sal(51, 'ST 5867', '2026-11-21T10:05:00Z', [LONA], { state: 'assigned', fechaHecha: null, backorderDe: 50 });
  // como en Odoo: el backorder nace ANTES de que se valide la madre (y la API los trae en otro orden)
  const hijaAntes = sal(51, 'ST 5867', '2026-11-21T09:59:00Z', [LONA], { state: 'assigned', fechaHecha: null, backorderDe: 50 });
  const rb = amarrarSalidas([a, ped('c', '2026-11-20T15:00:00Z', ['Sellador poliuretano Sikaflex 1A', 'Lona Insugrand 4KG Mineral Gris'])].map((p, i) => i ? p : { ...p, items: [...p.items, { id: 'x', descripcion: 'Primer asfáltico Insuprimer' }] }), resp([hijaAntes, { ...madre, productos: [{ producto: LONA, cantidad: 1 }, { producto: PRIMER, cantidad: 1 }] }]), refDe);
  t('backorder anterior a la madre igual va con ella', eq(rb.a.salidas.map(s => s.id).sort(), [50, 51]) && !rb.c.dudas.length && !rb.a.dudas.length);
  const r = amarrarSalidas([a, b], resp([madre, hija]), refDe);
  t('backorder con su madre', eq(r.a.salidas.map(s => s.id), [50, 51]));
  const v = salidaDePedidoVista(a, { ...resp([]), amarre: r }, prj);
  t('con backorder abierto no está todo hecho', v.estado === 'por_cotizacion' && v.hecha && !v.todasHechas);
  // backorder de una salida fija
  const r2 = amarrarSalidas([{ ...b, odooPickingId: 50 }, a], resp([madre, hija]), refDe);
  t('backorder de fija va al mismo pedido', eq(r2.b.salidas.map(s => s.id), [50, 51]) && r2.b.via === 'fija');
}
// --- una salida va a UN solo pedido ---
{
  const ps = ['a', 'b', 'c'].map((id, i) => ped(id, `2026-11-20T1${i}:00:00Z`, ['Lona Insugrand 4KG Mineral Gris', 'Primer asfáltico Insuprimer']));
  ps[2].items = [{ id: 'c0', descripcion: 'Primer asfáltico Insuprimer' }];
  const r = amarrarSalidas(ps, resp([sal(60, 'ST 5867', '2026-11-21T10:00:00Z', [PRIMER])]), refDe);
  const dueños = ['a', 'b', 'c'].filter(id => r[id].salidas.length);
  t('nunca en dos pedidos', dueños.length <= 1);
}
// --- sin respuesta / canceladas ---
t('sin resp', eq(amarrarSalidas([ped('a', '2026-11-20T13:00:00Z', [])], null, refDe), {}));
{
  const a = ped('a', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const r = amarrarSalidas([a], resp([sal(70, 'ST 5867', '2026-11-21T10:00:00Z', [LONA], { state: 'cancel' })]), refDe);
  t('salida cancelada no', r.a.via === null && !r.a.dudas.length);
}
// --- consulta: pide la cotización solo para pedidos desde el corte ---
{
  const proyectoDe = () => prj;
  const q = consultaSalidas([ped('a', '2026-11-20T13:00:00Z', []), ped('v', '2026-11-10T13:00:00Z', [], { codigo: 'REQ-0100' })], proyectoDe);
  t('refs con el pedido nuevo', eq(q.refs, ['ST-C5867']) && eq(q.codigos, ['REQ-0100']) && q.desde === '2026-11-10');
  const q2 = consultaSalidas([ped('v', '2026-11-10T13:00:00Z', [])], proyectoDe);
  t('pedido viejo sin REQ: nada que buscar', q2 === null);
  // vista: pedido nuevo sin REQ y aún sin respuesta → cargando, con respuesta sin salidas → sin_salida
  const a = ped('a', '2026-11-20T13:00:00Z', []);
  t('nuevo sin REQ cargando', salidaDePedidoVista(a, null, prj, { cargando: true }).estado === 'cargando');
  t('nuevo sin REQ sin salida', salidaDePedidoVista(a, { porReferencia: { ST5867: [] }, porCodigo: {}, amarre: { a: { salidas: [], via: null, dudas: [] } } }, prj).estado === 'sin_salida');
}

// ===== casos de la revisión adversarial =====
// F1/F7: la 2da salida de un pedido ya fijado no se pasa a otro pedido
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris', 'Primer asfáltico Insuprimer']);
  const B = ped('B', '2026-11-20T15:00:00Z', ['Primer asfáltico Insuprimer']);
  const X = sal(101, 'ST 5867', '2026-11-20T16:00:00Z', [LONA]);
  const Y = sal(102, 'ST 5867', '2026-11-20T17:00:00Z', [LONA, PRIMER]);
  const r1 = amarrarSalidas([A, B], resp([X, Y]), refDe);
  t('F1 vuelta 1: A tiene X e Y', eq(r1.A.salidas.map(s => s.id), [101, 102]));
  // salida automática: fija las dos y A queda con salidaAt
  const A2 = { ...A, estado: 'en_ruta', salidaAt: '2026-11-20T17:00:00Z', odooPickingId: 101, odooPickingsFijos: [101, 102] };
  const r2 = amarrarSalidas([A2, B], resp([X, Y]), refDe);
  t('F1 vuelta 2: A conserva las dos, B nada', eq(r2.A.salidas.map(s => s.id), [101, 102]) && !r2.B.salidas.length);
  // aun con solo odooPickingId (datos viejos), Y no se le da clara a B: A sigue compitiendo
  const r3 = amarrarSalidas([{ ...A2, odooPickingsFijos: [] }, B], resp([X, Y]), refDe);
  t('F1 sin fijos: Y no va a B', !r3.B.salidas.length);
}
// F2: una salida chica no dispara "Salió" (cobertura)
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris', 'Primer asfáltico Insuprimer', 'Sellador poliuretano Sikaflex 1A']);
  const S = sal(110, 'ST 5867', '2026-11-21T10:00:00Z', [PRIMER]);
  const r = amarrarSalidas([A], resp([S]), refDe);
  const v = salidaDePedidoVista(A, { ...resp([S]), amarre: r }, prj);
  t('F2 se amarra (es parte del pedido)', v.estado === 'por_cotizacion');
  t('F2 cobertura 1/3, sin salida automática', v.cobertura < 1 && !v.automatica && v.todasHechas);
  const S2 = sal(111, 'ST 5867', '2026-11-21T11:00:00Z', [LONA, SELLADOR]);
  const r2 = amarrarSalidas([A], resp([S, S2]), refDe);
  const v2 = salidaDePedidoVista(A, { ...resp([S, S2]), amarre: r2 }, prj);
  t('F2 con todo salido: avisa validada, pero NO automática (por cotización)', v2.cobertura === 1 && v2.validadaEnOdoo && !v2.automatica);
  t('cobertura helper', coberturaPedido(A, [S]) === 0.33);
}
// F4/F5: deshacer = descartadas todas; no vuelve a registrarse
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { odooPickingsDescartados: [120, 121] });
  const r = amarrarSalidas([A], resp([sal(120, 'ST 5867', '2026-11-21T10:00:00Z', [LONA]), sal(121, 'ST 5867', '2026-11-21T11:00:00Z', [LONA])]), refDe);
  t('F5 descartadas todas: nada', !r.A.salidas.length && !r.A.dudas.length);
  // por REQ también respeta el descarte
  const B = ped('B', '2026-11-20T13:00:00Z', ['Lona'], { codigo: 'REQ-0300', odooPickingsDescartados: [122] });
  const s3 = sal(122, 'ST 5867 REQ-0300', '2026-11-21T10:00:00Z', [LONA]);
  const r2 = amarrarSalidas([B], resp([s3], { 'REQ-0300': [s3] }), refDe);
  t('F8 REQ descartado: se ve pero no vuelve a ser automática', !salidaDePedidoVista(B, { ...resp([s3], { 'REQ-0300': [s3] }), amarre: r2 }, prj).automatica);
  // backorder de una descartada no se cuela
  const C = ped('C', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { odooPickingsDescartados: [130] });
  const r3 = amarrarSalidas([C], resp([sal(130, 'ST 5867', '2026-11-21T10:00:00Z', [LONA]), sal(131, 'ST 5867', '2026-11-21T10:00:00Z', [LONA], { backorderDe: 130 })]), refDe);
  t('F13 backorder de descartada → solo si se descarta también (queda para elegir)', !r3.C.salidas.some(s => s.id === 130));
  // despacho deshecho: conserva su picking a la vista, pero sin salida automática
  const D = { id: 'D', tipo: 'despacho', estado: 'lista', referencia: 'ST-C5867', codigo: 'REQ-0400', createdAt: '2026-11-20T13:00:00Z', items: [], odooPickingId: 140, odooPickingsDescartados: [140] };
  const s4 = sal(140, 'ST 5867', '2026-11-21T10:00:00Z', [LONA]);
  const r4 = amarrarSalidas([D], resp([s4], { 'REQ-0400': [] }), refDe);
  const v4 = salidaDePedidoVista(D, { ...resp([s4], { 'REQ-0400': [] }), amarre: r4 }, null);
  t('F16 despacho conserva su picking', v4.estado === 'exacta' && !v4.automatica);
}
// F5/F17: la misma salida elegida en dos pedidos → conflicto visible, no se pierde en silencio
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona'], { odooPickingsFijos: [150] });
  const B = ped('B', '2026-11-20T14:00:00Z', ['Lona'], { odooPickingsFijos: [150] });
  const r = amarrarSalidas([A, B], resp([sal(150, 'ST 5867', '2026-11-21T10:00:00Z', [LONA])]), refDe);
  const conDuena = ['A', 'B'].filter(k => r[k].salidas.length), conConflicto = ['A', 'B'].filter(k => r[k].dudas.some(d => d.conflicto));
  t('conflicto: una la tiene y la otra lo ve', conDuena.length === 1 && conConflicto.length === 1 && conDuena[0] !== conConflicto[0]);
}
// F9/F14: un pedido ya entregado no se queda las salidas nuevas de la obra
{
  const E = ped('E', '2026-11-19T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { estado: 'entregada', salidaAt: '2026-11-19T18:00:00Z', entregadaAt: '2026-11-19T20:00:00Z' });
  const P = ped('P', '2026-11-22T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const r = amarrarSalidas([E, P], resp([sal(160, 'ST 5867', '2026-11-23T10:00:00Z', [LONA])]), refDe);
  t('entregado no se queda salidas nuevas (P la recibe o la ve como duda)', !r.E.salidas.length && (r.P.salidas.length === 1 || r.P.dudas.length === 1));
  // pero sí recibe su salida validada tarde (dentro de 2 días)
  const r2 = amarrarSalidas([E], resp([sal(161, 'ST 5867', '2026-11-20T15:00:00Z', [LONA])]), refDe);
  t('entregado recibe su salida validada al día siguiente', r2.E.salidas.length === 1);
}
// F15: lo amarrado no se ofrece como venta por entregar
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const B = ped('B', '2026-11-20T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const r = amarrarSalidas([A, B], resp([sal(170, 'ST 5867', '2026-11-21T10:00:00Z', [LONA])]), refDe);
  t('ids en amarre incluye dudas', idsSalidasEnAmarre(r).has('170'));
}

// ===== segunda revisión =====
// solo el REQ dispara la salida automática
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { codigo: 'REQ-0500' });
  const s1 = sal(200, 'ST 5867 REQ-0500', '2026-11-21T10:00:00Z', [LONA]);
  const r = amarrarSalidas([A], resp([s1], { 'REQ-0500': [s1] }), refDe);
  t('REQ hecho → automática', salidaDePedidoVista(A, { ...resp([s1], { 'REQ-0500': [s1] }), amarre: r }, prj).automatica);
  const B = ped('B', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { odooPickingsFijos: [201] });
  const s2 = sal(201, 'ST 5867', '2026-11-21T10:00:00Z', [LONA]);
  const r2 = amarrarSalidas([B], resp([s2]), refDe);
  const v2 = salidaDePedidoVista(B, { ...resp([s2]), amarre: r2 }, prj);
  t('elegida por la oficina → exacta pero no automática', v2.estado === 'exacta' && !v2.automatica && v2.validadaEnOdoo);
}
// H1/H2: deshacer o "No" en A no hace que B salga solo
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris', 'Primer asfáltico Insuprimer'], { odooPickingsDescartados: [210] });
  const B = ped('B', '2026-11-20T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const S = sal(210, 'ST 5867', '2026-11-21T10:00:00Z', [LONA, PRIMER]);
  const r = amarrarSalidas([A, B], resp([S]), refDe);
  t('H1 B no queda automática', !salidaDePedidoVista(B, { ...resp([S]), amarre: r }, prj).automatica);
}
// H3: Odoo validado tarde (>2 días) de un pedido que ya salió → duda, no claro para el abierto
{
  const A = ped('A', '2026-11-19T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris', 'Primer asfáltico Insuprimer'], { estado: 'en_ruta', salidaAt: '2026-11-20T16:00:00Z' });
  const B = ped('B', '2026-11-21T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const r = amarrarSalidas([A, B], resp([sal(220, 'ST 5867', '2026-11-23T18:00:00Z', [LONA, PRIMER])]), refDe);
  t('H3 tardía → duda en B, no amarre', !r.B.salidas.length && r.B.dudas.length === 1);
}
// H4/H7: backorder YA HECHO de la AL/OUT de la venta se reparte como salida nueva
{
  const A = ped('A', '2026-11-19T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris', 'Primer asfáltico Insuprimer'], { estado: 'entregada', salidaAt: '2026-11-20T10:00:00Z', entregadaAt: '2026-11-20T12:00:00Z' });
  const B = ped('B', '2026-11-22T13:00:00Z', ['Primer asfáltico Insuprimer']);
  const venta = sal(600, 'ST 5867', '2026-11-01T10:00:00Z', [LONA, PRIMER], { fechaHecha: '2026-11-20T09:00:00Z' });
  const bo = sal(601, 'ST 5867', '2026-11-20T09:00:00Z', [PRIMER], { fechaHecha: '2026-11-25T10:00:00Z', backorderDe: 600 });
  const r = amarrarSalidas([A, B], resp([venta, bo]), refDe);
  t('H4 la venta va a A', r.A.salidas.map(s => s.id).join() === '600');
  t('H4 su backorder validado después va a B', r.B.salidas.map(s => s.id).join() === '601');
  // mientras el backorder está abierto es el saldo de A
  const r2 = amarrarSalidas([A, B], resp([venta, { ...bo, state: 'assigned', fechaHecha: null }]), refDe);
  t('H4 backorder abierto sigue con A', r2.A.salidas.some(s => s.id === 601));
}
// H8: la consulta trae por cotización desde el corte
{
  const q = consultaSalidas([ped('a', '2026-11-25T13:00:00Z', [])], () => prj);
  t('desde = corte cuando hay cotización', q.desde === AMARRE_COT_DESDE);
}
// #6: REQ sobre una salida ya elegida para otro pedido → conflicto, no doble
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona'], { odooPickingsFijos: [230] });
  const B = ped('B', '2026-11-20T14:00:00Z', ['Lona'], { codigo: 'REQ-0600' });
  const S = sal(230, 'ST 5867 REQ-0600', '2026-11-21T10:00:00Z', [LONA]);
  const r = amarrarSalidas([A, B], resp([S], { 'REQ-0600': [S] }), refDe);
  t('#6 REQ vs elegida → conflicto en B', r.A.salidas.length === 1 && !r.B.salidas.length && r.B.dudas[0]?.conflicto);
}

// ===== chequeo final =====
{
  const A = ped('A', '2026-11-20T13:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { codigo: 'REQ-0001' });
  const B = ped('B', '2026-11-20T14:00:00Z', ['Lona Insugrand 4KG Mineral Gris'], { codigo: 'REQ-0002' });
  const S = sal(300, 'ST 5867 REQ-0001 REQ-0002', '2026-11-21T10:00:00Z', [LONA]);
  const R = resp([S], { 'REQ-0001': [S], 'REQ-0002': [S] });
  const r = amarrarSalidas([B, A], R, refDe);
  const vA = salidaDePedidoVista(A, { ...R, amarre: r }, prj), vB = salidaDePedidoVista(B, { ...R, amarre: r }, prj);
  t('dos REQ en el origen → los dos pedidos, automáticos', vA.estado === 'exacta' && vB.estado === 'exacta' && vA.automatica && vB.automatica);
  // REQ hecho + otra salida sin REQ en duda / por cotización no frenan la automática
  const C = ped('C', '2026-11-20T15:00:00Z', ['Lona Insugrand 4KG Mineral Gris']);
  const S1 = sal(301, 'ST 5867 REQ-0001', '2026-11-21T10:00:00Z', [LONA]);
  const S2 = sal(302, 'ST 5867', '2026-11-21T11:00:00Z', [LONA]);
  const R2 = resp([S1, S2], { 'REQ-0001': [S1] });
  const r2 = amarrarSalidas([A, C], R2, refDe);
  t('REQ hecho sigue automático con otra salida de la obra', salidaDePedidoVista(A, { ...R2, amarre: r2 }, prj).automatica);
  // deshecha (descartada) con REQ: se ve pero no vuelve a ser automática
  const A3 = { ...A, odooPickingsDescartados: [301] };
  const r3 = amarrarSalidas([A3], resp([S1], { 'REQ-0001': [S1] }), refDe);
  const v3 = salidaDePedidoVista(A3, { ...resp([S1], { 'REQ-0001': [S1] }), amarre: r3 }, prj);
  t('REQ deshecha: visible, no automática', v3.estado === 'exacta' && !v3.automatica && v3.validadaEnOdoo);
}

console.log(`amarreSalidas: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
