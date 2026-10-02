// tests/programa-sites.test.mjs — v8.58.0 · Programa de locaciones (Towers and Sites).
// Ejecutar desde la raíz:  node tests/programa-sites.test.mjs

import assert from 'node:assert/strict';
import { etapaDeLocacion, resumenPrograma, pendientesDelCliente, agruparPorZona, distanciaKm, ETAPAS, amarrarLocaciones, normalizarRefOdoo, textoCoordinacion, fechasPorEtapa, enEtapaDesde } from '../lib/helpers/programaSites.js';

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

// --- etapas
caso('sin luz verde cuando el propietario no ha autorizado', () => {
  assert.equal(etapaDeLocacion({}, {}), 'sin_luz_verde');
});
caso('con luz verde pasa a por levantar', () => {
  assert.equal(etapaDeLocacion({ luzVerde: true }, {}), 'por_levantar');
});
caso('levantado cuando la visita ya se hizo', () => {
  assert.equal(etapaDeLocacion({ luzVerde: true, levantadoAt: '2026-10-02' }, {}), 'levantado');
});
caso('cotizado cuando hay referencia de cotización', () => {
  assert.equal(etapaDeLocacion({ luzVerde: true, levantadoAt: '2026-10-02', cotizacionRef: 'ST-C5880' }, {}), 'cotizado');
});
caso('por programar cuando el cliente aprobó', () => {
  assert.equal(etapaDeLocacion({ cotizacionRef: 'ST-C5880', cotizacionAprobada: true }, {}), 'por_programar');
});
caso('la obra manda sobre todo lo demás', () => {
  const loc = { luzVerde: false }; // dato viejo
  assert.equal(etapaDeLocacion(loc, { obra: { estado: 'en_ejecucion' } }), 'en_ejecucion');
});
caso('obra aprobada o planificada = por programar', () => {
  assert.equal(etapaDeLocacion({}, { obra: { estado: 'aprobado' } }), 'por_programar');
  assert.equal(etapaDeLocacion({}, { obra: { estado: 'planificado' } }), 'por_programar');
});
caso('terminada sin entregar = terminado', () => {
  assert.equal(etapaDeLocacion({}, { obra: { estado: 'finalizado_no_entregado' } }), 'terminado');
});
caso('recibido conforme y facturado = entregado (estados reales del ERP)', () => {
  assert.equal(etapaDeLocacion({}, { obra: { estado: 'finalizado_recibido_conforme' } }), 'entregado');
  assert.equal(etapaDeLocacion({}, { obra: { estado: 'facturado' } }), 'entregado');
});
caso('obra parada vuelve a por programar', () => {
  assert.equal(etapaDeLocacion({}, { obra: { estado: 'parado' } }), 'por_programar');
});

// --- resumen
const locs = [
  { id: 1, etapa: 'entregado' }, { id: 2, etapa: 'en_ejecucion' },
  { id: 3, etapa: 'sin_luz_verde' }, { id: 4, etapa: 'sin_luz_verde' },
  { id: 5, etapa: 'cotizado' }, { id: 6, etapa: 'por_programar' },
];
caso('el resumen cuenta por etapa y reparte de quién depende', () => {
  const r = resumenPrograma(locs);
  assert.equal(r.total, 6);
  assert.equal(r.entregadas, 1);
  assert.equal(r.faltan, 5);
  assert.equal(r.porEtapa.sin_luz_verde, 2);
  assert.equal(r.pendientesCliente, 3);   // 2 sin luz verde + 1 cotización por aprobar
  assert.equal(r.pendientesNuestros, 2);  // en ejecución + por programar
  assert.equal(r.pctAvance, 17);
});
caso('con fecha meta dice cuántas hay que entregar por semana', () => {
  const r = resumenPrograma(locs, { fechaMeta: '2026-12-31', hoy: new Date('2026-10-02') });
  assert.equal(r.ritmo.diasRestantes, 90);
  assert.ok(r.ritmo.porSemanaNecesarias >= 1);
});
caso('programa vacío no rompe', () => {
  const r = resumenPrograma([]);
  assert.equal(r.total, 0); assert.equal(r.pctAvance, 0);
});

// --- pendientes del cliente
caso('la lista del cliente separa luz verde, aprobaciones y supervisor', () => {
  const p = pendientesDelCliente([
    { id: 1, etapa: 'sin_luz_verde', supervisorClienteNombre: 'Leanny' },
    { id: 2, etapa: 'cotizado', supervisorClienteNombre: 'Leanny' },
    { id: 3, etapa: 'por_levantar' },
    { id: 4, etapa: 'entregado' },
  ]);
  assert.equal(p.sinLuzVerde.length, 1);
  assert.equal(p.cotizacionesPorAprobar.length, 1);
  assert.equal(p.sinSupervisor.length, 1); // la entregada no cuenta
});

// --- zonas (coordenadas reales del acuerdo)
const almirante = { id: 'a', nombre: 'El Almirante', lat: 18.52386, lng: -69.81014, sector: 'SD Este' };
const mirador = { id: 'b', nombre: 'Nuevo Mirador del Este', lat: 18.5205, lng: -69.8156, sector: 'SD Este' };
const colinas = { id: 'c', nombre: 'Las Colinas de los Ríos', lat: 18.491515, lng: -69.974710, sector: 'DN' };
caso('dos antenas del mismo sector caen en el mismo grupo', () => {
  const g = agruparPorZona([almirante, mirador, colinas], 8);
  const grande = g[0];
  assert.equal(grande.locaciones.length, 2);
  assert.ok(g.some(x => x.locaciones.length === 1));
});
caso('la distancia entre El Almirante y Las Colinas pasa de 15 km', () => {
  assert.ok(distanciaKm(almirante, colinas) > 15);
});
caso('las que no tienen coordenadas quedan en su propio grupo', () => {
  const g = agruparPorZona([almirante, { id: 'z', nombre: 'Sin coords' }], 8);
  assert.ok(g.find(x => x.zona === 'Sin coordenadas')?.locaciones.length === 1);
});
caso('las 8 etapas tienen dueño o están cerradas', () => {
  assert.equal(ETAPAS.length, 8);
  assert.equal(ETAPAS.filter(e => e.deQuien === 'cliente').length, 2);
});


// --- amarre automático (datos reales del 3-oct-2026)
const isabelita = { id: 'pl_15', codigoUt: 'DO-01-SD-00119-08', nombre: 'ISABELITA', lat: 18.473781902351, lng: -69.843355190462 };
const mirSur = { id: 'pl_46', codigoUt: 'DO-01-DN-00151-10', nombre: 'MIRADOR DEL SUR', lat: 18.44514, lng: -69.95983 };
const sanJuan = { id: 'pl_12', codigoUt: 'DO-04-SN-01344-15', nombre: 'MANOGUAYABO, SAN JUAN', lat: 18.79665, lng: -71.22899 };
const levs = [
  { id: 'lev-isa', siteNombre: 'Antena Isabelita DO-01-SD-00119-08', lat: 18.473828, lng: -69.843299, referenciaOdoo: 'ST-C5818', realizadoAt: '2026-09-07', cotizadoAt: '2026-09-07' },
  { id: 'lev-msur', siteNombre: 'Antena MIRADOR DEL SUR', lat: 18.445140, lng: -69.959830, referenciaOdoo: 'ST-C5875', realizadoAt: null, cotizadoAt: '2026-09-28' },
  { id: 'lev-mano', siteNombre: 'Antena Manoguayabo', lat: 18.484248, lng: -69.978111, referenciaOdoo: 'ST-C5790', realizadoAt: '2026-08-25', cotizadoAt: '2026-08-26' },
];
caso('amarra por código UT y trae la cotización', () => {
  const c = amarrarLocaciones([isabelita], levs, []);
  assert.equal(c[0].campos.levantamientoId, 'lev-isa');
  assert.equal(c[0].campos.cotizacionRef, 'ST-C5818');
  assert.equal(c[0].campos.luzVerde, true);
});
caso('amarra por cercanía cuando el nombre no trae el código', () => {
  const c = amarrarLocaciones([{ ...mirSur, codigoUt: 'XX' }], levs, []);
  assert.equal(c[0].campos.levantamientoId, 'lev-msur');
});
caso('Manoguayabo de Santo Domingo NO se confunde con el de San Juan', () => {
  const c = amarrarLocaciones([sanJuan], levs, []);
  assert.equal(c.length, 0);
});
caso('la obra se amarra por la referencia de Odoo del levantamiento', () => {
  const obras = [{ id: 'p_obra', nombre: 'Antena Isabelita', referenciaOdoo: 'ST-C5818', valorCotizacion: 250000 }];
  const c = amarrarLocaciones([isabelita], levs, obras);
  assert.equal(c[0].campos.proyectoId, 'p_obra');
  assert.equal(c[0].campos.cotizacionAprobada, true);
  assert.equal(c[0].campos.cotizacionMonto, 250000);
});
caso('no pisa un amarre que ya existe', () => {
  const c = amarrarLocaciones([{ ...isabelita, levantamientoId: 'otro', proyectoId: 'otra' }], levs, []);
  assert.equal(c.length, 0);
});
caso('un levantamiento no se usa para dos locaciones', () => {
  const c = amarrarLocaciones([isabelita, { ...isabelita, id: 'pl_dup' }], levs, []);
  assert.equal(c.filter(x => x.campos.levantamientoId === 'lev-isa').length, 1);
});
caso('San Carlos y San Gerónimo con las mismas coordenadas: gana el nombre', () => {
  const coords = { lat: 18.460106, lng: -69.916224 };
  const levsMal = [
    { id: 'lev-sc', siteNombre: 'Antena San Carlos', ...coords, referenciaOdoo: 'ST5775' },
    { id: 'lev-sg', siteNombre: 'Antena San Geronimo', ...coords, referenciaOdoo: 'ST5759' },
  ];
  const sanGeronimo = { id: 'pl_07', codigoUt: 'DO-01-DN-00198-12', nombre: 'SAN GERÓNIMO UASD', lat: 18.460146, lng: -69.913594 };
  const sanCarlos = { id: 'pl_60', codigoUt: 'DO-01-DN-00097-08', nombre: 'SAN CARLOS', lat: 18.47761944, lng: -69.89825556 };
  const c = amarrarLocaciones([sanGeronimo, sanCarlos], levsMal, []);
  assert.equal(c.find(x => x.id === 'pl_07').campos.levantamientoId, 'lev-sg');
  assert.equal(c.find(x => x.id === 'pl_60').campos.levantamientoId, 'lev-sc');
});
caso('ST5758 y ST-C5758 son la misma cotización', () => {
  assert.equal(normalizarRefOdoo('ST5758'), 'ST-C5758');
  assert.equal(normalizarRefOdoo('ST-C5758'), 'ST-C5758');
  assert.equal(normalizarRefOdoo('PG-C1287'), 'PG-C1287');
});
caso('después del amarre, la locación cotizada queda en "cotizado"', () => {
  const [c] = amarrarLocaciones([isabelita], levs, []);
  assert.equal(etapaDeLocacion({ ...isabelita, ...c.campos }, {}), 'cotizado');
});

// --- coordinación de la visita
caso('el amarre trae la fecha coordinada del levantamiento', () => {
  const [c] = amarrarLocaciones([isabelita], [{ ...levs[0], fechaVisita: '2026-10-09', horaVisita: '09:00' }], []);
  assert.equal(c.campos.fechaVisita, '2026-10-09');
  assert.equal(c.campos.horaVisita, '09:00');
});
caso('no pisa una fecha ya coordinada', () => {
  const [c] = amarrarLocaciones([{ ...isabelita, fechaVisita: '2026-10-08' }], [{ ...levs[0], fechaVisita: '2026-10-09' }], []);
  assert.equal('fechaVisita' in c.campos, false);
});
caso('la fecha coordinada se lee en español con hora de 12', () => {
  const t = textoCoordinacion('2026-10-09', '14:30');
  assert.match(t, /9/); assert.match(t, /2:30 p\. m\./);
  assert.equal(textoCoordinacion(null), '');
});
caso('los nombres nuevos de las etapas', () => {
  assert.equal(ETAPAS[0].label, 'Pendiente coordinar levantamiento');
  assert.equal(ETAPAS[1].label, 'Coordinado para levantar');
});

// --- desde cuándo en cada etapa
caso('cada etapa toma su fecha del dato real', () => {
  const f = fechasPorEtapa(
    { createdAt: '2026-10-02', luzVerdeAt: '2026-10-03', levantadoAt: '2026-10-09', cotizadoAt: '2026-10-10', cotizacionAprobadaAt: '2026-10-15' },
    [{ estadoNuevo: 'en_ejecucion', fecha: '2026-10-20' }, { estadoNuevo: 'aprobado', fecha: '2026-10-14' }, { estadoNuevo: 'finalizado_recibido_conforme', fecha: '2026-10-25' }]);
  assert.equal(f.por_levantar, '2026-10-03');
  assert.equal(f.cotizado, '2026-10-10');
  assert.equal(f.por_programar, '2026-10-15');   // la aprobación del cliente gana a la de Odoo
  assert.equal(f.en_ejecucion, '2026-10-20');
  assert.equal(f.entregado, '2026-10-25');
});
caso('si la obra entra dos veces a ejecución, cuenta la primera', () => {
  const f = fechasPorEtapa({}, [{ estadoNuevo: 'en_ejecucion', fecha: '2026-10-22' }, { estadoNuevo: 'parado', fecha: '2026-10-21' }, { estadoNuevo: 'en_ejecucion', fecha: '2026-10-20' }]);
  assert.equal(f.en_ejecucion, '2026-10-20');
});
caso('días en la etapa actual', () => {
  const r = enEtapaDesde('cotizado', { cotizado: '2026-10-10T12:00:00Z' }, new Date('2026-10-17T12:00:00Z'));
  assert.equal(r.dias, 7);
  assert.equal(enEtapaDesde('levantado', {}).desde, null);
});
caso('el amarre guarda la fecha de la cotización', () => {
  const [c] = amarrarLocaciones([isabelita], levs, []);
  assert.equal(c.campos.cotizadoAt, '2026-09-07');
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
