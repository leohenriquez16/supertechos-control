// tests/portal-programa.test.mjs — v8.59.0 · Portal del cliente (Towers and Sites).
// Ejecutar desde la raíz:  node tests/portal-programa.test.mjs

import assert from 'node:assert/strict';
import { hashClave, claveValida, generarClave, locacionParaCliente, armarPortal, aplicarAccionCliente, levantamientoParaCliente, validarDocumento, rutaDocumento } from '../lib/server/portalPrograma.js';

let ok = 0; const fallos = [];
const caso = (n, fn) => { try { fn(); ok++; } catch (e) { fallos.push(`${n}: ${e.message}`); } };

// --- clave
caso('la clave correcta entra, la incorrecta no', () => {
  const h = hashClave('ABCD-EFGH-JKMN');
  assert.equal(claveValida('ABCD-EFGH-JKMN', h), true);
  assert.equal(claveValida('ABCD-EFGH-JKMX', h), false);
  assert.equal(claveValida('', h), false);
  assert.equal(claveValida('ABCD-EFGH-JKMN', null), false);
});
caso('la clave generada se puede dictar: sin 0/O ni 1/I/L', () => {
  for (let i = 0; i < 50; i++) {
    const c = generarClave();
    assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.doesNotMatch(c, /[01OIL]/);
  }
});
caso('no se guarda la clave, se guarda su hash', () => {
  assert.notEqual(hashClave('ABCD-EFGH-JKMN'), 'ABCD-EFGH-JKMN');
  assert.equal(hashClave('ABCD-EFGH-JKMN').length, 64);
});

// --- lo que ve el cliente
const fila = {
  id: 'pl_50', nombre: 'CORAL GABLES II', codigo_ut: 'DO-01-DN-00086-08', direccion: 'Max Henríquez Ureña 1',
  lat: '18.47467', lng: '-69.93283', luz_verde: true, cotizacion_ref: 'ST-C5858', cotizacion_monto: '415122.40',
  cotizacion_aprobada: true, proyecto_id: 'p1', notas: 'Nota interna: el maestro pidió adelanto', updated_at: '2026-10-03',
};
caso('el cliente ve su locación con la etapa derivada de la obra', () => {
  const l = locacionParaCliente(fila, { estado: 'en_ejecucion', fecha_inicio: '2026-10-06' });
  assert.equal(l.etapa, 'en_ejecucion');
  assert.equal(l.cotizacionMonto, 415122.4);
  assert.equal(l.inicioObra, '2026-10-06');
});
caso('las notas internas NUNCA salen al portal', () => {
  const l = locacionParaCliente(fila, null);
  assert.equal('notas' in l, false);
  assert.equal(JSON.stringify(l).includes('adelanto'), false);
});
caso('el portal arma resumen y pendientes del cliente', () => {
  const filas = [fila, { id: 'pl_02', nombre: 'LAS COLINAS', luz_verde: false }, { id: 'pl_15', nombre: 'ISABELITA', luz_verde: true, levantado_at: '2026-09-07', cotizacion_ref: 'ST-C5818' }];
  const p = armarPortal({ nombre: 'Sites 2026', cliente_nombre: 'TOWERS', fecha_meta: '2026-12-31' }, filas, new Map([['p1', { estado: 'aprobado' }]]));
  assert.equal(p.resumen.total, 3);
  assert.deepEqual(p.pendientes.sinLuzVerde, ['pl_02']);
  assert.deepEqual(p.pendientes.cotizacionesPorAprobar, ['pl_15']);
  assert.equal(p.locaciones.length, 3);
  assert.equal(p.etapas.length, 8);
});

// --- acciones del cliente
caso('coordinar la visita deja fecha, hora y quién', () => {
  const r = aplicarAccionCliente('coordinar', { fecha: '2026-10-09', hora: '09:00' }, { luz_verde: false }, 'Leanny Peña');
  assert.equal(r.ok, true);
  assert.equal(r.cambios.luz_verde, true);
  assert.equal(r.cambios.fecha_visita, '2026-10-09');
  assert.equal(r.cambios.hora_visita, '09:00');
  assert.match(r.cambios.luz_verde_por, /Leanny Peña/);
});
caso('coordinar exige el día y valida la hora', () => {
  assert.equal(aplicarAccionCliente('coordinar', {}, {}).ok, false);
  assert.equal(aplicarAccionCliente('coordinar', { fecha: '9/10' }, {}).ok, false);
  assert.equal(aplicarAccionCliente('coordinar', { fecha: '2026-10-09', hora: '25:00' }, {}).ok, false);
});
caso('se puede cambiar la fecha coordinada, y el aviso lo dice', () => {
  const r = aplicarAccionCliente('coordinar', { fecha: '2026-10-12' }, { luz_verde: true, fecha_visita: '2026-10-09' }, 'Leanny');
  assert.equal(r.ok, true);
  assert.match(r.resumen, /cambió la visita/);
});
caso('no se coordina una locación ya levantada', () => {
  assert.equal(aplicarAccionCliente('coordinar', { fecha: '2026-10-12' }, { levantado_at: '2026-09-07' }).ok, false);
});
caso('el supervisor pide nombre y un contacto', () => {
  assert.equal(aplicarAccionCliente('supervisor', { nombre: '' }, {}).ok, false);
  assert.equal(aplicarAccionCliente('supervisor', { nombre: 'Juan' }, {}).ok, false);
  assert.equal(aplicarAccionCliente('supervisor', { nombre: 'Juan', email: 'no-es-correo' }, {}).ok, false);
  const r = aplicarAccionCliente('supervisor', { nombre: 'Juan Núñez', telefono: '809-555-1234' }, {});
  assert.equal(r.ok, true);
  assert.equal(r.cambios.supervisor_cliente_nombre, 'Juan Núñez');
});
caso('aprobar cotización exige que exista y que no esté aprobada', () => {
  assert.equal(aplicarAccionCliente('aprobar_cotizacion', {}, {}).ok, false);
  assert.equal(aplicarAccionCliente('aprobar_cotizacion', {}, { cotizacion_ref: 'ST-C5818', cotizacion_aprobada: true }).ok, false);
  const r = aplicarAccionCliente('aprobar_cotizacion', {}, { cotizacion_ref: 'ST-C5818' }, 'Leanny');
  assert.equal(r.cambios.cotizacion_aprobada, true);
  assert.match(r.cambios.notas, /Aprobó la cotización ST-C5818/);
});
caso('pedir cambios exige el motivo y lo guarda en la bitácora', () => {
  assert.equal(aplicarAccionCliente('rechazar_cotizacion', { motivo: '' }, { cotizacion_ref: 'ST-C5818' }).ok, false);
  const r = aplicarAccionCliente('rechazar_cotizacion', { motivo: 'Falta la movilización de tinacos' }, { cotizacion_ref: 'ST-C5818', notas: 'previa' });
  assert.match(r.cambios.notas, /^previa\n/);
  assert.match(r.cambios.notas, /tinacos/);
});
caso('una acción desconocida se rechaza', () => {
  assert.equal(aplicarAccionCliente('borrar_todo', {}, {}).ok, false);
});
caso('los textos se limpian y se recortan', () => {
  const r = aplicarAccionCliente('comentario', { texto: 'x'.repeat(5000) + '\u0007' }, {});
  assert.ok(r.cambios.notas.length < 1200);
});

// --- ficha del sitio
const visita = { checkin_at: '2026-09-07T14:07:52Z', is_completed: true, recommended_system: 'Silicona sobre lona', estimated_days: 3,
  cross_sell_notes: 'Ofrecerle pintura de fachada', execution_risks: 'Techo débil', general_notes: 'Interno' };
caso('la ficha trae áreas, total y fotos del levantamiento', () => {
  const l = levantamientoParaCliente(visita,
    [{ name: 'Techo principal', net_area_m2: 120.5 }, { name: 'Caseta', gross_area_m2: 18 }, { name: 'No tratar', net_area_m2: 50, to_be_treated: false }],
    [{ url: 'https://x/f1.jpg', photo_type: 'general' }, { url: 'https://x/f2.jpg', caption: 'Fisura en junta', is_critical: true }]);
  assert.equal(l.areas.length, 2);
  assert.equal(l.totalM2, 138.5);
  assert.equal(l.fotos[0].titulo, 'Vista general');
  assert.equal(l.fotos[1].critica, true);
  assert.equal(l.sistemaRecomendado, 'Silicona sobre lona');
});
caso('las notas internas del levantamiento NO salen', () => {
  const l = levantamientoParaCliente(visita, [], []);
  const txt = JSON.stringify(l);
  ['Ofrecerle pintura', 'Techo débil', 'Interno'].forEach(x => assert.equal(txt.includes(x), false, x));
});
caso('sin visita no hay ficha de levantamiento', () => {
  assert.equal(levantamientoParaCliente(null), null);
});

// --- desde cuándo y documentos
caso('la locación dice desde cuándo está en su etapa', () => {
  const l = locacionParaCliente({ id: 'x', nombre: 'X', luz_verde: true, levantado_at: '2026-09-07', cotizacion_ref: 'ST-C1', cotizado_at: '2026-09-08T10:00:00Z' }, null);
  assert.equal(l.etapa, 'cotizado');
  assert.equal(l.etapaDesde, '2026-09-08T10:00:00Z');
  assert.ok(l.diasEnEtapa >= 0);
});
caso('la fecha de ejecución sale del historial de la obra', () => {
  const l = locacionParaCliente({ id: 'x', nombre: 'X' }, { estado: 'en_ejecucion' }, [{ estado_nuevo: 'en_ejecucion', created_at: '2026-10-06T13:00:00Z' }]);
  assert.equal(l.etapaDesde, '2026-10-06T13:00:00Z');
});
caso('el portal solo acepta documentos razonables', () => {
  assert.equal(validarDocumento({ tipo: 'oc', nombre: 'OC.pdf', mime: 'application/pdf', tamano: 200000 }), null);
  assert.ok(validarDocumento({ tipo: 'oc', nombre: 'x.exe', mime: 'application/x-msdownload', tamano: 10 }));
  assert.ok(validarDocumento({ tipo: 'oc', nombre: 'grande.pdf', mime: 'application/pdf', tamano: 20 * 1024 * 1024 }));
  assert.ok(validarDocumento({ tipo: 'virus', nombre: 'a.pdf', mime: 'application/pdf', tamano: 10 }));
});
caso('la ruta del archivo no deja colar carpetas ni acentos raros', () => {
  const r = rutaDocumento('pl_15', 'oc', 'pd_1', '../../OC Señal Ñ#4.pdf');
  assert.match(r, /^programas\/pl_15\/oc\/pd_1_/);
  assert.equal(r.includes('..'), false);
  assert.equal(r.includes('/', 'programas/pl_15/oc/'.length), false);
});

console.log(`\n${ok} pasadas, ${fallos.length} fallidas`);
if (fallos.length) { fallos.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
