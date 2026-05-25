// v8.17.89: Migración idempotente — hashea PINs plaintext que queden en
// la columna `personal.pin`. Se ejecuta UNA vez tras desplegar este PR.
//
// Uso:
//   node scripts/hash-existing-pins.mjs            # contra prod (usa .env.local)
//   node scripts/hash-existing-pins.mjs --dry-run  # solo reporta, no escribe
//   node scripts/hash-existing-pins.mjs --local    # contra DB local (supabase start)
//
// Variables requeridas (en .env.local o exportadas):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Es seguro correrlo dos veces. Detecta PINs ya hasheados (formato bcrypt)
// y los salta. Solo toca rows cuyo `pin` parece plaintext.

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BCRYPT_COST = 10;
const REGEX_BCRYPT = /^\$2[aby]\$\d{2}\$/;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const local = args.has('--local');

function loadEnvLocal() {
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // sin .env.local, asume vars exportadas al shell
  }
}

loadEnvLocal();

const SUPABASE_URL = local
  ? (process.env.SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321')
  : process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = local
  ? (process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  : process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Define en .env.local o expórtalas. Para DB local pasa --local.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

console.log(`[hash-pins] modo: ${local ? 'LOCAL' : 'REMOTO'}, dry-run: ${dryRun}`);
console.log(`[hash-pins] URL: ${SUPABASE_URL}`);

const { data: rows, error } = await sb
  .from('personal')
  .select('id, nombre, pin')
  .not('pin', 'is', null);

if (error) {
  console.error('Error leyendo personal:', error.message);
  process.exit(1);
}

let yaHashed = 0;
let aHashear = 0;
let hasheados = 0;
let errores = 0;
const detalles = [];

for (const row of rows || []) {
  const pin = String(row.pin || '');
  if (!pin) continue;
  if (REGEX_BCRYPT.test(pin)) {
    yaHashed++;
    continue;
  }
  aHashear++;
  detalles.push({ id: row.id, nombre: row.nombre, longitud: pin.length });

  if (dryRun) continue;

  try {
    const hash = await bcrypt.hash(pin, BCRYPT_COST);
    const { error: upErr } = await sb.from('personal').update({ pin: hash }).eq('id', row.id);
    if (upErr) {
      errores++;
      console.error(`  ✗ ${row.id} (${row.nombre}): ${upErr.message}`);
    } else {
      hasheados++;
      console.log(`  ✓ ${row.id} (${row.nombre})`);
    }
  } catch (e) {
    errores++;
    console.error(`  ✗ ${row.id} (${row.nombre}): ${e.message}`);
  }
}

console.log('');
console.log('Resumen:');
console.log(`  Personas con PIN total:    ${rows?.length || 0}`);
console.log(`  Ya estaban hasheados:      ${yaHashed}`);
console.log(`  Plaintext detectados:      ${aHashear}`);
if (dryRun) {
  console.log(`  Hasheados (dry-run):       0  (no se escribió nada)`);
  if (detalles.length) {
    console.log('  Detalle pendientes:');
    for (const d of detalles) {
      console.log(`    - ${d.id} ${d.nombre} (PIN de ${d.longitud} dígitos)`);
    }
  }
} else {
  console.log(`  Hasheados ahora:           ${hasheados}`);
  console.log(`  Errores:                   ${errores}`);
}

process.exit(errores > 0 ? 1 : 0);
