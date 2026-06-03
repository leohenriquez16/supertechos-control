// Genera una CONSTANCIA (HTML imprimible + CSV) del incidente: el cron del módulo
// l10n_do_accounting_plus (CAPW) sobrescribió res.partner.name. Solo lectura de Odoo.
// Uso: node scripts/reporte-odoo-nombres.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8').split('\n').map(l => l.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY } = env;
async function rpc(s, m, a) { const r = await fetch(`${ODOO_URL}/jsonrpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: s, method: m, args: a } }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error.data?.message || j.error.message)); return j.result; }
const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]);
const call = (model, method, args = [], kw = {}) => rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kw]);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 1) Evidencia: cron + módulo
const cron = (await call('ir.cron', 'search_read', [[['name', 'like', 'Actualizar tipo de contacto']]], { fields: ['id', 'name', 'active', 'create_uid', 'create_date', 'write_uid', 'write_date', 'interval_number', 'interval_type', 'nextcall'] }))[0];
const xmlid = (await call('ir.model.data', 'search_read', [[['model', '=', 'ir.cron'], ['res_id', '=', cron.id]]], { fields: ['module', 'name'] }))[0];
const mod = (await call('ir.module.module', 'search_read', [[['name', '=', 'l10n_do_accounting_plus']]], { fields: ['shortdesc', 'name', 'state', 'author', 'installed_version', 'create_uid', 'create_date', 'write_uid', 'write_date'] }))[0];

// 2) Cambios de 'name' en res.partner hechos por OdooBot (historial de tracking)
console.log('Leyendo historial de cambios…');
const msgs = await call('mail.message', 'search_read', [[['model', '=', 'res.partner'], ['date', '>=', '2026-04-01']]], { fields: ['id', 'res_id', 'date', 'author_id'], limit: 9000, order: 'date asc' });
const msgsBot = msgs.filter(m => (m.author_id && /odoobot/i.test(m.author_id[1] || '')));
const msgById = Object.fromEntries(msgsBot.map(m => [m.id, m]));
const ids = msgsBot.map(m => m.id);
const fieldNameId = (await call('ir.model.fields', 'search', [[['model', '=', 'res.partner'], ['name', '=', 'name']]]))[0];
let nameTvs = [];
for (let i = 0; i < ids.length; i += 1000) {
  const chunk = ids.slice(i, i + 1000);
  const part = await call('mail.tracking.value', 'search_read', [[['mail_message_id', 'in', chunk], ['field_id', '=', fieldNameId]]], { fields: ['mail_message_id', 'old_value_char', 'new_value_char'] });
  nameTvs = nameTvs.concat(part);
}
// Por partner: el nombre ORIGINAL = old_value del cambio MÁS ANTIGUO; actual = new del MÁS reciente.
const porPartner = {};
for (const t of nameTvs) {
  const m = msgById[t.mail_message_id && t.mail_message_id[0]]; if (!m) continue;
  const pid = m.res_id; const d = m.date;
  const e = porPartner[pid] || (porPartner[pid] = { pid, original: null, actual: null, primera: null, ultima: null });
  if (!e.primera || d < e.primera) { e.primera = d; e.original = t.old_value_char; }
  if (!e.ultima || d > e.ultima) { e.ultima = d; e.actual = t.new_value_char; }
}
const afectados = Object.values(porPartner).filter(e => e.original && e.original !== e.actual);

// 3) Enriquecer con email + empresa actual
const pids = afectados.map(a => a.pid);
const partners = {};
for (let i = 0; i < pids.length; i += 300) {
  const chunk = pids.slice(i, i + 300);
  const rows = await call('res.partner', 'read', [chunk], { fields: ['name', 'email', 'function', 'parent_id'] });
  for (const r of rows) partners[r.id] = r;
}
afectados.sort((a, b) => ((partners[a.pid]?.parent_id?.[1] || '') + (a.original || '')).localeCompare((partners[b.pid]?.parent_id?.[1] || '') + (b.original || '')));

console.log('Contactos afectados (nombre real perdido):', afectados.length);

// 4) CSV
const csv = ['ID,Nombre original,Nombre actual,Email,Puesto,Empresa,Fecha del cambio']
  .concat(afectados.map(a => { const p = partners[a.pid] || {}; const q = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`; return [a.pid, q(a.original), q(a.actual), q(p.email), q(p.function), q(p.parent_id?.[1]), a.primera].join(','); }))
  .join('\n');
fs.writeFileSync(path.join(ROOT, 'reporte-odoo-nombres.csv'), csv);

// 5) HTML imprimible
const hoy = new Date().toISOString().slice(0, 10);
const filas = afectados.map(a => { const p = partners[a.pid] || {}; return `<tr><td>${a.pid}</td><td><b>${esc(a.original)}</b></td><td class="muted">${esc(a.actual)}</td><td>${esc(p.email)}</td><td>${esc(p.function)}</td><td>${esc(p.parent_id?.[1])}</td><td class="muted">${esc((a.primera || '').slice(0, 16))}</td></tr>`; }).join('');
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Constancia — Pérdida de nombres de contactos en Odoo</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;max-width:1000px;margin:24px auto;padding:0 16px;font-size:13px}
h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #c00;padding-bottom:3px}
.muted{color:#777} .box{background:#f6f6f6;border:1px solid #ddd;border-radius:6px;padding:10px 12px;margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:11px;margin-top:6px} th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eee} .kpi{font-size:22px;font-weight:800;color:#c00} small{color:#666}
@media print{body{margin:0}}
</style></head><body>
<h1>Constancia — Pérdida de nombres de contactos en Odoo</h1>
<div class="muted">Empresa: <b>${esc(mod.author === 'CAPW Servicios Tecnicos' ? 'LH Super Techos / Prouco' : '')}</b> · Odoo: ${esc(ODOO_URL)} · DB: ${esc(ODOO_DB)} · Generado: ${hoy}</div>

<h2>Resumen del incidente</h2>
<div class="box">
Se detectó que los <b>nombres (campo <code>name</code>) de contactos hijos de empresas</b> fueron sobrescritos automáticamente con el nombre de la empresa padre.
El cambio lo ejecutó el usuario de sistema <b>OdooBot</b> de forma <b>automática y recurrente (de madrugada)</b>, no un usuario editando manualmente.
</div>
<div class="box">
<span class="kpi">${afectados.length}</span> contactos con nombre real perdido (detectados en el historial; el alcance potencial son los ${''} contactos con empresa padre).
</div>

<h2>Causa raíz</h2>
<table>
<tr><th>Acción programada (cron)</th><td><b>${esc(cron.name)}</b> (id ${cron.id}) — estado: <b>${cron.active ? 'ACTIVA' : 'inactiva'}</b>, cada ${cron.interval_number} ${esc(cron.interval_type)}, próxima ejecución ${esc(cron.nextcall)}</td></tr>
<tr><th>Definida por el módulo</th><td><b>${esc(xmlid ? xmlid.module : '')}.${esc(xmlid ? xmlid.name : '')}</b></td></tr>
<tr><th>Módulo</th><td><b>${esc(mod.shortdesc)}</b> (<code>${esc(mod.name)}</code>) — versión ${esc(mod.installed_version)}, estado ${esc(mod.state)}</td></tr>
<tr><th>Autor del módulo</th><td><b>${esc(mod.author)}</b></td></tr>
<tr><th>Módulo: creado por</th><td>${esc(mod.create_uid?.[1])} el ${esc(mod.create_date)}</td></tr>
<tr><th>Módulo: última instalación/actualización</th><td><b>${esc(mod.write_uid?.[1])}</b> el <b>${esc(mod.write_date)}</b></td></tr>
<tr><th>Cron: creado por</th><td>${esc(cron.create_uid?.[1])} el ${esc(cron.create_date)}</td></tr>
</table>
<p><small>Interpretación: la versión del módulo que introdujo este cron se aplicó por <b>OdooBot</b> (actualización automática) el <b>${esc(mod.write_date)}</b>. A partir de esa fecha, el job sobreescribe cada noche el <code>name</code> de los contactos hijos. La lógica vive dentro del módulo (<code>cron_update_partner_type_by_tag()</code>).</small></p>

<h2>Contactos afectados (nombre original recuperado del historial)</h2>
<table>
<tr><th>ID</th><th>Nombre ORIGINAL</th><th>Nombre actual (incorrecto)</th><th>Email</th><th>Puesto</th><th>Empresa</th><th>Fecha cambio</th></tr>
${filas}
</table>
<p><small>Los nombres originales se extrajeron del historial de cambios de Odoo (mail.tracking.value). Documento generado en modo solo-lectura; no se modificó ningún dato en Odoo.</small></p>
</body></html>`;
fs.writeFileSync(path.join(ROOT, 'reporte-odoo-nombres.html'), html);
console.log('\nGenerados:');
console.log('  ' + path.join(ROOT, 'reporte-odoo-nombres.html'));
console.log('  ' + path.join(ROOT, 'reporte-odoo-nombres.csv'));
