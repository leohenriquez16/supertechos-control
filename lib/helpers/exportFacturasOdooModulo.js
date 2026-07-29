// Exporta las facturas del MÓDULO Facturas (Lily) a Odoo.
// Reusa el mismo formato de columnas que el export de caja chica
// (lib/helpers/exportOdooCSV.js) para que contabilidad reconozca el archivo,
// y arma un ZIP con las fotos nombradas por su referencia (ncf/id) para
// asociarlas a cada línea del CSV.
import JSZip from 'jszip';
import * as db from '../db';

const csvEscape = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fmtN = (n) => Number(n || 0).toFixed(2);
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

// v8.27.50: token canónico de un código de proyecto (ST-C5737 / PG-C1269).
// En Odoo el name puede venir con prefijo ("32004334: ST-C5321"); normalizamos
// a PREFIJO+DIGITOS para cruzar el "número azul" con la cuenta analítica de Odoo.
function canonTokenAnalitica(s) {
  const u = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = u.match(/(ST|PG)C?(\d+)/);
  return m ? `${m[1]}${m[2]}` : null;
}

// v8.27.53: resolver concepto → ID de producto de Odoo. Se usa el ID (product_id/.id)
// en el CSV porque el match por NOMBRE del import aplica el dominio de venta
// (sale_ok=True) y estos productos son purchase_ok/sale_ok=false → el nombre no matchea.
// El .id ignora dominio y nombre. Resolución: 1) exacto sin distinguir mayúsculas;
// 2) si no, único producto cuyo nombre contiene el texto. Devuelve el id o null.
export function construirResolverProducto(productos = []) {
  const exact = {}; // nombre en minúsculas -> id
  const all = [];
  for (const p of productos) {
    const n = String(p.name || '').trim();
    if (!n) continue;
    const low = n.toLowerCase();
    if (exact[low] == null) exact[low] = p.id;
    all.push({ low, id: p.id });
  }
  return (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const low = raw.toLowerCase();
    if (exact[low] != null) return exact[low];
    // Contains: puede haber varios aliases (en/es) del MISMO producto → dedupe por id.
    const ids = [...new Set(all.filter((p) => p.low.includes(low)).map((p) => p.id))];
    return ids.length === 1 ? ids[0] : null;
  };
}

// v8.27.51: resolver RNC → NOMBRE EXACTO del proveedor en Odoo (evita duplicados y
// fallos de match por nombre). Prefiere el partner con mayor supplier_rank.
export function construirResolverProveedor(proveedores = []) {
  const byVat = {};
  for (const p of proveedores) {
    const v = soloDigitos(p.vat);
    if (!v) continue;
    if (byVat[v] == null || (p.supplier_rank || 0) > (byVat[v].supplier_rank || 0)) byVat[v] = p;
  }
  return (rnc) => {
    const v = soloDigitos(rnc);
    return v && byVat[v] ? byVat[v].name : null;
  };
}

// Construye un resolver código→id a partir de las cuentas analíticas de Odoo
// ([{id, name}]). Devuelve { resolver(codigo)->id|null }.
export function construirResolverAnalitica(cuentas = []) {
  const byToken = {};
  const byName = {};
  for (const c of cuentas) {
    const t = canonTokenAnalitica(c.name);
    if (t && byToken[t] == null) byToken[t] = c.id;
    const k = String(c.name || '').trim().toLowerCase();
    if (k && byName[k] == null) byName[k] = c.id;
  }
  return (codigo) => {
    const raw = String(codigo || '').trim();
    if (!raw) return null;
    const t = canonTokenAnalitica(raw);
    if (t && byToken[t] != null) return byToken[t];
    const k = raw.toLowerCase();
    if (byName[k] != null) return byName[k];
    return null;
  };
}

// Deriva subtotal/itbis desde el monto total según el modo de ITBIS.
function desglosar(f) {
  const total = Number(f.monto) || 0;
  if (f.itbisModo === 'exento') return { subtotal: total, itbis: 0 };
  // Si se capturó/extrajo un ITBIS explícito y válido, respetarlo.
  const itbisManual = Number(f.itbis);
  if (!isNaN(itbisManual) && itbisManual > 0 && itbisManual < total) {
    return { subtotal: total - itbisManual, itbis: itbisManual };
  }
  const subtotal = total / 1.18;
  return { subtotal, itbis: total - subtotal };
}

// v8.27.46: encabezados = nombres TÉCNICOS de campos de Odoo (account.move + líneas con
// prefijo invoice_line_ids/) para que la IMPORTACIÓN AUTO-MAPEE sin intervención. Se usan
// nombres técnicos (no labels) porque son independientes del idioma. Las columnas ref_* son
// informativas — Odoo las ignora. Valores clave ya alineados: move_type=in_invoice,
// company_id con el nombre EXACTO de la compañía, currency_id (DOP/USD/EUR).
// tax_ids y l10n_latam_document_type_id se dejan vacíos a propósito: el ITBIS tiene varias
// variantes (Compras / al Costo) y el tipo de NCF Odoo lo infiere del número — los ajusta
// contabilidad. price_unit va con el TOTAL (sin impuesto separado por ahora).
const NOMBRE_COMPANIA_ODOO = { super_techos: 'LH Super Techos, SRL', prouco: 'Prouco Group Dominicana' };
// v8.27.48: mapeo por categoría (catPorId) → producto/cuenta/impuesto EXACTOS de Odoo.
// v8.27.51: todo se resuelve al VALOR EXACTO de Odoo (read-only) para que el import
// auto-mapee y matchee sin trabajo manual:
//  - partner_id  = nombre EXACTO del proveedor (resuelto por RNC)
//  - product_id  = nombre EXACTO del producto (resuelto del mapeo/concepto; case-insensitive)
//  - analytic_distribution = JSON {"<id>":100} (resuelto del "número azul")
// Lo que no se resuelve se deja VACÍO (no bloquea el import) y se reporta en `sin`.
function toCSV(facturas, catPorId = {}, maps = {}) {
  const { resolverAnalitica, resolverProducto, resolverProveedor, sin } = maps;
  const headers = [
    'move_type', 'company_id', 'invoice_date', 'partner_id',
    'l10n_latam_document_number', 'l10n_latam_document_type_id', 'currency_id',
    // product_id/.id (ID de Odoo) — el match por nombre falla por el dominio de venta;
    // por .id matchea directo y Odoo autocompleta cuenta e ITBIS del producto.
    'invoice_line_ids/product_id/.id', 'invoice_line_ids/name',
    'invoice_line_ids/price_unit', 'invoice_line_ids/tax_ids',
    'invoice_line_ids/account_id', 'invoice_line_ids/analytic_distribution',
    // informativas (no se importan): RNC del proveedor, ITBIS desglosado, referencia de la foto, reembolso
    'ref_proveedor_rnc', 'ref_itbis', 'ref_referencia_factura', 'ref_reembolsable',
  ];
  const rows = facturas.map((f) => {
    const { itbis } = desglosar(f);
    // v8.27.48: mapeo por categoría detectada por la IA (si existe). Override opcional del
    // producto/cuenta/impuesto; si vacío, se usa el concepto de la IA como pista.
    const cat = catPorId[f.datosIA?.categoria_sugerida] || null;
    const impuesto = (cat?.odooImpuesto || '').trim() || '';

    // Proveedor: nombre EXACTO de Odoo resuelto por RNC (si no, se deja el capturado y se reporta).
    let proveedor = '';
    const nombreOdoo = resolverProveedor ? resolverProveedor(f.rnc) : null;
    if (nombreOdoo) proveedor = nombreOdoo;
    else { proveedor = f.proveedor || ''; if (sin && (f.rnc || '').trim()) sin.proveedor.add(`${f.proveedor || 's/nombre'} (${f.rnc || 's/RNC'})`); }

    // Producto: se resuelve al ID de Odoo. Prioridad: mapeo por categoría (nombre exacto
    // puesto por el usuario) → concepto de la IA. Vacío si nada resuelve (no bloquea) y se
    // reporta. Se usa el .id porque el match por nombre falla (dominio de venta de Odoo).
    const mapeadoProducto = (cat?.odooProducto || '').trim();
    const conceptoProducto = (f.concepto || '').trim();
    let productoId = null;
    if (mapeadoProducto && resolverProducto) productoId = resolverProducto(mapeadoProducto);
    if (productoId == null && conceptoProducto && resolverProducto) productoId = resolverProducto(conceptoProducto);
    if (productoId == null && (mapeadoProducto || conceptoProducto) && sin) sin.producto.add(mapeadoProducto || conceptoProducto);
    const producto = productoId != null ? String(productoId) : '';
    // Cuenta contable: solo el valor EXACTO del mapeo por categoría (los códigos de cuenta
    // son únicos). Si hay producto, Odoo la autocompleta; por eso vacío es aceptable.
    const cuenta = (cat?.odooCuenta || '').trim();

    // Analítica: JSON {"<id>":100}. Vacío si no resuelve (no bloquea) y se reporta.
    const codigoAnalitica = (f.cuentaAnalitica || '').trim();
    let analiticaJson = '';
    if (codigoAnalitica) {
      const id = resolverAnalitica ? resolverAnalitica(codigoAnalitica) : null;
      if (id != null) analiticaJson = JSON.stringify({ [String(id)]: 100 });
      else if (sin) sin.analitica.add(codigoAnalitica);
    }
    return [
      'in_invoice',
      NOMBRE_COMPANIA_ODOO[f.empresa] || '',
      f.fecha || '',
      proveedor,          // partner_id (nombre EXACTO de Odoo, resuelto por RNC)
      f.ncf || '',
      '', // l10n_latam_document_type_id → Odoo lo infiere del número de NCF
      (f.moneda || 'DOP'),
      producto,           // product_id (nombre EXACTO de Odoo; vacío si no resuelve)
      f.concepto || '',   // name (etiqueta de la línea)
      fmtN(f.monto),
      impuesto,           // tax_ids (del mapeo por categoría; vacío = lo pone el producto/contador)
      cuenta,             // account_id (del mapeo; vacío = lo pone el producto/contador)
      analiticaJson,      // analytic_distribution (JSON con el id de Odoo)
      soloDigitos(f.rnc), fmtN(itbis), (f.ncf || f.id), (f.reembolsable ? 'si' : 'no'),
    ].map(csvEscape).join(',');
  });
  return '﻿' + headers.join(',') + '\n' + rows.join('\n') + '\n';
}

function extDePath(path) {
  const m = (path || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'jpg';
}
// Nombre de archivo de foto seguro y único (por si dos facturas comparten NCF vacío).
function nombreFoto(f) {
  const base = (f.ncf || f.id || 'factura').replace(/[^\w.-]/g, '_');
  return `${base}.${extDePath(f.fotoPath)}`;
}

// Genera el ZIP: CSV por empresa + carpeta fotos/. onProgreso(hechas, total).
// v8.27.51: refs de Odoo (read-only) para resolver a valores EXACTOS:
//   cuentasAnaliticas/productos = [{id, name}], proveedores = [{id, name, vat, supplier_rank}].
export async function generarZipFacturasOdoo({ facturas, categorias = [], cuentasAnaliticas = [], productos = [], proveedores = [], onProgreso }) {
  if (!facturas || facturas.length === 0) throw new Error('No hay facturas para exportar.');
  const zip = new JSZip();
  // v8.27.48: índice de categorías por id para el mapeo Odoo (producto/cuenta/impuesto).
  const catPorId = {};
  (categorias || []).forEach((c) => { catPorId[c.id] = c; });
  // v8.27.51: resolvers + reporte de no resueltos (por tipo).
  const maps = {
    resolverAnalitica: construirResolverAnalitica(cuentasAnaliticas || []),
    resolverProducto: construirResolverProducto(productos || []),
    resolverProveedor: construirResolverProveedor(proveedores || []),
    sin: { analitica: new Set(), producto: new Set(), proveedor: new Set() },
  };

  const st = facturas.filter((f) => f.empresa === 'super_techos');
  const pg = facturas.filter((f) => f.empresa === 'prouco');
  const sin = facturas.filter((f) => f.empresa !== 'super_techos' && f.empresa !== 'prouco');
  if (st.length) zip.file('facturas-super-techos.csv', toCSV(st, catPorId, maps));
  if (pg.length) zip.file('facturas-prouco.csv', toCSV(pg, catPorId, maps));
  if (sin.length) zip.file('facturas-sin-empresa.csv', toCSV(sin, catPorId, maps));

  const fotosDir = zip.folder('fotos');
  let hechas = 0, sinFoto = 0;
  const total = facturas.length;
  const LOTE = 5;
  for (let i = 0; i < facturas.length; i += LOTE) {
    await Promise.all(facturas.slice(i, i + LOTE).map(async (f) => {
      try {
        if (!f.fotoPath) { sinFoto++; return; }
        const url = await db.obtenerUrlFirmadaFacturaOdoo(f.fotoPath, 600);
        const res = url && (await fetch(url));
        if (res && res.ok) fotosDir.file(nombreFoto(f), await res.blob());
        else sinFoto++;
      } catch { sinFoto++; }
      finally { hechas++; onProgreso?.(hechas, total); }
    }));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    counts: {
      superTechos: st.length, prouco: pg.length, sinEmpresa: sin.length, sinFoto,
      sinAnalitica: Array.from(maps.sin.analitica),
      sinProducto: Array.from(maps.sin.producto),
      sinProveedor: Array.from(maps.sin.proveedor),
    },
  };
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
