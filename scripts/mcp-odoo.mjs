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
// Tools genéricos — acceso total a cualquier modelo de Odoo
// ============================================================

async function odooSearchRead(model, domain = [], opts = {}) {
  const { url, db, uid, apiKey } = await getClient();
  const { fields, limit = 50, offset = 0, order } = opts;
  const kwargs = { limit, offset };
  if (fields && fields.length) kwargs.fields = fields;
  if (order) kwargs.order = order;
  return odooCall(url, db, uid, apiKey, model, 'search_read', [domain], kwargs);
}

async function odooReadIds(model, ids, fields) {
  const { url, db, uid, apiKey } = await getClient();
  const kwargs = {};
  if (fields && fields.length) kwargs.fields = fields;
  return odooCall(url, db, uid, apiKey, model, 'read', [ids], kwargs);
}

async function odooFieldsGet(model, attributes) {
  const { url, db, uid, apiKey } = await getClient();
  const kwargs = {};
  if (attributes && attributes.length) kwargs.attributes = attributes;
  else kwargs.attributes = ['string', 'type', 'required', 'readonly', 'relation', 'selection', 'help'];
  return odooCall(url, db, uid, apiKey, model, 'fields_get', [], kwargs);
}

async function odooModelsBuscar(query, limit = 30) {
  const { url, db, uid, apiKey } = await getClient();
  const domain = ['|', ['model', 'ilike', query], ['name', 'ilike', query]];
  return odooCall(url, db, uid, apiKey, 'ir.model', 'search_read', [domain],
    { fields: ['model', 'name', 'transient'], limit, order: 'model' }
  );
}

async function odooCount(model, domain = []) {
  const { url, db, uid, apiKey } = await getClient();
  return odooCall(url, db, uid, apiKey, model, 'search_count', [domain], {});
}

async function odooCreate(model, values) {
  const { url, db, uid, apiKey } = await getClient();
  const id = await odooCall(url, db, uid, apiKey, model, 'create', [values], {});
  return { id, model };
}

async function odooWrite(model, ids, values) {
  const { url, db, uid, apiKey } = await getClient();
  const ok = await odooCall(url, db, uid, apiKey, model, 'write', [ids, values], {});
  return { ok, model, ids };
}

async function odooUnlink(model, ids) {
  const { url, db, uid, apiKey } = await getClient();
  const ok = await odooCall(url, db, uid, apiKey, model, 'unlink', [ids], {});
  return { ok, model, ids };
}

async function odooExecute(model, method, args = [], kwargs = {}) {
  const { url, db, uid, apiKey } = await getClient();
  return odooCall(url, db, uid, apiKey, model, method, args, kwargs);
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

  // ---- Tools genéricos ----
  {
    name: 'odoo_search_read',
    description: 'Consulta cualquier modelo de Odoo con un dominio. Ejemplo model="res.partner", domain=[["name","ilike","Carlos"]]. Si no pasas fields, devuelve todos. Limit default 50. Úsalo para responder preguntas abiertas sobre datos en Odoo (facturas, clientes, proyectos, empleados, etc).',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Nombre técnico del modelo, ej. "account.move", "res.partner", "sale.order", "hr.employee", "stock.picking"' },
        domain: { type: 'array', description: 'Dominio Odoo, ej. [["state","=","posted"],["invoice_date",">=","2026-05-01"]]. Acepta operadores "|" "&" "!".' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Campos a devolver (opcional, default todos)' },
        limit: { type: 'integer', description: 'Máximo de registros (default 50)' },
        offset: { type: 'integer', description: 'Offset para paginar (default 0)' },
        order: { type: 'string', description: 'Orden, ej. "date_order desc, id"' },
      },
      required: ['model'],
    },
  },
  {
    name: 'odoo_read',
    description: 'Lee uno o varios registros de Odoo por ID. Más rápido que search_read cuando ya tienes el id.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Nombre del modelo' },
        ids: { type: 'array', items: { type: 'integer' }, description: 'IDs a leer' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Campos a devolver (opcional)' },
      },
      required: ['model', 'ids'],
    },
  },
  {
    name: 'odoo_count',
    description: 'Cuenta cuántos registros matchean un dominio (search_count). Útil para "¿cuántas facturas vencidas hay?" sin traerlas todas.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        domain: { type: 'array' },
      },
      required: ['model'],
    },
  },
  {
    name: 'odoo_fields_get',
    description: 'Devuelve la lista de campos de un modelo (nombre, tipo, relación, help). Úsalo antes de search_read cuando no sepas qué campos pedir.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        attributes: { type: 'array', items: { type: 'string' }, description: 'Atributos a devolver por campo (opcional)' },
      },
      required: ['model'],
    },
  },
  {
    name: 'odoo_models_buscar',
    description: 'Lista modelos de Odoo cuyo nombre técnico o label coincida con la búsqueda. Ej. query="invoice" → account.move. Úsalo cuando no sepas el nombre exacto del modelo.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer' },
      },
      required: ['query'],
    },
  },
  {
    name: 'odoo_create',
    description: 'Crea un registro en Odoo. Devuelve el id creado. ⚠ Modifica datos en Odoo — solicitar confirmación al usuario antes de invocar.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        values: { type: 'object', description: 'Diccionario campo:valor. Para campos many2one pasa el id, para one2many/many2many usa comandos Odoo [(0,0,{...}), (4,id), ...].' },
      },
      required: ['model', 'values'],
    },
  },
  {
    name: 'odoo_write',
    description: 'Actualiza uno o varios registros existentes. ⚠ Modifica datos en Odoo — confirmar con el usuario antes.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        ids: { type: 'array', items: { type: 'integer' } },
        values: { type: 'object' },
      },
      required: ['model', 'ids', 'values'],
    },
  },
  {
    name: 'odoo_unlink',
    description: 'Elimina registros por ID. ⚠ DESTRUCTIVO — siempre pedir confirmación explícita al usuario antes de invocar.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        ids: { type: 'array', items: { type: 'integer' } },
      },
      required: ['model', 'ids'],
    },
  },
  {
    name: 'odoo_execute',
    description: 'Invoca cualquier método del ORM de Odoo. Útil para botones/acciones como sale.order.action_confirm, account.move.action_post, etc. ⚠ Puede modificar datos.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        method: { type: 'string' },
        args: { type: 'array', description: 'Argumentos posicionales (típicamente [[ids]] para acciones sobre records)' },
        kwargs: { type: 'object', description: 'Argumentos con nombre' },
      },
      required: ['model', 'method'],
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
      } else if (name === 'odoo_search_read') {
        result = await odooSearchRead(args.model, args.domain ?? [], {
          fields: args.fields,
          limit: args.limit ?? 50,
          offset: args.offset ?? 0,
          order: args.order,
        });
      } else if (name === 'odoo_read') {
        result = await odooReadIds(args.model, args.ids, args.fields);
      } else if (name === 'odoo_count') {
        result = await odooCount(args.model, args.domain ?? []);
      } else if (name === 'odoo_fields_get') {
        result = await odooFieldsGet(args.model, args.attributes);
      } else if (name === 'odoo_models_buscar') {
        result = await odooModelsBuscar(args.query, args.limit ?? 30);
      } else if (name === 'odoo_create') {
        result = await odooCreate(args.model, args.values);
      } else if (name === 'odoo_write') {
        result = await odooWrite(args.model, args.ids, args.values);
      } else if (name === 'odoo_unlink') {
        result = await odooUnlink(args.model, args.ids);
      } else if (name === 'odoo_execute') {
        result = await odooExecute(args.model, args.method, args.args ?? [], args.kwargs ?? {});
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
