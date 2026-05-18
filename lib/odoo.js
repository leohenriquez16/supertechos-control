// lib/odoo.js
// Cliente para comunicarse con la API de Odoo 17 Enterprise
// Usa XML-RPC (estándar de Odoo)
// v8.10.23: Soporte completo para secciones (áreas) y campo x_studio_referencias

/**
 * Hace una llamada al API XML-RPC de Odoo
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
    const content = arrayMatch[1];
    return extractValues(content);
  }

  // Struct (objeto)
  if (xml.startsWith('<struct>')) {
    const obj = {};
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

// ============================================================
// FUNCIONES PÚBLICAS
// ============================================================

/**
 * Lista cotizaciones aprobadas con sus secciones (áreas) y líneas de producto
 * v8.10.23: Incluye display_type para identificar secciones y notas
 */
export async function listarCotizacionesAprobadas() {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables de entorno: ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY');
  }

  const uid = await odooAuthenticate(url, db, username, apiKey);

  // Leer cotizaciones confirmadas (state='sale')
  const cotizaciones = await odooCall(url, db, uid, apiKey, 'sale.order', 'search_read',
    [[['state', '=', 'sale']]],
    {
      // v8.17.45: incluir company_id para detectar si la cotización es de
      // Super Techos o Prouco (en Odoo cada empresa tiene su company_id).
      fields: ['name', 'partner_id', 'date_order', 'amount_total', 'order_line', 'state', 'client_order_ref', 'x_studio_referencias', 'company_id'],
      limit: 50,
      order: 'date_order desc',
    }
  );

  // Leer TODAS las líneas incluyendo secciones y notas
  const lineIds = cotizaciones.flatMap(c => c.order_line || []);
  let lineas = [];
  if (lineIds.length > 0) {
    // Leer en lotes de 200 para evitar timeouts
    for (let i = 0; i < lineIds.length; i += 200) {
      const batch = lineIds.slice(i, i + 200);
      const batchResult = await odooCall(url, db, uid, apiKey, 'sale.order.line', 'read',
        [batch],
        { fields: ['order_id', 'product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal', 'display_type', 'sequence'] }
      );
      lineas = lineas.concat(batchResult);
    }
  }

  // Mapear líneas a sus cotizaciones
  const lineasPorOrden = {};
  for (const linea of lineas) {
    const orderId = Array.isArray(linea.order_id) ? linea.order_id[0] : linea.order_id;
    if (!lineasPorOrden[orderId]) lineasPorOrden[orderId] = [];
    lineasPorOrden[orderId].push(linea);
  }

  // v8.17.45: helper para mapear company_id de Odoo a nuestra clave interna.
  // El company_id de Odoo viene como [id, nombre]. Si el nombre incluye "SUPER
  // TECHOS" → super_techos. Si incluye "PROUCO" → prouco. Si no, null y el
  // admin lo asigna manualmente.
  const inferirEmpresaEmisora = (companyId) => {
    if (!Array.isArray(companyId)) return null;
    const nombre = String(companyId[1] || '').toUpperCase();
    if (nombre.includes('PROUCO')) return 'prouco';
    if (nombre.includes('SUPER TECHOS') || nombre.includes('LH SUPER')) return 'super_techos';
    return null;
  };

  // Combinar y estructurar con áreas
  return cotizaciones.map(c => {
    const lineasOrden = (lineasPorOrden[c.id] || []).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    
    // Agrupar por secciones (áreas)
    const areas = [];
    let areaActual = null;

    for (const l of lineasOrden) {
      const tipo = l.display_type || false;
      
      if (tipo === 'line_section') {
        // Nueva área/sección
        areaActual = {
          nombre: l.name || 'Sin nombre',
          productos: [],
          notas: [],
        };
        areas.push(areaActual);
      } else if (tipo === 'line_note') {
        // Nota — agregar al área actual o como nota general
        if (areaActual) {
          areaActual.notas.push(l.name || '');
        }
      } else {
        // Línea de producto
        const producto = {
          id: l.id,
          nombre: l.name || '',
          producto: Array.isArray(l.product_id) ? l.product_id[1] : '',
          productoId: Array.isArray(l.product_id) ? l.product_id[0] : null,
          cantidad: l.product_uom_qty || 0,
          precioUnitario: l.price_unit || 0,
          subtotal: l.price_subtotal || 0,
        };
        
        if (areaActual) {
          areaActual.productos.push(producto);
        } else {
          // Producto sin sección — crear área "General"
          if (areas.length === 0 || areas[areas.length - 1].nombre !== 'General') {
            areaActual = { nombre: 'General', productos: [], notas: [] };
            areas.push(areaActual);
          }
          areas[areas.length - 1].productos.push(producto);
        }
      }
    }

    // Calcular m² por área (el mayor qty de producto en esa sección, excluyendo movilización)
    for (const area of areas) {
      const productosM2 = area.productos.filter(p => 
        !p.producto.toLowerCase().includes('movilización') &&
        !p.producto.toLowerCase().includes('movilizacion') &&
        !p.producto.toLowerCase().includes('transporte') &&
        !p.producto.toLowerCase().includes('precio ajustado') &&
        !p.producto.toLowerCase().includes('down payment')
      );
      area.m2 = productosM2.length > 0 
        ? Math.max(...productosM2.map(p => p.cantidad))
        : (area.productos.length > 0 ? area.productos[0].cantidad : 0);
    }

    return {
      id: c.id,
      referencia: c.name,
      referenciaCliente: c.client_order_ref || '',
      referencias: c.x_studio_referencias || '',
      cliente: Array.isArray(c.partner_id) ? c.partner_id[1] : '',
      clienteId: Array.isArray(c.partner_id) ? c.partner_id[0] : null,
      fechaOrden: c.date_order,
      montoTotal: c.amount_total,
      estado: c.state,
      // v8.17.45: empresa de nuestro lado que emitió la cotización
      empresaEmisora: inferirEmpresaEmisora(c.company_id),
      empresaOdoo: Array.isArray(c.company_id) ? c.company_id[1] : null,
      areas,
    };
  });
}

/**
 * Obtiene el detalle completo de una cotización específica por ID
 */
export async function obtenerCotizacion(cotizacionId) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables de entorno');
  }

  const uid = await odooAuthenticate(url, db, username, apiKey);

  const cotizaciones = await odooCall(url, db, uid, apiKey, 'sale.order', 'read',
    [[cotizacionId]],
    { fields: ['name', 'partner_id', 'date_order', 'amount_total', 'order_line', 'state', 'client_order_ref', 'x_studio_referencias'] }
  );

  if (!cotizaciones || cotizaciones.length === 0) {
    throw new Error('Cotización no encontrada');
  }

  const c = cotizaciones[0];
  const lineas = await odooCall(url, db, uid, apiKey, 'sale.order.line', 'read',
    [c.order_line],
    { fields: ['order_id', 'product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal', 'display_type', 'sequence'] }
  );

  lineas.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const areas = [];
  let areaActual = null;

  for (const l of lineas) {
    const tipo = l.display_type || false;
    if (tipo === 'line_section') {
      areaActual = { nombre: l.name || 'Sin nombre', productos: [], notas: [] };
      areas.push(areaActual);
    } else if (tipo === 'line_note') {
      if (areaActual) areaActual.notas.push(l.name || '');
    } else {
      const producto = {
        id: l.id,
        nombre: l.name || '',
        producto: Array.isArray(l.product_id) ? l.product_id[1] : '',
        productoId: Array.isArray(l.product_id) ? l.product_id[0] : null,
        cantidad: l.product_uom_qty || 0,
        precioUnitario: l.price_unit || 0,
        subtotal: l.price_subtotal || 0,
      };
      if (areaActual) {
        areaActual.productos.push(producto);
      } else {
        if (areas.length === 0 || areas[areas.length - 1].nombre !== 'General') {
          areaActual = { nombre: 'General', productos: [], notas: [] };
          areas.push(areaActual);
        }
        areas[areas.length - 1].productos.push(producto);
      }
    }
  }

  for (const area of areas) {
    const productosM2 = area.productos.filter(p =>
      !p.producto.toLowerCase().includes('movilización') &&
      !p.producto.toLowerCase().includes('movilizacion') &&
      !p.producto.toLowerCase().includes('transporte') &&
      !p.producto.toLowerCase().includes('precio ajustado') &&
      !p.producto.toLowerCase().includes('down payment')
    );
    area.m2 = productosM2.length > 0
      ? Math.max(...productosM2.map(p => p.cantidad))
      : (area.productos.length > 0 ? area.productos[0].cantidad : 0);
  }

  return {
    id: c.id,
    referencia: c.name,
    referenciaCliente: c.client_order_ref || '',
    referencias: c.x_studio_referencias || '',
    cliente: Array.isArray(c.partner_id) ? c.partner_id[1] : '',
    clienteId: Array.isArray(c.partner_id) ? c.partner_id[0] : null,
    fechaOrden: c.date_order,
    montoTotal: c.amount_total,
    estado: c.state,
    areas,
  };
}

/**
 * Obtiene los datos completos de un partner (cliente) de Odoo por ID
 */
export async function obtenerPartner(partnerId) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables de entorno: ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY');
  }

  const uid = await odooAuthenticate(url, db, username, apiKey);

  const partners = await odooCall(url, db, uid, apiKey, 'res.partner', 'read',
    [[partnerId]],
    { fields: ['name', 'vat', 'company_type', 'street', 'street2', 'city', 'phone', 'mobile', 'email', 'comment'] }
  );

  if (!partners || partners.length === 0) {
    throw new Error('Partner no encontrado en Odoo');
  }

  const p = partners[0];
  const direccion = [p.street, p.street2, p.city].filter(Boolean).join(', ');
  const telefono = p.phone || p.mobile || '';

  return {
    odooPartnerId: p.id,
    nombre: p.name || '',
    rnc: p.vat || '',
    tipo: p.company_type === 'person' ? 'persona' : 'empresa',
    direccion,
    telefonoPrincipal: telefono,
    emailPrincipal: p.email || '',
    nota: p.comment || '',
  };
}

/**
 * v8.17.67: Busca facturas (account.move) ligadas a un Sale Order de Odoo.
 * Recibe `referenciaOdoo` (ej "S00123") o el id numérico del SO.
 * Devuelve array con cada factura POSTED encontrada:
 *   { id, numero, fecha, monto_total, estado, monto_pagado, ref_so }
 * Devuelve [] si no hay facturas o si el SO no existe.
 */
export async function buscarFacturasDeSO(referenciaOdoo) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables de entorno de Odoo');
  }
  const uid = await odooAuthenticate(url, db, username, apiKey);

  // 1) Resolver SO: puede venir como id numérico o como name "S00123"
  let soId = null;
  if (typeof referenciaOdoo === 'number') {
    soId = referenciaOdoo;
  } else {
    const sos = await odooCall(url, db, uid, apiKey, 'sale.order', 'search_read',
      [[['name', '=', String(referenciaOdoo)]]],
      { fields: ['id', 'name', 'invoice_ids'], limit: 1 }
    );
    if (!sos || sos.length === 0) return [];
    soId = sos[0].id;
  }

  // 2) Leer el SO con sus invoice_ids
  const sos = await odooCall(url, db, uid, apiKey, 'sale.order', 'read',
    [[soId]],
    { fields: ['name', 'invoice_ids'] }
  );
  if (!sos || sos.length === 0) return [];
  const invoiceIds = sos[0].invoice_ids || [];
  if (invoiceIds.length === 0) return [];

  // 3) Leer las facturas. Filtramos por state='posted' (las draft se ignoran).
  const facturas = await odooCall(url, db, uid, apiKey, 'account.move', 'read',
    [invoiceIds],
    { fields: ['name', 'invoice_date', 'amount_total', 'amount_residual', 'state', 'move_type'] }
  );

  return (facturas || [])
    .filter(f => f.state === 'posted' && (f.move_type === 'out_invoice' || f.move_type === 'out_refund'))
    .map(f => ({
      id: f.id,
      numero: f.name || '',
      fecha: f.invoice_date || null,
      monto_total: Number(f.amount_total || 0),
      monto_pagado: Number(f.amount_total || 0) - Number(f.amount_residual || 0),
      estado: f.state,
      tipo: f.move_type,
      ref_so: sos[0].name,
    }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
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
