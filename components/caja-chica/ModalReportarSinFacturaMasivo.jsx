'use client';

// v8.17.4: Reportar varios gastos SIN factura en una sola ventana.
// - Sin OCR ni foto (es texto plano).
// - Tabla de filas: fecha + categoría + monto + concepto.
// - Proyecto común a todo el lote (acelera el flujo).
// - Validaciones inline por fila: categoría obligatoria, concepto mín 15 chars,
//   monto > 0 y ≤ maxTransaccionCajaChica.
// - Envío en lote vía N llamadas a db.crearMovimientoCajaChica con sin_factura:true.

import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2, Loader2, FileWarning, Send, Check, AlertCircle } from 'lucide-react';
import * as db from '../../lib/db';
import ProyectoSelector from '../common/ProyectoSelector';

const PROYECTO_GENERICO = '__generico__';

const fmtRD = (n) => 'RD$' + new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const nuevaFila = () => ({
  id: 'sf_' + Date.now() + Math.random().toString(36).slice(2, 6),
  fecha: new Date().toISOString().split('T')[0],
  categoria: '',
  monto: '',
  concepto: '',
});

export default function ModalReportarSinFacturaMasivo({ usuario, proyectos, categorias, onCerrar, onGuardado }) {
  // v8.50.0: proyecto OBLIGATORIO (ticket Felvison) — arranca vacío, ya no en genérico
  const [proyectoComunId, setProyectoComunId] = useState('');
  const [filas, setFilas] = useState([nuevaFila()]);
  const [enviando, setEnviando] = useState(false);
  const [resumen, setResumen] = useState(null);

  const categoriasActivas = useMemo(
    () => (categorias || []).filter(c => c.activa).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [categorias]
  );

  const maxTx = usuario?.maxTransaccionCajaChica;

  const actualizarFila = (id, parche) => {
    setFilas(prev => prev.map(f => f.id === id ? { ...f, ...parche } : f));
  };

  const agregarFila = () => setFilas(prev => [...prev, nuevaFila()]);
  const eliminarFila = (id) => setFilas(prev => prev.length > 1 ? prev.filter(f => f.id !== id) : prev);

  // Validación por fila
  const validarFila = (f) => {
    const errores = [];
    const monto = parseFloat(f.monto);
    if (!monto || monto <= 0) errores.push('monto');
    if (maxTx != null && maxTx > 0 && monto > maxTx) errores.push('maxTx');
    if (!f.categoria) errores.push('categoria');
    const conceptoTrim = (f.concepto || '').trim();
    if (conceptoTrim.length < 15) errores.push('concepto');
    if (!f.fecha) errores.push('fecha');
    return errores;
  };

  const filasConErrores = useMemo(() => {
    return filas.map(f => ({ ...f, _errores: validarFila(f) }));
  }, [filas, maxTx]);

  const filasValidas = filasConErrores.filter(f => f._errores.length === 0);
  const totalLote = filasValidas.reduce((s, f) => s + (parseFloat(f.monto) || 0), 0);
  const todoOk = filas.length > 0 && filasConErrores.every(f => f._errores.length === 0)
    && !!proyectoComunId && proyectoComunId !== PROYECTO_GENERICO; // v8.50.0: exige proyecto

  const enviar = async () => {
    if (!todoOk) return;
    setEnviando(true);
    setResumen({ exitos: 0, errores: [], total: filas.length });
    const proyectoId = proyectoComunId === PROYECTO_GENERICO ? null : proyectoComunId;

    let exitos = 0;
    const errores = [];

    for (const f of filas) {
      try {
        // v8.17.29: heredar partida (dieta/hospedaje) de la categoría
        const cat = categoriasActivas.find(c => c.id === f.categoria);
        await db.crearMovimientoCajaChica({
          personaId: usuario.id,
          proyectoId,
          fecha: f.fecha,
          tipo: 'gasto_factura',
          monto: parseFloat(f.monto),
          fotoDataUrl: null,
          proveedor: null,
          rnc: null,
          concepto: (f.concepto || '').trim(),
          aplicaA: cat?.aplicaA || null,
          datosIA: {
            sin_factura: true,
            categoria_sugerida: f.categoria || null,
          },
          creadoPorId: usuario.id,
        });
        exitos++;
        setResumen({ exitos, errores: [...errores], total: filas.length });
      } catch (e) {
        const cat = categoriasActivas.find(c => c.id === f.categoria);
        errores.push({ fila: f, error: e?.message || String(e), label: `${fmtRD(f.monto)} · ${cat?.nombre || 'Sin cat.'}` });
        setResumen({ exitos, errores: [...errores], total: filas.length });
      }
    }

    setEnviando(false);
    if (errores.length === 0) {
      // Todo OK → cerrar y recargar
      onGuardado();
    }
    // Si hubo errores: queda el resumen visible y el usuario decide cerrar
  };

  // Pantalla de resumen post-envío con errores
  if (resumen && !enviando && resumen.errores.length > 0) {
    return (
      <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto">
        <div className="bg-zinc-900 border-2 border-yellow-600 rounded-card max-w-md w-full p-5 space-y-4 my-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-yellow-500 font-bold">Envío parcial</div>
              <h2 className="text-lg font-black">{resumen.exitos} de {resumen.total} guardados</h2>
            </div>
            <button onClick={() => { onGuardado(); }} className="text-zinc-500"><X className="w-4 h-4" /></button>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-700 p-3 text-xs text-yellow-200">
            <div className="font-bold mb-1">Errores ({resumen.errores.length}):</div>
            {resumen.errores.map((e, i) => (
              <div key={i} className="text-[11px] mt-1">
                <span className="font-bold">{e.label}</span>: {e.error}
              </div>
            ))}
          </div>
          <button onClick={() => { onGuardado(); }} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-3 text-xs font-bold uppercase">Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-2 sm:p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-orange-600 rounded-card max-w-2xl w-full my-4 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-orange-500 font-bold flex items-center gap-1">
              <FileWarning className="w-3 h-3" /> Sin factura · {filas.length} gasto{filas.length !== 1 ? 's' : ''}
            </div>
            <h2 className="text-lg font-black">Reportar sin factura</h2>
            <div className="text-[10px] text-zinc-500 mt-0.5">Para gastos sin comprobante fiscal. Explica con detalle qué y por qué.</div>
          </div>
          <button onClick={onCerrar} disabled={enviando} className="text-zinc-500 hover:text-white disabled:opacity-30"><X className="w-4 h-4" /></button>
        </div>

        {/* Proyecto común — v8.17.25: con buscador + orden por últimos usados */}
        <div className="px-4 pt-4 pb-2 border-b border-zinc-800">
          <label className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Proyecto * (común a todos los gastos)</label>
          <div className="mt-1">
            {/* v8.50.0: obligatorio — se quitó la opción de gasto genérico (ticket Felvison) */}
            <ProyectoSelector
              value={proyectoComunId === PROYECTO_GENERICO ? '' : proyectoComunId}
              onChange={(id) => setProyectoComunId(id || '')}
              proyectos={proyectos || []}
              permitirVacio={false}
              disabled={enviando}
            />
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">¿Mezcla de proyectos? Reporta en lotes separados.</div>
        </div>

        {/* Filas de gastos */}
        <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
          {filasConErrores.map((f, idx) => {
            const tieneErr = (campo) => f._errores.includes(campo);
            return (
              <div key={f.id} className={`bg-zinc-950 border ${f._errores.length > 0 ? 'border-yellow-700/60' : 'border-zinc-800'} p-3 space-y-2`}>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Gasto #{idx + 1}</div>
                  {filas.length > 1 && (
                    <button onClick={() => eliminarFila(f.id)} disabled={enviando} className="text-zinc-500 hover:text-red-400 disabled:opacity-30" title="Quitar este gasto"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] uppercase text-zinc-500 font-bold">Fecha</label>
                    <input
                      type="date"
                      value={f.fecha}
                      onChange={e => actualizarFila(f.id, { fecha: e.target.value })}
                      disabled={enviando}
                      className={`w-full bg-zinc-900 border ${tieneErr('fecha') ? 'border-yellow-700' : 'border-zinc-800'} px-2 py-1.5 text-xs text-white disabled:opacity-40`}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase text-zinc-500 font-bold">Monto (RD$)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={f.monto}
                      onChange={e => actualizarFila(f.id, { monto: e.target.value })}
                      disabled={enviando}
                      placeholder="0.00"
                      className={`w-full bg-zinc-900 border ${tieneErr('monto') || tieneErr('maxTx') ? 'border-yellow-700' : 'border-zinc-800'} px-2 py-1.5 text-xs text-white text-right disabled:opacity-40`}
                    />
                    {tieneErr('maxTx') && (
                      <div className="text-[9px] text-yellow-400 mt-0.5">Excede tu máx. por transacción ({fmtRD(maxTx)})</div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[9px] uppercase text-zinc-500 font-bold">Categoría</label>
                  <select
                    value={f.categoria}
                    onChange={e => actualizarFila(f.id, { categoria: e.target.value })}
                    disabled={enviando}
                    className={`w-full bg-zinc-900 border ${tieneErr('categoria') ? 'border-yellow-700' : 'border-zinc-800'} px-2 py-1.5 text-xs text-white disabled:opacity-40`}
                  >
                    <option value="">Selecciona…</option>
                    {categoriasActivas.map(c => (
                      <option key={c.id} value={c.id}>{c.icono ? c.icono + ' ' : ''}{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] uppercase text-zinc-500 font-bold">Concepto · mín. 15 caracteres</label>
                  <textarea
                    value={f.concepto}
                    onChange={e => actualizarFila(f.id, { concepto: e.target.value })}
                    disabled={enviando}
                    placeholder="Explica qué y por qué (ej: compra de cinta para cubrir filtración mientras llegaba el material…)"
                    rows={2}
                    className={`w-full bg-zinc-900 border ${tieneErr('concepto') ? 'border-yellow-700' : 'border-zinc-800'} px-2 py-1.5 text-xs text-white disabled:opacity-40`}
                  />
                  <div className="text-[9px] text-zinc-500 mt-0.5 flex justify-between">
                    <span>{(f.concepto || '').trim().length} caracteres</span>
                    {tieneErr('concepto') && <span className="text-yellow-400">Necesita al menos 15</span>}
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={agregarFila}
            disabled={enviando}
            className="w-full border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-400 hover:text-orange-400 py-3 text-xs font-bold uppercase flex items-center justify-center gap-1 disabled:opacity-30"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar otro gasto
          </button>
        </div>

        {/* Footer: total + acciones */}
        <div className="p-4 border-t border-zinc-800 space-y-3">
          {/* Progreso de envío */}
          {enviando && resumen && (
            <div className="bg-blue-900/20 border border-blue-700 p-2 text-xs text-blue-200 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Enviando {resumen.exitos + resumen.errores.length} de {resumen.total}…
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <div className="text-zinc-500 uppercase tracking-wider font-bold">Total del lote</div>
            <div className="text-2xl font-black text-white">{fmtRD(totalLote)}</div>
          </div>

          {!todoOk && filas.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700 p-2 text-[11px] text-yellow-300 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>Hay {filasConErrores.filter(f => f._errores.length > 0).length} gasto{filasConErrores.filter(f => f._errores.length > 0).length !== 1 ? 's' : ''} con datos incompletos. Revisa los campos en amarillo antes de enviar.</div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onCerrar}
              disabled={enviando}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-3 text-xs font-bold uppercase disabled:opacity-30"
            >
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={enviando || !todoOk}
              className="flex-[2] bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white py-3 text-xs font-black uppercase flex items-center justify-center gap-2"
            >
              {enviando ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
              ) : (
                <><Send className="w-4 h-4" /> Enviar {filas.length} gasto{filas.length !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
