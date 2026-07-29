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
// v8.27.50: proveedor se matchea por RNC (partner_id/vat) — evita duplicados cuando el
// nombre capturado difiere del de Odoo. analytic_distribution va como JSON {"<id>":100},
// resolviendo el "número azul" al id de la cuenta analítica de Odoo (resolverAnalitica).
function toCSV(facturas, catPorId = {}, resolverAnalitica = null, sinAnalitica = null) {
  const headers = [
    'move_type', 'company_id', 'invoice_date', 'partner_id/vat',
    'l10n_latam_document_number', 'l10n_latam_document_type_id', 'currency_id',
    // v8.27.47: product_id (por nombre) — Odoo reconoce el producto existente (Gasoil, Gas,
    // Materiales Varios…) y autocompleta cuenta e ITBIS. name = misma etiqueta.
    'invoice_line_ids/product_id', 'invoice_line_ids/name',
    'invoice_line_ids/price_unit', 'invoice_line_ids/tax_ids',
    'invoice_line_ids/account_id', 'invoice_line_ids/analytic_distribution',
    // informativas (no se importan): nombre del proveedor, ITBIS desglosado, referencia de la foto, reembolso
    'ref_proveedor_nombre', 'ref_itbis', 'ref_referencia_factura', 'ref_reembolsable',
  ];
  const rows = facturas.map((f) => {
    const { itbis } = desglosar(f);
    // v8.27.48: mapeo por categoría detectada por la IA (si existe). Override opcional del
    // producto (ej. "Materiales Varios (copia)"); si vacío, usa el concepto de la IA.
    const cat = catPorId[f.datosIA?.categoria_sugerida] || null;
    const producto = (cat?.odooProducto || '').trim() || f.concepto || '';
    const cuenta = (cat?.odooCuenta || '').trim() || f.cuentaGasto || '';
    const impuesto = (cat?.odooImpuesto || '').trim() || '';
    // v8.27.50: analytic_distribution = JSON {"<id cuenta analítica>": 100}. Si no se pudo
    // resolver el código con Odoo, se deja vacío (Odoo importa igual) y se registra el faltante.
    const codigoAnalitica = (f.cuentaAnalitica || '').trim();
    let analiticaJson = '';
    if (codigoAnalitica) {
      const id = resolverAnalitica ? resolverAnalitica(codigoAnalitica) : null;
      if (id != null) analiticaJson = JSON.stringify({ [String(id)]: 100 });
      else if (sinAnalitica) sinAnalitica.add(codigoAnalitica);
    }
    return [
      'in_invoice',
      NOMBRE_COMPANIA_ODOO[f.empresa] || '',
      f.fecha || '',
      soloDigitos(f.rnc),   // partner_id/vat → Odoo encuentra el proveedor por RNC
      f.ncf || '',
      '', // l10n_latam_document_type_id → Odoo lo infiere del número de NCF
      (f.moneda || 'DOP'),
      producto,           // product_id (nombre exacto de Odoo, del mapeo o del concepto)
      f.concepto || '',   // name (etiqueta de la línea)
      fmtN(f.monto),
      impuesto,           // tax_ids (del mapeo por categoría; vacío = lo pone el contador/producto)
      cuenta,             // account_id (del mapeo o cuenta_gasto)
      analiticaJson,      // analytic_distribution (JSON con el id de Odoo)
      f.proveedor || '', fmtN(itbis), (f.ncf || f.id), (f.reembolsable ? 'si' : 'no'),
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
// v8.27.50: cuentasAnaliticas = [{id, name}] de Odoo (read-only) para resolver el
// "número azul" al id y armar analytic_distribution (JSON) que Odoo exige.
export async function generarZipFacturasOdoo({ facturas, categorias = [], cuentasAnaliticas = [], onProgreso }) {
  if (!facturas || facturas.length === 0) throw new Error('No hay facturas para exportar.');
  const zip = new JSZip();
  // v8.27.48: índice de categorías por id para el mapeo Odoo (producto/cuenta/impuesto).
  const catPorId = {};
  (categorias || []).forEach((c) => { catPorId[c.id] = c; });
  // v8.27.50: resolver de cuentas analíticas + set de códigos que no se pudieron resolver.
  const resolverAnalitica = construirResolverAnalitica(cuentasAnaliticas || []);
  const sinAnalitica = new Set();

  const st = facturas.filter((f) => f.empresa === 'super_techos');
  const pg = facturas.filter((f) => f.empresa === 'prouco');
  const sin = facturas.filter((f) => f.empresa !== 'super_techos' && f.empresa !== 'prouco');
  if (st.length) zip.file('facturas-super-techos.csv', toCSV(st, catPorId, resolverAnalitica, sinAnalitica));
  if (pg.length) zip.file('facturas-prouco.csv', toCSV(pg, catPorId, resolverAnalitica, sinAnalitica));
  if (sin.length) zip.file('facturas-sin-empresa.csv', toCSV(sin, catPorId, resolverAnalitica, sinAnalitica));

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
  return { blob, counts: { superTechos: st.length, prouco: pg.length, sinEmpresa: sin.length, sinFoto, sinAnalitica: Array.from(sinAnalitica) } };
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
