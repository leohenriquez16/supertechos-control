// lib/odoo.js
// Cliente para comunicarse con la API de Odoo 17 Enterprise
// Usa XML-RPC (estándar de Odoo)

/**
 * Hace una llamada al API XML-RPC de Odoo
 *
 * @param {string} url - URL base de Odoo (ej: 'https://supertechos.odoo.com')
 * @param {string} db - Database name de Odoo
 * @param {number} uid - User ID autenticado
 * @param {string} apiKey - API key del usuario
 * @param {string} model - Modelo Odoo (ej: 'sale.order')
 * @param {string} method - Método (ej: 'search_read')
 * @param {Array} args - Argumentos posicionales
 * @param {Object} kwargs - Argumentos nombrados (opcional)
 */
async function odooCall(url, db, uid, apiKey, model, method, args = [], kwargs = {}) {
  const xmlBody = `<?xml version='1.0'?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><string>${model}</string></value></param>
    <param><value><string>${method}</string></value></param>
    <param><value>${valueToXml(args)}</value></param>
    <param><value>${valueToXml(kwargs)}</value></param>
  </params>
</methodCall>`;

  const response = await fetch(`${url}/xmlrpc/2/object`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xmlBody,
  });

  if (!response.ok) {
    throw new Error(`Odoo HTTP error: ${response.status}`);
  }

  const text = await response.text();

  if (text.includes('<fault>')) {
    const errorMatch = text.match(/<string>([^<]+)<\/string>/);
    throw new Error(`Odoo error: ${errorMatch ? errorMatch[1] : 'unknown'}`);
  }

  return parseOdooResponse(text);
}

/**
 * Autentica con Odoo y obtiene el UID del usuario
 */
async function odooAuthenticate(url, db, username, apiKey) {
  const xmlBody = `<?xml version='1.0'?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${db}</string></value></param>
    <param><value><string>${username}</string></value></param>
    <param><value><string>${apiKey}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;

  const response = await fetch(`${url}/xmlrpc/2/common`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xmlBody,
  });

  if (!response.ok) {
    throw new Error(`Odoo auth HTTP error: ${response.status}`);
  }

  const text = await response.text();

  if (text.includes('<fault>')) {
    throw new Error('Odoo authentication failed');
  }

  const uidMatch = text.match(/<int>(\d+)<\/int>/);
  if (!uidMatch) {
    throw new Error('Could not parse UID from Odoo response');
  }

  const uid = parseInt(uidMatch[1]);
  if (uid === 0 || isNaN(uid)) {
    throw new Error('Invalid credentials (uid=0)');
  }

  return uid;
}

// Convierte un valor JS a XML-RPC
function valueToXml(value) {
  if (value === null || value === undefined) {
    return '<nil/>';
  }
  if (typeof value === 'boolean') {
    return `<boolean>${value ? 1 : 0}</boolean>`;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? `<int>${value}</int>`
      : `<double>${value}</double>`;
  }
  if (typeof value === 'string') {
    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<string>${escaped}</string>`;
  }
  if (Array.isArray(value)) {
    const items = value.map(v => `<value>${valueToXml(v)}</value>`).join('');
    return `<array><data>${items}</data></array>`;
  }
  if (typeof value === 'object') {
    const members = Object.entries(value)
      .map(([k, v]) => `<member><name>${k}</name><value>${valueToXml(v)}</value></member>`)
      .join('');
    return `<struct>${members}</struct>`;
  }
  return '<nil/>';
}

// Parser XML-RPC simplificado para responses
function parseOdooResponse(xml) {
  // Extrae el contenido entre <methodResponse><params><param><value>...</value>
  const valueMatch = xml.match(/<methodResponse>\s*<params>\s*<param>\s*<value>([\s\S]+)<\/value>\s*<\/param>/);
  if (!valueMatch) {
    throw new Error('Could not parse Odoo response');
  }
  return parseXmlValue(valueMatch[1].trim());
}

function parseXmlValue(xml) {
  xml = xml.trim();

  // Array
  const arrayMatch = xml.match(/^<array>\s*<data>([\s\S]*)<\/data>\s*<\/array>$/);
  if (arrayMatch) {
    const items = [];
    const itemRegex = /<value>([\s\S]*?)<\/value>/g;
    let m;
    let depth = 0;
    let buffer = '';
    let inValue = false;

    // Parse manual considerando anidamiento
    const content = arrayMatch[1];
    return extractValues(content);
  }

  // Struct (objeto)
  if (xml.startsWith('<struct>')) {
    const obj = {};
    const memberRegex = /<member>\s*<name>([^<]+)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g;
    let m;
    // Parser más robusto para anidamiento
    const inner = xml.slice('<struct>'.length, -'</struct>'.length);
    let pos = 0;
    while (pos < inner.length) {
      const memberStart = inner.indexOf('<member>', pos);
      if (memberStart === -1) break;
      const memberEnd = findMatchingClose(inner, memberStart, 'member');
      const memberContent = inner.slice(memberStart + '<member>'.length, memberEnd);
      const nameMatch = memberContent.match(/<name>([^<]+)<\/name>/);
      const valueStart = memberContent.indexOf('<value>');
      const valueEnd = findMatchingClose(memberContent, valueStart, 'value');
      const valueContent = memberContent.slice(valueStart + '<value>'.length, valueEnd);
      if (nameMatch) {
        obj[nameMatch[1]] = parseXmlValue(valueContent);
      }
      pos = memberEnd + '</member>'.length;
    }
    return obj;
  }

  // Tipos simples
  let m;
  if ((m = xml.match(/^<int>(-?\d+)<\/int>$/))) return parseInt(m[1]);
  if ((m = xml.match(/^<i4>(-?\d+)<\/i4>$/))) return parseInt(m[1]);
  if ((m = xml.match(/^<double>(-?[\d.]+)<\/double>$/))) return parseFloat(m[1]);
  if ((m = xml.match(/^<boolean>([01])<\/boolean>$/))) return m[1] === '1';
  if ((m = xml.match(/^<string>([\s\S]*)<\/string>$/))) {
    return m[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
  if (xml === '<nil/>' || xml === '') return null;

  // Si no hay tag, asumimos string
  return xml;
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
    const valueStart = content.indexOf('<value>', pos);
    if (valueStart === -1) break;
    const valueEnd = findMatchingClose(content, valueStart, 'value');
    if (valueEnd === -1) break;
    const valueContent = content.slice(valueStart + '<value>'.length, valueEnd);
    result.push(parseXmlValue(valueContent));
    pos = valueEnd + '</value>'.length;
  }
  return result;
}

/**
 * Función pública: lista cotizaciones aprobadas (sale.order en estado 'sale')
 *
 * @returns Array de cotizaciones con sus líneas
 */
export async function listarCotizacionesAprobadas() {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables de entorno: ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY');
  }

  // Paso 1: autenticar
  const uid = await odooAuthenticate(url, db, username, apiKey);

  // Paso 2: leer cotizaciones aprobadas (state='sale')
  const cotizaciones = await odooCall(url, db, uid, apiKey, 'sale.order', 'search_read',
    [[['state', '=', 'sale']]], // domain
    {
      fields: ['name', 'partner_id', 'date_order', 'amount_total', 'order_line', 'state', 'client_order_ref'],
      limit: 100,
      order: 'date_order desc',
    }
  );

  // Paso 3: leer las líneas de cada cotización
  const lineIds = cotizaciones.flatMap(c => c.order_line || []);
  let lineas = [];
  if (lineIds.length > 0) {
    lineas = await odooCall(url, db, uid, apiKey, 'sale.order.line', 'read',
      [lineIds],
      { fields: ['order_id', 'product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'] }
    );
  }

  // Mapear líneas a sus cotizaciones
  const lineasPorOrden = {};
  for (const linea of lineas) {
    const orderId = Array.isArray(linea.order_id) ? linea.order_id[0] : linea.order_id;
    if (!lineasPorOrden[orderId]) lineasPorOrden[orderId] = [];
    lineasPorOrden[orderId].push(linea);
  }

  // Combinar
  return cotizaciones.map(c => ({
    id: c.id,
    referencia: c.name,
    referenciaCliente: c.client_order_ref || '',
    cliente: Array.isArray(c.partner_id) ? c.partner_id[1] : '',
    clienteId: Array.isArray(c.partner_id) ? c.partner_id[0] : null,
    fechaOrden: c.date_order,
    montoTotal: c.amount_total,
    estado: c.state,
    lineas: (lineasPorOrden[c.id] || []).map(l => ({
      id: l.id,
      nombre: l.name,
      producto: Array.isArray(l.product_id) ? l.product_id[1] : '',
      productoId: Array.isArray(l.product_id) ? l.product_id[0] : null,
      cantidad: l.product_uom_qty,
      precioUnitario: l.price_unit,
      subtotal: l.price_subtotal,
    })),
  }));
}

/**
 * Test simple: solo verifica que las credenciales funcionen
 */
export async function testConexion() {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  if (!url) return { ok: false, error: 'Falta ODOO_URL en variables de entorno' };
  if (!db) return { ok: false, error: 'Falta ODOO_DB en variables de entorno' };
  if (!username) return { ok: false, error: 'Falta ODOO_USERNAME en variables de entorno' };
  if (!apiKey) return { ok: false, error: 'Falta ODOO_API_KEY en variables de entorno' };

  try {
    const uid = await odooAuthenticate(url, db, username, apiKey);
    return { ok: true, uid, db, url, username };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
