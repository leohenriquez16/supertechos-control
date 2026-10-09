// tests/requisitos-ejecucion.test.mjs — v8.56.0 · Requisitos para arrancar una obra.
// Ejecutar desde la raíz:  node tests/requisitos-ejecucion.test.mjs

import assert from 'node:assert/strict';
import { faltantesParaEjecucion } from '../lib/helpers/requisitosEjecucion.js';

const completa = () => ({
  maestroId: 'm1', supervisorId: 's1', fechaInicio: '2026-10-05',
  ubicacionLat: 18.4, ubicacionLng: -69.9, sistemaId: 'sis1',
  areas: [{ id: 'a1', m2: 300 }], valorCotizacion: 500000,
  modoPagoManoObra: 'm2_fijo', precioM2FijoMaestro: 280,
});
const ctx = { tieneContacto: true };
let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

caso('obra completa → no falta nada', () => {
  assert.deepEqual(faltantesParaEjecucion(completa(), ctx), []);
});
caso('sin maestro ni supervisor', () => {
  const p = completa(); delete p.maestroId; delete p.supervisorId;
  const f = faltantesParaEjecucion(p, ctx);
  assert.ok(f.includes('maestro asignado')); assert.ok(f.includes('supervisor asignado'));
});
caso('la fecha estimada sirve como fecha de inicio', () => {
  const p = completa(); delete p.fechaInicio; p.fechaEstimadaInicio = '2026-10-07';
  assert.equal(faltantesParaEjecucion(p, ctx).includes('fecha de inicio'), false);
});
caso('sin ubicación ni contacto', () => {
  const p = completa(); p.ubicacionLat = null; p.ubicacionLng = null;
  const f = faltantesParaEjecucion(p, { tieneContacto: false });
  assert.ok(f.includes('ubicación en el mapa')); assert.ok(f.includes('contacto del cliente'));
});
caso('área sin m²', () => {
  const p = completa(); p.areas = [{ id: 'a1', m2: 300 }, { id: 'a2' }];
  assert.ok(faltantesParaEjecucion(p, ctx).includes('m² en todas las áreas'));
});
caso('m² fijo sin precio', () => {
  const p = completa(); p.precioM2FijoMaestro = 0;
  assert.ok(faltantesParaEjecucion(p, ctx).includes('precio por m² del maestro'));
});
caso('modo m² sin precios por tarea', () => {
  const p = completa(); p.modoPagoManoObra = 'm2'; p.preciosTareasM2 = {};
  assert.ok(faltantesParaEjecucion(p, ctx).includes('precios por tarea (m²)'));
});
caso('modo tarea sin precios de mano de obra', () => {
  const p = completa(); p.modoPagoManoObra = 'tarea'; p.preciosManoObraTareas = {};
  assert.ok(faltantesParaEjecucion(p, ctx).includes('precios de mano de obra por tarea'));
});
caso('modo día sin costo por día configurado', () => {
  const p = completa(); p.modoPagoManoObra = 'dia';
  assert.ok(faltantesParaEjecucion(p, ctx).includes('costo por día del maestro'));
});
caso('modo día CON costo por día pasa', () => {
  const p = completa(); p.modoPagoManoObra = 'dia'; p.costoDiaConfigurado = 2500;
  assert.deepEqual(faltantesParaEjecucion(p, ctx), []);
});
caso('sin valor de cotización', () => {
  const p = completa(); p.valorCotizacion = 0;
  assert.ok(faltantesParaEjecucion(p, ctx).includes('valor de la cotización'));
});
caso('obra vacía: lista larga', () => {
  assert.ok(faltantesParaEjecucion({}, { tieneContacto: false }).length >= 8);
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }

// v8.61.2 — regla de valor compartida
import { faltantesDeValor } from '../lib/helpers/requisitosEjecucion.js';
{
  let ok2 = 0, ko2 = 0; const tt = (n, c) => { if (c) ok2++; else { ko2++; console.error('FALLA:', n); } };
  const sis = { s1: { tareas: [{ id: 't' }], precio_m2: 500 }, s2: { tareas: [{ id: 't' }] } };
  tt('completa', faltantesDeValor({ sistemaId: 's1', areas: [{ m2: 10 }], valorCotizacion: 1 }, sis).length === 0);
  tt('área sin precio (sistema sin precio)', faltantesDeValor({ sistemaId: 's2', areas: [{ m2: 10 }], valorCotizacion: 1 }, sis).includes('precio de venta en las áreas'));
  tt('precio del área salva', faltantesDeValor({ sistemaId: 's2', areas: [{ m2: 10, precioVentaM2: 300 }], valorCotizacion: 1 }, sis).length === 0);
  tt('sin valor', faltantesDeValor({ sistemaId: 's1', areas: [{ m2: 10 }] }, sis).includes('valor de la cotización'));
  tt('sin sistemas no revisa precios', faltantesDeValor({ sistemaId: 's2', areas: [{ m2: 10 }], valorCotizacion: 1 }).length === 0);
  tt('precio 0 a propósito = incluido', faltantesDeValor({ sistemaId: 's2', areas: [{ m2: 10, precioVentaM2: 0 }], valorCotizacion: 1 }, sis).length === 0);
  console.log(`valor: ${ok2} pasadas, ${ko2} fallidas`); if (ko2) process.exit(1);
}
