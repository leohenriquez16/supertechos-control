import { aplanarRenglonesCompras, normalizarNombreArticulo, agruparPorArticulo, diasEnEspera, kpisCompras, filtrarRenglones } from '../lib/helpers/compras.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const ahora = new Date('2026-10-19T12:00:00Z');

t('días: 5', diasEnEspera('2026-10-14T12:00:00Z', ahora) === 5);
t('días: sin fecha → null', diasEnEspera(null, ahora) === null);
t('días: fecha inválida → null', diasEnEspera('xx', ahora) === null);
t('días: futuro → 0', diasEnEspera('2026-10-20T12:00:00Z', ahora) === 0);

t('normaliza acentos y espacios', normalizarNombreArticulo('  Pintura   ACRÍLICA blanca ') === 'pintura acrilica blanca');
t('quita unidad del renglón al final', normalizarNombreArticulo('Silicona gris cubeta', 'Cubeta') === 'silicona gris');
t('quita cantidad+unidad al inicio', normalizarNombreArticulo('10 sacos de cemento', '') === 'cemento');
t('quita "5 gal" al final', normalizarNombreArticulo('Primer epóxico 5 gal', 'gal') === 'primer epoxico');
t('no deja vacío un nombre que es solo unidad', normalizarNombreArticulo('Rollo', 'rollo') === 'rollo');

const reqs = [
  { id: 'r1', estado: 'pendiente', urgente: true, proyectoId: 'p1', solicitadoPorNombre: 'Ana', createdAt: '2026-10-10T12:00:00Z', ocOdooName: 'P00012',
    items: [
      { id: 'i1', descripcion: 'Pintura acrílica', cantidad: 2, unidad: 'gal', estadoCompra: 'solicitado', createdAt: '2026-10-12T12:00:00Z' },
      { id: 'i2', descripcion: 'Brocha', cantidad: 3, unidad: 'und', estadoCompra: 'comprado' },
      { id: 'i3', descripcion: 'Arena', cantidad: 1, unidad: 'm3', estadoCompra: null },
      { id: 'i4', descripcion: 'Tornillos', cantidad: 10, unidad: 'und', estadoCompra: 'compra_maestro' },
    ] },
  { id: 'r2', estado: 'preparando', proyectoId: 'p2', createdAt: '2026-10-18T12:00:00Z',
    items: [
      { id: 'i5', descripcion: 'PINTURA  ACRILICA', cantidad: 5, unidad: 'Gal', estadoCompra: 'cotizado' },
      { id: 'i6', descripcion: 'Malla', cantidad: 1, unidad: 'rollo', estadoCompra: 'comprar_en_ruta' },
    ] },
  { id: 'r3', estado: 'entregada', proyectoId: 'p1', items: [{ id: 'i7', descripcion: 'X', estadoCompra: 'comprado' }] },
  { id: 'r4', estado: 'cancelada', proyectoId: 'p1', items: [{ id: 'i8', descripcion: 'Y', estadoCompra: 'solicitado' }] },
  { id: 'r5', estado: 'lista', tipo: 'despacho', clienteNombre: 'Cliente Z', items: [{ id: 'i9', descripcion: 'Pintura acrílica', cantidad: 1, unidad: 'cubeta', estadoCompra: 'esperando_aprobacion' }] },
];
const { renglones, fuera } = aplanarRenglonesCompras(reqs, { ahora });
t('aplana: 4 renglones en flujo', renglones.length === 4);
t('aplana: 2 fuera de compras', fuera.length === 2);
t('excluye entregada y cancelada', !renglones.some(f => f.requisicionId === 'r3' || f.requisicionId === 'r4'));
t('ignora estado null', !renglones.some(f => f.itemId === 'i3'));
const f1 = renglones.find(f => f.itemId === 'i1');
t('días desde el renglón', f1.dias === 7);
t('días cae a la requisición', renglones.find(f => f.itemId === 'i2').dias === 9);
t('urgente y OC heredados', f1.urgente && f1.ocOdooName === 'P00012');

const k = kpisCompras(renglones);
t('kpis por estado', k.porEstado.solicitado === 1 && k.porEstado.cotizado === 1 && k.porEstado.esperando_aprobacion === 1 && k.porEstado.comprado === 1);
t('más viejo excluye comprado', k.masViejo.itemId === 'i1');

const g = agruparPorArticulo(renglones);
const pint = g.find(x => x.clave === 'pintura acrilica');
t('agrupa pintura (3 renglones)', pint && pint.renglones.length === 3);
t('suma por unidad', pint.cantidades.gal === 7 && pint.cantidades.cubeta === 1);
t('cuenta obras distintas', pint.numObras === 3);
t('estado más atrasado', pint.estadoMasAtrasado === 'solicitado');
t('urgente del grupo', pint.urgente === true);
t('orden: más atrasado primero', g[0].clave === 'pintura acrilica');

t('filtro texto sin acentos', filtrarRenglones(renglones, { texto: 'acrilica' }).length === 3);
t('filtro obra', filtrarRenglones(renglones, { obraId: 'p2' }).length === 1);
t('filtro urgentes', filtrarRenglones(renglones, { soloUrgentes: true }).length === 2);
t('filtro texto por obra', filtrarRenglones(renglones, { texto: 'cliente z', etiquetaObra: f => f.clienteNombre }).length === 1);

console.log(`compras: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
