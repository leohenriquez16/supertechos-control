#!/usr/bin/env node
// MCP server: consulta productos y compras en Odoo desde Claude Code.
//
// Configurado vía .mcp.json. Lee las credenciales desde process.env o desde
// .env.local en la raíz del proyecto.
//
// Variables requeridas:
//   ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY
//
// Tools expuestos:
//   - buscar_producto(query, limit?)
//   - historial_compras_producto(product_id, limit?)
//   - costo_ultima_compra(query)

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// ============================================================
// Cliente XML-RPC de Odoo (autocontenido)
// ============================================================

function valueToXml(value) {
  if (value === null || value === undefined) return '<nil/>';
  if (typeof value === 'boolean') return `<boolean>${value ? 1 : 0}</boolean>`;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `<int>${value}</int>` : `<double>${value}</double>`;
  }
  if (typeof value === 'string') {
    const e = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<string>${e}</string>`;
  }
  if (Array.isArray(value)) {
    return `<array><data>${value.map(v => `<value>${valueToXml(v)}</value>`).join('')}</data></array>`;
  }
  if (typeof value === 'object') {
    return `<struct>${Object.entries(value).map(([k, v]) =>
      `<member><name>${k}</name><value>${valueToXml(v)}</value></member>`).join('')}</struct>`;
  }
  return '<nil/>';
}

function findMatchingClose(text, openIdx, tag) {
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  let depth = 1;
  let pos = openIdx + openTag.length;
  while (depth > 0 && pos < text.length) {
    const nextOpen = text.indexOf(openTag, pos);
    const nextClose = text.indexOf(closeTag, pos);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closeTag.length;
    }
  }
  return -1;
}

function extractValues(content) {
  const result = [];
  let pos = 0;
  while (pos < content.length) {
    const vs = content.indexOf('<value>', pos);
    if (vs === -1) break;
    const ve = findMatchingClose(content, vs, 'value');
    if (ve === -1) break;
    result.push(parseXmlValue(content.slice(vs + '<value>'.length, ve)));
    pos = ve + '</value>'.length;
  }
  return result;
}

function parseXmlValue(xml) {
  xml = xml.trim();
  const arrayMatch = xml.match(/^<array>\s*<data>([\s\S]*)<\/data>\s*<\/array>$/);
  if (arrayMatch) return extractValues(arrayMatch[1]);
  if (xml.startsWith('<struct>')) {
    const obj = {};
    const inner = xml.slice('<struct>'.length, -'</struct>'.length);
    let pos = 0;
    while (pos < inner.length) {
      const ms = inner.indexOf('<member>', pos);
      if (ms === -1) break;
      const me = findMatchingClose(inner, ms, 'member');
      const mc = inner.slice(ms + '<member>'.length, me);
      const nm = mc.match(/<name>([^<]+)<\/name>/);
      const vs = mc.indexOf('<value>');
      const ve = findMatchingClose(mc, vs, 'value');
      if (nm) obj[nm[1]] = parseXmlValue(mc.slice(vs + '<value>'.length, ve));
      pos = me + '</member>'.length;
    }
    return obj;
  }
  let m;
  if ((m = xml.match(/^<int>(-?\d+)<\/int>$/))) return parseInt(m[1]);
  if ((m = xml.match(/^<i4>(-?\d+)<\/i4>$/))) return parseInt(m[1]);
  if ((m = xml.match(/^<double>(-?[\d.]+)<\/double>$/))) return parseFloat(m[1]);
  if ((m = xml.match(/^<boolean>([01])<\/boolean>$/))) return m[1] === '1';
  if ((m = xml.match(/^<string>([\s\S]*)<\/string>$/))) {
    return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  if (xml === '<nil/>' || xml === '') return null;
  return xml;
}

function parseOdooResponse(xml) {
  const m = xml.match(/<methodResponse>\s*<params>\s*<param>\s*<value>([\s\S]+)<\/value>\s*<\/param>/);
  if (!m) throw new Error('Could not parse Odoo response');
  return parseXmlValue(m[1].trim());
}

async function odooAuthenticate(url, db, username, apiKey) {
  const xml = `<?xml version='1.0'?><methodCall><methodName>authenticate</methodName><params>` +
    `<param><value><string>${db}</string></value></param>` +
    `<param><value><string>${username}</string></value></param>` +
    `<param><value><string>${apiKey}</string></value></param>` +
    `<param><value><struct></struct></value></param>` +
    `</params></methodCall>`;
  const r = await fetch(`${url}/xmlrpc/2/common`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml,
  });
  if (!r.ok) throw new Error(`Odoo auth HTTP ${r.status}`);
  const text = await r.text();
  if (text.includes('<fault>')) throw new Error('Odoo authentication failed');
  const uidMatch = text.match(/<int>(\d+)<\/int>/);
  if (!uidMatch) throw new Error('Could not parse UID');
  const uid = parseInt(uidMatch[1]);
  if (uid === 0 || isNaN(uid)) throw new Error('Invalid credentials (uid=0)');
  return uid;
}

async function odooCall(url, db, uid, apiKey, model, method, args = [], kwargs = {}) {
  const xml = `<?xml version='1.0'?><methodCall><methodName>execute_kw</methodName><params>` +
    `<param><value><string>${db}</string></value></param>` +
    `<param><value><int>${uid}</int></value></param>` +
    `<param><value><string>${apiKey}</string></value></param>` +
    `<param><value><string>${model}</string></value></param>` +
    `<param><value><string>${method}</string></value></param>` +
    `<param><value>${valueToXml(args)}</value></param>` +
    `<param><value>${valueToXml(kwargs)}</value></param>` +
    `</params></methodCall>`;
  const r = await fetch(`${url}/xmlrpc/2/object`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml,
  });
  if (!r.ok) throw new Error(`Odoo HTTP ${r.status}`);
  const text = await r.text();
  if (text.includes('<fault>')) {
    const e = text.match(/<string>([^<]+)<\/string>/);
    throw new Error(`Odoo error: ${e ? e[1] : 'unknown'}`);
  }
  return parseOdooResponse(text);
}

let cachedUid = null;
async function getClient() {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY');
  }
  if (!cachedUid) cachedUid = await odooAuthenticate(url, db, username, apiKey);
  return { url, db, uid: cachedUid, apiKey };
}

// ============================================================
// Tools
// ============================================================

async function buscarProducto(query, limit = 10) {
  const { url, db, uid, apiKey } = await getClient();
  const domain = ['|', ['name', 'ilike', query], ['default_code', 'ilike', query]];
  const productos = await odooCall(url, db, uid, apiKey, 'product.product', 'search_read',
    [domain],
    {
      fields: ['id', 'name', 'default_code', 'standard_price', 'list_price', 'uom_id', 'categ_id'],
      limit,
    }
  );
  return productos.map(p => ({
    id: p.id,
    nombre: p.name || '',
    codigo: p.default_code || '',
    costo_estandar: Number(p.standard_price || 0),
    precio_venta: Number(p.list_price || 0),
    unidad: Array.isArray(p.uom_id) ? p.uom_id[1] : '',
    categoria: Array.isArray(p.categ_id) ? p.categ_id[1] : '',
  }));
}

async function historialComprasProducto(productId, limit = 10) {
  const { url, db, uid, apiKey } = await getClient();
  const lineas = await odooCall(url, db, uid, apiKey, 'purchase.order.line', 'search_read',
    [[['product_id', '=', productId], ['state', 'in', ['purchase', 'done']]]],
    {
      fields: ['id', 'order_id', 'product_id', 'name', 'product_qty', 'price_unit', 'price_subtotal', 'date_planned', 'currency_id'],
      order: 'date_planned desc',
      limit,
    }
  );
  if (lineas.length === 0) return [];

  const orderIds = [...new Set(lineas.map(l => Array.isArray(l.order_id) ? l.order_id[0] : l.order_id))];
  const ordenes = await odooCall(url, db, uid, apiKey, 'purchase.order', 'read',
    [orderIds],
    { fields: ['id', 'name', 'partner_id', 'date_order', 'state', 'currency_id'] }
  );
  const ordenById = Object.fromEntries(ordenes.map(o => [o.id, o]));

  return lineas.map(l => {
    const orderId = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id;
    const o = ordenById[orderId] || {};
    return {
      orden: o.name || '',
      proveedor: Array.isArray(o.partner_id) ? o.partner_id[1] : '',
      fecha: o.date_order || l.date_planned || null,
      cantidad: Number(l.product_qty || 0),
      precio_unitario: Number(l.price_unit || 0),
      subtotal: Number(l.price_subtotal || 0),
      moneda: Array.isArray(o.currency_id) ? o.currency_id[1] : (Array.isArray(l.currency_id) ? l.currency_id[1] : ''),
      estado: o.state || '',
      descripcion: l.name || '',
    };
  });
}

async function costoUltimaCompra(query) {
  const productos = await buscarProducto(query, 5);
  if (productos.length === 0) {
    return { error: `No se encontró ningún producto que coincida con "${query}"` };
  }
  const resultados = [];
  for (const p of productos) {
    const historial = await historialComprasProducto(p.id, 1);
    resultados.push({ ...p, ultima_compra: historial[0] || null });
  }
  return resultados;
}

// ============================================================
// MCP server (JSON-RPC 2.0 sobre stdio)
// ============================================================

const TOOLS = [
  {
    name: 'buscar_producto',
    description: 'Busca productos en Odoo por nombre o código interno (default_code). Devuelve id, nombre, código, costo estándar (standard_price) y precio de venta (list_price).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar en nombre o código del producto' },
        limit: { type: 'integer', description: 'Máximo de resultados (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'historial_compras_producto',
    description: 'Devuelve las últimas órdenes de compra confirmadas (state in [purchase, done]) de un producto específico. Incluye proveedor, fecha, cantidad, precio unitario y subtotal. Requiere el product_id de Odoo (lo da buscar_producto).',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'integer', description: 'ID del producto en Odoo (product.product)' },
        limit: { type: 'integer', description: 'Máximo de órdenes (default 10)' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'costo_ultima_compra',
    description: 'Atajo: busca un producto por texto y devuelve para cada match la última compra (proveedor, fecha, precio). Úsalo cuando el usuario pregunta "¿cuánto me costó X?".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nombre o código del producto a consultar' },
      },
      required: ['query'],
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function replyError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handleRequest(req) {
  const { id, method, params } = req;
  try {
    if (method === 'initialize') {
      return reply(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'odoo-supertechos', version: '0.1.0' },
      });
    }
    if (method === 'notifications/initialized' || method === 'initialized') return;
    if (method === 'tools/list') return reply(id, { tools: TOOLS });
    if (method === 'tools/call') {
      const { name, arguments: args = {} } = params || {};
      let result;
      if (name === 'buscar_producto') {
        result = await buscarProducto(args.query, args.limit ?? 10);
      } else if (name === 'historial_compras_producto') {
        result = await historialComprasProducto(args.product_id, args.limit ?? 10);
      } else if (name === 'costo_ultima_compra') {
        result = await costoUltimaCompra(args.query);
      } else {
        return replyError(id, -32601, `Tool desconocido: ${name}`);
      }
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    }
    if (method === 'ping') return reply(id, {});
    if (id !== undefined) replyError(id, -32601, `Método no implementado: ${method}`);
  } catch (e) {
    if (id !== undefined) replyError(id, -32000, e.message || String(e));
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    handleRequest(JSON.parse(line));
  } catch (e) {
    process.stderr.write(`MCP parse error: ${e.message}\n`);
  }
});
