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
      // v8.27.73: incluir currency_id — hay cotizaciones en USD y el importador
      // debe convertir el valor a RD$ (antes tomaba el número USD como pesos).
      fields: ['name', 'partner_id', 'date_order', 'amount_total', 'order_line', 'state', 'client_order_ref', 'x_studio_referencias', 'company_id', 'currency_id'],
      limit: 50,
      order: 'date_order desc',
    }
  );

  // v8.27.73: tasa USD→DOP del día según Odoo (DOP es la moneda base, rate=1).
  let tasaUsd = null;
  try {
    const cur = await odooCall(url, db, uid, apiKey, 'res.currency', 'search_read',
      [[['name', '=', 'USD']]], { fields: ['rate'], limit: 1 });
    const rate = Number(cur?.[0]?.rate || 0);
    if (rate > 0) tasaUsd = Math.round((1 / rate) * 100) / 100; // p.ej. 59.95
  } catch (_) { /* sin tasa → el importador avisa */ }

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
      // v8.27.73: moneda de la cotización + tasa USD→DOP del día (para convertir al importar)
      moneda: Array.isArray(c.currency_id) ? c.currency_id[1] : 'DOP',
      tasaUsd,
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
 * Lista las facturas de VENTA posteadas de una empresa en un mes dado.
 * Fuente del reporte 607 (DGII) durante la transición a facturación nativa.
 *
 * @param {'super_techos'|'prouco'} empresa
 * @param {number} anio  (ej. 2026)
 * @param {number} mes   (1..12)
 * Devuelve array normalizado: { id, ncf, ncfModificado, rncCliente,
 *   clienteNombre, fecha, subtotal, itbis, total, tipo }.
 */
export async function listarFacturasVenta(empresa, anio, mes) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables de entorno de Odoo');
  }
  const uid = await odooAuthenticate(url, db, username, apiKey);

  // RNC de la empresa informante (para resolver su company_id en Odoo).
  const rncEmpresa = empresa === 'prouco' ? '131515541' : '130774331';

  // Resolver company_id por RNC (vat). Si no se encuentra, no se filtra por
  // empresa (mejor devolver de más y que el contador filtre, que romper).
  let companyId = null;
  try {
    const companies = await odooCall(url, db, uid, apiKey, 'res.company', 'search_read',
      [[]], { fields: ['id', 'name', 'vat'] });
    const norm = (v) => String(v || '').replace(/\D/g, '');
    const match = (companies || []).find(c => norm(c.vat) === rncEmpresa);
    if (match) companyId = match.id;
  } catch (_) { /* sigue sin filtro de empresa */ }

  // Rango del mes [primer día, último día].
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

  const domain = [
    ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['state', '=', 'posted'],
    ['invoice_date', '>=', desde],
    ['invoice_date', '<=', hasta],
  ];
  if (companyId) domain.push(['company_id', '=', companyId]);

  // Campos base + NCF de la localización dominicana. Si el campo l10n no
  // existe en esta instancia, Odoo lanza fault → reintentamos sin él.
  const camposBase = ['id', 'name', 'ref', 'invoice_date', 'amount_untaxed', 'amount_tax', 'amount_total', 'move_type', 'partner_id'];
  let facturas;
  try {
    facturas = await odooCall(url, db, uid, apiKey, 'account.move', 'search_read',
      [domain], { fields: [...camposBase, 'l10n_latam_document_number'], order: 'invoice_date asc' });
  } catch (_) {
    facturas = await odooCall(url, db, uid, apiKey, 'account.move', 'search_read',
      [domain], { fields: camposBase, order: 'invoice_date asc' });
  }
  if (!facturas || facturas.length === 0) return [];

  // RNC del cliente: leer res.partner.vat para los partners involucrados.
  const partnerIds = [...new Set(facturas.map(f => Array.isArray(f.partner_id) ? f.partner_id[0] : null).filter(Boolean))];
  const vatPorPartner = {};
  if (partnerIds.length > 0) {
    const partners = await odooCall(url, db, uid, apiKey, 'res.partner', 'read',
      [partnerIds], { fields: ['id', 'vat'] });
    for (const p of partners || []) vatPorPartner[p.id] = p.vat || '';
  }

  return facturas.map(f => {
    const pid = Array.isArray(f.partner_id) ? f.partner_id[0] : null;
    const pnombre = Array.isArray(f.partner_id) ? f.partner_id[1] : '';
    return {
      id: f.id,
      ncf: f.l10n_latam_document_number || f.ref || f.name || '',
      ncfModificado: '',
      rncCliente: pid ? (vatPorPartner[pid] || '') : '',
      clienteNombre: pnombre,
      fecha: f.invoice_date || null,
      subtotal: Number(f.amount_untaxed || 0),
      itbis: Number(f.amount_tax || 0),
      total: Number(f.amount_total || 0),
      tipo: f.move_type,
    };
  });
}

// v8.26.1: [Contabilidad Fase 2] credenciales + company_id por RNC (helper común).
async function odooConexionEmpresa(empresa) {
  const url = process.env.ODOO_URL, db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME, apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) throw new Error('Faltan variables de entorno de Odoo');
  const uid = await odooAuthenticate(url, db, username, apiKey);
  const rncEmpresa = empresa === 'prouco' ? '131515541' : '130774331';
  let companyId = null;
  try {
    const companies = await odooCall(url, db, uid, apiKey, 'res.company', 'search_read', [[]], { fields: ['id', 'name', 'vat'] });
    const norm = (v) => String(v || '').replace(/\D/g, '');
    const match = (companies || []).find(c => norm(c.vat) === rncEmpresa);
    if (match) companyId = match.id;
  } catch (_) { /* sin filtro de empresa */ }
  return { url, db, uid, apiKey, companyId };
}

// v8.26.1: catálogo de cuentas + diarios de la empresa, leídos de Odoo (read-only).
export async function listarCatalogoContableOdoo(empresa) {
  const { url, db, uid, apiKey, companyId } = await odooConexionEmpresa(empresa);
  const domain = companyId ? [['company_id', '=', companyId]] : [];
  const cuentas = await odooCall(url, db, uid, apiKey, 'account.account', 'search_read',
    [domain], { fields: ['id', 'code', 'name', 'account_type', 'deprecated'], limit: 3000, order: 'code asc' });
  const diarios = await odooCall(url, db, uid, apiKey, 'account.journal', 'search_read',
    [domain], { fields: ['id', 'code', 'name', 'type'], limit: 200, order: 'type asc, code asc' });
  return {
    cuentas: (cuentas || []).map(c => ({ odooId: c.id, codigo: c.code || '', nombre: c.name || '', tipo: c.account_type || '', activa: !c.deprecated })),
    diarios: (diarios || []).map(d => ({ odooId: d.id, codigo: d.code || '', nombre: d.name || '', tipo: d.type || '' })),
  };
}

// v8.26.1: facturas PENDIENTES de pago/cobro (CxP = in_invoice, CxC = out_invoice),
// posteadas, con saldo (not_paid/partial). Para las vistas Cuentas por Pagar/Cobrar.
export async function listarFacturasPendientesOdoo(empresa, tipo) {
  const { url, db, uid, apiKey, companyId } = await odooConexionEmpresa(empresa);
  const moveType = tipo === 'cxc' ? 'out_invoice' : 'in_invoice';
  const domain = [
    ['move_type', '=', moveType],
    ['state', '=', 'posted'],
    ['payment_state', 'in', ['not_paid', 'partial']],
  ];
  if (companyId) domain.push(['company_id', '=', companyId]);
  const facturas = await odooCall(url, db, uid, apiKey, 'account.move', 'search_read',
    [domain], {
      // v8.27.76: + currency_id — hay CxP en USD (Sherwin, Lucas, Crown…) que se mostraban
      // como RD$ y subestimaban el total (~US$300k pendientes).
      fields: ['id', 'name', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_total', 'amount_residual', 'l10n_latam_document_number', 'payment_state', 'currency_id'],
      limit: 1000, order: 'invoice_date_due asc',
    });
  // v8.27.76: tasa USD→DOP del día (DOP es base, rate=1)
  let tasaUsd = null;
  try {
    const cur = await odooCall(url, db, uid, apiKey, 'res.currency', 'search_read',
      [[['name', '=', 'USD']]], { fields: ['rate'], limit: 1 });
    const rate = Number(cur?.[0]?.rate || 0);
    if (rate > 0) tasaUsd = Math.round((1 / rate) * 100) / 100;
  } catch (_) { /* sin tasa → factor 1 y se muestra la moneda igual */ }
  return (facturas || []).map(f => {
    const moneda = Array.isArray(f.currency_id) ? f.currency_id[1] : 'DOP';
    const factor = moneda === 'USD' && tasaUsd ? tasaUsd : 1;
    return {
      id: f.id,
      documento: f.name || '',
      ncf: f.l10n_latam_document_number || '',
      tercero: Array.isArray(f.partner_id) ? f.partner_id[1] : '',
      fecha: f.invoice_date || null,
      vence: f.invoice_date_due || f.invoice_date || null,
      moneda,            // 'DOP' | 'USD' | …
      tasaUsd: moneda === 'USD' ? tasaUsd : null,
      totalOriginal: Number(f.amount_total || 0),       // en la moneda de la factura
      pendienteOriginal: Number(f.amount_residual || 0),
      total: Number(f.amount_total || 0) * factor,      // en RD$ (para totales)
      pendiente: Number(f.amount_residual || 0) * factor,
      estadoPago: f.payment_state, // not_paid | partial
    };
  });
}

// v8.28.0: saldos EN LIBROS de las cuentas de liquidez (asset_cash) + tasa USD del
// día. Para el tab Flujo de Caja: se muestran como referencia — mientras los bancos
// sigan sin conciliar en Odoo, la disponibilidad real se captura a mano en el flujo.
export async function listarSaldosLiquidezOdoo(empresa) {
  const { url, db, uid, apiKey, companyId } = await odooConexionEmpresa(empresa);
  const domain = [['account_type', '=', 'asset_cash'], ['deprecated', '=', false]];
  if (companyId) domain.push(['company_id', '=', companyId]);
  const cuentas = await odooCall(url, db, uid, apiKey, 'account.account', 'search_read',
    [domain], { fields: ['id', 'code', 'name', 'currency_id'], limit: 200, order: 'code asc' });

  const saldoPorCuenta = new Map();
  if ((cuentas || []).length) {
    const grupos = await odooCall(url, db, uid, apiKey, 'account.move.line', 'read_group',
      [[['account_id', 'in', cuentas.map(c => c.id)], ['parent_state', '=', 'posted']], ['balance'], ['account_id']], {});
    for (const g of grupos || []) {
      if (Array.isArray(g.account_id)) saldoPorCuenta.set(g.account_id[0], Number(g.balance || 0));
    }
  }

  let tasaUsd = null;
  try {
    const cur = await odooCall(url, db, uid, apiKey, 'res.currency', 'search_read',
      [[['name', '=', 'USD']]], { fields: ['rate'], limit: 1 });
    const rate = Number(cur?.[0]?.rate || 0);
    if (rate > 0) tasaUsd = Math.round((1 / rate) * 100) / 100;
  } catch (_) { /* sin tasa → el cliente usa la última conocida */ }

  return {
    tasaUsd,
    cuentas: (cuentas || []).map(c => ({
      odooId: c.id,
      codigo: c.code || '',
      nombre: c.name || '',
      moneda: Array.isArray(c.currency_id) ? c.currency_id[1] : 'DOP',
      saldoLibrosRD: saldoPorCuenta.get(c.id) || 0, // balance siempre en moneda de la compañía (RD$)
    })).filter(c => c.saldoLibrosRD !== 0),
  };
}

// v8.27.50: cuentas analíticas (proyectos) de Odoo, read-only. Se usan para
// resolver el "número azul" (ej. ST-C5737, PG-C1269) al ID de la cuenta y armar
// el JSON de analytic_distribution que Odoo exige en la importación de facturas.
// En Odoo el identificador vive en `name` (a veces con prefijo "32004334: ST-C5321").
export async function listarCuentasAnaliticasOdoo() {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables de entorno de Odoo');
  }
  const uid = await odooAuthenticate(url, db, username, apiKey);
  const cuentas = await odooCall(url, db, uid, apiKey, 'account.analytic.account', 'search_read',
    [[]], { fields: ['id', 'name'], limit: 5000, order: 'name asc' });
  return (cuentas || []).map(c => ({ id: c.id, name: c.name || '' }));
}

// v8.27.51: productos de COMPRA (purchase_ok) activos, read-only. El export los usa
// para resolver el concepto al NOMBRE EXACTO del producto de Odoo (el match del import
// es case-sensitive y algunos tienen sufijo, ej. "Materiales Varios (copia)").
export async function listarProductosCompraOdoo() {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) throw new Error('Faltan variables de entorno de Odoo');
  const uid = await odooAuthenticate(url, db, username, apiKey);
  // v8.27.53: el name de producto es TRADUCIBLE. El mismo producto (id 70) se llama "Gas"
  // en en_US y "GENERICO - Gas" en es_DO. Traemos AMBOS idiomas y los devolvemos como
  // aliases (id repetido con distintos nombres) para que el resolver matchee el concepto
  // de la IA (en inglés) y el mapeo del usuario (en español) → el mismo id.
  const dom = [['purchase_ok', '=', true], ['active', '=', true]];
  const [en, es] = await Promise.all([
    odooCall(url, db, uid, apiKey, 'product.product', 'search_read', [dom],
      { fields: ['id', 'name'], limit: 3000, order: 'name asc', context: { lang: 'en_US' } }),
    odooCall(url, db, uid, apiKey, 'product.product', 'search_read', [dom],
      { fields: ['id', 'name'], limit: 3000, order: 'name asc', context: { lang: 'es_DO' } }),
  ]);
  const seen = new Set();
  const out = [];
  for (const p of [...(en || []), ...(es || [])]) {
    const nombre = p.name || '';
    const key = `${p.id}::${nombre.toLowerCase()}`;
    if (!nombre || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: p.id, name: nombre });
  }

  // v8.27.55: cuenta de gasto EFECTIVA por producto y por compañía. Odoo NO autocompleta
  // account_id al importar por CSV → la línea viola el check si va sin cuenta. Cuenta =
  // property_account_expense_id del producto (company-dependent) o, si no, la de su categoría
  // (property_account_expense_categ_id). Los ids de cuenta difieren por compañía.
  const ids = [...new Set((en || []).map(p => p.id))];
  const EMPRESAS = [{ key: 'super_techos', cid: 1 }, { key: 'prouco', cid: 2 }];
  const cuentas = {};       // { productId: { super_techos: accId, prouco: accId } }
  const cuentaDefault = {}; // { super_techos: accId, prouco: accId } (categoría "All / Saleable" = id 1)
  // v8.27.58: impuestos ITBIS de compra por compañía. El 18% es "precio incluido" → se manda
  // con price_unit=total y Odoo extrae el ITBIS por dentro (total exacto). Exento = 0%.
  const impuestos = {};     // { super_techos: {itbis18, exento}, prouco: {itbis18, exento} }
  for (const { key, cid } of EMPRESAS) {
    const cctx = { company_id: cid, allowed_company_ids: [cid] };
    const rows = ids.length
      ? await odooCall(url, db, uid, apiKey, 'product.product', 'read', [ids],
          { fields: ['id', 'property_account_expense_id', 'categ_id'], context: cctx })
      : [];
    const catIds = [...new Set((rows || []).map(r => (Array.isArray(r.categ_id) ? r.categ_id[0] : null)).filter(Boolean))];
    catIds.push(1); // categoría default "All / Saleable"
    const catRows = await odooCall(url, db, uid, apiKey, 'product.category', 'read', [[...new Set(catIds)]],
      { fields: ['id', 'property_account_expense_categ_id'], context: cctx });
    const catExp = {};
    for (const c of (catRows || [])) catExp[c.id] = Array.isArray(c.property_account_expense_categ_id) ? c.property_account_expense_categ_id[0] : null;
    cuentaDefault[key] = catExp[1] || null;
    for (const r of (rows || [])) {
      const prodExp = Array.isArray(r.property_account_expense_id) ? r.property_account_expense_id[0] : null;
      const catId = Array.isArray(r.categ_id) ? r.categ_id[0] : null;
      const acc = prodExp || (catId ? catExp[catId] : null) || null;
      if (!cuentas[r.id]) cuentas[r.id] = {};
      cuentas[r.id][key] = acc;
    }
    // v8.27.58: impuestos de compra por compañía (18% precio-incluido + Exento) por nombre.
    const tx = await odooCall(url, db, uid, apiKey, 'account.tax', 'search_read',
      [[['type_tax_use', '=', 'purchase'], ['company_id', '=', cid], ['name', 'in', ['18% ITBIS Incl. Compras', 'Exento ITBIS Compras']]]],
      { fields: ['id', 'name'], context: cctx });
    const porNombre = {};
    for (const t of (tx || [])) porNombre[t.name] = t.id;
    impuestos[key] = { itbis18: porNombre['18% ITBIS Incl. Compras'] || null, exento: porNombre['Exento ITBIS Compras'] || null };
  }
  return { productos: out, cuentas, cuentaDefault, impuestos };
}

// v8.27.51: busca proveedores por RNC (vat) para resolver el NOMBRE EXACTO en Odoo y
// evitar duplicados / fallos de match por nombre. Recibe array de RNC (dígitos).
export async function buscarProveedoresPorRncOdoo(rncs = []) {
  const digits = [...new Set((rncs || []).map(r => String(r || '').replace(/\D/g, '')).filter(Boolean))];
  if (digits.length === 0) return [];
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) throw new Error('Faltan variables de entorno de Odoo');
  const uid = await odooAuthenticate(url, db, username, apiKey);
  const partners = await odooCall(url, db, uid, apiKey, 'res.partner', 'search_read',
    [[['vat', 'in', digits]]],
    { fields: ['id', 'name', 'vat', 'supplier_rank'], limit: 2000 });
  return (partners || []).map(p => ({ id: p.id, name: p.name || '', vat: p.vat || '', supplier_rank: p.supplier_rank || 0 }));
}

// v8.27.57: adjunta la FOTO de una factura de gasto a su bill en Odoo (ir.attachment).
// Casa la factura por `ref` (= NCF, que se importó) + compañía. ESCRIBE en Odoo (autorizado
// solo para adjuntos). No duplica: si ya hay un adjunto con ese nombre, no lo repite.
export async function adjuntarFotoFacturaOdoo({ empresa, ref, base64, filename, mimetype }) {
  if (!ref) return { ok: false, error: 'sin ref (NCF)' };
  if (!base64) return { ok: false, error: 'sin imagen' };
  const { url, db, uid, apiKey, companyId } = await odooConexionEmpresa(empresa);
  const domain = [['move_type', '=', 'in_invoice'], ['ref', '=', ref]];
  if (companyId) domain.push(['company_id', '=', companyId]);
  const moves = await odooCall(url, db, uid, apiKey, 'account.move', 'search_read',
    [domain], { fields: ['id'], limit: 1, order: 'id desc' });
  if (!moves || moves.length === 0) return { ok: true, adjuntado: false, motivo: 'factura no encontrada en Odoo' };
  const moveId = moves[0].id;
  const nombre = filename || `${ref}.jpg`;
  const existentes = await odooCall(url, db, uid, apiKey, 'ir.attachment', 'search_read',
    [[['res_model', '=', 'account.move'], ['res_id', '=', moveId], ['name', '=', nombre]]],
    { fields: ['id'], limit: 1 });
  if (existentes && existentes.length > 0) return { ok: true, adjuntado: false, motivo: 'ya estaba adjunta', moveId };
  const attId = await odooCall(url, db, uid, apiKey, 'ir.attachment', 'create',
    [{ name: nombre, datas: base64, res_model: 'account.move', res_id: moveId, type: 'binary', mimetype: mimetype || 'image/jpeg' }]);
  return { ok: true, adjuntado: true, moveId, attachmentId: attId };
}

// v8.27.61: verifica que las facturas exportadas ENTRARON en Odoo. Casa por ref (=NCF) +
// compañía; devuelve por NCF si existe el bill, su estado, monto y si tiene foto adjunta.
// Read-only. items = [{ncf, empresa}].
export async function verificarFacturasEnOdoo(items = []) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) throw new Error('Faltan variables de entorno de Odoo');
  const uid = await odooAuthenticate(url, db, username, apiKey);

  const rncEmpresa = { super_techos: '130774331', prouco: '131515541' };
  const norm = (v) => String(v || '').replace(/\D/g, '');
  let companies = [];
  try { companies = await odooCall(url, db, uid, apiKey, 'res.company', 'search_read', [[]], { fields: ['id', 'vat'] }); } catch { /* sin filtro */ }
  const compId = (empresa) => { const m = (companies || []).find((c) => norm(c.vat) === rncEmpresa[empresa]); return m ? m.id : null; };

  const porEmpresa = {};
  for (const it of items) {
    const ncf = String(it?.ncf || '').trim();
    if (!ncf) continue;
    const emp = it?.empresa || '';
    (porEmpresa[emp] = porEmpresa[emp] || new Set()).add(ncf);
  }

  const resultado = {}; // ncf -> {found, moveId, name, state, montoOdoo, adjuntos}
  for (const [emp, refsSet] of Object.entries(porEmpresa)) {
    const refs = [...refsSet];
    const domain = [['move_type', '=', 'in_invoice'], ['ref', 'in', refs]];
    const cid = compId(emp);
    if (cid) domain.push(['company_id', '=', cid]);
    const moves = await odooCall(url, db, uid, apiKey, 'account.move', 'search_read',
      [domain], { fields: ['id', 'name', 'ref', 'state', 'amount_total'], order: 'id desc', limit: 2000 });
    const moveIds = (moves || []).map((mv) => mv.id);
    const attByMove = {};
    if (moveIds.length) {
      const atts = await odooCall(url, db, uid, apiKey, 'ir.attachment', 'search_read',
        [[['res_model', '=', 'account.move'], ['res_id', 'in', moveIds]]], { fields: ['res_id'], limit: 5000 });
      for (const a of (atts || [])) attByMove[a.res_id] = (attByMove[a.res_id] || 0) + 1;
    }
    const porRef = {};
    for (const mv of (moves || [])) { if (!porRef[mv.ref]) porRef[mv.ref] = mv; }
    for (const ncf of refs) {
      const mv = porRef[ncf];
      resultado[ncf] = mv
        ? { found: true, empresa: emp, moveId: mv.id, name: mv.name || '', state: mv.state, montoOdoo: Number(mv.amount_total || 0), adjuntos: attByMove[mv.id] || 0 }
        : { found: false, empresa: emp };
    }
  }
  return resultado;
}

// v8.27.63: valida el proveedor contra Odoo al capturar. Devuelve el partner que tiene ese
// RNC (porRnc) y los partners cuyo nombre se parece (porNombre). El modal cruza ambos para
// avisar/corregir cuando la IA lee mal el RNC o el nombre. Read-only.
export async function validarProveedorOdoo({ rnc, nombre } = {}) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) throw new Error('Faltan variables de entorno de Odoo');
  const uid = await odooAuthenticate(url, db, username, apiKey);
  const rncD = String(rnc || '').replace(/\D/g, '');
  const nom = String(nombre || '').trim();

  let porRnc = null;
  if (rncD) {
    const r = await odooCall(url, db, uid, apiKey, 'res.partner', 'search_read',
      [[['vat', '=', rncD]]], { fields: ['id', 'name', 'vat', 'supplier_rank'], limit: 5 });
    if (r && r.length) { r.sort((a, b) => (b.supplier_rank || 0) - (a.supplier_rank || 0)); porRnc = { id: r[0].id, name: r[0].name || '', vat: r[0].vat || '' }; }
  }

  let porNombre = [];
  if (nom.length >= 4) {
    const r = await odooCall(url, db, uid, apiKey, 'res.partner', 'search_read',
      [[['name', 'ilike', nom], ['supplier_rank', '>', 0]]], { fields: ['id', 'name', 'vat'], limit: 5 });
    porNombre = (r || []).map((p) => ({ id: p.id, name: p.name || '', vat: p.vat || '' }));
  }

  return { porRnc, porNombre };
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

// ============================================================
// v8.30.2: Resumen de actividad por usuario (tablero Carga y Actividad)
// SOLO LECTURA — cuenta quién creó qué en Odoo en el rango, usando el
// create_uid/create_date que Odoo guarda en todos los registros.
// ============================================================
export async function resumenActividadOdoo(desde) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) {
    throw new Error('Faltan variables de entorno de Odoo');
  }
  const uid = await odooAuthenticate(url, db, username, apiKey);

  const porUsuario = async (model, dom = []) => {
    try {
      const r = await odooCall(url, db, uid, apiKey, model, 'read_group',
        [[...dom, ['create_date', '>=', desde]], ['create_uid'], ['create_uid']], { lazy: false });
      const out = {};
      (r || []).forEach(x => { if (x.create_uid) out[x.create_uid[1]] = x.__count; });
      return out;
    } catch (e) { return { _error: String(e?.message || e).slice(0, 80) }; }
  };

  const [ocs, factProv, factCli, contactos, pagos, banco] = await Promise.all([
    porUsuario('purchase.order'),
    porUsuario('account.move', [['move_type', '=', 'in_invoice']]),
    porUsuario('account.move', [['move_type', '=', 'out_invoice']]),
    porUsuario('res.partner'),
    porUsuario('account.payment'),
    porUsuario('account.bank.statement.line'),
  ]);

  // Ciclo OC: borrador → confirmada (horas promedio)
  let cicloOcHoras = null;
  try {
    const rows = await odooCall(url, db, uid, apiKey, 'purchase.order', 'search_read',
      [[['create_date', '>=', desde], ['state', '=', 'purchase'], ['date_approve', '!=', false]]],
      { fields: ['create_date', 'date_approve'], limit: 300 });
    const difs = (rows || []).map(o => (new Date(o.date_approve + 'Z') - new Date(o.create_date + 'Z')) / 3600000).filter(h => h >= 0);
    if (difs.length) cicloOcHoras = difs.reduce((s, h) => s + h, 0) / difs.length;
  } catch (e) { /* opcional */ }

  // Cola: OCs en borrador ahora mismo
  let ocsEnBorrador = null;
  try {
    ocsEnBorrador = await odooCall(url, db, uid, apiKey, 'purchase.order', 'search_count', [[['state', '=', 'draft']]], {});
  } catch (e) { /* opcional */ }

  return { ocs, factProv, factCli, contactos, pagos, banco, cicloOcHoras, ocsEnBorrador };
}

// v8.31.0: estado de cotizaciones (sale.order) por referencia — para cerrar el
// proceso de levantamiento cuando la cotización sale ENVIADA en Odoo.
export async function estadoCotizacionesOdoo(refs) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey || !refs?.length) return {};
  const uid = await odooAuthenticate(url, db, username, apiKey);
  const rows = await odooCall(url, db, uid, apiKey, 'sale.order', 'search_read',
    [[['name', 'in', refs]]], { fields: ['name', 'state'] });
  const out = {};
  (rows || []).forEach(r => { out[r.name] = r.state; }); // draft | sent | sale | cancel
  return out;
}

// ============================================================
// v8.32.0: Analíticas ↔ proyectos — match por convención de nombre.
// La analítica se llama empezando por la referencia de la cot ORIGINAL
// (ST-C1234…). Devuelve, por referencia: la analítica que matchea y TODAS
// las cotizaciones (sale.order confirmadas o enviadas) que apuntan a esa
// analítica — la original y sus SUB-COTIZACIONES.
// ============================================================
export async function matchAnaliticasProyectos(referencias) {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey || !referencias?.length) return {};
  const uid = await odooAuthenticate(url, db, username, apiKey);

  // Todas las analíticas (una vez) → match por prefijo de nombre.
  const analiticas = await odooCall(url, db, uid, apiKey, 'account.analytic.account', 'search_read',
    [[]], { fields: ['id', 'name'], limit: 5000 });
  const porRef = {};
  const idsAnaliticas = [];
  referencias.forEach(ref => {
    const r = String(ref).trim().toUpperCase();
    const a = (analiticas || []).find(x => (x.name || '').trim().toUpperCase().startsWith(r));
    porRef[ref] = { analiticaId: a?.id || null, analiticaNombre: a?.name || null, cotizaciones: [] };
    if (a?.id) idsAnaliticas.push(a.id);
  });
  if (!idsAnaliticas.length) return porRef;

  // Cotizaciones (SO) que apuntan a esas analíticas — original + sub-cots.
  let sos = [];
  try {
    sos = await odooCall(url, db, uid, apiKey, 'sale.order', 'search_read',
      [[['analytic_account_id', 'in', idsAnaliticas], ['state', 'in', ['sent', 'sale']]]],
      { fields: ['name', 'amount_untaxed', 'amount_total', 'state', 'analytic_account_id'], limit: 2000 });
  } catch (e) {
    // instancias sin el campo en SO — devolvemos solo el match de analíticas
    return porRef;
  }
  Object.values(porRef).forEach(v => {
    if (!v.analiticaId) return;
    v.cotizaciones = (sos || []).filter(s => s.analytic_account_id && s.analytic_account_id[0] === v.analiticaId)
      .map(s => ({ ref: s.name, monto: s.amount_untaxed, montoConItbis: s.amount_total, estado: s.state }));
  });
  return porRef;
}

// ============================================================
// v8.39.0: ORDEN DE COMPRA en BORRADOR desde una cotización leída por la IA.
// Crea purchase.order state=draft (Lily la revisa/completa en Odoo antes de
// confirmar — nada se confirma solo). Proveedor: por RNC primero, luego por
// nombre; productos: match por similitud purchase_ok, y lo que no matchea va
// en las notas de la OC para que compras lo complete a mano.
// ============================================================
export async function crearOrdenCompraBorradorOdoo({ empresa, proveedorRnc, proveedorNombre, lineas = [], origin = '', notas = '' }) {
  const { url, db, uid, apiKey, companyId } = await odooConexionEmpresa(empresa);

  // 1 · Proveedor: RNC exacto → nombre ilike. Sin proveedor no hay OC.
  let partner = null;
  const rncDigits = String(proveedorRnc || '').replace(/\D/g, '');
  if (rncDigits) {
    const ps = await odooCall(url, db, uid, apiKey, 'res.partner', 'search_read',
      [[['vat', 'in', [rncDigits]]]], { fields: ['id', 'name'], limit: 1 });
    if (ps && ps.length) partner = ps[0];
  }
  if (!partner && proveedorNombre) {
    const ps = await odooCall(url, db, uid, apiKey, 'res.partner', 'search_read',
      [[['name', 'ilike', proveedorNombre], ['supplier_rank', '>', 0]]], { fields: ['id', 'name'], limit: 1 });
    if (ps && ps.length) partner = ps[0];
    if (!partner) {
      const ps2 = await odooCall(url, db, uid, apiKey, 'res.partner', 'search_read',
        [[['name', 'ilike', proveedorNombre]]], { fields: ['id', 'name'], limit: 1 });
      if (ps2 && ps2.length) partner = ps2[0];
    }
  }
  if (!partner) {
    return { ok: false, error: `Proveedor no encontrado en Odoo: "${proveedorNombre || proveedorRnc || '—'}". Créalo en Odoo (con su RNC) y reintenta.` };
  }

  // 2 · Productos: por cada línea, match ilike con las primeras palabras significativas.
  const sinMatch = [];
  const orderLines = [];
  for (const ln of lineas) {
    const desc = String(ln.descripcion || '').trim();
    if (!desc) continue;
    const palabras = desc.split(/\s+/).filter(w => w.length > 2).slice(0, 2).join('%');
    let prod = null;
    if (palabras) {
      const prods = await odooCall(url, db, uid, apiKey, 'product.product', 'search_read',
        [[['purchase_ok', '=', true], ['active', '=', true], ['name', 'ilike', palabras]]],
        { fields: ['id', 'name'], limit: 1 });
      if (prods && prods.length) prod = prods[0];
    }
    if (prod) {
      orderLines.push([0, 0, {
        product_id: prod.id, name: desc,
        product_qty: Number(ln.cantidad) > 0 ? Number(ln.cantidad) : 1,
        ...(Number(ln.precioUnitario) > 0 ? { price_unit: Number(ln.precioUnitario) } : {}),
      }]);
    } else {
      sinMatch.push(`${desc}${ln.cantidad ? ` (${ln.cantidad})` : ''}${ln.precioUnitario ? ` @ ${ln.precioUnitario}` : ''}`);
    }
  }
  if (orderLines.length === 0 && sinMatch.length === 0) {
    return { ok: false, error: 'La cotización no tiene líneas legibles.' };
  }

  // 3 · Crear la OC en borrador (state draft por defecto).
  const notasFinal = [notas, sinMatch.length ? `⚠ Renglones SIN producto en Odoo (agregar a mano):\n- ${sinMatch.join('\n- ')}` : '']
    .filter(Boolean).join('\n\n');
  const vals = {
    partner_id: partner.id,
    ...(companyId ? { company_id: companyId } : {}),
    ...(origin ? { origin } : {}),
    ...(notasFinal ? { notes: notasFinal } : {}),
    ...(orderLines.length ? { order_line: orderLines } : {}),
  };
  const ocId = await odooCall(url, db, uid, apiKey, 'purchase.order', 'create', [vals]);
  const oc = await odooCall(url, db, uid, apiKey, 'purchase.order', 'read', [[ocId]], { fields: ['name', 'state'] });
  return {
    ok: true, id: ocId, name: (oc && oc[0]?.name) || String(ocId), estado: (oc && oc[0]?.state) || 'draft',
    proveedor: partner.name, lineas: orderLines.length, sinMatch,
  };
}
