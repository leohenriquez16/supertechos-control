'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Receipt, Loader2, Edit2, Trash2, Download, Eye, FileText, ArrowLeft, Check, Images, AlertTriangle, Paperclip } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagen } from '../../lib/imports';
import { NOMBRE_EMPRESA, detectarTipoNcf } from '../../lib/facturasOdooMap';
import { validarRNC, validarNCF } from '../../lib/validacionFiscal';

// v8.27.48: valida una factura antes de exportar. Devuelve lista de errores (vacía = ok).
function erroresFacturaOdoo(f) {
  const e = [];
  if (!f.empresa) e.push('sin empresa');
  if (!(Number(f.monto) > 0)) e.push('monto inválido');
  const rnc = (f.rnc || '').trim();
  if (!rnc) e.push('sin RNC'); else if (!validarRNC(rnc).ok) e.push('RNC inválido');
  const ncf = (f.ncf || '').trim();
  if (!ncf) e.push('sin NCF'); else if (!validarNCF(ncf).ok) e.push('NCF/e-CF inválido');
  return e;
}

const tieneRol = (p, r) => p?.roles?.includes(r);
import { generarZipFacturasOdoo, descargarBlob } from '../../lib/helpers/exportFacturasOdooModulo';
import ModalSubirFacturaOdoo from './ModalSubirFacturaOdoo';

const fmtRD = (n) => 'RD$' + new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
// v8.27.59: símbolo según la moneda de la factura (la lista mostraba RD$ fijo aun en USD/EUR).
const SIMBOLO_MONEDA = { DOP: 'RD$', USD: 'US$', EUR: '€' };
const fmtMoneda = (n, moneda) => (SIMBOLO_MONEDA[moneda] || 'RD$') + new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
// v8.27.43: PDF (subir desde computadora) sin comprimir
const esArchivoPdf = (f) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
const archivoADataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });

export default function VistaFacturasOdoo({ usuario, data, onVolver }) {
  const esAdmin = tieneRol(usuario, 'admin');
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(null); // null | 'nueva' | factura(editar)
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroReembolso, setFiltroReembolso] = useState('');
  const [soloMias, setSoloMias] = useState(false);
  const [exportando, setExportando] = useState(null); // {hechas, total} | null
  const [masiva, setMasiva] = useState(null); // v8.27.41: carga masiva {hechas, total, errores} | null
  const [adjuntando, setAdjuntando] = useState(null); // v8.27.57: adjuntar fotos a Odoo

  // v8.27.41: carga masiva — elige muchas fotos; la IA parsea cada una (incluida la
  // cuenta analítica escrita a mano en azul) y crea BORRADORES para revisar.
  const onCargaMasiva = async (fileList) => {
    const imgs = Array.from(fileList || []).filter((f) => f.type.startsWith('image/') || esArchivoPdf(f));
    if (imgs.length === 0) return;
    const MAX = 60;
    if (imgs.length > MAX) toast.warning(`Máximo ${MAX} fotos por carga; se toman las primeras ${MAX}.`);
    const lote = imgs.slice(0, MAX);
    setMasiva({ hechas: 0, total: lote.length, errores: 0 });
    let errores = 0;
    for (let i = 0; i < lote.length; i++) {
      try {
        const pdf = esArchivoPdf(lote[i]);
        const dataUrl = pdf ? await archivoADataUrl(lote[i]) : await comprimirImagen(lote[i]);
        let d = {};
        try {
          const res = await fetch('/api/caja-chica/parse-factura', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            // v8.27.52: pasar las categorías REALES para que la IA use sus IDs (gas, etc.)
            // y el mapeo a Odoo por categoría se aplique al exportar.
            body: JSON.stringify({ base64Data: dataUrl, categorias: data?.categoriasCajaChica || [], ...(pdf ? { mediaType: 'application/pdf' } : {}) }),
          });
          const json = await res.json();
          if (res.ok && json.datos) d = json.datos;
        } catch { /* si falla la IA, igual se crea el borrador con la foto */ }
        await db.crearFacturaOdoo({
          empresa: d.empresa_receptora || '',
          proveedor: d.proveedor || null,
          rnc: d.rnc || null,
          ncf: d.ncf || null,
          tipoNcf: detectarTipoNcf(d.ncf) || null,
          fecha: d.fecha || new Date().toISOString().split('T')[0],
          monto: d.monto_total || 0,
          itbis: d.itbis != null ? d.itbis : null,
          concepto: d.concepto || null,
          cuentaAnalitica: d.cuenta_analitica || null, // número azul leído por la IA
          moneda: d.moneda || 'DOP', // v8.27.42: moneda leída por la IA
          datosIA: d,
          estado: 'borrador',
          fotoDataUrl: dataUrl,
          creadoPorId: usuario.id, creadoPorNombre: usuario.nombre,
        });
      } catch (e) { errores++; }
      setMasiva({ hechas: i + 1, total: lote.length, errores });
    }
    setMasiva(null);
    toast.success(`Carga masiva: ${lote.length - errores} borrador(es) creado(s)${errores ? ` · ${errores} con error` : ''}. Revisa cada uno y confirma su cuenta analítica.`, { duration: 8000 });
    cargar();
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setFacturas(await db.listarFacturasOdoo({})); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // v8.27.59: por defecto se ocultan las EXPORTADAS de la vista principal (ya fueron a Odoo);
  // se ven solo si el filtro pide explícitamente ese estado.
  const visibles = facturas.filter((f) =>
    (filtroEstado ? f.estado === filtroEstado : f.estado !== 'exportada')
    && (!filtroEmpresa || f.empresa === filtroEmpresa)
    && (!filtroReembolso || (filtroReembolso === 'si' ? f.reembolsable : !f.reembolsable))
    && (!soloMias || f.creadoPorId === usuario.id));

  const totalMonto = visibles.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const nLista = facturas.filter((f) => f.estado === 'lista').length;

  const verFoto = async (f) => {
    if (!f.fotoPath) { toast.info('Esta factura no tiene foto.'); return; }
    try {
      const url = await db.obtenerUrlFirmadaFacturaOdoo(f.fotoPath, 3600);
      if (url) window.open(url, '_blank');
    } catch (e) { toast.error('No se pudo abrir la foto.'); }
  };

  const eliminar = async (f) => {
    if (!confirm(`¿Eliminar la factura de ${f.proveedor || 'proveedor'} (${f.ncf || 'sin NCF'})?`)) return;
    try { await db.eliminarFacturaOdoo(f.id); toast.success('Eliminada.'); cargar(); }
    catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  // v8.27.49: cambiar el estado a mano desde la lista (útil en pruebas: revertir
  // "exportada" → "lista" para volver a exportar). Solo admin.
  const cambiarEstado = async (f, estado) => {
    if (estado === f.estado) return;
    try { await db.actualizarFacturaOdoo(f.id, { estado }); toast.success(`Estado: ${estado}.`); cargar(); }
    catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  // Exporta las que están "lista" (o las filtradas si el filtro es explícito).
  const exportar = async () => {
    const aExportar = facturas.filter((f) => f.estado === 'lista');
    if (aExportar.length === 0) { toast.warning('No hay facturas en estado "lista" para exportar.'); return; }
    // v8.27.48: no exportar si alguna factura lista tiene error en un campo (RNC/NCF/datos).
    const conError = aExportar.filter((f) => erroresFacturaOdoo(f).length > 0);
    if (conError.length > 0) {
      toast.error(`No se puede exportar: ${conError.length} factura(s) con error (marcadas en rojo en la lista). Corrígelas y reintenta.`, { duration: 9000 });
      return;
    }
    setExportando({ hechas: 0, total: aExportar.length });
    try {
      // v8.27.51: traer de Odoo (read-only) cuentas analíticas + productos + proveedores
      // (por los RNC presentes) para resolver TODO a valores EXACTOS y que el import
      // auto-mapee y matchee. Si falla, se exporta con lo que haya (sin bloquear).
      let cuentasAnaliticas = [], productos = [], proveedores = [], cuentasProducto = {}, cuentaDefault = {}, impuestos = {};
      try {
        const rncs = [...new Set(aExportar.map((f) => (f.rnc || '')).filter(Boolean))];
        const r = await fetch('/api/odoo/import-refs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rncs }),
        });
        const j = await r.json();
        if (r.ok && j.ok) {
          cuentasAnaliticas = j.cuentas || []; productos = j.productos || []; proveedores = j.proveedores || [];
          cuentasProducto = j.cuentasProducto || {}; cuentaDefault = j.cuentaDefault || {}; impuestos = j.impuestos || {};
        } else toast.warning('No se pudieron leer las referencias de Odoo; el CSV puede requerir mapeo manual.', { duration: 7000 });
      } catch { toast.warning('No se pudieron leer las referencias de Odoo; el CSV puede requerir mapeo manual.', { duration: 7000 }); }

      const { blob, counts } = await generarZipFacturasOdoo({
        facturas: aExportar,
        categorias: data?.categoriasCajaChica || [],
        cuentasAnaliticas, productos, proveedores, cuentasProducto, cuentaDefault, impuestos,
        onProgreso: (hechas, total) => setExportando({ hechas, total }),
      });
      const hoy = new Date().toISOString().split('T')[0];
      descargarBlob(blob, `facturas-odoo-${hoy}.zip`);
      await db.marcarFacturasOdooExportadas(aExportar.map((f) => f.id));
      toast.success(`Exportadas ${aExportar.length} facturas (ST ${counts.superTechos} · PG ${counts.prouco}${counts.sinFoto ? ` · ${counts.sinFoto} sin foto` : ''}).`, { duration: 7000 });
      // v8.27.51: avisar de lo que Odoo no pudo resolver (va vacío, no bloquea el import).
      if (counts.sinProveedor && counts.sinProveedor.length) {
        toast.warning(`Proveedor no encontrado en Odoo por RNC (créalo o revísalo): ${counts.sinProveedor.slice(0, 8).join(', ')}${counts.sinProveedor.length > 8 ? '…' : ''}.`, { duration: 11000 });
      }
      if (counts.sinProducto && counts.sinProducto.length) {
        toast.warning(`Producto sin match exacto en Odoo (línea sin producto): ${counts.sinProducto.slice(0, 8).join(', ')}${counts.sinProducto.length > 8 ? '…' : ''}. Ajusta el mapeo por categoría.`, { duration: 11000 });
      }
      if (counts.sinAnalitica && counts.sinAnalitica.length) {
        toast.warning(`Sin cuenta analítica en Odoo (van sin proyecto): ${counts.sinAnalitica.join(', ')}.`, { duration: 10000 });
      }
      if (counts.sinCuenta && counts.sinCuenta.length) {
        toast.error(`Sin cuenta contable (Odoo la exige): ${counts.sinCuenta.slice(0, 8).join(', ')}${counts.sinCuenta.length > 8 ? '…' : ''}. Esas líneas fallarán al importar.`, { duration: 11000 });
      }
      cargar();
    } catch (e) {
      toast.error('Error exportando: ' + (e.message || e));
    } finally { setExportando(null); }
  };

  // v8.27.57: adjunta a Odoo la foto de cada factura YA exportada, casándola por NCF (ref).
  // Escribe en Odoo (solo ir.attachment). Corre después de importar el CSV.
  const blobABase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const adjuntarFotos = async () => {
    const conFoto = facturas.filter((f) => f.estado === 'exportada' && f.fotoPath && f.ncf);
    if (conFoto.length === 0) { toast.warning('No hay facturas exportadas con foto y NCF. Primero exporta e importa en Odoo.'); return; }
    if (!confirm(`Adjuntar ${conFoto.length} foto(s) a sus facturas en Odoo (casadas por NCF)?\n\nEsto escribe adjuntos en Odoo. Requiere que ya hayas importado el CSV.`)) return;
    setAdjuntando({ hechas: 0, total: conFoto.length });
    let adjuntadas = 0, noEnc = 0, err = 0;
    for (let i = 0; i < conFoto.length; i++) {
      const f = conFoto[i];
      try {
        const url = await db.obtenerUrlFirmadaFacturaOdoo(f.fotoPath, 600);
        const res = url && (await fetch(url));
        if (!res || !res.ok) { err++; }
        else {
          const blob = await res.blob();
          const dataUrl = await blobABase64(blob);
          const ext = (String(f.fotoPath).match(/\.([a-z0-9]+)$/i) || [null, 'jpg'])[1];
          const rr = await fetch('/api/odoo/adjuntar-foto', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresa: f.empresa, ref: f.ncf, base64: dataUrl, filename: `${(f.ncf || f.id)}.${ext}`, mimetype: blob.type || 'image/jpeg' }),
          });
          const j = await rr.json();
          if (j.ok && j.adjuntado) adjuntadas++;
          else if (j.ok && /no encontrada/.test(j.motivo || '')) noEnc++;
          else if (!j.ok) err++;
        }
      } catch (e) { err++; }
      setAdjuntando({ hechas: i + 1, total: conFoto.length });
    }
    setAdjuntando(null);
    toast.success(`Fotos a Odoo: ${adjuntadas} adjuntada(s)${noEnc ? ` · ${noEnc} sin factura en Odoo (¿ya importaste?)` : ''}${err ? ` · ${err} error` : ''}.`, { duration: 10000 });
  };

  const BADGE = {
    borrador: 'bg-zinc-800 text-zinc-400',
    lista: 'bg-green-900/40 text-green-400 border border-green-800',
    exportada: 'bg-blue-900/40 text-blue-400 border border-blue-800',
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Receipt className="w-6 h-6 text-red-500" /> Facturas</h1>
            <div className="text-[11px] text-zinc-500">Sube las facturas de gasto · se exportan a Odoo con su foto</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* v8.27.41: carga masiva — elegir todas las fotos de una */}
          <label className={`bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-black uppercase px-3 py-2.5 flex items-center gap-1 cursor-pointer ${masiva ? 'opacity-50 pointer-events-none' : ''}`} title="Sube varias facturas a la vez">
            <Images className="w-4 h-4" /> Carga masiva
            <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={!!masiva} onChange={(e) => { onCargaMasiva(e.target.files); e.target.value = ''; }} />
          </label>
          <button onClick={() => setModal('nueva')} disabled={!!masiva} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-black uppercase px-4 py-2.5 flex items-center gap-1">
            <Plus className="w-4 h-4" /> Subir factura
          </button>
        </div>
      </div>

      {/* v8.27.57: adjuntar a Odoo las fotos de las facturas ya exportadas (por NCF) */}
      {facturas.some((f) => f.estado === 'exportada' && f.fotoPath && f.ncf) && (
        <div className="mb-3">
          <button onClick={adjuntarFotos} disabled={!!adjuntando}
            className="bg-zinc-900 border border-blue-800 hover:bg-blue-950/40 disabled:opacity-50 text-blue-300 text-xs font-bold px-3 py-2 flex items-center gap-2">
            {adjuntando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            {adjuntando ? `Adjuntando fotos a Odoo… ${adjuntando.hechas}/${adjuntando.total}` : 'Adjuntar fotos a Odoo (después de importar)'}
          </button>
        </div>
      )}

      {/* v8.27.41: progreso de la carga masiva */}
      {masiva && (
        <div className="bg-zinc-900 border border-red-800 rounded-card p-3 mb-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-red-500 animate-spin shrink-0" />
          <div className="text-sm">
            Procesando fotos… <b>{masiva.hechas}/{masiva.total}</b>{masiva.errores ? ` · ${masiva.errores} con error` : ''}
            <div className="text-[10px] text-zinc-500">Se crean como borrador. No cierres esta pantalla.</div>
          </div>
        </div>
      )}

      {/* Resumen + acciones */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Facturas</div>
          <div className="text-xl font-black">{facturas.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Listas para Odoo</div>
          <div className="text-xl font-black text-green-400">{nLista}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] text-zinc-500 uppercase">Monto (visible)</div>
          <div className="text-lg font-black">{fmtRD(totalMonto)}</div>
        </div>
        <button onClick={exportar} disabled={!!exportando || nLista === 0}
          className="bg-zinc-900 border border-green-800 hover:bg-green-950/40 disabled:opacity-40 rounded-card p-3 text-left flex items-center gap-2">
          {exportando ? <Loader2 className="w-5 h-5 text-green-400 animate-spin" /> : <Download className="w-5 h-5 text-green-400" />}
          <div>
            <div className="text-[10px] text-zinc-500 uppercase">Exportar a Odoo</div>
            <div className="text-xs font-bold text-green-400">{exportando ? `${exportando.hechas}/${exportando.total} fotos…` : `ZIP (${nLista})`}</div>
          </div>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="bg-zinc-900 border border-zinc-800 text-xs px-3 py-2 text-white">
          <option value="">Activas (sin exportadas)</option>
          <option value="borrador">Borrador</option>
          <option value="lista">Lista</option>
          <option value="exportada">Exportada</option>
        </select>
        <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className="bg-zinc-900 border border-zinc-800 text-xs px-3 py-2 text-white">
          <option value="">Todas las empresas</option>
          <option value="super_techos">Super Techos</option>
          <option value="prouco">Prouco</option>
        </select>
        <select value={filtroReembolso} onChange={(e) => setFiltroReembolso(e.target.value)} className="bg-zinc-900 border border-zinc-800 text-xs px-3 py-2 text-white">
          <option value="">Reembolso: todas</option>
          <option value="si">Solo reembolsables</option>
          <option value="no">Solo registrar</option>
        </select>
        <button onClick={() => setSoloMias((v) => !v)} className={`text-xs px-3 py-2 border ${soloMias ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
          {soloMias ? '✓ Solo las mías' : 'Solo las mías'}
        </button>
      </div>

      {cargando ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : visibles.length === 0 ? (
        <div className="py-16 text-center text-zinc-600">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <div className="text-sm">No hay facturas todavía. Toca <b>“Subir factura”</b> para empezar.</div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-zinc-800 rounded-card">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-[10px] uppercase text-zinc-500">
              <tr>
                <th className="text-left p-2">Fecha</th>
                <th className="text-left p-2">Proveedor</th>
                <th className="text-left p-2">NCF</th>
                <th className="text-left p-2">Empresa</th>
                <th className="text-right p-2">Monto</th>
                <th className="text-center p-2">Estado</th>
                <th className="text-right p-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="p-2 whitespace-nowrap text-zinc-400">{f.fecha || '—'}</td>
                  <td className="p-2">
                    <div className="font-bold flex items-center gap-1">
                      {f.proveedor || <span className="text-zinc-600">Sin proveedor</span>}
                      {f.reembolsable && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-800">reembolso</span>}
                    </div>
                    <div className="text-[10px] text-zinc-500">{f.rnc || 'sin RNC'}{f.concepto ? ` · ${f.concepto}` : ''}{f.creadoPorNombre ? ` · por ${f.creadoPorNombre}` : ''}</div>
                  </td>
                  <td className="p-2 whitespace-nowrap text-[11px]">{f.ncf || '—'}{f.tipoNcf ? <span className="text-zinc-600"> ({f.tipoNcf})</span> : ''}</td>
                  <td className="p-2 whitespace-nowrap text-[11px]">{NOMBRE_EMPRESA[f.empresa] || <span className="text-amber-500">—</span>}</td>
                  <td className="p-2 text-right font-bold whitespace-nowrap">{fmtMoneda(f.monto, f.moneda)}{f.moneda && f.moneda !== 'DOP' ? <span className="text-[9px] text-yellow-500 ml-1">{f.moneda}</span> : ''}</td>
                  <td className="p-2 text-center">
                    {/* v8.27.48: si tiene error en un campo, badge rojo (y bloquea el export) */}
                    <div className="inline-flex items-center gap-1">
                      {erroresFacturaOdoo(f).length > 0 && (
                        <span title={erroresFacturaOdoo(f).join(' · ')} className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-700 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Error</span>
                      )}
                      {/* v8.27.49: admin puede cambiar el estado a mano (pruebas: revertir exportada → lista) */}
                      {esAdmin
                        ? <select value={f.estado} onChange={(e) => cambiarEstado(f, e.target.value)}
                            className="bg-zinc-950 border border-zinc-700 rounded text-[10px] px-1.5 py-0.5 text-white focus:border-red-600 outline-none cursor-pointer">
                            <option value="borrador">borrador</option>
                            <option value="lista">lista</option>
                            <option value="exportada">exportada</option>
                          </select>
                        : erroresFacturaOdoo(f).length === 0 && <span className={`text-[10px] px-2 py-0.5 rounded-full ${BADGE[f.estado] || BADGE.borrador}`}>{f.estado}</span>}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-1">
                      {f.fotoPath && <button onClick={() => verFoto(f)} title="Ver foto" className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"><Eye className="w-3.5 h-3.5" /></button>}
                      <button onClick={() => setModal(f)} title="Editar" className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => eliminar(f)} title="Eliminar" className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-zinc-600 mt-3">
        💡 Al exportar se descarga un ZIP con un CSV por empresa (formato que ya usa contabilidad) + la carpeta <b>fotos/</b> nombradas por NCF. Odoo importa las facturas; las fotos se adjuntan desde esa carpeta.
      </div>

      {modal && (
        <ModalSubirFacturaOdoo
          usuario={usuario}
          categorias={data?.categoriasCajaChica || []}
          facturaEditar={modal === 'nueva' ? null : modal}
          onCerrar={() => setModal(null)}
          onGuardado={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}
