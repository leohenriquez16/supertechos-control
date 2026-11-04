// tests/sitio-levantamiento.test.mjs — v8.75.0 · El sitio de cada levantamiento en el Kanban.
// Ejecutar desde la raíz:  node tests/sitio-levantamiento.test.mjs

import assert from 'node:assert/strict';
import { nombreSitioVisible, textoBusquedaSitios, normalizarBusqueda, etapaDeLevantamiento } from '../lib/helpers/sitioLevantamiento.js';

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

caso('la antena se ve aunque el cliente sea el mismo en todas las tarjetas', () => {
  assert.equal(nombreSitioVisible('Antena Agustín Lara        DO-01-DN-00099-08', 'TOWERS AND SITES DOMINICANA'), 'Antena Agustín Lara DO-01-DN-00099-08');
});
caso('limpia el tab que trae el nombre pegado de Excel', () => {
  assert.equal(nombreSitioVisible('Antena LA PRIVADA II (Caonabo) DO-01-DN-00090-08\t', 'TOWERS'), 'Antena LA PRIVADA II (Caonabo) DO-01-DN-00090-08');
});
caso('no repite el nombre del cliente (ni con otra capitalización o acentos)', () => {
  assert.equal(nombreSitioVisible('TOWERS AND SITES DOMINICANA', 'Towers and Sites Dominicana'), '');
  assert.equal(nombreSitioVisible('Inversiones Peña', 'INVERSIONES PENA'), '');
});
caso('sin sitio no hay nada que enseñar', () => {
  assert.equal(nombreSitioVisible('', 'X'), '');
  assert.equal(nombreSitioVisible(null, 'X'), '');
  assert.equal(nombreSitioVisible('   ', 'X'), '');
});
caso('sucursales y tiendas también se distinguen', () => {
  assert.equal(nombreSitioVisible('Sucursal Mao', 'BANCO DE RESERVAS DE LA REPUBLICA DOMINICANA'), 'Sucursal Mao');
});
caso('busca por nombre de la antena, código UT, código LEV y ciudad, sin acentos', () => {
  const m = textoBusquedaSitios([
    { project_id: 'p1', name: 'Antena Coliseo Gallístico Santiago DO-03-SG-01013-14', external_code: 'LEV-2026-10-013', city: 'Santiago' },
    { project_id: 'p2', name: 'Antena San Carlos', external_code: 'LEV-2026-08-014', address: 'C/ Jacinto' },
  ]);
  assert.ok(m.p1.includes(normalizarBusqueda('gallístico')));
  assert.ok(m.p1.includes(normalizarBusqueda('GALLISTICO')));
  assert.ok(m.p1.includes('01013'));
  assert.ok(m.p1.includes('lev-2026-10-013'));
  assert.ok(m.p2.includes('jacinto'));
  assert.ok(!m.p2.includes('santiago'));
});
caso('un proyecto multi-sitio se encuentra por cualquiera de sus sitios', () => {
  const m = textoBusquedaSitios([
    { project_id: 'p1', name: 'Sucursal Mao' },
    { project_id: 'p1', name: 'Sucursal Baní' },
  ]);
  assert.ok(m.p1.includes('mao') && m.p1.includes('bani'));
});
caso('filas sin proyecto o vacías no rompen', () => {
  assert.deepEqual(textoBusquedaSitios([{ name: 'x' }, { project_id: 'p9' }, null]), {});
  assert.deepEqual(textoBusquedaSitios(), {});
});

caso('tampoco repite el nombre del levantamiento (11 de 124 en producción)', () => {
  assert.equal(nombreSitioVisible('Residencial Dorpel', 'Pablo Alcantara', 'Residencial  Dorpel'), '');
  assert.equal(nombreSitioVisible('Sucursal Mao', 'BANRESERVAS', 'Banreservas — Pintura'), 'Sucursal Mao');
  assert.equal(nombreSitioVisible('Sucursal Mao', 'BANRESERVAS', null, undefined), 'Sucursal Mao');
});
caso('la etapa usa la de Odoo y, si no hay, traduce el status (creado desde el programa = New)', () => {
  assert.equal(etapaDeLevantamiento({ odoo_stage: 'Agendado', status: 'planning' }), 'Agendado');
  assert.equal(etapaDeLevantamiento({ odoo_stage: null, status: 'planning' }), 'New');
  assert.equal(etapaDeLevantamiento({ status: 'survey_completed' }), 'Realizado');
  assert.equal(etapaDeLevantamiento({ status: 'quoted' }), 'Cotizacion Realizada');
  assert.equal(etapaDeLevantamiento({}), 'New');
  assert.equal(etapaDeLevantamiento(null), 'New');
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
