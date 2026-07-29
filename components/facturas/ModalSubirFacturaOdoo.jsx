'use client';

import React, { useState } from 'react';
import { Camera, Loader2, X, Sparkles, AlertTriangle, Check } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagen } from '../../lib/imports';
import Campo from '../common/Campo';
import Input from '../common/Input';
import { validarRNC, validarNCF } from '../../lib/validacionFiscal';
import { TIPOS_NCF, detectarTipoNcf } from '../../lib/facturasOdooMap';

// Modal para que Lily suba una factura de gasto (para exportar a Odoo).
// Flujo: foto → comprime → /api/caja-chica/parse-factura → revisa → guarda.
export default function ModalSubirFacturaOdoo({ usuario, facturaEditar = null, onCerrar, onGuardado }) {
  const editando = !!facturaEditar;
  const [paso, setPaso] = useState(editando ? 'confirmar' : 'foto'); // foto | revisando | confirmar | guardando
  const [fotoData, setFotoData] = useState(null); // dataURL nueva (si se sube/cambia)
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
    reembolsable: facturaEditar?.reembolsable || false,
  });

  const onFile = async (file) => {
    if (!file) return;
    setErrorAI(null);
    try {
      const dataUrl = await comprimirImagen(file);
      setFotoData(dataUrl);
      setPaso('revisando');
      const res = await fetch('/api/caja-chica/parse-factura', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: dataUrl }),
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
      }));
      setPaso('confirmar');
    } catch (e) {
      setErrorAI(e.message || String(e));
      setPaso('confirmar');
    }
  };

  const guardar = async () => {
    const monto = parseFloat(datos.monto);
    if (!datos.empresa) { toast.warning('Elige la empresa (Super Techos o Prouco).'); return; }
    if (!monto || monto <= 0) { toast.warning('Ingresa un monto válido.'); return; }
    const rncTxt = (datos.rnc || '').trim();
    if (rncTxt) { const v = validarRNC(rncTxt); if (!v.ok) { toast.warning('RNC inválido: ' + v.mensaje); return; } }
    const ncfTxt = (datos.ncf || '').trim();
    if (ncfTxt) { const v = validarNCF(ncfTxt); if (!v.ok) { toast.warning('NCF/e-CF inválido: ' + v.mensaje); return; } }
    setPaso('guardando');
    const payload = {
      empresa: datos.empresa, proveedor: datos.proveedor || null, rnc: datos.rnc || null,
      tipoNcf: datos.tipoNcf || null, ncf: datos.ncf || null, fecha: datos.fecha,
      concepto: datos.concepto || null, monto, itbisModo: datos.itbisModo,
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
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto">
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
              <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
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
            {fotoData && <img src={fotoData} alt="" className="max-h-48 mx-auto border border-zinc-800" />}
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
                <img src={fotoData} alt="" className="max-h-32 mx-auto border border-zinc-800" />
                <button onClick={() => { setPaso('foto'); setFotoData(null); setDatosIA(null); }} className="absolute top-1 right-1 bg-black/70 text-white p-1 text-[10px]">Cambiar</button>
              </div>
            )}
            {editando && !fotoData && facturaEditar?.fotoPath && (
              <div className="text-[10px] text-zinc-500 text-center">📎 Foto guardada. Sube una nueva solo si quieres reemplazarla.
                <label className="ml-1 underline text-red-400 cursor-pointer">cambiar<input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="hidden" /></label>
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
              <Campo label="Monto total RD$">
                <input type="number" value={datos.monto} onChange={(e) => setDatos({ ...datos, monto: e.target.value })} placeholder="0"
                  className="w-full bg-zinc-950 border-2 border-green-800 focus:border-green-500 outline-none px-3 py-2 text-sm font-bold text-right text-green-400" />
              </Campo>
            </div>

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
              <Campo label="ITBIS">
                <select value={datos.itbisModo} onChange={(e) => setDatos({ ...datos, itbisModo: e.target.value })}
                  className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
                  <option value="incluido">Incluido en el monto</option>
                  <option value="aparte">Aparte (se suma)</option>
                  <option value="exento">Exento (sin ITBIS)</option>
                </select>
              </Campo>
            </div>

            <Campo label="Producto / Concepto"><Input value={datos.concepto} onChange={(v) => setDatos({ ...datos, concepto: v })} placeholder="Qué se compró" /></Campo>

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

            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
              <button onClick={guardar} disabled={!datos.empresa || !datos.monto}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1">
                <Check className="w-3 h-3" /> {editando ? 'Guardar cambios' : 'Guardar factura'}
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
