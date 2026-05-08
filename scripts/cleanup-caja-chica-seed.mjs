// Borra los datos de demo cargados con seed-caja-chica.mjs.
// Uso: node scripts/cleanup-caja-chica-seed.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8')
    .split('\n')
    .map(l => l.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].trim()])
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_KEY);

console.log('🧹 Limpiando datos de seed...\n');

// 1. Movimientos seed
const { count: movs, error: e1 } = await sb.from('caja_chica_movimientos')
  .delete({ count: 'exact' }).like('id', 'cc_seed_%');
if (e1) console.error('  movs:', e1); else console.log(`  ✓ ${movs} movimientos borrados`);

// 2. Proveedores seed
const { count: provs, error: e2 } = await sb.from('caja_chica_proveedores')
  .delete({ count: 'exact' }).like('id', 'cc_seed_%');
if (e2) console.error('  proveedores:', e2); else console.log(`  ✓ ${provs} proveedores borrados`);

// 3. Revertir flags que el seed agregó a Miguel y Osman (Adonis lo dejamos
//    como estaba — el usuario lo había habilitado manualmente)
const { error: e3 } = await sb.from('personal')
  .update({ caja_chica_habilitada: false, limite_caja_chica: null })
  .in('id', ['p_juan', 'p_carlos']);
if (e3) console.error('  personal:', e3); else console.log('  ✓ Toggle quitado de Miguel y Osman');

console.log('\n✅ Cleanup completo.');
