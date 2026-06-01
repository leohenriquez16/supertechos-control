// Enriquece (solo LOCAL) el Personal con datos de hr.employee de Odoo, para los
// que calzan por cédula o nombre. Llena puesto/departamento/gerente siempre; y
// cédula/foto/fecha nac/teléfono/email solo si están vacíos (no pisa lo real).
// Uso: node scripts/enrich-personal-odoo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8').split('\n').map(l => l.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY } = env;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_KEY);

async function jsonrpc(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }) });
  const j = await res.json(); if (j.error) throw new Error(JSON.stringify(j.error.data?.message || j.error.message)); return j.result;
}
const uid = await jsonrpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]);
const call = (model, method, args = [], kwargs = {}) => jsonrpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs]);

const emps = await call('hr.employee', 'search_read', [[]], { fields: ['name', 'job_title', 'work_phone', 'mobile_phone', 'work_email', 'identification_id', 'department_id', 'parent_id', 'birthday', 'image_128'] });
console.log('Empleados Odoo leídos:', emps.length);

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const ced = s => (s || '').replace(/\D/g, '');
const m2name = v => Array.isArray(v) ? v[1] : '';
const byName = new Map(emps.map(e => [norm(e.name), e]));
const byCed = new Map(emps.filter(e => e.identification_id).map(e => [ced(e.identification_id), e]));

const { data: pers } = await sb.from('personal').select('*');
let enriquecidos = 0, conFoto = 0;
for (const p of pers) {
  const e = (p.cedula_numero && byCed.get(ced(p.cedula_numero))) || byName.get(norm(p.nombre));
  if (!e) continue;
  const u = { odoo_employee_id: e.id };
  if (e.job_title) u.puesto = e.job_title.trim();
  if (e.department_id) u.departamento = m2name(e.department_id);
  if (e.parent_id) u.gerente_nombre = m2name(e.parent_id);
  // solo si están vacíos en local:
  if (!p.cedula_numero && e.identification_id) u.cedula_numero = e.identification_id;
  if (!p.fecha_nacimiento && e.birthday) u.fecha_nacimiento = e.birthday;
  if (!p.telefono && (e.mobile_phone || e.work_phone)) u.telefono = e.mobile_phone || e.work_phone;
  if (!p.email && e.work_email) u.email = e.work_email;
  if (!p.foto_2x2 && e.image_128) { u.foto_2x2 = 'data:image/png;base64,' + e.image_128; conFoto++; }
  const { error } = await sb.from('personal').update(u).eq('id', p.id);
  if (error) { console.warn('  ', p.nombre, error.message); continue; }
  enriquecidos++;
  console.log(`  ✓ ${p.nombre} → puesto=${u.puesto || '—'} depto=${u.departamento || '—'} gerente=${u.gerente_nombre || '—'}`);
}
console.log(`\nEnriquecidos: ${enriquecidos}/${pers.length} (con foto nueva: ${conFoto})`);
