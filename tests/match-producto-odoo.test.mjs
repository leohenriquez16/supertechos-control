// v8.74.15: match de salidas de almacén de Odoo contra materiales del presupuesto.
// Caso real ST-C5996: "BITUNIL BITUGUARD CP 4KG LISO" no casaba con "Lona 4 kg lisa".
import { matcheaProductoOdoo as m, calcRentabilidadObra } from '../lib/helpers/presupuestoObra.js';
let ok = 0, ko = 0;
const t = (n, c, v) => { if (c) ok++; else { ko++; console.error('FALLA:', n, v ?? ''); } };
const L = (nombre, keywordsOdoo = []) => ({ tipo: 'material', nombre, keywordsOdoo });

t('lona 4kg lisa ← bituguard 4kg liso', m(L('Lona 4 kg lisa'), 'BITUNIL BITUGUARD CP 4KG LISO'));
t('lona 4kg lisa ✗ 4mm liso', !m(L('Lona 4 kg lisa'), 'BITUNIL BITUGUARD CP 4MM LISO'));
t('lona 4kg lisa ✗ 4kg mineral', !m(L('Lona 4 kg lisa'), 'BITUNIL BITUGUARD 4KG MINERAL GRIS'));
t('lona 4mm lisa ← lona 4 mm liso', m(L('Lona 4 mm lisa'), 'LONA ASFALTICA 4 MM LISO'));
t('lona 4mm lisa ✗ bituguard 4kg liso (4mm=5kg, no 4kg)', !m(L('Lona 4 mm lisa'), 'BITUNIL BITUGUARD CP 4KG LISO'));
// keyword de marca no se lleva el acabado equivocado
t('kw bituguard en lona mineral ✗ producto liso', !m(L('Lona Insugrand 4KG Mineral Gris', ['insugrand', 'bituguard']), 'BITUNIL BITUGUARD CP 4KG LISO'));
t('kw bituguard en lona mineral ← producto mineral', m(L('Lona Insugrand 4KG Mineral Gris', ['insugrand', 'bituguard']), 'BITUNIL BITUGUARD CP 4KG MINERAL GRIS'));
// comportamientos previos
t('primer asfáltico ← PRIMER ASFALTICO', m(L('Primer asfáltico'), 'PRIMER ASFALTICO BITUNIL CUBETA'));
t('gas propano ← GAS PROPANO 100 LB', m(L('Gas propano'), 'GAS PROPANO 100 LB'));
t('pintura de aluminio ← PINTURA ALUMINIO', m(L('Pintura de aluminio'), 'PINTURA DE ALUMINIO TROPICAL GALON'));
t('kw sika', m(L('Sikatopseal 107 Kit (A+B)', ['sika', 'topseal']), 'SIKA TOP SEAL 107 KIT'));
t('lona ✗ guante', !m(L('Lona 4 kg lisa'), 'GUANTE DE ALGODON CON PUNTOS DE PVC'));
t('lona ✗ mota', !m(L('Lona 4 kg lisa'), 'MOTA SINTETICA 1 1/4 LANCO'));
t('sacos ✗ lona', !m(L('Sacos'), 'BITUNIL BITUGUARD CP 4KG LISO'));
t('primer ✗ pintura aluminio', !m(L('Primer asfáltico'), 'PINTURA DE ALUMINIO TROPICAL'));

t('sikalastic 18 kg ← 20KG (medida = presentación)', m(L('Sikalastic-1K 18 kg'), 'Sikalastic-1K ES light grey 20KG'));
t('lona 4mm lisa ← bituguard 5kg liso (equivalencia 4mm=5kg)', m(L('Lona 4 mm lisa'), 'BITUNIL BITUGUARD CP 5KG LISO'));
t('lona 4kg lisa ✗ 3kg liso', !m(L('Lona 4 kg lisa'), 'BITUNIL BITUGUARD CP 3KG LISO - ROLLO LONA ASFALTICA 10M'));
t('lona mineral ← nilobit 4kg mineral gris', m(L('Lona Insugrand 4KG Mineral Gris'), 'BITUNIL NILOBIT CPM 4KG MINERAL GRIS'));
t('brochas ← BROCHA DE 3', m(L('Brochas'), 'BROCHA DE 3 MARRON LONG LIFE SL 380/30'));
// keywords vivas del sistema (el presupuesto guardó [] al generarse)
const sistemas = { s1: { id: 's1', tareas: [{ id: 'x', peso: 100 }], materiales: [{ id: 'm_tela', nombre: 'Tela', keywords_odoo: ['geotextil'] }] } };
const proyecto = { id: 'p1', sistema: 's1', areas: [{ id: 'a1', m2: 100, sistemaId: 's1' }] };
const presupuesto = { partidas: [{ id: 'pa', sistemaId: 's1', m2: 100, venta: { totalRd: 1000 }, costos: [
  { id: 'c1', tipo: 'material', nombre: 'Tela', materialId: 'm_tela', keywordsOdoo: [], cantidad: 2, costoUnidad: 100, totalRd: 200 }] }] };
const r = calcRentabilidadObra({ presupuesto, proyecto, sistemas, salidasOdoo: { productos: [{ producto: 'GEOTEXTIL NO TEJIDO 200G', cantidad: 3 }] } });
t('keyword viva cuenta la salida', r.partidas[0].lineas[0].cantidadOdoo === 3, r.partidas[0].lineas[0].cantidadOdoo);

// Material Gastable: lo no casado y gastable va a su fila con cantidad y dinero
{
  const pres2 = { partidas: [{ id: 'pa', sistemaId: 's1', m2: 100, venta: { totalRd: 1000 }, costos: [
    { id: 'c1', tipo: 'material', nombre: 'Lona 4 kg lisa', materialId: 'x', cantidad: 2, costoUnidad: 100, totalRd: 200 }] }], gastos: [] };
  const r2_ = calcRentabilidadObra({ presupuesto: pres2, proyecto, sistemas, salidasOdoo: { productos: [
    { producto: 'BITUNIL BITUGUARD CP 4KG LISO', cantidad: 33, costoRd: 34821.96 },
    { producto: 'MOTA SINTETICA 1 1/4 LANCO', cantidad: 8, costoRd: 1348 },
    { producto: 'GUANTE DE ALGODON CON PUNTOS DE PVC', cantidad: 3, costoRd: 0 },
    { producto: 'Polos Super Techos', cantidad: 5, costoRd: 0 },
    { producto: 'PALO DE ESCOBA MADERA', cantidad: 2, costoRd: 0 },
  ] }, movimientosCajaChica: [{ id: 'm1', proyectoId: 'p1', tipo: 'gasto_factura', status: 'aprobado', concepto: 'Cuchillas y lentes de seguridad', monto: 450 }] });
  const g = r2_.gastos.find(x => x.categoria === 'material_gastable');
  t('fila Material Gastable existe aunque el ppto sea viejo', !!g);
  t('real gastable = motas + caja chica', g && g.real === 1798, g?.real);
  const mota = g?.articulos.find(a => a.nombre.startsWith('MOTA'));
  t('motas: cantidad 8 y RD$1,348', mota && mota.cantidad === 8 && mota.costoRd === 1348, mota);
  const guante = g?.articulos.find(a => a.nombre.startsWith('GUANTE'));
  t('guantes marcados sin costo', guante && guante.sinCosto && guante.cantidad === 3, guante);
  t('lona casó con su línea, no es gastable', !g?.articulos.some(a => a.nombre.startsWith('BITUNIL')));
  const lona = r2_.partidas[0].lineas[0];
  t('lona: real = costo FIFO de Odoo', lona.real === 34821.96, lona.real);
  t('lona: costo unitario real', Math.abs(lona.costoUnidadReal - 1055.21) < 0.01, lona.costoUnidadReal);
  t('lona: proyección = real (ya salió todo, más barato que ppto)', lona.proyeccion === 34821.96, lona.proyeccion);
  t('palo de escoba es gastable', g?.articulos.some(a => a.nombre.startsWith('PALO')));
  t('no casados = solo polos', r2_.salidasOdooNoMatch.length === 1 && r2_.salidasOdooNoMatch[0].producto === 'Polos Super Techos', r2_.salidasOdooNoMatch);
}

console.log(`match-producto-odoo: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
