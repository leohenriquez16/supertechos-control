// Importa datos reales de Odoo a la base LOCAL para ver el flujo completo
// Cliente → Ubicación → Cotización → Garantía → Mantenimientos.
//
// Pass 1 (demo, completo): ~7 empresas con varios contactos, varias direcciones
//   de entrega (→ubicaciones) y cotizaciones aprobadas (→garantías + mantenimientos).
// Pass 2 (operativo): resuelve cada proyecto local por su referencia_odoo (ST-Cxxxx)
//   → SO de Odoo → empresa, materializa ese cliente (deduplicado), importa sus
//   direcciones de entrega, y enlaza proyectos.cliente_id (+ ubicacion_id si el
//   envío de la SO coincide con una dirección).
//
// Idempotente: borra al inicio todo lo marcado con prefijos c-odoo-/c-proj-/etc.
// Uso: node scripts/import-odoo-demo.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf-8').split('\n')
    .map(l => l.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()])
);
const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY } = env;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_KEY);

// ---------- Odoo JSON-RPC ----------
async function jsonrpc(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error.data?.message || j.error.message));
  return j.result;
}
const uid = await jsonrpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}]);
const call = (model, method, args = [], kwargs = {}) =>
  jsonrpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs]);
console.log('Odoo UID:', uid);

// ---------- helpers ----------
const PARTNER_FIELDS = ['name', 'vat', 'email', 'phone', 'mobile', 'street', 'street2', 'city', 'state_id', 'function', 'type', 'child_ids', 'commercial_partner_id'];
const m2id = (v) => Array.isArray(v) ? v[0] : (v || null);
const m2name = (v) => Array.isArray(v) ? v[1] : '';
const clean = (s) => (s && String(s).trim()) || null;
const sumarMeses = (iso, meses) => { const d = new Date(iso); d.setMonth(d.getMonth() + Number(meses)); return d.toISOString().split('T')[0]; };
const hoyISO = new Date().toISOString().split('T')[0];
const cliId = (pid) => `c-odoo-${pid}`;

const DEMO_PARTNER_IDS = [46, 4072, 24, 1449, 4393, 1037, 558]; // interamerica, alma iglesias, codetel, rizek, seconva, malespin, corripio
const CAP_DELIVERY = 6, CAP_CONTACT = 8, CAP_SO = 5;

// ---------- 0. limpiar import previo ----------
console.log('\n[0] Limpiando import previo…');
await sb.from('garantias').delete().like('id', 'gar-odoo-%');
await sb.from('clientes').delete().like('id', 'c-odoo-%');   // cascada: contactos + ubicaciones
await sb.from('clientes').delete().like('id', 'c-proj-%');
// (mantenimientos caen por cascada de garantias; proyectos.cliente_id/ubicacion_id → SET NULL)

// cache de partners ya materializados como cliente en esta corrida
const clienteDePartner = new Map();   // commercial_partner_id -> cliente_id local
const ubicByOdooAddr = new Map();     // odoo address id -> ubicacion_id local

// Materializa un partner-empresa como cliente local (+contactos +ubicaciones).
async function materializarCliente(partner, { fullContacts, fullDeliveries }) {
  const pid = partner.id;
  if (clienteDePartner.has(pid)) return clienteDePartner.get(pid);
  const id = cliId(pid);
  await sb.from('clientes').insert({
    id, nombre: partner.name, rnc: clean(partner.vat), tipo: 'empresa',
    direccion: [partner.street, partner.street2, partner.city].filter(Boolean).join(', ') || null,
    telefono_principal: clean(partner.phone) || clean(partner.mobile),
    email_principal: clean(partner.email), odoo_partner_id: pid,
    nota: 'Importado de Odoo',
  });
  clienteDePartner.set(pid, id);

  // hijos
  const kids = partner.child_ids?.length
    ? await call('res.partner', 'read', [partner.child_ids], { fields: PARTNER_FIELDS }) : [];
  const contacts = kids.filter(k => k.type === 'contact' || (!k.type && k.function));
  const deliveries = kids.filter(k => k.type === 'delivery');

  // contactos
  const ctRows = contacts.slice(0, fullContacts ? CAP_CONTACT : 3).map((k, i) => ({
    id: `ct-odoo-${k.id}`, cliente_id: id, nombre: k.name || 'Contacto',
    cargo: clean(k.function), telefono: clean(k.phone), whatsapp: clean(k.mobile),
    email: clean(k.email), es_principal: i === 0, odoo_partner_id: k.id,
  }));
  if (ctRows.length) { const { error } = await sb.from('contactos').insert(ctRows); if (error) console.warn('  contactos:', error.message); }

  // ubicaciones (dirección propia "Principal" + direcciones de entrega)
  const ubRows = [];
  if (partner.street) ubRows.push({
    id: `ub-odoo-p${pid}`, cliente_id: id, nombre: 'Principal',
    direccion: [partner.street, partner.street2].filter(Boolean).join(', '), ciudad: clean(partner.city),
    provincia: m2name(partner.state_id) || null, odoo_address_id: pid,
  });
  for (const d of deliveries.slice(0, fullDeliveries ? CAP_DELIVERY : 4)) {
    // Odoo nombra las direcciones de entrega con el nombre de la empresa; usamos la
    // calle/ciudad como nombre para que sea distintivo.
    ubRows.push({
      id: `ub-odoo-${d.id}`, cliente_id: id, nombre: (clean(d.street) || clean(d.city) || 'Entrega'),
      direccion: [d.street, d.street2].filter(Boolean).join(', ') || null, ciudad: clean(d.city),
      provincia: m2name(d.state_id) || null, contacto_telefono: clean(d.phone) || clean(d.mobile),
      odoo_address_id: d.id,
    });
  }
  if (ubRows.length) {
    const { error } = await sb.from('cliente_ubicaciones').insert(ubRows);
    if (error) console.warn('  ubicaciones:', error.message);
    else for (const u of ubRows) ubicByOdooAddr.set(u.odoo_address_id, u.id);
  }
  console.log(`  + ${partner.name} (odoo ${pid}) → ${ctRows.length} contactos, ${ubRows.length} ubicaciones`);
  return id;
}

// ---------- 1. PASS demo (completo + garantías) ----------
console.log('\n[1] Clientes demo (contactos + entregas + garantías)…');
const demoPartners = await call('res.partner', 'read', [DEMO_PARTNER_IDS], { fields: PARTNER_FIELDS });
let nGar = 0, nMan = 0;
for (const p of demoPartners) {
  const cid = await materializarCliente(p, { fullContacts: true, fullDeliveries: true });
  // cotizaciones aprobadas → garantías
  const sos = await call('sale.order', 'search_read',
    [[['partner_id', 'child_of', p.id], ['state', 'in', ['sale', 'done']]]],
    { fields: ['name', 'amount_total', 'date_order', 'partner_shipping_id'], limit: CAP_SO, order: 'date_order desc' });
  for (const so of sos) {
    const inicio = (so.date_order || '').split(' ')[0] || hoyISO;
    const dur = 60;
    const cadaMant = 24; // inspección obligatoria cada 2 años (tipo imper_liquida)
    const TIPO = 'imper_liquida';
    const CONDICION = 'Vigente siempre que se realicen las inspecciones obligatorias cada 24 meses y no haya intervención de terceros sobre la superficie.';
    const venc = sumarMeses(inicio, dur);
    const estado = venc < hoyISO ? 'vencida' : 'vigente';
    const gid = `gar-odoo-${so.name.replace(/[^A-Za-z0-9]/g, '')}`;
    const ubId = ubicByOdooAddr.get(m2id(so.partner_shipping_id)) || null;
    const { error } = await sb.from('garantias').insert({
      id: gid, codigo: so.name, cliente_id: cid, ubicacion_id: ubId,
      referencia_cotizacion: so.name, sistema_nombre: 'Impermeabilización',
      tipo: TIPO, condicion: CONDICION,
      fecha_inicio: inicio, duracion_meses: dur, fecha_vencimiento: venc, estado,
      monto: so.amount_total ?? null, origen: 'odoo', notas: `Importada de cotización ${so.name}`,
    });
    if (error) { console.warn('  garantia:', error.message); continue; }
    nGar++;
    // inspecciones obligatorias cada 24 meses
    const mans = [];
    for (let m = cadaMant; m < dur; m += cadaMant) {
      const f = sumarMeses(inicio, m);
      mans.push({ id: `man-odoo-${so.name.replace(/[^A-Za-z0-9]/g, '')}-${m}`, garantia_id: gid, cliente_id: cid, ubicacion_id: ubId, tipo: 'inspeccion', obligatorio: true, fecha_programada: f, estado: f < hoyISO ? 'realizado' : 'pendiente' });
    }
    // La inspección vencida más reciente queda PENDIENTE (el cliente debe la del
    // ciclo actual) → la garantía aparece SUSPENDIDA hasta que se realice.
    const pasados = mans.filter(x => x.fecha_programada < hoyISO);
    if (pasados.length) pasados[pasados.length - 1].estado = 'pendiente';
    if (mans.length) { await sb.from('mantenimientos').insert(mans); nMan += mans.length; }
  }
}
console.log(`  Garantías: ${nGar} · Mantenimientos: ${nMan}`);

// ---------- 2. PASS operativo: enlazar proyectos locales ----------
console.log('\n[2] Enlazando clientes de proyectos locales…');
const { data: proys } = await sb.from('proyectos').select('id, cliente, cliente_id, referencia_odoo').eq('archivado', false);
const refs = [...new Set(proys.map(p => p.referencia_odoo).filter(Boolean))];
// Resolver SO → partner y shipping
const soList = refs.length ? await call('sale.order', 'search_read',
  [[['name', 'in', refs]]],
  { fields: ['name', 'partner_id', 'partner_shipping_id'] }) : [];
const soByName = Object.fromEntries(soList.map(s => [s.name, s]));
// La empresa (commercial) se obtiene del res.partner del partner_id de la SO.
const soPartnerIds = [...new Set(soList.map(s => m2id(s.partner_id)).filter(Boolean))];
const soPartners = soPartnerIds.length ? await call('res.partner', 'read', [soPartnerIds], { fields: ['commercial_partner_id'] }) : [];
const commercialDe = Object.fromEntries(soPartners.map(p => [p.id, m2id(p.commercial_partner_id) || p.id]));
const commercialIds = [...new Set(Object.values(commercialDe))];
// leer los partners-empresa que faltan por materializar
const faltan = commercialIds.filter(pid => !clienteDePartner.has(pid));
const partnersFaltan = faltan.length ? await call('res.partner', 'read', [faltan], { fields: PARTNER_FIELDS }) : [];
const partnerById = Object.fromEntries(partnersFaltan.map(p => [p.id, p]));

let nLinkSO = 0, nLinkText = 0, nUbicAuto = 0;
const cacheTextCliente = new Map(); // nombre normalizado -> cliente_id
const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

for (const p of proys) {
  let cid = null, ubId = null;
  const so = p.referencia_odoo ? soByName[p.referencia_odoo] : null;
  if (so) {
    const pid = commercialDe[m2id(so.partner_id)];
    if (pid) {
      cid = clienteDePartner.get(pid);
      if (!cid && partnerById[pid]) cid = await materializarCliente(partnerById[pid], { fullContacts: true, fullDeliveries: true });
      // ubicacion por el envío de la SO
      const shipId = m2id(so.partner_shipping_id);
      if (shipId) ubId = ubicByOdooAddr.get(shipId) || null;
      if (cid) nLinkSO++;
    }
  }
  if (!cid) {
    // fallback: crear cliente por nombre de texto del proyecto
    const key = norm(p.cliente);
    if (!key) continue;
    if (cacheTextCliente.has(key)) cid = cacheTextCliente.get(key);
    else {
      cid = `c-proj-${key.slice(0, 24)}`;
      await sb.from('clientes').upsert({ id: cid, nombre: p.cliente, tipo: 'empresa', nota: 'Creado desde proyecto local' }, { onConflict: 'id' });
      cacheTextCliente.set(key, cid);
    }
    nLinkText++;
  }
  const upd = { cliente_id: cid };
  if (ubId) { upd.ubicacion_id = ubId; nUbicAuto++; }
  await sb.from('proyectos').update(upd).eq('id', p.id);
}
console.log(`  Proyectos enlazados por SO/Odoo: ${nLinkSO} · por texto: ${nLinkText} · ubicación auto-asignada: ${nUbicAuto}`);

// ---------- resumen ----------
const cnt = async (t, f) => (await sb.from(t).select('id', { count: 'exact', head: true }).like('id', f)).count;
console.log('\n=== RESUMEN LOCAL ===');
console.log('clientes (odoo):', await cnt('clientes', 'c-odoo-%'), '· clientes (proyecto):', await cnt('clientes', 'c-proj-%'));
console.log('contactos:', await cnt('contactos', 'ct-odoo-%'), '· ubicaciones:', await cnt('cliente_ubicaciones', 'ub-odoo-%'));
console.log('garantías:', await cnt('garantias', 'gar-odoo-%'), '· mantenimientos:', await cnt('mantenimientos', 'man-odoo-%'));
const { count: proysLink } = await sb.from('proyectos').select('id', { count: 'exact', head: true }).not('cliente_id', 'is', null);
console.log('proyectos con cliente_id:', proysLink);
console.log('\nListo.');
