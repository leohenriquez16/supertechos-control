// tests/programa-sites.test.mjs — v8.58.0 · Programa de locaciones (Towers and Sites).
// Ejecutar desde la raíz:  node tests/programa-sites.test.mjs

import assert from 'node:assert/strict';
import { etapaDeLocacion, resumenPrograma, pendientesDelCliente, agruparPorZona, distanciaKm, ETAPAS } from '../lib/helpers/programaSites.js';

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
caso('facturada cuenta como terminada, no como entregada', () => {
  assert.equal(etapaDeLocacion({}, { obra: { estado: 'facturado' } }), 'terminado');
});
caso('recibido conforme = entregado', () => {
  assert.equal(etapaDeLocacion({}, { obra: { estado: 'recibido_conforme' } }), 'entregado');
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

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
