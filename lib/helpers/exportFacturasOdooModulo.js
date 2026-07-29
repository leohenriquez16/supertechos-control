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

// Mismas columnas que exportarFacturasOdooCSV + tipo_ncf. referencia = ncf o id.
function toCSV(facturas) {
  const headers = [
    'fecha_factura', 'empresa_receptora', 'tipo_ncf', 'proveedor_rnc', 'proveedor_nombre',
    'ncf', 'monto_total', 'subtotal', 'itbis', 'concepto', 'cuenta_gasto',
    'cuenta_analitica',
    'reembolsable', 'reembolsar_a', 'referencia_factura',
  ];
  const rows = facturas.map((f) => {
    const { subtotal, itbis } = desglosar(f);
    return [
      f.fecha || '', f.empresa || '', f.tipoNcf || '', f.rnc || '', f.proveedor || '',
      f.ncf || '', fmtN(f.monto), fmtN(subtotal), fmtN(itbis), f.concepto || '',
      f.cuentaGasto || '',
      f.cuentaAnalitica || '',
      f.reembolsable ? 'si' : 'no', f.reembolsable ? (f.creadoPorNombre || '') : '',
      f.ncf || f.id,
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
