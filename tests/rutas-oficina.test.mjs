import { construirCandidatos, buscarCandidatos, agregarReciente, moverEnLista, distanciasRuta, totalRutaM, estadoVisualParada, insigniasParada, resumenRuta, reducirPuntos, sumarDias, completadaPorDe, coordsParada, OFICINA, formatKm } from '../lib/helpers/rutasOficina.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };

const cands = construirCandidatos({
  proyectos: [
    { id: 'p1', referenciaOdoo: 'ST-C5467', cliente: 'Armadura Sofía', nombre: 'Gildan', ubicacionLat: 18.5, ubicacionLng: -69.9 },
    { id: 'p2', cliente: 'Sin GPS', ubicacionLat: null, ubicacionLng: null },
    { id: 'p3', cliente: 'Archivada', archivado: true, ubicacionLat: 18, ubicacionLng: -70 },
  ],
  clientes: [{ id: 'c1', nombre: 'Banreservas' }],
  ubicaciones: [{ id: 'u1', clienteId: 'c1', nombre: 'Sucursal Núñez', latitud: 18.47, longitud: -69.93, sector: 'Naco' }, { id: 'u2', clienteId: 'c1', nombre: 'Sin coords', latitud: null, longitud: null }],
  suplidores: [{ nombre: 'Ferretería Americana', locaciones: [{ id: 'l1', nombre: 'Principal', lat: 18.48, lng: -69.95 }, { id: 'l2', nombre: 'Sin', lat: null, lng: null }] }],
  lugares: [{ id: 'g1', tipo: 'puerto', nombre: 'Caucedo', lat: 18.42, lng: -69.63 }],
});
t('oficina siempre primero', cands[0].key === 'oficina' && cands[0].lat === OFICINA.lat);
t('solo con GPS y no archivados', cands.length === 5);
t('obra entrega por defecto', cands.find(c => c.key === 'obra:p1').tipoDefecto === 'entrega');
t('suplidor recoge por defecto', cands.find(c => c.grupo === 'suplidor').tipoDefecto === 'recogida');
t('puerto recoge por defecto', cands.find(c => c.key === 'lug:g1').tipoDefecto === 'recogida');
t('cliente con nombre del cliente', cands.find(c => c.key === 'cli:u1').label === 'Banreservas — Sucursal Núñez');

t('busca sin acentos', buscarCandidatos(cands, 'nunez').some(c => c.key === 'cli:u1'));
t('busca por código', buscarCandidatos(cands, 'c5467')[0].key === 'obra:p1');
t('varias palabras', buscarCandidatos(cands, 'ferreteria amer').length === 1);
t('busca por sector', buscarCandidatos(cands, 'naco')[0].key === 'cli:u1');
t('oficina se encuentra', buscarCandidatos(cands, 'ofi')[0].key === 'oficina');
t('sin texto = recientes', JSON.stringify(buscarCandidatos(cands, '', { recientes: ['lug:g1', 'nada', 'oficina'] }).map(c => c.key)) === '["lug:g1","oficina"]');
t('agrupado en orden', (() => { const r = buscarCandidatos(cands, 'a'); const orden = ['oficina', 'obra', 'cliente', 'suplidor', 'lugar']; return r.every((c, i) => i === 0 || orden.indexOf(c.grupo) >= orden.indexOf(r[i - 1].grupo)); })());

t('reciente al frente sin repetir', JSON.stringify(agregarReciente(['a', 'b', 'c'], 'b', 3)) === '["b","a","c"]');
t('reciente tope', agregarReciente(['a', 'b', 'c'], 'd', 3).length === 3);

t('mover abajo', JSON.stringify(moverEnLista(['a', 'b', 'c', 'd'], 0, 2)) === '["b","c","a","d"]');
t('mover arriba', JSON.stringify(moverEnLista(['a', 'b', 'c', 'd'], 3, 1)) === '["a","d","b","c"]');
t('mover fuera de rango no cambia', JSON.stringify(moverEnLista(['a', 'b'], 0, 5)) === '["a","b"]');

const paradas = [
  { id: 'x1', lat: 18.4353713, lng: -69.9548778, estado: 'completada' },
  { id: 'x2', proyectoId: 'p1', estado: 'pendiente' },
  { id: 'x3', lat: 1, lng: 1, estado: 'cancelada' },
  { id: 'x4', lat: null, lng: null, estado: 'pendiente' },
  { id: 'x5', lat: 18.5, lng: -69.9, estado: 'pendiente' },
];
const prys = [{ id: 'p1', ubicacionLat: 18.5, ubicacionLng: -69.9 }];
const d = distanciasRuta(paradas, prys);
t('coords de la obra', coordsParada(paradas[1], prys).lat === 18.5);
t('primera parada sin tramo', d.x1.tramoM === null && d.x1.acumM === 0);
t('tramo oficina→obra ~9 km', d.x2.tramoM > 8000 && d.x2.tramoM < 10000);
t('cancelada ignorada', d.x3 === undefined);
t('sin coords no rompe', d.x4.tramoM === null && d.x4.acumM === d.x2.acumM);
t('mismo punto = 0 tramo', d.x5.tramoM === 0);
t('total', totalRutaM(paradas, prys) === d.x2.acumM);
t('formatKm', formatKm(850) === '850 m' && formatKm(12345) === '12 km' && formatKm(2500) === '2.5 km');

t('pendiente azul', estadoVisualParada({ estado: 'pendiente' }).color === 'blue');
t('visitada GPS morado', estadoVisualParada({ estado: 'pendiente', llegadaGpsAt: '2026-11-18T14:38:00Z' }).color === 'purple');
t('hecha chofer verde sin borde', (() => { const e = estadoVisualParada({ estado: 'completada', completadaPor: 'chofer' }); return e.color === 'green' && !e.borde; })());
t('hecha GPS verde con borde', (() => { const e = estadoVisualParada({ estado: 'completada', completadaPor: 'gps' }); return e.color === 'green' && !!e.borde; })());
t('cancelada gris', estadoVisualParada({ estado: 'cancelada' }).color === 'gray');
t('vieja con nota de oficina', completadaPorDe({ estado: 'completada', notas: 'x\nMarcada hecha desde oficina por Erisdania' }) === 'oficina');
t('vieja sin nota = chofer', completadaPorDe({ estado: 'completada' }) === 'chofer');

const ins = insigniasParada({ estado: 'completada', completadaPor: 'chofer', completadaAt: '2026-11-18T14:45:00Z', llegadaGpsAt: '2026-11-18T14:38:00Z', permanenciaGpsS: 720 });
t('insignia chofer + gps', ins.length === 2 && ins[0].texto.startsWith('✓ Chofer') && ins[1].texto.includes('12 min'));
t('no ha pasado solo si se revisó', insigniasParada({ estado: 'pendiente' }, { gpsRevisado: true })[0].texto === '🛰 no ha pasado' && insigniasParada({ estado: 'pendiente' }).length === 0);
t('cancelada sin insignias', insigniasParada({ estado: 'cancelada', llegadaGpsAt: 'x' }).length === 0);

const r = resumenRuta({ paradas: [{ estado: 'completada' }, { estado: 'pendiente', llegadaGpsAt: 'x' }, { estado: 'cancelada' }] });
t('resumen', r.total === 2 && r.hechas === 1 && r.gps === 1 && !r.completa);

const muchos = Array.from({ length: 5000 }, (_, i) => ({ lat: 18 + i / 1e5, lng: -69 }));
const red = reducirPuntos(muchos, 600);
t('reduce puntos', red.length === 600 && red[0] === muchos[0] && red[599] === muchos[4999]);
t('sumar días cruza mes', sumarDias('2026-11-30', 1) === '2026-12-01');

console.log(`rutas-oficina: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
