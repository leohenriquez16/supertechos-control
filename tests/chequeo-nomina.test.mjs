// tests/chequeo-nomina.test.mjs — v8.57.0 · Semáforo "Listo para nómina".
// Casos tomados del corte 17-30 sep 2026 (Villa Cacique sin jornadas, Cristian en cero,
// Lucson sin costo/día, Baños Las Parras con días y sin reportes).
// Ejecutar desde la raíz:  node tests/chequeo-nomina.test.mjs

import assert from 'node:assert/strict';
import { chequearNomina } from '../lib/helpers/chequeoNomina.js';

const corte = { fechaInicio: '2026-09-17', fechaFin: '2026-09-30' };
const base = () => ({
  proyectos: [
    { id: 'p1', referenciaOdoo: 'ST-C5108', cliente: 'Villa Cacique', modoPagoManoObra: 'm2_fijo', precioM2FijoMaestro: 280, maestroId: 'pablo', areas: [{ id: 'a1' }] },
    { id: 'p2', referenciaOdoo: 'ST-C5827', cliente: 'DGII', modoPagoManoObra: 'dia', maestroId: 'adonis', areas: [{ id: 'a2' }] },
  ],
  personal: [
    { id: 'pablo', nombre: 'Pablo Tejas', banco: 'Popular', bancoNumeroCuenta: '123' },
    { id: 'adonis', nombre: 'Adonis Heredia', banco: 'Popular', bancoNumeroCuenta: '456' },
    { id: 'lucson', nombre: 'Lucson Theodort' },
  ],
  reportes: [{ id: 'r1', proyectoId: 'p1', areaId: 'a1', tareaId: 't1', fecha: '2026-09-18', m2: 85 }],
});
const soloTipos = (res) => res.alertas.map(a => a.tipo);

let ok = 0; const fallos = [];
const caso = (nombre, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${nombre}: ${e.message}`); } };

caso('obra con reportes y sin jornadas → bloqueante', () => {
  const r = chequearNomina({ corte, data: base(), jornadas: [], detalle: [{ personaId: 'pablo', montoTotal: 23800 }] });
  const a = r.alertas.find(x => x.tipo === 'obra_sin_jornadas');
  assert.ok(a); assert.equal(a.severidad, 'bloqueante');
  assert.match(a.titulo, /Villa Cacique/); assert.equal(r.listo, false);
});

caso('obra con jornadas y sin reportes → aviso', () => {
  const data = base(); data.reportes = [];
  const r = chequearNomina({ corte, data,
    jornadas: [{ proyectoId: 'p2', fecha: '2026-09-18', personasPresentesIds: ['adonis'] }],
    detalle: [{ personaId: 'adonis', montoTotal: 1500 }],
    costosDia: { p2: { adonis: { costoDia: 1500 } } } });
  const a = r.alertas.find(x => x.tipo === 'obra_sin_reportes');
  assert.ok(a); assert.equal(a.severidad, 'aviso');
});

caso('persona sin costo por día en obra que paga por día', () => {
  const r = chequearNomina({ corte, data: base(),
    jornadas: [{ proyectoId: 'p2', fecha: '2026-09-18', personasPresentesIds: ['lucson'] }],
    detalle: [], costosDia: {} });
  const a = r.alertas.find(x => x.tipo === 'persona_sin_costo_dia');
  assert.ok(a); assert.match(a.titulo, /Lucson/);
});

caso('no avisa si el costo por día SÍ está puesto', () => {
  const r = chequearNomina({ corte, data: base(),
    jornadas: [{ proyectoId: 'p2', fecha: '2026-09-18', personasPresentesIds: ['adonis'] }],
    detalle: [{ personaId: 'adonis', montoTotal: 1500 }],
    costosDia: { p2: { adonis: { costoDia: 1500 } } } });
  assert.equal(soloTipos(r).includes('persona_sin_costo_dia'), false);
});

caso('obra por m² sin precios de tarea → bloqueante', () => {
  const data = base(); data.proyectos[0].modoPagoManoObra = 'm2'; data.proyectos[0].preciosTareasM2 = {};
  const r = chequearNomina({ corte, data, jornadas: [], detalle: [] });
  assert.ok(r.alertas.find(x => x.tipo === 'obra_sin_precios'));
});

caso('obra por m² fijo CON precio no alerta por precios', () => {
  const r = chequearNomina({ corte, data: base(), jornadas: [], detalle: [{ personaId: 'pablo', montoTotal: 100 }] });
  assert.equal(soloTipos(r).includes('obra_sin_precios'), false);
});

caso('reporte sin maestro en ninguna parte → bloqueante', () => {
  const data = base(); delete data.proyectos[0].maestroId;
  const r = chequearNomina({ corte, data, jornadas: [], detalle: [] });
  assert.ok(r.alertas.find(x => x.tipo === 'reporte_sin_maestro'));
});

caso('caso Cristian: trabajó y el corte le da RD$0', () => {
  const data = base();
  data.personal.push({ id: 'cristian', nombre: 'Cristian De Los Santos' });
  data.proyectos.push({ id: 'p3', referenciaOdoo: 'PG-C1269', cliente: 'Hermida', modoPagoManoObra: 'tarea', preciosManoObraTareas: { t9: 50 }, maestroId: 'adrian', areas: [] });
  const r = chequearNomina({ corte, data,
    jornadas: [{ proyectoId: 'p3', fecha: '2026-09-29', personasPresentesIds: ['cristian'] },
               { proyectoId: 'p3', fecha: '2026-09-30', personasPresentesIds: ['cristian'] }],
    detalle: [{ personaId: 'adrian', montoTotal: 23500 }] });
  const a = r.alertas.find(x => x.tipo === 'persona_en_cero' && x.personaId === 'cristian');
  assert.ok(a); assert.match(a.titulo, /2 días/); assert.equal(a.severidad, 'bloqueante');
});

caso('quien ya cobra no sale en cero', () => {
  const r = chequearNomina({ corte, data: base(),
    jornadas: [{ proyectoId: 'p2', fecha: '2026-09-18', personasPresentesIds: ['adonis'] }],
    detalle: [{ personaId: 'adonis', montoTotal: 9350 }],
    costosDia: { p2: { adonis: { costoDia: 1500 } } } });
  assert.equal(r.alertas.filter(x => x.tipo === 'persona_en_cero' && x.personaId === 'adonis').length, 0);
});

caso('cobra pero sin datos bancarios → aviso', () => {
  const data = base(); data.personal[0].banco = null;
  const r = chequearNomina({ corte, data, jornadas: [], detalle: [{ personaId: 'pablo', montoTotal: 23800 }] });
  const a = r.alertas.find(x => x.tipo === 'sin_datos_banco');
  assert.ok(a); assert.equal(a.severidad, 'aviso');
});

caso('reportes excluidos del pago no generan alertas', () => {
  const data = base(); data.reportes[0].excluirNomina = true;
  const r = chequearNomina({ corte, data, jornadas: [], detalle: [] });
  assert.equal(soloTipos(r).includes('obra_sin_jornadas'), false);
});

caso('corte limpio → listo', () => {
  const data = base(); data.reportes = [];
  data.proyectos = [data.proyectos[1]];
  const r = chequearNomina({ corte, data,
    jornadas: [{ proyectoId: 'p2', fecha: '2026-09-18', personasPresentesIds: ['adonis'] }],
    detalle: [{ personaId: 'adonis', montoTotal: 1500 }],
    costosDia: { p2: { adonis: { costoDia: 1500 } } } });
  assert.equal(r.listo, false); // la obra no tiene reportes → aviso
  assert.equal(r.bloqueantes, 0);
});

caso('bloqueantes primero en el orden', () => {
  const data = base(); data.personal[0].banco = null;
  const r = chequearNomina({ corte, data, jornadas: [], detalle: [{ personaId: 'pablo', montoTotal: 100 }] });
  assert.equal(r.alertas[0].severidad, 'bloqueante');
});


// --- v8.56.0: modo sin montos (correo diario de las 10:30 am) ---
const sinMontos = (extra = {}) => chequearNomina({ corte, data: base(), jornadas: [], detalle: [], conMontos: false, ...extra });
caso('sin montos: no inventa "trabajó y le dan RD$0"', () => {
  assert.equal(sinMontos().alertas.some(a => a.tipo === 'persona_en_cero'), false);
});
caso('sin montos: sigue viendo obras sin jornadas', () => {
  assert.ok(sinMontos().alertas.find(a => a.tipo === 'obra_sin_jornadas'));
});
caso('sin montos: avisa del banco de quien tuvo movimiento', () => {
  const data = base(); data.personal[0].banco = null;
  const r = chequearNomina({ corte, data, jornadas: [], detalle: [], conMontos: false });
  assert.ok(r.alertas.find(a => a.tipo === 'sin_datos_banco' && a.personaId === 'pablo'));
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
