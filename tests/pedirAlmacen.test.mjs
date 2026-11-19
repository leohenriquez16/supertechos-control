// tests de lib/helpers/pedirAlmacen.js (v8.76: "Pedir al almacén" desde Materiales)
import {
  claveRenglon, baseDesdePresupuesto, baseDesdeSistema, salioPorRenglon, pedidosConSalida,
  etiquetaPedido, renglonDeItem, pedidoPorRenglon, armarRenglones, avisoYaPedido, avisoYaSalio,
  itemsParaRequisicion, desdePedidosAbiertos, salioDetallePorRenglon, avisoDudaOdoo, avisoOtraUnidad,
  detalleSalioTexto, pluralUnidad, singularUnidad, conUnidad, fechaCortaRD,
} from '../lib/helpers/pedirAlmacen.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- base desde presupuesto ---
const sistemas = {
  s1: { nombre: 'Lona granular', materiales: [{ id: 'membrana', nombre: 'Lona 4 kg granular', keywords_odoo: ['granular'] }, { id: 'primer', nombre: 'Primer asfáltico' }] },
  s2: { nombre: 'Silicona', materiales: [{ id: 'sil', nombre: 'Silicona blanca', keywords_odoo: 'silicona, ever silic' }] },
};
const ppto = {
  version: 3,
  partidas: [
    { id: 'pt1', tipo: 'sistema', sistemaId: 's1', nombre: 'Lona granular', costos: [
      { id: 'c1', tipo: 'material', materialId: 'membrana', nombre: 'Lona 4 kg granular', unidad: 'rollos', cantidad: 40, keywordsOdoo: [] },
      { id: 'c2', tipo: 'material', materialId: 'primer', nombre: 'Primer asfáltico', unidad: 'cubetas', cantidad: 6.5 },
      { id: 'c3', tipo: 'mdo_tarea', nombre: 'MDO', totalRd: 1000 },
      { id: 'c4', tipo: 'material', materialId: null, nombre: 'Clavos', unidad: 'lb', cantidad: 5 },
    ] },
    { id: 'pt2', tipo: 'adicional', sistemaVinculadoId: 's1', nombre: 'Adicional techo', costos: [
      { id: 'c5', tipo: 'material', materialId: 'membrana', nombre: 'Lona 4 kg granular', unidad: 'rollos', cantidad: 10 },
    ] },
    { id: 'pt3', tipo: 'sistema', sistemaId: 's2', nombre: 'Silicona', costos: [
      { id: 'c6', tipo: 'material', materialId: 'sil', nombre: 'Silicona blanca', unidad: 'cubetas', cantidad: null },
    ] },
  ],
};
const bp = baseDesdePresupuesto(ppto, sistemas);
t('presupuesto: solo materiales, suma por sistema+material', bp.length === 4);
t('presupuesto: lona suma partidas del mismo sistema', bp.find(b => b.clave === 's1|membrana').requerido === 50);
t('presupuesto: keywords vivas del sistema', bp.find(b => b.clave === 's1|membrana').keywordsOdoo.includes('granular'));
t('presupuesto: keywords texto con comas', eq(bp.find(b => b.clave === 's2|sil').keywordsOdoo, ['silicona', 'ever silic']));
t('presupuesto: cantidad null → 0', bp.find(b => b.clave === 's2|sil').requerido === 0);
t('presupuesto: línea manual sin materialId', bp.some(b => b.materialId === null && b.nombre === 'Clavos'));
t('presupuesto: nombre del sistema', bp.find(b => b.clave === 's1|primer').sistemaNombre === 'Lona granular');
t('presupuesto vacío', eq(baseDesdePresupuesto(null), []) && eq(baseDesdePresupuesto({ partidas: [] }), []));

// --- base desde sistema ---
const grupos = [
  { sistemaId: 's1', sistema: sistemas.s1, materialesCalculados: [
    { id: 'membrana', nombre: 'Lona 4 kg granular', unidad: 'rollo', unidad_plural: 'rollos', requerido: 33.333, keywords_odoo: ['granular'] },
    { id: 'primer', nombre: 'Primer asfáltico', unidad: 'cubeta', requerido: 4.2 },
  ] },
  { sistemaId: 's2', sistema: null, materialesCalculados: [] },
];
const bs = baseDesdeSistema(grupos);
t('sistema: renglones', bs.length === 2 && bs[0].clave === claveRenglon('s1', 'membrana'));
t('sistema: unidad singular + plural y redondeo', bs[0].unidad === 'rollo' && bs[0].unidadPlural === 'rollos' && bs[0].requerido === 33.33);
t('sistema: plural calculado si falta', bs[1].unidadPlural === 'cubetas');
t('presupuesto: unidad singular y plural', bp.find(b => b.clave === 's1|membrana').unidad === 'rollo' && bp.find(b => b.clave === 's1|membrana').unidadPlural === 'rollos');

// --- unidades ---
t('plural rollo', pluralUnidad('rollo') === 'rollos' && pluralUnidad('galón') === 'galones' && pluralUnidad('lb') === 'lb' && pluralUnidad('saco') === 'sacos');
t('singular', singularUnidad('cubetas') === 'cubeta' && singularUnidad('galones') === 'galón' && singularUnidad('lb') === 'lb');
t('con unidad 1 / 20', conUnidad(1, 'rollo', 'rollos') === '1 rollo' && conUnidad(20, 'rollo', 'rollos') === '20 rollos' && conUnidad(3, '', '') === '3');
t('fecha corta RD', fechaCortaRD('2026-11-03T15:00:00Z') === '3-nov' && fechaCortaRD('2026-11-04T02:00:00Z') === '3-nov' && fechaCortaRD('2026-09-08') === '8-sep' && fechaCortaRD(null) === '');

// --- ya salió ---
const productos = [
  { producto: 'LONA 4 KG GRANULAR ROJO', cantidad: 12 },
  { producto: 'PRIMER ASFALTICO CUBETA', cantidad: 2 },
  { producto: 'Guantes', cantidad: 5 },
];
const salio = salioPorRenglon(bs, productos);
t('salió: lona por keyword', salio['s1|membrana'] === 12);
t('salió: primer por nombre', salio['s1|primer'] === 2);
t('salió: guantes no cuenta', Object.keys(salio).length === 2);
t('salió: sin productos', eq(salioPorRenglon(bs, []), {}));
// detalle para el title + otra unidad
const det = salioDetallePorRenglon(bs, [
  { producto: 'LONA 4 KG GRANULAR ROJO', cantidad: 12, unidad: 'Unidades' },
  { producto: 'PRIMER ASFALTICO', cantidad: 25, unidad: 'Galón' },
]);
t('detalle: lona contada con su producto', det.cantidades['s1|membrana'] === 12 && det.detalle['s1|membrana'][0].producto === 'LONA 4 KG GRANULAR ROJO');
t('detalle: primer en galones vs cubetas NO se suma', !det.cantidades['s1|primer'] && det.otraUnidad['s1|primer'].length === 1);
t('aviso otra unidad', avisoOtraUnidad(det.otraUnidad['s1|primer'], 'cubetas').includes('Galón') && avisoOtraUnidad([], 'x') === '');
t('texto detalle', detalleSalioTexto(det.detalle['s1|membrana'], []).includes('LONA 4 KG GRANULAR ROJO ×12 Unidades')
  && detalleSalioTexto([], det.otraUnidad['s1|primer']).includes('otra unidad'));
// mismo material en dos sistemas: se reparte en proporción a lo requerido
const dos = [
  { clave: 's1|membrana', materialId: 'membrana', nombre: 'Lona 4 kg granular', keywordsOdoo: ['granular'], unidad: 'rollo', requerido: 30 },
  { clave: 's3|membrana', materialId: 'membrana', nombre: 'Lona 4 kg granular', keywordsOdoo: ['granular'], unidad: 'rollo', requerido: 10 },
];
const rep2 = salioPorRenglon(dos, [{ producto: 'LONA GRANULAR', cantidad: 20 }]);
t('dos sistemas: reparte 15/5', rep2['s1|membrana'] === 15 && rep2['s3|membrana'] === 5);

// --- pedidos ---
const reqs = [
  { id: 'r1', numero: 142, codigo: 'REQ-0142', estado: 'pendiente', createdAt: '2026-11-10T14:00:00Z',
    items: [{ descripcion: 'Lona 4 kg granular', cantidad: 20, materialId: 'membrana', sistemaId: 's1' }] },
  { id: 'r2', numero: 150, codigo: 'REQ-0150', estado: 'preparando', createdAt: '2026-11-12T14:00:00Z',
    items: [{ descripcion: 'primer asfaltico', cantidad: 3 }, { descripcion: 'Escoba', cantidad: 2 }] },
  { id: 'r3', estado: 'entregada', createdAt: '2026-11-01T14:00:00Z', items: [{ materialId: 'membrana', cantidad: 99 }] },
  { id: 'r4', numero: 99, codigo: 'REQ-0099', estado: 'lista', createdAt: '2026-10-01T14:00:00Z',
    items: [{ descripcion: 'Lona granular', cantidad: 8, materialId: 'membrana' }] },
];
t('renglón por materialId', renglonDeItem(bs, { materialId: 'membrana', sistemaId: 's1' }) === 's1|membrana');
t('renglón por nombre parecido', renglonDeItem(bs, { descripcion: 'primer asfaltico' }) === 's1|primer');
t('renglón sin parecido', renglonDeItem(bs, { descripcion: 'Escoba' }) === null);
t('renglón materialId desconocido', renglonDeItem(bs, { materialId: 'zzz' }) === null);

t('etiqueta sin número = fecha corta', etiquetaPedido({ createdAt: '2026-09-08T14:00:00Z' }) === 'el pedido del 8-sep');
t('etiqueta sin nada', etiquetaPedido({}) === 'un pedido');

// --- pedidosConSalida: solo salidas HECHAS y solo por el producto que coincide ---
const sal = (name, origin, state, fecha, productos, fechaHecha = null) => ({ id: name, name, origin, state, fecha, fechaHecha, productos });
const lonaP = (c) => ({ producto: 'LONA 4 KG GRANULAR ROJO', cantidad: c, unidad: 'Unidades' });
const primP = (c) => ({ producto: 'PRIMER ASFALTICO CUBETA', cantidad: c, unidad: 'Unidades' });

// Caso 1 (revisión ALTA 1): la salida por REQ existe pero está SIN VALIDAR → sigue en "Ya pedido".
const reqA = [{ id: 'a', codigo: 'REQ-0150', estado: 'preparando', createdAt: '2026-11-10T14:00:00Z',
  items: [{ descripcion: 'Lona 4 kg granular', cantidad: 20, materialId: 'membrana', sistemaId: 's1' }] }];
const respA = { porReferencia: { ST5867: [] }, porCodigo: { 'REQ-0150': [sal('AL/OUT/1', 'ST 5867 REQ-0150', 'assigned', '2026-11-10T16:00:00Z', [lonaP(20)])] } };
const csA = pedidosConSalida(reqA, respA, 'ST-C5867', bs);
const pA = pedidoPorRenglon(bs, reqA, csA);
t('sin validar: sigue en ya pedido', pA.cantidades['s1|membrana'] === 20 && !pA.salidos['s1|membrana']);
t('sin validar: aviso de la duda', avisoDudaOdoo(pA.detalle['s1|membrana']).includes('sin validar') && avisoDudaOdoo(pA.detalle['s1|membrana']).includes('AL/OUT/1'));

// Caso 2 (revisión ALTA 2): A pide lona, B pide primer; sale (hecha, por cotización) SOLO el primer.
const reqB = [
  { id: 'A', estado: 'pendiente', createdAt: '2026-11-09T14:00:00Z', items: [{ descripcion: 'Lona 4 kg granular', cantidad: 20, materialId: 'membrana', sistemaId: 's1' }] },
  { id: 'B', estado: 'pendiente', createdAt: '2026-11-10T14:00:00Z', items: [{ descripcion: 'Primer asfáltico', cantidad: 4, materialId: 'primer', sistemaId: 's1' }] },
];
const respB = { porReferencia: { ST5867: [sal('AL/OUT/2', 'ST 5867', 'done', '2026-11-10T18:00:00Z', [primP(4)], '2026-11-10T19:00:00Z')] }, porCodigo: {} };
const pB = pedidoPorRenglon(bs, reqB, pedidosConSalida(reqB, respB, 'ST-C5867', bs));
t('por producto: la lona sigue en ya pedido', pB.cantidades['s1|membrana'] === 20);
// v8.80.0: ya no se amarra por cotización (solo REQ exacto) → la salida "ST 5867" no descuenta nada
t('v8.80 sin REQ: el primer sigue en ya pedido', pB.cantidades['s1|primer'] === 4 && !pB.salidos['s1|primer']);

// Caso 3: salida parcial → solo se descuenta lo que salió (mínimo).
const reqC = [{ id: 'C', codigo: 'REQ-0160', estado: 'lista', createdAt: '2026-11-10T14:00:00Z',
  items: [{ descripcion: 'Lona', cantidad: 20, materialId: 'membrana', sistemaId: 's1' }, { descripcion: 'Primer', cantidad: 3, materialId: 'primer', sistemaId: 's1' }] }];
const respC = { porReferencia: {}, porCodigo: { 'REQ-0160': [sal('AL/OUT/3', 'REQ-0160', 'done', '2026-11-11T14:00:00Z', [lonaP(12)])] } };
const csC = pedidosConSalida(reqC, respC, 'ST-C5867', bs);
const pC = pedidoPorRenglon(bs, reqC, csC);
t('parcial: exacto por código', csC.C.via === 'codigo' && csC.C.cubierto[0].cantidad === 12 && !csC.C.cubierto[1]);
t('parcial: quedan 8 rollos pedidos', pC.cantidades['s1|membrana'] === 8 && pC.salidos['s1|membrana'][0].cantidad === 12);
t('parcial: primer completo en ya pedido', pC.cantidades['s1|primer'] === 3);

// Caso 4: dos pedidos de la misma obra, una sola salida por cotización → no se descuenta dos veces.
const reqD = [
  { id: 'D1', estado: 'pendiente', createdAt: '2026-11-09T14:00:00Z', items: [{ descripcion: 'Lona', cantidad: 10, materialId: 'membrana', sistemaId: 's1' }] },
  { id: 'D2', estado: 'pendiente', createdAt: '2026-11-09T15:00:00Z', items: [{ descripcion: 'Lona', cantidad: 10, materialId: 'membrana', sistemaId: 's1' }] },
];
const respD = { porReferencia: { ST5867: [sal('AL/OUT/4', 'ST 5867', 'done', '2026-11-10T14:00:00Z', [lonaP(10)], '2026-11-10T14:00:00Z')] }, porCodigo: {} };
const pD = pedidoPorRenglon(bs, reqD, pedidosConSalida(reqD, respD, 'ST-C5867', bs));
t('v8.80 sin REQ: ninguno se descuenta', pD.cantidades['s1|membrana'] === 20 && !pD.salidos['s1|membrana']);

// Caso 5: salida en otra unidad (galones) no cubre cubetas.
const reqE = [{ id: 'E', codigo: 'REQ-0170', estado: 'lista', createdAt: '2026-11-10T14:00:00Z', items: [{ descripcion: 'Primer', cantidad: 5, materialId: 'primer', sistemaId: 's1' }] }];
const respE = { porReferencia: {}, porCodigo: { 'REQ-0170': [sal('AL/OUT/5', 'REQ-0170', 'done', '2026-11-11T14:00:00Z', [{ producto: 'PRIMER ASFALTICO', cantidad: 25, unidad: 'Galón' }])] } };
t('otra unidad no cubre', pedidoPorRenglon(bs, reqE, pedidosConSalida(reqE, respE, null, bs)).cantidades['s1|primer'] === 5);

// Respaldos
const ped = pedidoPorRenglon(bs, reqs, {});
t('pedido: suma abiertos', ped.cantidades['s1|membrana'] === 28 && ped.cantidades['s1|primer'] === 3);
t('pedido: entregados no cuentan', !ped.detalle['s1|membrana'].some(d => d.reqId === 'r3'));
t('pedido: etiqueta REQ', ped.detalle['s1|membrana'][0].etiqueta === 'REQ-0142');
t('con salida: sin respuesta', eq(pedidosConSalida(reqs, null, 'ST-C5867', bs), {}));
t('con salida: entregada no se mira', !pedidosConSalida(reqs, respB, 'ST-C5867', bs).r3);

// --- armar renglones ---
const rs = armarRenglones({ base: bs, salio: { 's1|membrana': 12 }, pedido: { 's1|membrana': 20 } });
const lona = rs.find(r => r.clave === 's1|membrana');
t('armar: sugerido = ceil(33.33 − 12 − 20)', lona.sugerido === 2 && lona.pedir === 2 && lona.marcado);
const prim = rs.find(r => r.clave === 's1|primer');
t('armar: primer sugerido 5', prim.sugerido === 5 && prim.yaSalio === 0);
const rs2 = armarRenglones({ base: bs, salio: { 's1|membrana': 40 }, pedido: {} });
t('armar: ya salió todo → no marcado', rs2[0].sugerido === 0 && !rs2[0].marcado);

// --- avisos ---
t('aviso un pedido', avisoYaPedido([{ etiqueta: 'REQ-0142', cantidad: 20 }], 'rollo', 'rollos') === 'Ya hay 20 rollos pedidos sin entregar en REQ-0142.');
t('aviso singular', avisoYaPedido([{ etiqueta: 'REQ-0142', cantidad: 1 }], 'rollo', 'rollos') === 'Ya hay 1 rollo pedido sin entregar en REQ-0142.');
t('aviso plural sin plural dado', avisoYaPedido([{ etiqueta: 'REQ-0142', cantidad: 20 }], 'rollo') === 'Ya hay 20 rollos pedidos sin entregar en REQ-0142.');
t('aviso varios', avisoYaPedido([{ etiqueta: 'REQ-0142', cantidad: 20 }, { etiqueta: 'REQ-0150', cantidad: 5 }, { etiqueta: 'REQ-0151', cantidad: 1 }], 'rollo', 'rollos')
  === 'Ya hay 26 rollos pedidos sin entregar en REQ-0142, REQ-0150 y REQ-0151.');
t('aviso vacío', avisoYaPedido([], 'x') === '' && avisoYaSalio([]) === '' && avisoDudaOdoo([]) === '');
const avS = avisoYaSalio([{ etiqueta: 'REQ-0099', via: 'cotizacion', cantidad: 4 }], 'cubeta', 'cubetas');
t('aviso ya salió sin palabras técnicas', !avS.includes('aproximado') && !avS.includes('ERP') && avS.startsWith('REQ-0099 sigue abierto aquí') && avS.includes('4 cubetas') && avS.includes('puede ser de otro pedido'));
t('aviso ya salió plural', avisoYaSalio([{ etiqueta: 'REQ-1', via: 'codigo', cantidad: 1 }, { etiqueta: 'REQ-2', via: 'codigo', cantidad: 1 }], 'rollo', 'rollos').startsWith('REQ-1 y REQ-2 siguen abiertos aquí'));

// --- items ---
const its = itemsParaRequisicion(
  [{ ...lona, pedir: '3' }, { ...prim, marcado: false }, { ...rs2[0], marcado: true, pedir: 0 }],
  [{ descripcion: ' Brochas 4" ', cantidad: '6', unidad: 'und' }, { descripcion: '', cantidad: 2 }, { descripcion: 'Motas', cantidad: '' }],
);
t('items: marcado con cantidad', its[0].descripcion === 'Lona 4 kg granular' && its[0].cantidad === 3 && its[0].unidad === 'rollos' && its[0].materialId === 'membrana' && its[0].sistemaId === 's1');
t('items: no marcados ni en 0 fuera', its.length === 3);
t('items: libre sin materialId', its[1].descripcion === 'Brochas 4"' && its[1].materialId === null && its[1].cantidad === 6);
t('items: libre sin cantidad', its[2].cantidad === null);

// --- desde ---
t('desde: día antes del más viejo abierto', desdePedidosAbiertos(reqs) === '2026-09-30');
t('desde: sin abiertos', desdePedidosAbiertos([{ estado: 'entregada', createdAt: '2026-01-01' }]) === null);

console.log(`pedirAlmacen: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
