// tests de lib/helpers/requisiciones.js (v8.76: pedidos de material ↔ salidas de Odoo)
import {
  codigoRequisicion, numeroDeCodigo, claveCotizacion, origenMencionaCotizacion, origenMencionaCodigo,
  codigosEnOrigen, agruparSalidasPorPedido, fechaOdooAIso, diaRD, salidasDePedido,
  cantidadesSugeridas, yaPedidoPorMaterial, yaSalioPorMaterial,
  fechaDeSalida, unidadesCompatibles, familiaUnidad, yaSalioDetallado,
} from '../lib/helpers/requisiciones.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- codigoRequisicion ---
t('código 1', codigoRequisicion(1) === 'REQ-0001');
t('código 142', codigoRequisicion(142) === 'REQ-0142');
t('código 12345 no se corta', codigoRequisicion(12345) === 'REQ-12345');
t('código texto numérico', codigoRequisicion('7') === 'REQ-0007');
t('código null', codigoRequisicion(null) === null);
t('código undefined', codigoRequisicion(undefined) === null);
t('código 0', codigoRequisicion(0) === null);
t('código negativo', codigoRequisicion(-3) === null);
t('código decimal', codigoRequisicion(1.5) === null);
t('código vacío', codigoRequisicion('') === null);
t('número de código', numeroDeCodigo('REQ-0142') === 142 && numeroDeCodigo('req 142') === 142 && numeroDeCodigo('REQ0142') === 142);
t('número de código inválido', numeroDeCodigo('ST-C5867') === null && numeroDeCodigo('') === null);

// --- cotización ---
t('clave ST-C5867', claveCotizacion('ST-C5867') === 'ST5867');
t('clave PG-C1269', claveCotizacion('PG-C1269') === 'PG1269');
t('clave st 5867', claveCotizacion('st 5867') === 'ST5867');
t('clave sin prefijo', claveCotizacion('5867') === '5867');
t('clave nula', claveCotizacion('') === null && claveCotizacion(null) === null);
t('origen "ST 5867"', origenMencionaCotizacion('ST 5867', 'ST5867'));
t('origen "ST-C5867"', origenMencionaCotizacion('ST-C5867', 'ST5867'));
t('origen "St 5867"', origenMencionaCotizacion('St 5867', 'ST5867'));
t('origen "ST-5867"', origenMencionaCotizacion('ST-5867', 'ST5867'));
t('origen "ST5867 (RECLAMACION)"', origenMencionaCotizacion('ST5867 (RECLAMACION)', 'ST5867'));
t('PG no es ST', !origenMencionaCotizacion('PG 5867', 'ST5867'));
t('ST no es PG', !origenMencionaCotizacion('ST 1269', 'PG1269'));
t('PG 1269 sí', origenMencionaCotizacion('PG 1269', 'PG1269'));
t('número más largo no cuenta', !origenMencionaCotizacion('ST 58670', 'ST5867'));
t('número dentro de otro no cuenta', !origenMencionaCotizacion('ST 15867', 'ST5867'));
t('sin prefijo busca el número', origenMencionaCotizacion('PG 5867', '5867') && !origenMencionaCotizacion('ST 58671', '5867'));
t('REQ en origen', origenMencionaCodigo('ST 5867 REQ-0142', 'REQ-0142'));
t('REQ sin ceros', origenMencionaCodigo('req 142', 'REQ-0142'));
t('REQ distinto', !origenMencionaCodigo('REQ-1420', 'REQ-0142') && !origenMencionaCodigo('REQ-0014', 'REQ-0142'));
t('códigos en origen', eq(codigosEnOrigen('ST 5867 REQ-0142 / req 150'), ['REQ-0142', 'REQ-0150']));
t('códigos en origen vacío', eq(codigosEnOrigen('ST 5867'), []));

// --- agrupar ---
const s1 = { name: 'AL/OUT/1', origin: 'ST 5867', state: 'done', fecha: '2026-11-10T15:00:00Z', productos: [] };
const s2 = { name: 'AL/OUT/2', origin: 'ST-C5867 REQ-0142', state: 'assigned', fecha: '2026-11-12T15:00:00Z', productos: [] };
const s3 = { name: 'AL/OUT/3', origin: 'PG 1269', state: 'done', fecha: '2026-11-12T15:00:00Z', productos: [] };
const s4 = { name: 'AL/OUT/4', origin: 'ST 5867', state: 'cancel', fecha: '2026-11-12T15:00:00Z', productos: [] };
const s5 = { name: 'AL/OUT/5', origin: 'ST 5867 REQ-0150', state: 'draft', fecha: '2026-11-13T15:00:00Z', productos: [] };
const g = agruparSalidasPorPedido([s1, s2, s3, s4, s5], ['ST-C5867', 'PG-C1269', 'ST-C9999'], ['REQ-0142', 'req 150']);
t('agrupa ST5867 (sin cancelada)', eq(g.porReferencia.ST5867.map(s => s.name), ['AL/OUT/1', 'AL/OUT/2', 'AL/OUT/5']));
t('agrupa PG1269', eq(g.porReferencia.PG1269.map(s => s.name), ['AL/OUT/3']));
t('ref sin salidas = []', eq(g.porReferencia.ST9999, []));
t('agrupa por código', eq(g.porCodigo['REQ-0142'].map(s => s.name), ['AL/OUT/2']) && eq(g.porCodigo['REQ-0150'].map(s => s.name), ['AL/OUT/5']));

// --- fechas ---
t('fecha Odoo → ISO', fechaOdooAIso('2026-11-18 17:26:55') === '2026-11-18T17:26:55Z');
t('fecha Odoo false', fechaOdooAIso(false) === null);
t('día RD (UTC−4)', diaRD('2026-11-18T02:00:00Z') === '2026-11-17' && diaRD('2026-11-18T05:00:00Z') === '2026-11-18');
t('día RD de fecha simple', diaRD('2026-11-18') === '2026-11-18');

// --- salidasDePedido ---
const resp = g;
const p142 = { codigo: 'REQ-0142', createdAt: '2026-11-11T13:00:00Z' };
const r1 = salidasDePedido(p142, resp, { referencia: 'ST-C5867', porCotizacion: true });
t('amarre exacto por código', r1.via === 'codigo' && !r1.aproximado && eq(r1.salidas.map(s => s.name), ['AL/OUT/2']) && r1.salidas[0].porCotizacion === false);
const p160 = { numero: 160, createdAt: '2026-11-11T13:00:00Z' };
const r2 = salidasDePedido(p160, resp, { referencia: 'ST-C5867', porCotizacion: true });
// AL/OUT/1 es anterior al pedido; AL/OUT/2 y /5 traen el código de OTRO pedido → ninguna
t('por cotización excluye anteriores y las de otro REQ', r2.via === null && r2.salidas.length === 0);
const s6 = { name: 'AL/OUT/6', origin: 'ST 5867', state: 'done', fecha: '2026-11-11T20:00:00Z', productos: [] };
const resp2 = agruparSalidasPorPedido([s1, s2, s6], ['ST-C5867'], ['REQ-0142']);
const r3 = salidasDePedido(p160, resp2, { referencia: 'ST-C5867', porCotizacion: true });
t('por cotización aproximado (mismo día, más tarde, cuenta)', r3.via === 'cotizacion' && r3.aproximado && eq(r3.salidas.map(s => s.name), ['AL/OUT/6']) && r3.salidas[0].porCotizacion === true);
const r4 = salidasDePedido({ codigo: 'REQ-0142', createdAt: '2026-11-11T13:00:00Z', referencia: 'ST-C5867' }, resp2);
t('referencia desde el pedido', r4.via === 'codigo');
const r5 = salidasDePedido({ codigo: 'REQ-0142', createdAt: '2026-11-13T13:00:00Z' }, resp2, { referencia: 'ST-C5867', porCotizacion: true });
t('nunca salidas anteriores al pedido, ni por código', r5.via === null);
t('pedido sin datos', salidasDePedido(null, resp).via === null && salidasDePedido(p142, null).via === null);
const r6 = salidasDePedido({ codigo: 'REQ-0999', createdAt: '2026-11-01T13:00:00Z' }, resp2, {});
t('sin código ni cotización → nada', r6.via === null);

// --- cantidadesSugeridas ---
const mats = [{ id: 'm1', nombre: 'Lona 4mm', unidad: 'rollo' }, { id: 'm2', nombre: 'Primer', unidad: 'cubeta' }, { id: 'm3', nombre: 'Gas' }];
const cs = cantidadesSugeridas({ materiales: mats, requerido: { m1: 30, m2: 4.2, m3: 2 }, salio: { m1: 10 }, pedido: { m1: 5, m3: 5 } });
t('sugerido = requerido − salió − pedido', cs[0].sugerido === 15 && cs[0].requerido === 30 && cs[0].yaSalio === 10 && cs[0].yaPedido === 5);
t('sugerido redondea hacia arriba', cs[1].sugerido === 5);
t('sugerido nunca negativo', cs[2].sugerido === 0);
t('sugerido trae nombre y unidad', cs[0].nombre === 'Lona 4mm' && cs[0].unidad === 'rollo' && cs[0].materialId === 'm1');
t('flotante no sube de más', cantidadesSugeridas({ materiales: [{ id: 'a' }], requerido: { a: 0.1 + 0.2 + 2.7 } })[0].sugerido === 3);
t('acepta Map', cantidadesSugeridas({ materiales: [{ id: 'a' }], requerido: new Map([['a', 3]]), salio: new Map([['a', 1]]) })[0].sugerido === 2);
t('sin datos', eq(cantidadesSugeridas(), []) && cantidadesSugeridas({ materiales: [{ id: 'x' }] })[0].sugerido === 0);

// --- yaPedidoPorMaterial ---
const reqs = [
  { id: 'r1', estado: 'pendiente', items: [{ materialId: 'm1', cantidad: 5 }, { materialId: null, cantidad: 9 }] },
  { id: 'r2', estado: 'lista', items: [{ materialId: 'm1', cantidad: '2' }] },
  { id: 'r3', estado: 'entregada', items: [{ materialId: 'm1', cantidad: 100 }] },
  { id: 'r4', estado: 'cancelada', items: [{ materialId: 'm2', cantidad: 100 }] },
];
t('ya pedido solo abiertos', eq(yaPedidoPorMaterial(reqs), { m1: 7 }));
t('ya pedido excluye el que se edita', eq(yaPedidoPorMaterial(reqs, { excluirId: 'r1' }), { m1: 2 }));

// --- yaSalioPorMaterial ---
const ys = yaSalioPorMaterial(
  [{ id: 'm1', nombre: 'Sikalastic 560', keywords_odoo: 'sikalastic' }, { id: 'm2', nombre: 'Sikalastic otro', keywordsOdoo: ['sikalastic'] }, { id: 'm3', nombre: 'Gas propano' }],
  [{ producto: 'SIKALASTIC 560 CUBETA', cantidad: 8 }, { producto: 'Sikalastic 560 cubeta', cantidad: 2 }, { producto: 'Tornillos', cantidad: 50 }],
);
t('ya salió: cada producto a un solo material', ys.m1 === 10 && ys.m2 === undefined && ys.m3 === undefined);

// --- v8.80.0: por defecto SOLO código REQ exacto (sin opts.porCotizacion no hay amarre por cotización) ---
t('sin porCotizacion no amarra por cotización', salidasDePedido(p160, resp2, { referencia: 'ST-C5867' }).via === null);
t('por código sigue igual sin porCotizacion', salidasDePedido(p142, resp, { referencia: 'ST-C5867' }).via === 'codigo');
// --- revisión: amarre por hora, no por día ---
const pTarde = { numero: 170, createdAt: '2026-11-11T19:00:00Z' }; // 15:00 RD
const sManana = { name: 'AL/OUT/7', origin: 'ST 5867', state: 'done', fecha: '2026-11-11T13:00:00Z', productos: [] }; // 9:00 RD
const rT = salidasDePedido(pTarde, agruparSalidasPorPedido([sManana], ['ST-C5867'], []), { referencia: 'ST-C5867', porCotizacion: true });
t('salida de esa misma mañana NO cuenta para un pedido de la tarde', rT.via === null);
const sMargen = { name: 'AL/OUT/8', origin: 'ST 5867', state: 'done', fecha: '2026-11-11T18:55:00Z', productos: [] };
t('margen de 10 minutos', salidasDePedido(pTarde, agruparSalidasPorPedido([sMargen], ['ST-C5867'], []), { referencia: 'ST-C5867', porCotizacion: true }).via === 'cotizacion');
// --- revisión: salidas hechas se fechan por date_done ---
const sVieja = { name: 'AL/OUT/9', origin: 'ST-C5867', state: 'done', fecha: '2026-10-01T13:00:00Z', fechaHecha: '2026-11-12T13:00:00Z', productos: [] };
t('fecha de salida hecha = date_done', fechaDeSalida(sVieja) === '2026-11-12T13:00:00Z');
t('fecha de salida abierta = creación', fechaDeSalida({ ...sVieja, state: 'assigned' }) === '2026-10-01T13:00:00Z');
t('creada antes pero validada después del pedido → se amarra',
  salidasDePedido(pTarde, agruparSalidasPorPedido([sVieja], ['ST-C5867'], []), { referencia: 'ST-C5867', porCotizacion: true }).via === 'cotizacion');
t('abierta creada antes del pedido → no',
  salidasDePedido(pTarde, agruparSalidasPorPedido([{ ...sVieja, state: 'assigned', fechaHecha: null }], ['ST-C5867'], []), { referencia: 'ST-C5867', porCotizacion: true }).via === null);
// --- revisión: REQ.142 / REQ #142 / REQ:142 ---
t('REQ.142', origenMencionaCodigo('ST 5867 REQ.142', 'REQ-0142') && origenMencionaCodigo('REQ #142', 'REQ-0142') && origenMencionaCodigo('REQ:0142', 'REQ-0142'));
t('códigos con punto y #', eq(codigosEnOrigen('REQ.142 y REQ #150'), ['REQ-0142', 'REQ-0150']));
t('numeroDeCodigo con #', numeroDeCodigo('REQ #142') === 142);
// --- unidades ---
t('familia unidad', familiaUnidad('Galón') === 'galon' && familiaUnidad('Unidades') === 'unidad' && familiaUnidad('cubetas') === 'cubeta' && familiaUnidad('cosa rara') === null);
t('compatibles: unidades con cualquiera', unidadesCompatibles('Unidades', 'cubeta') && unidadesCompatibles('rollo', 'Units'));
t('compatibles: misma familia', unidadesCompatibles('rollos', 'Rollo') && unidadesCompatibles('gal', 'Galones'));
t('incompatibles: galón vs cubeta', !unidadesCompatibles('Galón', 'cubetas') && !unidadesCompatibles('kg', 'saco'));
t('desconocidas se aceptan', unidadesCompatibles('', 'cubeta') && unidadesCompatibles('xyz', 'kg'));
const yd = yaSalioDetallado([{ id: 'p', nombre: 'Primer asfáltico', unidad: 'cubetas' }],
  [{ producto: 'PRIMER ASFALTICO', cantidad: 25, unidad: 'Galón' }, { producto: 'PRIMER ASFALTICO 5G', cantidad: 2, unidad: 'Unidades' }]);
t('detallado: otra unidad aparte', yd.cantidades.p === 2 && yd.detalle.p.length === 1 && yd.otraUnidad.p[0].cantidad === 25);

console.log(`requisiciones: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
