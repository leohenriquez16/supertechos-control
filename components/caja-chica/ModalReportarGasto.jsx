'use client';

import React, { useState } from 'react';
import { Camera, Loader2, X, Sparkles, AlertTriangle, Check } from 'lucide-react';
import * as db from '../../lib/db';
import { comprimirImagen } from '../../lib/imports';
import { formatRD } from '../../lib/helpers/formato';
import Campo from '../common/Campo';
import Input from '../common/Input';

// Modal para que un maestro/supervisor reporte un gasto pagado con caja chica.
// Flujo:
//  1. Toma/sube foto de la factura
//  2. Comprime → llama /api/caja-chica/parse-factura → AI extrae monto/RNC/proveedor/fecha
//  3. Muestra los datos editables (el usuario corrige si la AI se equivocó)
//  4. Submit → crea movimiento con status='pendiente_revision' para aprobación admin

export default function ModalReportarGasto({ usuario, proyectos = [], proyectoIdDefault = null, onCerrar, onGuardado }) {
  const [paso, setPaso] = useState('foto'); // foto | revisando | confirmar | guardando
  const [fotoData, setFotoData] = useState(null); // dataURL base64 (preview local; al guardar se sube a Storage)
  const [errorAI, setErrorAI] = useState(null);
  const [datos, setDatos] = useState({
    fecha: new Date().toISOString().split('T')[0],
    proyectoId: proyectoIdDefault || '',
    monto: '',
    proveedor: '',
    rnc: '',
    concepto: '',
    categoria: '',
  });
  const [datosIA, setDatosIA] = useState(null);
  const [advertencias, setAdvertencias] = useState([]);
  const [proveedorMemoria, setProveedorMemoria] = useState(null); // si ya tenemos historial de este RNC

  const onFile = async (file) => {
    if (!file) return;
    setErrorAI(null);
    setProveedorMemoria(null);
    try {
      const dataUrl = await comprimirImagen(file);
      setFotoData(dataUrl);
      setPaso('revisando');
      // Llamar al endpoint de AI
      const res = await fetch('/api/caja-chica/parse-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorAI(json.error || 'Error procesando la imagen');
        setPaso('confirmar'); // permite continuar manualmente
        return;
      }
      const d = json.datos || {};
      setDatosIA(d);
      setAdvertencias(d.advertencias || []);

      // Buscar memoria de proveedores: si ya conocemos este RNC, autocompletar con
      // el nombre canónico que el admin guardó (más confiable que la AI).
      let nombreFinal = d.proveedor || '';
      let categoriaFinal = d.categoria_sugerida || '';
      if (d.rnc) {
        try {
          const prov = await db.buscarProveedorCajaChicaPorRnc(d.rnc);
          if (prov) {
            setProveedorMemoria(prov);
            nombreFinal = prov.nombre || nombreFinal;
            categoriaFinal = prov.categoria || categoriaFinal;
          }
        } catch (e) { /* no bloquea */ }
      }

      setDatos(prev => ({
        ...prev,
        fecha: d.fecha || prev.fecha,
        monto: d.monto_total != null ? String(d.monto_total) : prev.monto,
        proveedor: nombreFinal,
        rnc: d.rnc || prev.rnc,
        concepto: d.concepto || prev.concepto,
        categoria: categoriaFinal,
      }));
      setPaso('confirmar');
    } catch (e) {
      console.error(e);
      setErrorAI(e.message || String(e));
      setPaso('confirmar');
    }
  };

  const guardar = async () => {
    const monto = parseFloat(datos.monto);
    if (!monto || monto <= 0) { alert('Ingresa un monto válido'); return; }
    if (!fotoData) { alert('Falta la foto de la factura'); return; }
    setPaso('guardando');
    try {
      await db.crearMovimientoCajaChica({
        personaId: usuario.id,
        proyectoId: datos.proyectoId || null,
        fecha: datos.fecha,
        tipo: 'gasto_factura',
        monto,
        // El helper sube la foto al bucket y guarda foto_path
        fotoDataUrl: fotoData,
        proveedor: datos.proveedor || null,
        rnc: datos.rnc || null,
        concepto: datos.concepto || null,
        datosIA: { ...(datosIA || {}), categoria_sugerida: datos.categoria || (datosIA?.categoria_sugerida || null) },
        creadoPorId: usuario.id,
        // status implícito: 'pendiente_revision'
      });
      onGuardado();
    } catch (e) {
      alert('Error guardando: ' + (e.message || e));
      setPaso('confirmar');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-4 my-8">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Reportar gasto</div>
            <div className="text-sm font-bold mt-1">Caja chica</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {/* Paso 1: capturar foto */}
        {paso === 'foto' && (
          <div className="space-y-3">
            <div className="text-[10px] text-zinc-500">Toma una foto clara de la factura. La IA extraerá monto, RNC y proveedor automáticamente.</div>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => onFile(e.target.files?.[0])}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <div className="border-2 border-dashed border-zinc-700 hover:border-red-600 p-8 text-center transition">
                <Camera className="w-10 h-10 text-zinc-500 mx-auto mb-2" />
                <div className="text-sm font-bold">Toca para tomar foto</div>
                <div className="text-[10px] text-zinc-500 mt-1">o subir desde galería</div>
              </div>
            </div>
          </div>
        )}

        {/* Paso 2: revisando con AI */}
        {paso === 'revisando' && (
          <div className="space-y-3 py-6 text-center">
            {fotoData && <img src={fotoData} alt="" className="max-h-48 mx-auto border border-zinc-800" />}
            <div className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              <span className="text-zinc-400">Analizando con IA...</span>
              <Sparkles className="w-3 h-3 text-yellow-400" />
            </div>
            <div className="text-[10px] text-zinc-500">Extrayendo monto, RNC y proveedor de la factura</div>
          </div>
        )}

        {/* Paso 3: confirmar (con datos extraídos editables) */}
        {paso === 'confirmar' && (
          <div className="space-y-3">
            {fotoData && (
              <div className="relative">
                <img src={fotoData} alt="" className="max-h-32 mx-auto border border-zinc-800" />
                <button
                  onClick={() => { setPaso('foto'); setFotoData(null); setDatosIA(null); }}
                  className="absolute top-1 right-1 bg-black/70 text-white p-1 text-[10px]"
                >
                  Cambiar
                </button>
              </div>
            )}
            {errorAI && (
              <div className="bg-yellow-900/20 border border-yellow-800 p-2 text-[10px] text-yellow-300 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>La IA no pudo procesar la imagen ({errorAI}). Llena los datos manualmente.</span>
              </div>
            )}
            {!errorAI && datosIA && (
              <div className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] flex items-start gap-2">
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-yellow-400" />
                <div className="flex-1">
                  <div className="text-zinc-400">Datos extraídos por IA · confianza <b className={
                    datosIA.confianza === 'alta' ? 'text-green-400' : datosIA.confianza === 'media' ? 'text-yellow-400' : 'text-red-400'
                  }>{datosIA.confianza}</b></div>
                  {advertencias.length > 0 && (
                    <div className="text-yellow-400 mt-1">⚠️ {advertencias.join(' · ')}</div>
                  )}
                  <div className="text-zinc-500 mt-1">Revisa y corrige si hace falta.</div>
                </div>
              </div>
            )}
            {proveedorMemoria && (
              <div className="bg-blue-900/20 border border-blue-800 p-2 text-[10px] flex items-start gap-2">
                <span className="text-blue-400 shrink-0">💡</span>
                <div className="flex-1">
                  <div className="text-blue-300 font-bold">Proveedor conocido: {proveedorMemoria.nombre}</div>
                  <div className="text-zinc-400 mt-0.5">
                    {proveedorMemoria.totalFacturas} factura{proveedorMemoria.totalFacturas !== 1 ? 's' : ''} previa{proveedorMemoria.totalFacturas !== 1 ? 's' : ''} · histórico RD${new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(proveedorMemoria.totalMonto)}
                    {proveedorMemoria.categoria && ` · categoría ${proveedorMemoria.categoria}`}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Fecha"><Input type="date" value={datos.fecha} onChange={v => setDatos({ ...datos, fecha: v })} /></Campo>
              <Campo label="Monto RD$">
                <input
                  type="number"
                  value={datos.monto}
                  onChange={e => setDatos({ ...datos, monto: e.target.value })}
                  placeholder="0"
                  className="w-full bg-zinc-950 border-2 border-green-800 focus:border-green-500 outline-none px-3 py-2 text-green-400 text-sm font-bold text-right"
                />
              </Campo>
            </div>

            <Campo label="Proyecto (opcional)">
              <select
                value={datos.proyectoId}
                onChange={e => setDatos({ ...datos, proyectoId: e.target.value })}
                className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
              >
                <option value="">— Sin proyecto / gasto general —</option>
                {proyectos.map(p => (
                  <option key={p.id} value={p.id}>{p.referenciaOdoo ? `${p.referenciaOdoo} · ` : ''}{p.cliente || p.nombre}</option>
                ))}
              </select>
            </Campo>

            <Campo label="Proveedor"><Input value={datos.proveedor} onChange={v => setDatos({ ...datos, proveedor: v })} placeholder="Ferretería, gasolinera, etc." /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="RNC"><Input value={datos.rnc} onChange={v => setDatos({ ...datos, rnc: v })} placeholder="130-XXXXX-X" /></Campo>
              <Campo label="Categoría">
                <select
                  value={datos.categoria}
                  onChange={e => setDatos({ ...datos, categoria: e.target.value })}
                  className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
                >
                  <option value="">—</option>
                  <option value="ferreteria">Ferretería</option>
                  <option value="combustible">Combustible</option>
                  <option value="comida">Comida</option>
                  <option value="peaje">Peaje</option>
                  <option value="transporte">Transporte</option>
                  <option value="herramientas">Herramientas</option>
                  <option value="otros">Otros</option>
                </select>
              </Campo>
            </div>
            <Campo label="Concepto / nota"><Input value={datos.concepto} onChange={v => setDatos({ ...datos, concepto: v })} placeholder="Qué se compró" /></Campo>

            <div className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] text-zinc-500">
              💡 El gasto quedará pendiente de aprobación. Una vez aprobado, se descuenta de tu caja chica.
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
              <button
                onClick={guardar}
                disabled={!datos.monto || !fotoData}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" /> Enviar para aprobación
              </button>
            </div>
          </div>
        )}

        {paso === 'guardando' && (
          <div className="py-8 text-center">
            <Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" />
            <div className="text-xs text-zinc-400 mt-2">Guardando...</div>
          </div>
        )}
      </div>
    </div>
  );
}
