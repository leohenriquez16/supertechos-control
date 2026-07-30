'use client';

import React, { useState } from 'react';
import { Camera, Loader2, X, Sparkles, AlertTriangle, Check, FileText } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagen } from '../../lib/imports';
import Campo from '../common/Campo';
import Input from '../common/Input';
import { validarRNC, validarNCF } from '../../lib/validacionFiscal';
import { TIPOS_NCF, detectarTipoNcf } from '../../lib/facturasOdooMap';

// v8.27.43: lee un archivo (PDF) como dataURL sin comprimir (los PDF no pasan por canvas).
const archivoADataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});
const esArchivoPdf = (file) => !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));

// Modal para que Lily suba una factura de gasto (para exportar a Odoo).
// Flujo: foto/PDF → (comprime si es imagen) → /api/caja-chica/parse-factura → revisa → guarda.
export default function ModalSubirFacturaOdoo({ usuario, categorias = [], facturaEditar = null, revisando = false, onCerrar, onGuardado }) {
  const editando = !!facturaEditar;
  const [paso, setPaso] = useState(editando ? 'confirmar' : 'foto'); // foto | revisando | confirmar | guardando
  const [fotoData, setFotoData] = useState(null); // dataURL nueva (si se sube/cambia)
  const [esPdf, setEsPdf] = useState(false); // v8.27.43: el archivo subido es PDF
  const [errorAI, setErrorAI] = useState(null);
  const [datosIA, setDatosIA] = useState(facturaEditar?.datosIA || null);
  const [advertencias, setAdvertencias] = useState([]);
  const [datos, setDatos] = useState({
    empresa: facturaEditar?.empresa || '',
    fecha: facturaEditar?.fecha || new Date().toISOString().split('T')[0],
    proveedor: facturaEditar?.proveedor || '',
    rnc: facturaEditar?.rnc || '',
    tipoNcf: facturaEditar?.tipoNcf || '',
    ncf: facturaEditar?.ncf || '',
    monto: facturaEditar?.monto != null ? String(facturaEditar.monto) : '',
    itbisModo: facturaEditar?.itbisModo || 'incluido',
    itbis: facturaEditar?.itbis != null ? String(facturaEditar.itbis) : '',
    concepto: facturaEditar?.concepto || '',
    cuentaAnalitica: facturaEditar?.cuentaAnalitica || '', // v8.27.40: número azul = proyecto para Odoo
    moneda: facturaEditar?.moneda || 'DOP', // v8.27.42: DOP | USD | EUR
    reembolsable: facturaEditar?.reembolsable || false,
  });

  // v8.27.44: parseo con IA reutilizable (para subir y para "volver a leer").
  const procesarConIA = async (dataUrl, pdf) => {
    setErrorAI(null);
    setPaso('revisando');
    try {
      const res = await fetch('/api/caja-chica/parse-factura', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // v8.27.52: pasar las categorías REALES para que la IA use sus IDs (gas, etc.).
        body: JSON.stringify({ base64Data: dataUrl, categorias: categorias || [], ...(pdf ? { mediaType: 'application/pdf' } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) { setErrorAI(json.error || 'Error procesando la imagen'); setPaso('confirmar'); return; }
      const d = json.datos || {};
      setDatosIA(d);
      setAdvertencias(d.advertencias || []);
      setDatos((prev) => ({
        ...prev,
        empresa: d.empresa_receptora || prev.empresa,
        fecha: d.fecha || prev.fecha,
        proveedor: d.proveedor || prev.proveedor,
        rnc: d.rnc || prev.rnc,
        ncf: d.ncf || prev.ncf,
        tipoNcf: detectarTipoNcf(d.ncf) || prev.tipoNcf,
        monto: d.monto_total != null ? String(d.monto_total) : prev.monto,
        itbis: d.itbis != null ? String(d.itbis) : prev.itbis,
        concepto: d.concepto || prev.concepto,
        cuentaAnalitica: d.cuenta_analitica || prev.cuentaAnalitica, // v8.27.41: número azul leído por la IA
        moneda: d.moneda || prev.moneda, // v8.27.42: moneda leída por la IA
      }));
      setPaso('confirmar');
    } catch (e) {
      setErrorAI(e.message || String(e));
      setPaso('confirmar');
    }
  };

  const onFile = async (file) => {
    if (!file) return;
    const pdf = esArchivoPdf(file);
    setEsPdf(pdf);
    try {
      const dataUrl = pdf ? await archivoADataUrl(file) : await comprimirImagen(file);
      setFotoData(dataUrl);
      await procesarConIA(dataUrl, pdf);
    } catch (e) { setErrorAI(e.message || String(e)); setPaso('confirmar'); }
  };

  // v8.27.44: re-leer la MISMA foto/PDF con IA (cuando leyó mal un campo). Rápido, sin re-subir.
  const reLeerConIA = async () => {
    if (fotoData) await procesarConIA(fotoData, esPdf);
    else setPaso('foto'); // sin foto (edición manual) → ir a subir una
  };

  const guardar = async () => {
    const monto = parseFloat(datos.monto);
    if (!datos.empresa) { toast.warning('Elige la empresa (Super Techos o Prouco).'); return; }
    if (!monto || monto <= 0) { toast.warning('Ingresa un monto válido.'); return; }
    const rncTxt = (datos.rnc || '').trim();
    if (rncTxt) { const v = validarRNC(rncTxt); if (!v.ok) { toast.warning('RNC inválido: ' + v.mensaje); return; } }
    const ncfTxt = (datos.ncf || '').trim();
    if (ncfTxt) { const v = validarNCF(ncfTxt); if (!v.ok) { toast.warning('NCF/e-CF inválido: ' + v.mensaje); return; } }
    // v8.27.40: cuenta analítica NO es obligatoria, pero si va vacía se avisa (no bloquea).
    if (!(datos.cuentaAnalitica || '').trim()) {
      if (!confirm('⚠️ Esta factura no tiene CUENTA ANALÍTICA (proyecto). Irá a Odoo sin obra asignada.\n\n¿Guardar así de todos modos?')) return;
    }
    setPaso('guardando');
    const payload = {
      empresa: datos.empresa, proveedor: datos.proveedor || null, rnc: datos.rnc || null,
      tipoNcf: datos.tipoNcf || null, ncf: datos.ncf || null, fecha: datos.fecha,
      concepto: datos.concepto || null, monto, itbisModo: datos.itbisModo,
      cuentaAnalitica: datos.cuentaAnalitica || null, // v8.27.40
      moneda: datos.moneda || 'DOP', // v8.27.42
      itbis: datos.itbis !== '' ? Number(datos.itbis) : null,
      reembolsable: datos.reembolsable,
      datosIA, estado: 'lista',
    };
    try {
      if (editando) {
        await db.actualizarFacturaOdoo(facturaEditar.id, { ...payload, ...(fotoData ? { fotoDataUrl: fotoData } : {}) });
      } else {
        await db.crearFacturaOdoo({ ...payload, fotoDataUrl: fotoData, creadoPorId: usuario.id, creadoPorNombre: usuario.nombre });
      }
      toast.success('Factura guardada.');
      onGuardado();
    } catch (e) {
      toast.error('Error guardando: ' + (e.message || e));
      setPaso('confirmar');
    }
  };

  return (
    // v8.27.45: items-start (no items-center) para que el scroll llegue bien al fondo
    // cuando el formulario es más alto que la pantalla (bug de flexbox+overflow).
    <div className="fixed inset-0 bg-black/85 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-4 my-8">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">{editando ? 'Editar factura' : 'Subir factura'}</div>
            <div className="text-sm font-bold mt-1">Facturas para Odoo</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {paso === 'foto' && (
          <div className="space-y-3">
            <div className="text-[10px] text-zinc-500">Toma una foto clara de la factura. La IA extrae proveedor, RNC, NCF, fecha y monto automáticamente.</div>
            <div className="relative">
              <input type="file" accept="image/*,application/pdf" onChange={(e) => onFile(e.target.files?.[0])} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-zinc-700 hover:border-red-600 p-8 text-center transition">
                <Camera className="w-10 h-10 text-zinc-500 mx-auto mb-2" />
                <div className="text-sm font-bold">Toca para subir factura</div>
                <div className="text-[10px] text-zinc-500 mt-1">desde cámara o galería</div>
              </div>
            </div>
            <button onClick={() => setPaso('confirmar')} type="button" className="w-full text-[11px] text-zinc-500 hover:text-yellow-400 underline">
              Llenar manualmente sin foto
            </button>
          </div>
        )}

        {paso === 'revisando' && (
          <div className="space-y-3 py-6 text-center">
            {fotoData && (esPdf
              ? <div className="max-h-48 mx-auto border border-zinc-800 bg-zinc-950 p-4 flex items-center justify-center gap-2 text-zinc-300"><FileText className="w-6 h-6 text-red-400" /> PDF cargado</div>
              : <img src={fotoData} alt="" className="max-h-48 mx-auto border border-zinc-800" />)}
            <div className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              <span className="text-zinc-400">Analizando con IA...</span>
              <Sparkles className="w-3 h-3 text-yellow-400" />
            </div>
            <button onClick={() => setPaso('confirmar')} type="button" className="text-[10px] text-zinc-500 hover:text-yellow-400 underline">¿Tarda? Llenar manualmente</button>
          </div>
        )}

        {paso === 'confirmar' && (
          <div className="space-y-3">
            {fotoData && (
              <div className="relative">
                {esPdf
                  ? <div className="max-h-32 mx-auto border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-center gap-2 text-zinc-300 text-sm"><FileText className="w-5 h-5 text-red-400" /> PDF cargado</div>
                  : <img src={fotoData} alt="" className="max-h-32 mx-auto border border-zinc-800" />}
                <button onClick={() => { setPaso('foto'); setFotoData(null); setDatosIA(null); setEsPdf(false); }} className="absolute top-1 right-1 bg-black/70 text-white p-1 text-[10px]">Cambiar</button>
              </div>
            )}
            {/* v8.27.44: si la IA leyó mal un campo (ej. e-NCF), re-leer la misma foto o re-tomarla */}
            {fotoData && (
              <div className="flex gap-2">
                <button type="button" onClick={reLeerConIA} className="flex-1 border border-zinc-700 hover:border-red-600 text-zinc-300 text-[11px] font-bold py-1.5 flex items-center justify-center gap-1"><Sparkles className="w-3 h-3 text-yellow-400" /> Volver a leer con IA</button>
                <button type="button" onClick={() => { setPaso('foto'); setFotoData(null); setDatosIA(null); setEsPdf(false); }} className="flex-1 border border-zinc-700 hover:border-red-600 text-zinc-300 text-[11px] font-bold py-1.5 flex items-center justify-center gap-1"><Camera className="w-3 h-3" /> Re-tomar foto</button>
              </div>
            )}
            {editando && !fotoData && facturaEditar?.fotoPath && (
              <div className="text-[10px] text-zinc-500 text-center">📎 Foto guardada. Sube una nueva solo si quieres reemplazarla.
                <label className="ml-1 underline text-red-400 cursor-pointer">cambiar<input type="file" accept="image/*,application/pdf" onChange={(e) => onFile(e.target.files?.[0])} className="hidden" /></label>
              </div>
            )}
            {errorAI && (
              <div className="bg-yellow-900/20 border border-yellow-800 p-2 text-[10px] text-yellow-300 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /><span>La IA no pudo leer la imagen ({errorAI}). Llena los datos a mano.</span>
              </div>
            )}
            {!errorAI && datosIA && !editando && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] flex items-start gap-2">
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-yellow-400" />
                <div className="flex-1">
                  <div className="text-zinc-400">Datos extraídos por IA{datosIA.confianza ? <> · confianza <b className={datosIA.confianza === 'alta' ? 'text-green-400' : datosIA.confianza === 'media' ? 'text-yellow-400' : 'text-red-400'}>{datosIA.confianza}</b></> : ''}</div>
                  {advertencias.length > 0 && <div className="text-yellow-400 mt-1">⚠️ {advertencias.join(' · ')}</div>}
                  <div className="text-zinc-500 mt-1">Revisa y corrige si hace falta.</div>
                </div>
              </div>
            )}

            <Campo label="Empresa *">
              <select value={datos.empresa} onChange={(e) => setDatos({ ...datos, empresa: e.target.value })}
                className={`w-full bg-zinc-950 border-2 outline-none px-3 py-2 text-white text-sm ${datos.empresa ? 'border-zinc-800 focus:border-red-600' : 'border-red-700'}`}>
                <option value="">— Elegir —</option>
                <option value="super_techos">Super Techos</option>
                <option value="prouco">Prouco</option>
              </select>
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Fecha"><Input type="date" value={datos.fecha} onChange={(v) => setDatos({ ...datos, fecha: v })} /></Campo>
              {/* v8.27.42: moneda — Odoo la necesita (hay facturas en US$). El monto se
                  captura tal cual en la factura; Odoo convierte con su tasa del día. */}
              <Campo label="Moneda">
                <select value={datos.moneda} onChange={(e) => setDatos({ ...datos, moneda: e.target.value })}
                  className={`w-full bg-zinc-950 border-2 outline-none px-3 py-2 text-white text-sm ${datos.moneda !== 'DOP' ? 'border-yellow-600' : 'border-zinc-800 focus:border-red-600'}`}>
                  <option value="DOP">RD$ (pesos)</option>
                  <option value="USD">US$ (dólares)</option>
                  <option value="EUR">€ (euros)</option>
                </select>
              </Campo>
            </div>
            <Campo label={`Monto total ${datos.moneda === 'USD' ? 'US$' : datos.moneda === 'EUR' ? '€' : 'RD$'}`}>
              <input type="number" value={datos.monto} onChange={(e) => setDatos({ ...datos, monto: e.target.value })} placeholder="0"
                className="w-full bg-zinc-950 border-2 border-green-800 focus:border-green-500 outline-none px-3 py-2 text-sm font-bold text-right text-green-400" />
            </Campo>

            <Campo label="Proveedor"><Input value={datos.proveedor} onChange={(v) => setDatos({ ...datos, proveedor: v })} placeholder="Ferretería, gasolinera, etc." /></Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="RNC / Cédula">
                <Input value={datos.rnc} onChange={(v) => setDatos({ ...datos, rnc: v })} placeholder="130-XXXXX-X" />
                {(() => { const r = (datos.rnc || '').trim(); if (!r) return null; const v = validarRNC(r); const color = !v.ok ? 'text-red-400' : v.digito === 'no_cuadra' ? 'text-amber-400' : 'text-green-400'; return <div className={`text-[10px] mt-0.5 ${color}`}>{v.ok && v.digito !== 'no_cuadra' ? `✓ ${v.tipo === 'cedula' ? 'Cédula' : 'RNC'} válido` : `⚠ ${v.mensaje}`}</div>; })()}
              </Campo>
              <Campo label="NCF / e-CF">
                <Input value={datos.ncf} onChange={(v) => setDatos({ ...datos, ncf: (v || '').toUpperCase(), })} placeholder="B0100... / E31..." />
                {(() => { const n = (datos.ncf || '').trim(); if (!n) return null; const v = validarNCF(n); return <div className={`text-[10px] mt-0.5 ${v.ok ? 'text-green-400' : 'text-red-400'}`}>{v.ok ? '✓ válido' : `⚠ ${v.mensaje}`}</div>; })()}
              </Campo>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tipo NCF">
                <select value={datos.tipoNcf} onChange={(e) => setDatos({ ...datos, tipoNcf: e.target.value })}
                  className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
                  <option value="">— (auto por NCF) —</option>
                  {TIPOS_NCF.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </Campo>
              {/* v8.27.43: mostrar el MONTO del ITBIS (la IA lo desglosa). "Incluido" solo
                  se muestra abajo cuando la factura NO lo trae desglosado. */}
              <Campo label="ITBIS (monto)">
                <input type="number" value={datos.itbis}
                  onChange={(e) => setDatos({ ...datos, itbis: e.target.value, itbisModo: e.target.value ? 'incluido' : (datos.itbisModo === 'exento' ? 'exento' : 'incluido') })}
                  placeholder={datos.itbisModo === 'exento' ? 'Exento' : 'Monto del ITBIS'}
                  className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm text-right" />
              </Campo>
            </div>
            {/* Nota de ITBIS: solo dice "incluido" cuando NO viene desglosado en la factura */}
            <div className="text-[10px] -mt-1">
              {datos.itbisModo === 'exento'
                ? <span className="text-zinc-500">Factura exenta de ITBIS.</span>
                : (datos.itbis && Number(datos.itbis) > 0)
                  ? <span className="text-green-500/80">ITBIS desglosado: {new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2 }).format(Number(datos.itbis))}{datos.moneda === 'USD' ? ' US$' : datos.moneda === 'EUR' ? ' €' : ' RD$'} (incluido en el total).</span>
                  : <span className="text-zinc-500">Sin desglosar en la factura → se toma como <b className="text-zinc-300">ITBIS incluido en el monto</b>. <button type="button" onClick={() => setDatos({ ...datos, itbisModo: datos.itbisModo === 'exento' ? 'incluido' : 'exento' })} className="text-yellow-500 hover:underline ml-1">{datos.itbisModo === 'exento' ? '' : 'marcar exento'}</button></span>}
            </div>

            <Campo label="Producto / Concepto"><Input value={datos.concepto} onChange={(v) => setDatos({ ...datos, concepto: v })} placeholder="Ferretería → Materiales Varios · Gasoil / Gasolina · Gas" /></Campo>
            {/* v8.27.40: cuenta analítica = el número que se anota en lapicero azul en la
                factura física (el proyecto). Odoo la usa para cargar el gasto a la obra. */}
            <Campo label="Cuenta analítica (proyecto) — número azul">
              <Input value={datos.cuentaAnalitica} onChange={(v) => setDatos({ ...datos, cuentaAnalitica: v })} placeholder="Ej. ST-C5737, PG-C1297, Oficina" />
            </Campo>

            {/* ¿Solo registrar el gasto o pedir reembolso? */}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDatos({ ...datos, reembolsable: false })}
                className={`p-2.5 text-left border-2 rounded-card transition ${!datos.reembolsable ? 'border-zinc-500 bg-zinc-800' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}>
                <div className="text-xs font-bold flex items-center gap-1">{!datos.reembolsable && <Check className="w-3 h-3 text-green-400" />}Solo registrar</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Gasto ya pagado por la empresa</div>
              </button>
              <button type="button" onClick={() => setDatos({ ...datos, reembolsable: true })}
                className={`p-2.5 text-left border-2 rounded-card transition ${datos.reembolsable ? 'border-amber-600 bg-amber-950/30' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}>
                <div className="text-xs font-bold flex items-center gap-1">{datos.reembolsable && <Check className="w-3 h-3 text-amber-400" />}Es para reembolso</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">La pagué yo, me la devuelven</div>
              </button>
            </div>

            {/* v8.27.44: footer fijo (sticky) para que Guardar/Cancelar estén SIEMPRE visibles */}
            <div className="flex gap-2 pt-3 border-t border-zinc-800 sticky bottom-0 bg-zinc-900 -mx-5 px-5 pb-1 -mb-1">
              <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
              <button onClick={guardar} disabled={!datos.empresa || !datos.monto}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1">
                <Check className="w-3 h-3" /> {revisando ? 'Aprobar y siguiente' : editando ? 'Guardar cambios' : 'Guardar factura'}
              </button>
            </div>
          </div>
        )}

        {paso === 'guardando' && (
          <div className="py-8 text-center"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /><div className="text-xs text-zinc-400 mt-2">Guardando...</div></div>
        )}
      </div>
    </div>
  );
}
