import { compararConOdoo, partidasDeCotizacion, textoCambio } from '../lib/helpers/syncOdoo.js';
let ok = 0, ko = 0; const t = (n, c, v) => { if (c) ok++; else { ko++; console.error('FALLA:', n, v ?? ''); } };
const L = (name, qty, pu, extra = {}) => ({ name, product_uom_qty: qty, price_unit: pu, price_subtotal: qty * pu, product_uom: [1, 'M2'], ...extra });
const S = (name) => ({ display_type: 'line_section', name });
const sistemas = { asep: { nombre: 'Sistema Aséptico Paredes' }, epo: { nombre: 'Sistema Epóxico 100% Sólidos Autonivelante' }, lona: { nombre: 'Lona Asfáltica 4KG Mineral Gris' }, limp: { nombre: 'Limpieza y Bote' } };
// Yeara: sin secciones, m² suben, partida nueva
const yeara = { sistema: 'asep', valorCotizacion: 4056533, areas: [{ id: 'a1', nombre: 'Paredes - Sistema Aséptico', m2: 970.36, sistemaId: 'asep' }, { id: 'a2', nombre: 'Sistema Epóxico Autonivelante', m2: 396.84, sistemaId: 'epo' }] };
const cotY = { state: 'sale', amount_total: 5601882.38, amount_untaxed: 4922568, lineas: [L('AP - Sistema Aséptico Paredes', 2190, 800), L('AP - Curva Sanitaria', 729, 1000, { product_uom: [2, 'm'] }), L('AP - Sistema Epóxico\nSistema Epóxico 100% Sólidos Autonivelante', 396.84, 5200)] };
let r = compararConOdoo(yeara, cotY, { sistemas, reportadoPorArea: { a2: 396.84 } });
t('valor +38% → revisar', r.revisar.some(c => c.tipo === 'valor_grande' && c.a === 5601882.38) && !r.seguros.some(c => c.tipo === 'valor'));
t('m² suben → seguro', r.seguros.some(c => c.tipo === 'm2' && c.areaId === 'a1' && c.a === 2190));
t('precio aséptico', r.seguros.some(c => c.tipo === 'precio' && c.areaId === 'a1' && c.a === 800));
t('precio epóxico', r.seguros.some(c => c.tipo === 'precio' && c.areaId === 'a2' && c.a === 5200));
t('curva sanitaria a revisar', r.revisar.some(c => c.tipo === 'partida_nueva' && /Curva/.test(c.nombre)));
t('itbis 13.8%', r.seguros.some(c => c.tipo === 'itbis' && Math.abs(c.a - 1.138) < 0.001));
// m² bajan por debajo de lo reportado
r = compararConOdoo({ ...yeara, areas: [yeara.areas[0]] }, { ...cotY, lineas: [L('AP - Sistema Aséptico Paredes', 500, 800)] }, { sistemas, reportadoPorArea: { a1: 900 } });
t('m² bajo reportado → revisar', r.revisar.some(c => c.tipo === 'm2_bajo_reportado') && !r.seguros.some(c => c.tipo === 'm2'));
// Dalan: dos áreas por sección (lona + limpieza)
const dalan = { sistema: 'lona', valorCotizacion: 1, areas: [{ id: 'l', nombre: 'Bloque 1', m2: 1434.6, sistemaId: 'lona' }, { id: 'k', nombre: 'Bloque 1', m2: 1434.6, sistemaId: 'limp' }] };
const cotD = { state: 'sale', amount_total: 1, amount_untaxed: 1, lineas: [S('Bloque 1'), L('AP - Limpieza y Bote Escombros Remocion', 1434.6, 80), L('AP - Lona Asfáltica 4KG Mineral Gris', 1434.6, 690)] };
r = compararConOdoo(dalan, cotD, { sistemas });
t('lona emparejada por sistema', r.seguros.some(c => c.tipo === 'precio' && c.areaId === 'l' && c.a === 690));
t('limpieza emparejada por sistema', r.seguros.some(c => c.tipo === 'precio' && c.areaId === 'k' && c.a === 80));
t('sin partidas sueltas', r.revisar.length === 0, JSON.stringify(r.revisar));
// anticipos fuera, USD, cancelada
t('anticipos fuera', partidasDeCotizacion([S('Anticipos'), L('Down payment', 1, 5000)]).length === 0);
r = compararConOdoo({ areas: [], valorCotizacion: 0 }, { state: 'cancel', amount_total: 100, amount_untaxed: 100, moneda: 'USD', tasa: 60, lineas: [] });
t('usd convertido (sin valor previo → seguro)', r.seguros.some(c => c.tipo === 'valor' && c.a === 6000));
t('precio grande → revisar', compararConOdoo({ areas: [{ id: 'x', nombre: 'Techo', m2: 1, sistemaId: 'lona', precioVentaM2: 20000 }], sistema: 'lona', valorCotizacion: 1 }, { state: 'sale', amount_total: 1, amount_untaxed: 1, lineas: [L('Lona Asfaltica', 1, 715)] }, { sistemas }).revisar.some(c => c.tipo === 'precio_grande'));
t('cancelada a revisar', r.revisar.some(c => c.tipo === 'cancelada'));
t('sin cambios no propone nada', compararConOdoo({ areas: [{ id: 'x', nombre: 'Techo', m2: 300, sistemaId: 'lona', precioVentaM2: 715 }], valorCotizacion: 253110, itbisFactor: 1.18, sistema: 'lona' }, { state: 'sale', amount_total: 253110, amount_untaxed: 214500, lineas: [L('AP - Lona Asfaltica 4kg Lisa', 300, 715)] }, { sistemas }).seguros.length === 0);
t('texto', textoCambio({ tipo: 'm2', area: 'Techo', de: 1, a: 2 }).includes('Techo'));
const epo = compararConOdoo({ sistema: 'epo', valorCotizacion: 1, areas: [{ id: 'e', nombre: 'Sistema Epóxico Autonivelante', m2: 396.84, sistemaId: 'epo' }, { id: 'z', nombre: 'Otra', m2: 5, sistemaId: 'asep' }] }, { state: 'sale', amount_total: 1, amount_untaxed: 1, lineas: [L('AP - Sistema Epóxico\nSistema Epóxico 100% Sólidos Autonivelante', 396.84, 5200)] }, { sistemas });
t('empareja con la descripción completa', epo.seguros.some(c => c.tipo === 'precio' && c.areaId === 'e'));
const arr = compararConOdoo({ ...yeara, areas: [yeara.areas[0]] }, cotY, { sistemas, obraArrancada: true });
t('obra arrancada: m² a revisar', arr.revisar.some(c => c.tipo === 'm2_obra_arrancada') && !arr.seguros.some(c => c.tipo === 'm2'));
t('unidades sueltas no son partida nueva', !compararConOdoo({ areas: [], valorCotizacion: 1 }, { state: 'sale', amount_total: 1, amount_untaxed: 1, lineas: [L('Transporte y dieta', 1, 70000, { product_uom: [3, 'Units'] })] }).revisar.length);
console.log(`${ok} pasadas, ${ko} fallidas`); if (ko) process.exit(1);
