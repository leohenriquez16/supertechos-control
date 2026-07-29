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
function toCSV(facturas) {
  const headers = [
    'move_type', 'company_id', 'invoice_date', 'partner_id',
    'l10n_latam_document_number', 'l10n_latam_document_type_id', 'currency_id',
    'invoice_line_ids/name', 'invoice_line_ids/price_unit', 'invoice_line_ids/tax_ids',
    'invoice_line_ids/account_id', 'invoice_line_ids/analytic_distribution',
    // informativas (no se importan): RNC del proveedor, ITBIS desglosado, referencia de la foto, reembolso
    'ref_proveedor_rnc', 'ref_itbis', 'ref_referencia_factura', 'ref_reembolsable',
  ];
  const rows = facturas.map((f) => {
    const { itbis } = desglosar(f);
    return [
      'in_invoice',
      NOMBRE_COMPANIA_ODOO[f.empresa] || '',
      f.fecha || '',
      f.proveedor || '',
      f.ncf || '',
      '', // l10n_latam_document_type_id → Odoo lo infiere del número de NCF
      (f.moneda || 'DOP'),
      f.concepto || '',
      fmtN(f.monto),
      '', // tax_ids → el contador asigna el ITBIS correcto (varía)
      f.cuentaGasto || '',
      f.cuentaAnalitica || '',
      f.rnc || '', fmtN(itbis), (f.ncf || f.id), (f.reembolsable ? 'si' : 'no'),
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
export async function generarZipFacturasOdoo({ facturas, onProgreso }) {
  if (!facturas || facturas.length === 0) throw new Error('No hay facturas para exportar.');
  const zip = new JSZip();

  const st = facturas.filter((f) => f.empresa === 'super_techos');
  const pg = facturas.filter((f) => f.empresa === 'prouco');
  const sin = facturas.filter((f) => f.empresa !== 'super_techos' && f.empresa !== 'prouco');
  if (st.length) zip.file('facturas-super-techos.csv', toCSV(st));
  if (pg.length) zip.file('facturas-prouco.csv', toCSV(pg));
  if (sin.length) zip.file('facturas-sin-empresa.csv', toCSV(sin));

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
  return { blob, counts: { superTechos: st.length, prouco: pg.length, sinEmpresa: sin.length, sinFoto } };
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
