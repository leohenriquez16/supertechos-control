'use client';

// v8.15: Carga masiva de facturas a Caja Chica.
// Drag & drop múltiple → AI paralelo (concurrencia 5) → tabla editable de
// borradores con detección de duplicados (en lote y vs DB) → submit en lote
// con paralelización.

import React, { useState, useMemo, useEffect } from 'react';
import { Upload, X, Loader2, Check, AlertCircle, Sparkles, Trash2, FileWarning, Send } from 'lucide-react';
import * as db from '../../lib/db';
import { comprimirImagen } from '../../lib/imports';
import {
  procesarConConcurrencia,
  detectarDuplicadosNCFEnLote,
  buscarNCFsEnDB,
} from '../../lib/helpers/cargaMasivaCajaChica';

const MAX_CONCURRENCIA = 5;
const MAX_ARCHIVOS = 50;

const fmtRD = (n) => 'RD$' + new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export default function ModalCargaMasiva({ usuario, data, onCerrar, onListo }) {
  const [borradores, setBorradores] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [chequeandoDuplicados, setChequeandoDuplicados] = useState(false);

  const personasCajaChica = useMemo(
    () => (data.personal || []).filter(p => p.cajaChicaHabilitada),
    [data.personal]
  );
  const proyectosActivos = useMemo(
    () => (data.proyectos || []).filter(p => !p.archivado),
    [data.proyectos]
  );
  const categoriasActivas = useMemo(
    () => ((data.categoriasCajaChica) || []).filter(c => c.activa),
    [data.categoriasCajaChica]
  );

  // Re-detectar duplicados internos cada vez que cambian los datos
  const dupEnLoteMap = useMemo(() => detectarDuplicadosNCFEnLote(borradores), [borradores]);

  // Cuando borradores cambian (porque AI procesó o admin editó), re-chequear duplicados vs DB
  useEffect(() => {
    const ncfs = borradores
      .filter(b => b.status === 'listo' && b.datos.ncf)
      .map(b => b.datos.ncf);
    if (ncfs.length === 0) return;
    let cancelado = false;
    setChequeandoDuplicados(true);
    buscarNCFsEnDB(ncfs)
      .then(mapa => {
        if (cancelado) return;
        setBorradores(prev => prev.map(b => {
          const key = String(b.datos.ncf || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return { ...b, duplicadoEnDB: key && mapa.has(key) ? mapa.get(key) : null };
        }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelado) setChequeandoDuplicados(false); });
    return () => { cancelado = true; };
  }, [borradores.map(b => b.datos.ncf || '').join('|')]); // eslint-disable-line

  const actualizarBorrador = (id, parche) => {
    setBorradores(prev => prev.map(b => b.id === id ? { ...b, ...parche, datos: parche.datos ? { ...b.datos, ...parche.datos } : b.datos } : b));
  };

  const eliminarBorrador = (id) => {
    setBorradores(prev => prev.filter(b => b.id !== id));
  };

  const toggleSeleccionado = (id) => {
    setBorradores(prev => prev.map(b => b.id === id ? { ...b, seleccionado: !b.seleccionado } : b));
  };

  const seleccionarTodos = (val) => {
    setBorradores(prev => prev.map(b => ({ ...b, seleccionado: val })));
  };

  const procesarUnArchivo = async (borradorId, file) => {
    // 1. Comprimir y mostrar thumbnail
    const dataUrl = await comprimirImagen(file, 1400, 0.7);
    actualizarBorrador(borradorId, { dataUrl, status: 'procesando' });

    // 2. Llamar AI
    let datosIA = null;
    try {
      const res = await fetch('/api/caja-chica/parse-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: dataUrl,
          categorias: categoriasActivas.map(c => ({ id: c.id, nombre: c.nombre, descripcion: c.descripcion })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error AI');
      datosIA = json.datos || {};
    } catch (e) {
      actualizarBorrador(borradorId, { status: 'error', error: e?.message || 'Error procesando' });
      return;
    }

    // 3. Match con proveedor existente por RNC
    let proveedorMatch = null;
    let nombreFinal = datosIA.proveedor || '';
    let categoriaFinal = datosIA.categoria_sugerida || '';
    if (datosIA.rnc) {
      try {
        const prov = await db.buscarProveedorCajaChicaPorRnc(datosIA.rnc);
        if (prov) {
          proveedorMatch = prov;
          nombreFinal = prov.nombre || nombreFinal;
          categoriaFinal = prov.categoria || categoriaFinal;
        }
      } catch (e) { /* no bloquea */ }
    }

    // 4. Guardar resultado
    actualizarBorrador(borradorId, {
      status: 'listo',
      datosIA,
      proveedorMatch,
      datos: {
        fecha: datosIA.fecha || new Date().toISOString().split('T')[0],
        monto: datosIA.monto_total != null ? String(datosIA.monto_total) : '',
        proveedor: nombreFinal,
        rnc: datosIA.rnc || '',
        ncf: datosIA.ncf || '',
        concepto: datosIA.concepto || '',
        categoria: categoriaFinal,
        personaId: '',
        proyectoId: '',
      },
    });
  };

  const agregarArchivos = async (filesArr) => {
    const imgs = filesArr.filter(f => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    const restantes = MAX_ARCHIVOS - borradores.length;
    const aAgregar = imgs.slice(0, restantes);

    const nuevos = aAgregar.map(f => ({
      id: 'b_' + Date.now() + Math.random().toString(36).slice(2, 7),
      file: f,
      dataUrl: null,
      status: 'pendiente',
      datos: {
        fecha: new Date().toISOString().split('T')[0],
        monto: '', proveedor: '', rnc: '', ncf: '', concepto: '', categoria: '',
        personaId: '', proyectoId: '',
      },
      datosIA: null,
      proveedorMatch: null,
      error: null,
      duplicadoEnDB: null,
      seleccionado: true,
    }));

    setBorradores(prev => [...prev, ...nuevos]);

    // Procesar en paralelo con concurrencia 5
    const tareas = nuevos.map(b => () => procesarUnArchivo(b.id, b.file));
    await procesarConConcurrencia(tareas, MAX_CONCURRENCIA);
  };

  const validarBorrador = (b) => {
    const errs = [];
    if (!b.datos.monto || Number(b.datos.monto) <= 0) errs.push('Monto requerido');
    if (!b.datos.fecha) errs.push('Fecha requerida');
    if (!b.datos.personaId) errs.push('Falta titular');
    if (!b.datos.categoria) errs.push('Falta categoría');
    return errs;
  };

  const submitLote = async () => {
    if (enviando) return;
    const seleccionados = borradores.filter(b => b.seleccionado && b.status === 'listo');
    const conErrores = seleccionados.filter(b => validarBorrador(b).length > 0);
    if (conErrores.length > 0) {
      alert(`${conErrores.length} factura${conErrores.length > 1 ? 's tienen' : ' tiene'} datos incompletos. Revísalas antes de enviar.`);
      return;
    }

    const conDuplicado = seleccionados.filter(b => b.duplicadoEnDB || (dupEnLoteMap[b.id] || []).length > 0);
    if (conDuplicado.length > 0) {
      const ok = confirm(`${conDuplicado.length} factura${conDuplicado.length > 1 ? 's parecen' : ' parece'} duplicada${conDuplicado.length > 1 ? 's' : ''} (mismo NCF). ¿Subirlas de todas formas?\n\nRecomendado: cancelar y revisar.`);
      if (!ok) return;
    }

    setEnviando(true);
    const tareas = seleccionados.map(b => () => db.crearMovimientoCajaChica({
      personaId: b.datos.personaId,
      proyectoId: b.datos.proyectoId || null,
      fecha: b.datos.fecha,
      tipo: 'gasto_factura',
      monto: Number(b.datos.monto),
      fotoDataUrl: b.dataUrl,
      proveedor: b.datos.proveedor || null,
      rnc: b.datos.rnc || null,
      concepto: b.datos.concepto || null,
      datosIA: {
        ...(b.datosIA || {}),
        ncf: b.datos.ncf || null,
        categoria_sugerida: b.datos.categoria || null,
        cargado_en_lote: true,
      },
      creadoPorId: usuario.id,
    }));

    const resultados = await procesarConConcurrencia(tareas, MAX_CONCURRENCIA);
    const okCount = resultados.filter(r => r.ok).length;
    const failCount = resultados.length - okCount;
    setEnviando(false);
    setResumen({ ok: okCount, fail: failCount, errores: resultados.filter(r => !r.ok).map(r => r.error) });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (enviando || resumen) return;
    agregarArchivos(Array.from(e.dataTransfer.files || []));
  };

  const onFilePicker = (e) => {
    agregarArchivos(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const stats = useMemo(() => {
    const seleccionados = borradores.filter(b => b.seleccionado && b.status === 'listo');
    const totalMonto = seleccionados.reduce((acc, b) => acc + (Number(b.datos.monto) || 0), 0);
    const conDup = borradores.filter(b => b.duplicadoEnDB || (dupEnLoteMap[b.id] || []).length > 0).length;
    return { total: borradores.length, seleccionados: seleccionados.length, totalMonto, conDup };
  }, [borradores, dupEnLoteMap]);

  if (resumen) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-md p-6">
          <div className="text-center">
            <div className={`w-16 h-16 ${resumen.fail > 0 ? 'bg-yellow-600' : 'bg-green-600'} rounded-full flex items-center justify-center mx-auto mb-3`}>
              <Check className="w-9 h-9 text-white" />
            </div>
            <h2 className="text-xl font-black mb-2">Lote procesado</h2>
            <div className="text-sm text-zinc-300 space-y-1 mb-4">
              <div><b className="text-green-400">{resumen.ok}</b> facturas subidas a la bandeja</div>
              {resumen.fail > 0 && <div><b className="text-red-400">{resumen.fail}</b> fallaron</div>}
            </div>
            {resumen.fail > 0 && (
              <div className="bg-red-950/30 border border-red-800 p-3 text-xs text-left text-red-200 max-h-32 overflow-auto mb-4">
                {resumen.errores.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}
            <button
              onClick={() => { onListo?.(); onCerrar(); }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider py-3"
            >
              Ir a Bandeja
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-6xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-red-500" />
            <div className="font-black uppercase tracking-wider text-sm">Carga masiva de facturas</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-white" disabled={enviando}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drop zone */}
        <div className="px-4 pt-4 flex-shrink-0">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`block border-2 border-dashed cursor-pointer transition p-4 text-center ${dragOver ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 hover:border-red-600'}`}
          >
            <input type="file" accept="image/*" multiple onChange={onFilePicker} className="hidden" disabled={enviando} />
            <Upload className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
            <div className="text-sm font-bold">Arrastra fotos aquí o toca para seleccionar</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {borradores.length}/{MAX_ARCHIVOS} cargadas · AI procesa hasta {MAX_CONCURRENCIA} en paralelo
            </div>
          </label>
        </div>

        {/* Toolbar */}
        {borradores.length > 0 && (
          <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800 text-xs bg-zinc-950">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={borradores.length > 0 && borradores.every(b => b.seleccionado)}
                  onChange={e => seleccionarTodos(e.target.checked)}
                  className="accent-red-600"
                />
                <span>Seleccionar todas</span>
              </label>
              <span className="text-zinc-500">|</span>
              <span className="text-zinc-400">{stats.seleccionados} seleccionada{stats.seleccionados !== 1 && 's'} · {fmtRD(stats.totalMonto)}</span>
              {stats.conDup > 0 && (
                <span className="bg-yellow-900/40 border border-yellow-700 text-yellow-300 px-2 py-0.5">
                  ⚠ {stats.conDup} posible{stats.conDup > 1 ? 's' : ''} duplicado{stats.conDup > 1 ? 's' : ''}
                </span>
              )}
              {chequeandoDuplicados && <span className="text-zinc-500 text-[10px]">verificando duplicados…</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBorradores([])}
                disabled={enviando}
                className="text-zinc-400 hover:text-red-400 px-2 py-1 text-[10px] uppercase tracking-wider font-bold"
              >
                Vaciar
              </button>
            </div>
          </div>
        )}

        {/* Tabla de borradores */}
        <div className="flex-1 overflow-auto p-4">
          {borradores.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              Suelta facturas aquí. La AI extraerá monto, RNC, NCF, proveedor y categoría automáticamente.
              <div className="text-[10px] text-zinc-600 mt-2">Tú asignas titular y proyecto antes de subirlas.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {borradores.map(b => (
                <FilaBorrador
                  key={b.id}
                  borrador={b}
                  duplicadosEnLote={dupEnLoteMap[b.id] || []}
                  personas={personasCajaChica}
                  proyectos={proyectosActivos}
                  categorias={categoriasActivas}
                  onCambiar={(parche) => actualizarBorrador(b.id, { datos: parche })}
                  onToggleSeleccion={() => toggleSeleccionado(b.id)}
                  onEliminar={() => eliminarBorrador(b.id)}
                  validar={() => validarBorrador(b)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0 bg-zinc-950">
          <button
            onClick={onCerrar}
            disabled={enviando}
            className="px-4 py-3 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button
            onClick={submitLote}
            disabled={enviando || stats.seleccionados === 0}
            className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-6 py-3 flex items-center gap-2 text-sm"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {enviando ? 'Subiendo…' : `Enviar ${stats.seleccionados} a bandeja · ${fmtRD(stats.totalMonto)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilaBorrador({ borrador: b, duplicadosEnLote, personas, proyectos, categorias, onCambiar, onToggleSeleccion, onEliminar, validar }) {
  const errs = b.status === 'listo' ? validar() : [];
  const dupEnLote = duplicadosEnLote.length > 0;
  const dupEnDB = !!b.duplicadoEnDB;
  const tieneAlerta = dupEnLote || dupEnDB;
  const borderClass = b.status === 'error'
    ? 'border-red-700 bg-red-950/20'
    : tieneAlerta
      ? 'border-yellow-700 bg-yellow-950/10'
      : 'border-zinc-800';

  return (
    <div className={`bg-zinc-950 border-2 ${borderClass} p-3 flex gap-3`}>
      {/* Checkbox */}
      <div className="flex-shrink-0 pt-1">
        <input
          type="checkbox"
          checked={b.seleccionado}
          onChange={onToggleSeleccion}
          disabled={b.status !== 'listo'}
          className="accent-red-600 w-4 h-4"
        />
      </div>

      {/* Thumbnail */}
      <div className="flex-shrink-0 w-20 h-20 bg-black border border-zinc-800 overflow-hidden relative">
        {b.dataUrl ? (
          <img src={b.dataUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
          </div>
        )}
        {b.status === 'procesando' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
            <Sparkles className="w-4 h-4 text-red-500 animate-pulse" />
            <div className="text-[8px] text-white mt-1 uppercase tracking-wider">AI</div>
          </div>
        )}
        {b.status === 'error' && (
          <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-300" />
          </div>
        )}
      </div>

      {/* Campos editables */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
        {b.status === 'pendiente' && <div className="col-span-4 text-xs text-zinc-500">En cola…</div>}
        {b.status === 'procesando' && <div className="col-span-4 text-xs text-zinc-400 flex items-center gap-1"><Sparkles className="w-3 h-3 text-red-500" /> AI extrayendo datos…</div>}
        {b.status === 'error' && <div className="col-span-4 text-xs text-red-400">⚠ {b.error}. Edita manualmente o elimina.</div>}

        {b.status === 'listo' && (
          <>
            <Mini label="Fecha">
              <input type="date" value={b.datos.fecha} onChange={e => onCambiar({ fecha: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs" />
            </Mini>
            <Mini label="Monto RD$">
              <input type="number" step="0.01" value={b.datos.monto} onChange={e => onCambiar({ monto: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-right" />
            </Mini>
            <Mini label="Proveedor" wide>
              <input type="text" value={b.datos.proveedor} onChange={e => onCambiar({ proveedor: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs" placeholder="—" />
            </Mini>
            <Mini label="RNC">
              <input type="text" value={b.datos.rnc} onChange={e => onCambiar({ rnc: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs font-mono" placeholder="—" />
            </Mini>
            <Mini label="NCF">
              <input type="text" value={b.datos.ncf} onChange={e => onCambiar({ ncf: e.target.value.toUpperCase() })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs font-mono" placeholder="—" />
            </Mini>
            <Mini label="Categoría">
              <select value={b.datos.categoria} onChange={e => onCambiar({ categoria: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs">
                <option value="">—</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
              </select>
            </Mini>
            <Mini label="Titular *">
              <select value={b.datos.personaId} onChange={e => onCambiar({ personaId: e.target.value })} className={`w-full border px-2 py-1 text-xs ${b.datos.personaId ? 'bg-zinc-900 border-zinc-700' : 'bg-red-950/30 border-red-700'}`}>
                <option value="">— Asignar —</option>
                {personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Mini>
            <Mini label="Proyecto">
              <select value={b.datos.proyectoId} onChange={e => onCambiar({ proyectoId: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs">
                <option value="">— Sin proyecto —</option>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Mini>
            <Mini label="Concepto" wide colSpan={4}>
              <input type="text" value={b.datos.concepto} onChange={e => onCambiar({ concepto: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs" placeholder="Descripción breve" />
            </Mini>
          </>
        )}

        {/* Avisos */}
        {b.status === 'listo' && (errs.length > 0 || dupEnLote || dupEnDB || b.proveedorMatch) && (
          <div className="col-span-4 flex flex-wrap gap-2 text-[10px] mt-1">
            {errs.length > 0 && (
              <span className="bg-red-950/40 border border-red-800 text-red-300 px-2 py-0.5">⚠ {errs.join(' · ')}</span>
            )}
            {dupEnLote && (
              <span className="bg-yellow-950/40 border border-yellow-700 text-yellow-300 px-2 py-0.5">
                <FileWarning className="w-3 h-3 inline mr-1" />
                NCF repetido en este lote
              </span>
            )}
            {dupEnDB && (
              <span className="bg-yellow-950/40 border border-yellow-700 text-yellow-300 px-2 py-0.5">
                <FileWarning className="w-3 h-3 inline mr-1" />
                NCF ya existe en sistema (mov del {b.duplicadoEnDB.fecha} · {fmtRD(b.duplicadoEnDB.monto)})
              </span>
            )}
            {b.proveedorMatch && (
              <span className="bg-green-950/30 border border-green-800 text-green-300 px-2 py-0.5">
                ✓ Proveedor conocido ({b.proveedorMatch.total_facturas} factura{b.proveedorMatch.total_facturas !== 1 ? 's' : ''} previa{b.proveedorMatch.total_facturas !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Eliminar */}
      <button
        onClick={onEliminar}
        className="flex-shrink-0 text-zinc-500 hover:text-red-400 p-2"
        title="Quitar de la lista"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function Mini({ label, children, wide = false, colSpan = 1 }) {
  return (
    <div className={colSpan === 4 ? 'col-span-4' : wide ? 'col-span-2' : ''}>
      <div className="text-[9px] tracking-wider uppercase text-zinc-500 font-bold mb-0.5">{label}</div>
      {children}
    </div>
  );
}
