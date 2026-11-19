// tests de lib/helpers/pedirAlmacen.js (v8.76: "Pedir al almacén" desde Materiales)
import {
  claveRenglon, baseDesdePresupuesto, baseDesdeSistema, salioPorRenglon, pedidosConSalida,
  etiquetaPedido, renglonDeItem, pedidoPorRenglon, armarRenglones, avisoYaPedido, avisoYaSalio,
  itemsParaRequisicion, desdePedidosAbiertos,
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
t('sistema: unidad plural y redondeo', bs[0].unidad === 'rollos' && bs[0].requerido === 33.33);

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

const conSalida = { r4: { via: 'cotizacion', salidas: ['AL/OUT/01500'] } };
const ped = pedidoPorRenglon(bs, reqs, conSalida);
t('pedido: suma abiertos sin salida', ped.cantidades['s1|membrana'] === 20 && ped.cantidades['s1|primer'] === 3);
t('pedido: entregados no cuentan', !ped.detalle['s1|membrana'].some(d => d.reqId === 'r3'));
t('pedido: con salida en Odoo va aparte', ped.salidos['s1|membrana'].length === 1 && ped.salidos['s1|membrana'][0].via === 'cotizacion');
t('pedido: etiqueta REQ', ped.detalle['s1|membrana'][0].etiqueta === 'REQ-0142');
t('etiqueta sin número', etiquetaPedido({ createdAt: '2026-09-08T10:00:00Z' }) === 'el pedido del 2026-09-08');

// --- pedidosConSalida (usa salidasDePedido) ---
const resp = {
  porReferencia: { ST5867: [{ name: 'AL/OUT/01700', origin: 'ST 5867', state: 'done', fecha: '2026-11-13T15:00:00Z' }] },
  porCodigo: { 'REQ-0142': [{ name: 'AL/OUT/01710', origin: 'ST 5867 REQ-0142', state: 'done', fecha: '2026-11-11T15:00:00Z' }] },
};
const cs = pedidosConSalida(reqs, resp, 'ST-C5867');
t('con salida: exacto por código', cs.r1?.via === 'codigo' && eq(cs.r1.salidas, ['AL/OUT/01710']));
t('con salida: aproximado por cotización', cs.r2?.via === 'cotizacion');
t('con salida: entregada no se mira', !cs.r3);
t('con salida: sin respuesta', eq(pedidosConSalida(reqs, null, 'ST-C5867'), {}));

// --- armar renglones ---
const rs = armarRenglones({ base: bs, salio: { 's1|membrana': 12 }, pedido: { 's1|membrana': 20 } });
const lona = rs.find(r => r.clave === 's1|membrana');
t('armar: sugerido = ceil(33.33 − 12 − 20)', lona.sugerido === 2 && lona.pedir === 2 && lona.marcado);
const prim = rs.find(r => r.clave === 's1|primer');
t('armar: primer sugerido 5', prim.sugerido === 5 && prim.yaSalio === 0);
const rs2 = armarRenglones({ base: bs, salio: { 's1|membrana': 40 }, pedido: {} });
t('armar: ya salió todo → no marcado', rs2[0].sugerido === 0 && !rs2[0].marcado);

// --- avisos ---
t('aviso un pedido', avisoYaPedido([{ etiqueta: 'REQ-0142', cantidad: 20 }], 'rollos') === 'Ya hay 20 rollos pedidos sin entregar en REQ-0142.');
t('aviso varios', avisoYaPedido([{ etiqueta: 'REQ-0142', cantidad: 20 }, { etiqueta: 'REQ-0150', cantidad: 5 }, { etiqueta: 'REQ-0151', cantidad: 1 }], 'rollos')
  === 'Ya hay 26 rollos pedidos sin entregar en REQ-0142, REQ-0150 y REQ-0151.');
t('aviso vacío', avisoYaPedido([], 'x') === '' && avisoYaSalio([]) === '');
t('aviso ya salió aproximado', avisoYaSalio([{ etiqueta: 'REQ-0099', via: 'cotizacion' }]).includes('aproximado'));

// --- items ---
const its = itemsParaRequisicion(
  [{ ...lona, pedir: '3' }, { ...prim, marcado: false }, { ...rs2[0], marcado: true, pedir: 0 }],
  [{ descripcion: ' Brochas 4" ', cantidad: '6', unidad: 'und' }, { descripcion: '', cantidad: 2 }, { descripcion: 'Motas', cantidad: '' }],
);
t('items: marcado con cantidad', its[0].descripcion === 'Lona 4 kg granular' && its[0].cantidad === 3 && its[0].materialId === 'membrana' && its[0].sistemaId === 's1');
t('items: no marcados ni en 0 fuera', its.length === 3);
t('items: libre sin materialId', its[1].descripcion === 'Brochas 4"' && its[1].materialId === null && its[1].cantidad === 6);
t('items: libre sin cantidad', its[2].cantidad === null);

// --- desde ---
t('desde: día antes del más viejo abierto', desdePedidosAbiertos(reqs) === '2026-09-30');
t('desde: sin abiertos', desdePedidosAbiertos([{ estado: 'entregada', createdAt: '2026-01-01' }]) === null);

console.log(`pedirAlmacen: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
