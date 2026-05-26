// v8.17.90: Backfill — crea un user en auth.users por cada row de
// `personal` que no tenga auth_user_id, y vincula la columna bridge.
//
// Es PR 2A de Fase 2: deja todo listo para que PR 2B (login emite sesión
// Supabase) tenga contra qué autenticar.
//
// Uso:
//   node scripts/backfill-auth-users.mjs              # contra prod (usa .env.local)
//   node scripts/backfill-auth-users.mjs --dry-run    # solo reporta
//   node scripts/backfill-auth-users.mjs --local      # contra DB local
//
// Vars requeridas (en .env.local o exportadas):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Idempotente: cada run solo procesa las personas SIN auth_user_id. Correrlo
// 2 veces no rompe nada.
//
// Decisiones:
//   - Email sintético si la persona no tiene uno real (`{personal.id}@local.supertechos.do`).
//     auth.users requiere email único, así que usamos el ID textual como ancla.
//   - Password en auth.users: random de 24 chars. NUNCA se usa para login
//     (PR 2B emitirá sesión via Admin API tras validar PIN, sin signInWithPassword).
//   - user_metadata: { persona_id, roles, nombre } — útil para introspección
//     desde el dashboard de Supabase y para policies que lo necesiten.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

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
  } catch {}
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

console.log(`[backfill-auth] modo: ${local ? 'LOCAL' : 'REMOTO'}, dry-run: ${dryRun}`);
console.log(`[backfill-auth] URL: ${SUPABASE_URL}`);
console.log('');

// Verificación previa: la columna existe
const { error: schemaErr } = await sb.from('personal').select('id, auth_user_id').limit(1);
if (schemaErr) {
  console.error('No se pudo leer personal.auth_user_id. ¿Aplicaste 023_auth_users_bridge.sql?');
  console.error('Error:', schemaErr.message);
  process.exit(1);
}

const { data: rows, error } = await sb
  .from('personal')
  .select('id, nombre, telefono, email, roles, auth_user_id, archivado')
  .is('auth_user_id', null);

if (error) {
  console.error('Error leyendo personal:', error.message);
  process.exit(1);
}

const pendientes = (rows || []).filter(r => !r.archivado);
const archivadosOmitidos = (rows || []).length - pendientes.length;

console.log(`Personas sin auth_user_id:        ${rows?.length || 0}`);
console.log(`  - Activas (a procesar):         ${pendientes.length}`);
console.log(`  - Archivadas (se omiten):       ${archivadosOmitidos}`);
console.log('');

if (pendientes.length === 0) {
  console.log('Nada que hacer. Todas las personas activas ya tienen auth_user_id. ✓');
  process.exit(0);
}

let creados = 0;
let yaExistia = 0;
let errores = 0;

function emailSinteticoDe(p) {
  if (p.email && p.email.includes('@')) return p.email.toLowerCase().trim();
  // ID textual estable como local-part. Dominio sintético reservado.
  return `${String(p.id).toLowerCase().replace(/[^a-z0-9_-]/g, '_')}@local.supertechos.do`;
}

function passwordAleatorio() {
  return randomBytes(18).toString('base64url');
}

for (const p of pendientes) {
  const email = emailSinteticoDe(p);
  const tieneEmailReal = p.email && p.email.includes('@');

  if (dryRun) {
    console.log(`  [dry] ${p.id} (${p.nombre}) → email ${email}${tieneEmailReal ? '' : ' (sintético)'}`);
    continue;
  }

  try {
    // 1. Crear user en auth.users
    const { data: createRes, error: createErr } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      password: passwordAleatorio(),
      user_metadata: {
        persona_id: p.id,
        nombre: p.nombre,
        roles: p.roles || [],
        telefono: p.telefono || null,
        email_sintetico: !tieneEmailReal,
        creado_por: 'backfill-auth-users',
      },
    });

    let authUserId = createRes?.user?.id;

    if (createErr) {
      // Caso: el email ya existe en auth.users (puede ser de un run previo
      // interrumpido). Buscamos el user existente por email.
      if (/already registered|already exists|duplicate/i.test(createErr.message)) {
        const { data: lista, error: listErr } = await sb.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (listErr) {
          errores++;
          console.error(`  ✗ ${p.id} (${p.nombre}): listUsers falló: ${listErr.message}`);
          continue;
        }
        const existente = (lista?.users || []).find(u => u.email === email);
        if (existente) {
          authUserId = existente.id;
          yaExistia++;
          console.log(`  ↺ ${p.id} (${p.nombre}): auth.users ya existía con email ${email}`);
        } else {
          errores++;
          console.error(`  ✗ ${p.id} (${p.nombre}): createUser dijo "ya existe" pero no se encontró`);
          continue;
        }
      } else {
        errores++;
        console.error(`  ✗ ${p.id} (${p.nombre}): createUser falló: ${createErr.message}`);
        continue;
      }
    }

    if (!authUserId) {
      errores++;
      console.error(`  ✗ ${p.id} (${p.nombre}): no se obtuvo auth_user_id`);
      continue;
    }

    // 2. Vincular en personal.auth_user_id
    const { error: linkErr } = await sb
      .from('personal')
      .update({ auth_user_id: authUserId })
      .eq('id', p.id);

    if (linkErr) {
      errores++;
      console.error(`  ✗ ${p.id} (${p.nombre}): UPDATE personal falló: ${linkErr.message}`);
      continue;
    }

    creados++;
    console.log(`  ✓ ${p.id} (${p.nombre}) → ${authUserId.slice(0, 8)}…`);
  } catch (e) {
    errores++;
    console.error(`  ✗ ${p.id} (${p.nombre}): ${e.message}`);
  }
}

console.log('');
console.log('Resumen:');
console.log(`  Procesadas:              ${pendientes.length}`);
if (dryRun) {
  console.log(`  Creadas (dry-run):       0  (no se escribió nada)`);
} else {
  console.log(`  Creadas en auth.users:   ${creados}`);
  console.log(`  Ya existían (vinculadas): ${yaExistia}`);
  console.log(`  Errores:                 ${errores}`);
}

process.exit(errores > 0 ? 1 : 0);
