// Seed de datos de demo para Caja Chica.
// Uso: node scripts/seed-caja-chica.mjs
//
// Lee .env.local para las credenciales. Requiere que las migraciones 002, 003 y 004
// ya estén aplicadas en Supabase, y que RLS esté DESHABILITADO en
// caja_chica_movimientos y caja_chica_proveedores (anon key necesita escribir).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Cargar .env.local manualmente (sin dotenv para no agregar deps)
const envPath = path.join(ROOT, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('No existe .env.local en', envPath);
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf-8')
    .split('\n')
    .map(l => l.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_KEY;
if (!url || !key) { console.error('Faltan vars de Supabase'); process.exit(1); }
const sb = createClient(url, key);

// Helpers de fechas relativas a hoy
const hoy = () => new Date();
const fecha = (dias) => {
  const d = hoy(); d.setDate(d.getDate() - dias);
  return d.toISOString().split('T')[0];
};
const ts = (dias) => {
  const d = hoy(); d.setDate(d.getDate() - dias);
  return d.toISOString();
};

const log = (...args) => console.log(...args);
const die = (msg, e) => { console.error(msg, e?.message || e); process.exit(1); };

async function main() {
  log('🌱 Seed de Caja Chica\n');

  // ── 1. Habilitar caja chica + límites en 3 personas ──
  log('1/5 Habilitando caja chica en personal...');
  for (const [id, limite] of [['p_juan', 8000], ['p_carlos', 6000]]) {
    const { error } = await sb.from('personal')
      .update({ caja_chica_habilitada: true, limite_caja_chica: limite })
      .eq('id', id);
    if (error) die(`Error habilitando ${id}:`, error);
    log(`   ✓ ${id} con límite RD$${limite}`);
  }
  // Adonis ya está habilitado, solo confirmamos límite
  await sb.from('personal').update({ caja_chica_habilitada: true, limite_caja_chica: 10000 })
    .eq('id', 'p_1778000498578');
  log('   ✓ p_1778000498578 (Adonis) con límite RD$10000');

  // ── 2. Proveedores conocidos ──
  log('\n2/5 Cargando proveedores...');
  const proveedores = [
    { id: 'cc_seed_pv1', rnc: '130774331', nombre: 'Ferretería La Económica',  categoria: 'ferreteria',   total_facturas: 5, total_monto: 12500, primera_factura_at: ts(60), ultima_factura_at: ts(4),  notas: 'Cobra cash, rapidísimos en despacho' },
    { id: 'cc_seed_pv2', rnc: '131123456', nombre: 'Bomba Esso Naco',          categoria: 'combustible',  total_facturas: 4, total_monto: 8400,  primera_factura_at: ts(45), ultima_factura_at: ts(2),  notas: null },
    { id: 'cc_seed_pv3', rnc: '130998872', nombre: 'Ferretería Americana',     categoria: 'ferreteria',   total_facturas: 2, total_monto: 4200,  primera_factura_at: ts(20), ultima_factura_at: ts(5),  notas: null },
    { id: 'cc_seed_pv4', rnc: '132556677', nombre: 'Casa Cuesta',              categoria: 'herramientas', total_facturas: 2, total_monto: 6800,  primera_factura_at: ts(15), ultima_factura_at: ts(3),  notas: 'Garantía 30 días en herramientas eléctricas' },
    { id: 'cc_seed_pv5', rnc: '133445566', nombre: 'Cafetería Doña Coco',      categoria: 'comida',       total_facturas: 7, total_monto: 3500,  primera_factura_at: ts(50), ultima_factura_at: ts(1),  notas: 'Cerca del proyecto Naco' },
  ];
  const { error: errPv } = await sb.from('caja_chica_proveedores').upsert(proveedores, { onConflict: 'rnc' });
  if (errPv) die('Error en proveedores:', errPv);
  log(`   ✓ ${proveedores.length} proveedores`);

  // ── 3. Entregas ──
  log('\n3/5 Cargando entregas...');
  const entregas = [
    { id: 'cc_seed_e1', persona_id: 'p_juan',          fecha: fecha(7), tipo: 'entrega', monto: 5000,  status: 'aprobado', concepto: 'Entrega semanal',       aprobado_at: ts(7) },
    { id: 'cc_seed_e2', persona_id: 'p_juan',          fecha: fecha(1), tipo: 'entrega', monto: 3000,  status: 'aprobado', concepto: 'Reposición ferretería', aprobado_at: ts(1) },
    { id: 'cc_seed_e3', persona_id: 'p_carlos',        fecha: fecha(5), tipo: 'entrega', monto: 5000,  status: 'aprobado', concepto: 'Entrega semanal',       aprobado_at: ts(5) },
    { id: 'cc_seed_e4', persona_id: 'p_1778000498578', fecha: fecha(7), tipo: 'entrega', monto: 10000, status: 'aprobado', concepto: 'Entrega quincenal',     aprobado_at: ts(7) },
    { id: 'cc_seed_e5', persona_id: 'p_1778000498578', fecha: fecha(2), tipo: 'entrega', monto: 5000,  status: 'aprobado', concepto: 'Reposición',            aprobado_at: ts(2) },
  ];
  const { error: errEnt } = await sb.from('caja_chica_movimientos').upsert(entregas, { onConflict: 'id' });
  if (errEnt) die('Error en entregas:', errEnt);
  log(`   ✓ ${entregas.length} entregas`);

  // ── 4. Gastos con factura (mix de aprobados, pendientes, rechazados, foto-WS) ──
  log('\n4/5 Cargando gastos...');
  const gastos = [
    // Miguel (p_juan)
    { id: 'cc_seed_g1', persona_id: 'p_juan',          fecha: fecha(4), tipo: 'gasto_factura', monto: 1500, status: 'aprobado',           proveedor: 'Ferretería La Económica', rnc: '130-77433-1', concepto: 'Tornillos y abrazaderas',     datos_ia: { confianza: 'alta', categoria_sugerida: 'ferreteria' },   aprobado_at: ts(3) },
    { id: 'cc_seed_g2', persona_id: 'p_juan',          fecha: fecha(3), tipo: 'gasto_factura', monto:  800, status: 'aprobado',           proveedor: 'Bomba Esso Naco',         rnc: '131-12345-6', concepto: 'Combustible camioneta',       datos_ia: { confianza: 'alta', categoria_sugerida: 'combustible' },  aprobado_at: ts(2) },
    { id: 'cc_seed_g3', persona_id: 'p_juan',          fecha: fecha(1), tipo: 'gasto_factura', monto: 2200, status: 'pendiente_revision', proveedor: 'Ferretería La Económica', rnc: '130-77433-1', concepto: 'Cinta de plomería + cubetas', datos_ia: { confianza: 'media', categoria_sugerida: 'ferreteria' },  aprobado_at: null },
    { id: 'cc_seed_g4', persona_id: 'p_juan',          fecha: fecha(0), tipo: 'gasto_factura', monto:  300, status: 'pendiente_revision', proveedor: null,                       rnc: null,          concepto: 'Almuerzo del equipo',         datos_ia: { foto_por_ws: true, categoria_sugerida: 'comida' },        aprobado_at: null },
    { id: 'cc_seed_g5', persona_id: 'p_juan',          fecha: fecha(5), tipo: 'gasto_factura', monto:  450, status: 'rechazado',          proveedor: 'Cafetería Doña Coco',      rnc: '133-44556-6', concepto: 'Comida',                       datos_ia: { confianza: 'baja' },                                       aprobado_at: null, motivo_rechazo: 'Foto borrosa, no se ve el monto bien' },

    // Osman (p_carlos)
    { id: 'cc_seed_g6', persona_id: 'p_carlos',        fecha: fecha(3), tipo: 'gasto_factura', monto: 2000, status: 'aprobado',           proveedor: 'Ferretería Americana',     rnc: '130-99887-2', concepto: 'Pintura + brochas',           datos_ia: { confianza: 'alta', categoria_sugerida: 'ferreteria' },   aprobado_at: ts(2) },
    { id: 'cc_seed_g7', persona_id: 'p_carlos',        fecha: fecha(2), tipo: 'gasto_factura', monto: 1200, status: 'aprobado',           proveedor: null,                       rnc: null,          concepto: 'Combustible',                  datos_ia: { confianza: 'baja', categoria_sugerida: 'combustible' },   aprobado_at: ts(1) },
    { id: 'cc_seed_g8', persona_id: 'p_carlos',        fecha: fecha(0), tipo: 'gasto_factura', monto:  650, status: 'pendiente_revision', proveedor: 'Casa Cuesta',              rnc: '132-55667-7', concepto: 'Disco de corte 7"',           datos_ia: { foto_por_ws: true, categoria_sugerida: 'herramientas' },  aprobado_at: null },

    // Adonis (p_1778000498578)
    { id: 'cc_seed_g9',  persona_id: 'p_1778000498578', fecha: fecha(4), tipo: 'gasto_factura', monto: 3500, status: 'aprobado',           proveedor: 'Ferretería La Económica', rnc: '130-77433-1', concepto: 'Material membrana',            datos_ia: { confianza: 'alta', categoria_sugerida: 'ferreteria' },   aprobado_at: ts(3) },
    { id: 'cc_seed_g10', persona_id: 'p_1778000498578', fecha: fecha(2), tipo: 'gasto_factura', monto: 1800, status: 'aprobado',           proveedor: 'Bomba Esso Naco',         rnc: '131-12345-6', concepto: 'Combustible viaje a Bávaro',  datos_ia: { confianza: 'alta', categoria_sugerida: 'combustible' },  aprobado_at: ts(2) },
    { id: 'cc_seed_g11', persona_id: 'p_1778000498578', fecha: fecha(1), tipo: 'gasto_factura', monto: 2500, status: 'pendiente_revision', proveedor: 'Casa Cuesta',              rnc: '132-55667-7', concepto: 'Taladro Bosch',                datos_ia: { confianza: 'alta', categoria_sugerida: 'herramientas' }, aprobado_at: null },
    { id: 'cc_seed_g12', persona_id: 'p_1778000498578', fecha: fecha(0), tipo: 'gasto_factura', monto:  450, status: 'pendiente_revision', proveedor: null,                       rnc: null,          concepto: 'Comida del equipo en obra',    datos_ia: { foto_por_ws: true, categoria_sugerida: 'comida' },        aprobado_at: null },
  ];
  const { error: errG } = await sb.from('caja_chica_movimientos').upsert(gastos, { onConflict: 'id' });
  if (errG) die('Error en gastos:', errG);
  log(`   ✓ ${gastos.length} gastos (mix aprobados/pendientes/rechazados/WS)`);

  // ── 5. Dietas ──
  log('\n5/5 Cargando dietas...');
  const dietas = [
    { id: 'cc_seed_d1', persona_id: 'p_juan',          fecha: fecha(2), tipo: 'dieta', monto: 1500, status: 'aprobado', concepto: 'Dieta diaria (manual)',     aprobado_at: ts(2) },
    { id: 'cc_seed_d2', persona_id: 'p_1778000498578', fecha: fecha(3), tipo: 'dieta', monto: 2000, status: 'aprobado', concepto: 'Dieta diaria automática',  aprobado_at: ts(3) },
    { id: 'cc_seed_d3', persona_id: 'p_1778000498578', fecha: fecha(1), tipo: 'dieta', monto: 2000, status: 'aprobado', concepto: 'Dieta diaria automática',  aprobado_at: ts(1) },
  ];
  const { error: errD } = await sb.from('caja_chica_movimientos').upsert(dietas, { onConflict: 'id' });
  if (errD) die('Error en dietas:', errD);
  log(`   ✓ ${dietas.length} dietas`);

  // Resumen
  log('\n📊 Resumen esperado:');
  log('   Miguel:  +8000 entregado − 2300 aprobado − 1500 dieta = 4200 saldo (pendientes 2500, rechazado 1)');
  log('   Osman:   +5000 entregado − 3200 aprobado = 1800 saldo (pendientes 650 incl. WS)');
  log('   Adonis:  +15000 entregado − 5300 aprobado − 4000 dietas = 5700 saldo (pendientes 2950 incl. WS)');
  log('\n✅ Seed completo. Hard refresh en localhost:3000 → Caja Chica.');
}

main().catch(e => die('Falló:', e));
