'use client';

// v8.16: Carga masiva de gastos desde el celular del maestro/supervisor.
// Equivalente móvil del ModalCargaMasiva del admin, pero:
// - Persona es siempre el usuario actual.
// - Layout vertical apilado (mobile-first).
// - Concurrencia AI: 3 (cuidar 4G).
// - Dropdown proyecto: gasto_generico | proyectos_asignados | otro_con_cotizacion_manual.
// - Si elige "otro" → input de Nº cotización; admin lo asigna después al proyecto correcto.

import React, { useState, useMemo, useEffect } from 'react';
import { Upload, X, Loader2, Check, AlertCircle, Sparkles, Trash2, FileWarning, Send, Camera } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagen } from '../../lib/imports';
import {
  procesarConConcurrencia,
  detectarDuplicadosNCFEnLote,
  buscarNCFsEnDB,
} from '../../lib/helpers/cargaMasivaCajaChica';

const MAX_CONCURRENCIA = 3;
const MAX_ARCHIVOS = 20;

const fmtRD = (n) => 'RD$' + new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const PROYECTO_GENERICO = '__generico__';
const PROYECTO_OTRO = '__otro__';

export default function ModalReportarGastosMasivo({ usuario, proyectos, categorias, onCerrar, onGuardado }) {
  const [borradores, setBorradores] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [chequeandoDuplicados, setChequeandoDuplicados] = useState(false);

  const categoriasActivas = useMemo(
    () => (categorias || []).filter(c => c.activa),
    [categorias]
  );

  // Re-detectar duplicados internos cada vez que cambian los datos
  const dupEnLoteMap = useMemo(() => detectarDuplicadosNCFEnLote(borradores), [borradores]);

  // Verificar duplicados vs DB
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

  const procesarUnArchivo = async (borradorId, file) => {
    const dataUrl = await comprimirImagen(file, 1400, 0.7);
    actualizarBorrador(borradorId, { dataUrl, status: 'procesando' });

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
        proyectoSeleccion: '', // se llena en UI: '' no elegido | '__generico__' | proyectoId | '__otro__'
        cotizacionManual: '',
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
        proyectoSeleccion: '', cotizacionManual: '',
      },
      datosIA: null,
      proveedorMatch: null,
      error: null,
      duplicadoEnDB: null,
    }));

    setBorradores(prev => [...prev, ...nuevos]);

    const tareas = nuevos.map(b => () => procesarUnArchivo(b.id, b.file));
    await procesarConConcurrencia(tareas, MAX_CONCURRENCIA);
  };

  const validarBorrador = (b) => {
    const errs = [];
    if (!b.datos.monto || Number(b.datos.monto) <= 0) errs.push('Monto');
    if (!b.datos.fecha) errs.push('Fecha');
    if (!b.datos.categoria) errs.push('Categoría');
    if (!b.datos.proyectoSeleccion) errs.push('Proyecto');
    if (b.datos.proyectoSeleccion === PROYECTO_OTRO && !b.datos.cotizacionManual?.trim()) errs.push('Nº cotización');
    return errs;
  };

  const submitLote = async () => {
    if (enviando) return;
    if (borradores.length === 0) return;

    const listos = borradores.filter(b => b.status === 'listo');
    const conErrores = listos.filter(b => validarBorrador(b).length > 0);
    if (conErrores.length > 0) {
      toast.warning(`${conErrores.length} factura${conErrores.length > 1 ? 's tienen' : ' tiene'} datos incompletos. Revisa cada una antes de enviar.`);
      return;
    }
    if (listos.length === 0) {
      toast.warning('No hay facturas listas para enviar. Espera a que terminen de procesarse o quítalas del lote.');
      return;
    }

    setEnviando(true);
    const tareas = listos.map(b => async () => {
      const proySel = b.datos.proyectoSeleccion;
      const proyectoId = (proySel && proySel !== PROYECTO_GENERICO && proySel !== PROYECTO_OTRO) ? proySel : null;
      const cotizacionManual = proySel === PROYECTO_OTRO ? b.datos.cotizacionManual.trim() : null;
      const esGenerico = proySel === PROYECTO_GENERICO;

      // v8.17.29: heredar aplica_a de la categoría
      const cat = categoriasActivas.find(c => c.id === b.datos.categoria);
      return await db.crearMovimientoCajaChica({
        personaId: usuario.id,
        proyectoId,
        fecha: b.datos.fecha,
        tipo: 'gasto_factura',
        monto: Number(b.datos.monto),
        fotoDataUrl: b.dataUrl,
        proveedor: b.datos.proveedor || null,
        rnc: b.datos.rnc || null,
        concepto: b.datos.concepto || null,
        // v8.17.25: empresa receptora detectada por AI
        empresaReceptora: b.datosIA?.empresa_receptora || null,
        aplicaA: cat?.aplicaA || null,
        datosIA: {
          ...(b.datosIA || {}),
          ncf: b.datos.ncf || null,
          categoria_sugerida: b.datos.categoria || null,
          cargado_en_lote: true,
          ...(cotizacionManual ? { cotizacion_manual: cotizacionManual } : {}),
          ...(esGenerico ? { gasto_generico: true } : {}),
        },
        creadoPorId: usuario.id,
      });
    });

    const resultados = await procesarConConcurrencia(tareas, MAX_CONCURRENCIA);
    const okCount = resultados.filter(r => r.ok).length;
    const failCount = resultados.length - okCount;
    setEnviando(false);
    setResumen({
      ok: okCount,
      fail: failCount,
      errores: resultados.filter(r => !r.ok).map(r => r.error),
    });
  };

  const onFilePicker = (e) => {
    agregarArchivos(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const stats = useMemo(() => {
    const listos = borradores.filter(b => b.status === 'listo');
    const conErrores = listos.filter(b => validarBorrador(b).length > 0).length;
    const totalMonto = listos.reduce((acc, b) => acc + (Number(b.datos.monto) || 0), 0);
    const procesando = borradores.filter(b => b.status === 'procesando').length;
    const conDup = borradores.filter(b => b.duplicadoEnDB || (dupEnLoteMap[b.id] || []).length > 0).length;
    return { listos: listos.length, conErrores, totalMonto, procesando, conDup, total: borradores.length };
  }, [borradores, dupEnLoteMap]);

  // ---------- Pantalla de éxito ----------
  if (resumen) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-md p-5">
          <div className="text-center">
            <div className={`w-14 h-14 ${resumen.fail > 0 ? 'bg-yellow-600' : 'bg-green-600'} rounded-full flex items-center justify-center mx-auto mb-3`}>
              <Check className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-lg font-black mb-1">¡Listo!</h2>
            <div className="text-sm text-zinc-300 mb-3">
              <b className="text-green-400">{resumen.ok}</b> facturas enviadas para aprobación
              {resumen.fail > 0 && <> · <b className="text-red-400">{resumen.fail}</b> fallaron</>}
            </div>
            {resumen.fail > 0 && (
              <div className="bg-red-950/30 border border-red-800 p-3 text-[10px] text-left text-red-200 max-h-32 overflow-auto mb-3">
                {resumen.errores.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}
            <button
              onClick={() => { onGuardado?.(); onCerrar(); }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider py-3 text-sm"
            >
              Volver a Mi Caja Chica
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3 flex-shrink-0 bg-zinc-900">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-red-500 flex-shrink-0" />
          <div className="font-black uppercase tracking-wider text-sm truncate">Reportar varios</div>
        </div>
        <button onClick={onCerrar} disabled={enviando} className="bg-zinc-800 hover:bg-red-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drop zone / picker */}
      <div className="px-3 pt-3 flex-shrink-0">
        <label className="block border-2 border-dashed border-zinc-700 hover:border-red-600 transition p-3 text-center cursor-pointer">
          <input type="file" accept="image/*" multiple onChange={onFilePicker} className="hidden" disabled={enviando} />
          <Camera className="w-6 h-6 text-zinc-500 mx-auto mb-1" />
          <div className="text-xs font-bold">Agregar facturas</div>
          <div className="text-[10px] text-zinc-500">
            {borradores.length}/{MAX_ARCHIVOS} · Selecciona varias del carrete o toma fotos seguidas
          </div>
        </label>
      </div>

      {/* Stats compactos */}
      {borradores.length > 0 && (
        <div className="px-3 py-2 flex items-center gap-2 text-[10px] bg-zinc-950 border-b border-zinc-800 flex-wrap flex-shrink-0">
          <span className="text-zinc-400"><b className="text-white">{stats.listos}</b> listas</span>
          {stats.procesando > 0 && <span className="text-blue-400"><Loader2 className="w-3 h-3 animate-spin inline mr-0.5" />{stats.procesando} procesando</span>}
          {stats.conErrores > 0 && <span className="text-red-400">⚠ {stats.conErrores} con datos incompletos</span>}
          {stats.conDup > 0 && <span className="text-yellow-400">⚠ {stats.conDup} duplicado{stats.conDup > 1 ? 's' : ''}</span>}
          <span className="ml-auto text-green-400 font-bold">{fmtRD(stats.totalMonto)}</span>
        </div>
      )}

      {/* Lista de facturas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {borradores.length === 0 && (
          <div className="text-center text-zinc-500 text-xs py-8 px-4">
            Toca <b className="text-white">"Agregar facturas"</b> arriba.
            <div className="mt-1 text-zinc-600">La AI extrae monto, proveedor y demás datos.</div>
            <div className="mt-1 text-zinc-600">Tú asignas el proyecto y revisas antes de enviar.</div>
          </div>
        )}
        {borradores.map(b => (
          <FilaFacturaMobile
            key={b.id}
            borrador={b}
            duplicadosEnLote={dupEnLoteMap[b.id] || []}
            proyectos={proyectos || []}
            categorias={categoriasActivas}
            onCambiar={(parche) => actualizarBorrador(b.id, { datos: parche })}
            onEliminar={() => eliminarBorrador(b.id)}
            errs={b.status === 'listo' ? validarBorrador(b) : []}
          />
        ))}
      </div>

      {/* Footer fijo con submit */}
      <div className="border-t border-zinc-800 px-3 py-3 flex items-center gap-2 flex-shrink-0 bg-zinc-950">
        <button
          onClick={onCerrar}
          disabled={enviando}
          className="px-3 py-3 text-zinc-400 text-xs font-bold uppercase"
        >
          Cancelar
        </button>
        <button
          onClick={submitLote}
          disabled={enviando || stats.listos === 0 || stats.conErrores > 0 || stats.procesando > 0}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider py-3 text-xs flex items-center justify-center gap-1"
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {enviando ? 'Enviando…' : `Enviar ${stats.listos} factura${stats.listos !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

function FilaFacturaMobile({ borrador: b, duplicadosEnLote, proyectos, categorias, onCambiar, onEliminar, errs }) {
  const [expandido, setExpandido] = useState(true);
  const dupEnLote = duplicadosEnLote.length > 0;
  const dupEnDB = !!b.duplicadoEnDB;
  const tieneAlerta = dupEnLote || dupEnDB || errs.length > 0;
  const esOtro = b.datos.proyectoSeleccion === PROYECTO_OTRO;

  const borderClass = b.status === 'error'
    ? 'border-red-700 bg-red-950/20'
    : tieneAlerta
      ? 'border-yellow-700 bg-yellow-950/10'
      : b.status === 'listo'
        ? 'border-green-800 bg-zinc-900'
        : 'border-zinc-800 bg-zinc-900';

  return (
    <div className={`border-2 ${borderClass} overflow-hidden`}>
      {/* Cabecera de la factura */}
      <div className="flex items-start gap-2 p-2">
        {/* Thumb */}
        <div className="flex-shrink-0 w-14 h-14 bg-black border border-zinc-800 overflow-hidden relative">
          {b.dataUrl ? (
            <img src={b.dataUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-3 h-3 text-zinc-600 animate-spin" />
            </div>
          )}
          {b.status === 'procesando' && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-red-500 animate-pulse" />
            </div>
          )}
        </div>

        {/* Resumen + montos */}
        <div className="flex-1 min-w-0" onClick={() => setExpandido(!expandido)}>
          {b.status === 'pendiente' && <div className="text-xs text-zinc-500">En cola…</div>}
          {b.status === 'procesando' && <div className="text-xs text-zinc-400 flex items-center gap-1"><Sparkles className="w-3 h-3 text-red-500" /> AI extrayendo…</div>}
          {b.status === 'error' && <div className="text-xs text-red-400">⚠ {b.error}</div>}
          {b.status === 'listo' && (
            <>
              <div className="text-sm font-bold truncate">{b.datos.proveedor || 'Sin proveedor'}</div>
              <div className="text-[10px] text-zinc-500 truncate">
                {b.datos.fecha} · {b.datos.concepto || 'Sin concepto'}
              </div>
            </>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          {b.status === 'listo' && (
            <div className="text-base font-black text-orange-400">
              RD${new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(b.datos.monto) || 0)}
            </div>
          )}
          <button onClick={onEliminar} className="text-zinc-500 hover:text-red-400 mt-0.5" title="Quitar del lote">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expandido: campos editables */}
      {expandido && b.status === 'listo' && (
        <div className="p-2 space-y-2 border-t border-zinc-800 bg-zinc-950">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fecha">
              <input type="date" value={b.datos.fecha} onChange={e => onCambiar({ fecha: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-white" />
            </Field>
            <Field label="Monto">
              <input type="number" step="0.01" value={b.datos.monto} onChange={e => onCambiar({ monto: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-right text-orange-400 font-bold" />
            </Field>
          </div>

          <Field label="Proveedor">
            <input type="text" value={b.datos.proveedor} onChange={e => onCambiar({ proveedor: e.target.value })} placeholder="Razón social" className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-white" />
            {b.proveedorMatch && (
              <div className="text-[9px] text-green-400 mt-0.5"><Sparkles className="w-2.5 h-2.5 inline" /> Conocido</div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="RNC">
              <input type="text" value={b.datos.rnc} onChange={e => onCambiar({ rnc: e.target.value })} placeholder="—" className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs font-mono text-white" />
            </Field>
            <Field label="NCF">
              <input type="text" value={b.datos.ncf} onChange={e => onCambiar({ ncf: e.target.value.toUpperCase() })} placeholder="—" className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs font-mono text-white" />
            </Field>
          </div>

          <Field label="Categoría *">
            <select value={b.datos.categoria} onChange={e => onCambiar({ categoria: e.target.value })} className={`w-full border px-2 py-1.5 text-xs ${b.datos.categoria ? 'bg-zinc-900 border-zinc-700' : 'bg-red-950/30 border-red-700'} text-white`}>
              <option value="">— Elegir —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
            </select>
          </Field>

          <Field label="Proyecto / Obra *">
            <select
              value={b.datos.proyectoSeleccion}
              onChange={e => onCambiar({ proyectoSeleccion: e.target.value })}
              className={`w-full border px-2 py-1.5 text-xs ${b.datos.proyectoSeleccion ? 'bg-zinc-900 border-zinc-700' : 'bg-red-950/30 border-red-700'} text-white`}
            >
              <option value="">— Elegir —</option>
              <option value={PROYECTO_GENERICO}>🌐 Gasto genérico (sin proyecto)</option>
              {proyectos.length > 0 && (
                <optgroup label="Mis proyectos">
                  {proyectos.map(p => (
                    <option key={p.id} value={p.id}>{p.referenciaOdoo || ''} {p.nombre}</option>
                  ))}
                </optgroup>
              )}
              <option value={PROYECTO_OTRO}>✏️ Otro proyecto (escribir Nº cotización)</option>
            </select>
          </Field>

          {esOtro && (
            <Field label="Nº Cotización">
              <input
                type="text"
                value={b.datos.cotizacionManual || ''}
                onChange={e => onCambiar({ cotizacionManual: e.target.value })}
                placeholder="ej: ST-C5394"
                className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs font-mono text-white"
              />
              <div className="text-[9px] text-zinc-500 mt-0.5">El admin asignará al proyecto correcto.</div>
            </Field>
          )}

          <Field label="Concepto">
            <input type="text" value={b.datos.concepto} onChange={e => onCambiar({ concepto: e.target.value })} placeholder="Descripción breve" className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-white" />
          </Field>

          {/* Avisos al final */}
          {(errs.length > 0 || dupEnLote || dupEnDB) && (
            <div className="space-y-1 pt-1">
              {errs.length > 0 && (
                <div className="bg-red-950/40 border border-red-800 px-2 py-1 text-[10px] text-red-300">⚠ Falta: {errs.join(', ')}</div>
              )}
              {dupEnLote && (
                <div className="bg-yellow-950/40 border border-yellow-700 px-2 py-1 text-[10px] text-yellow-300">
                  <FileWarning className="w-3 h-3 inline mr-0.5" /> NCF repetido en este lote
                </div>
              )}
              {dupEnDB && (
                <div className="bg-yellow-950/40 border border-yellow-700 px-2 py-1 text-[10px] text-yellow-300">
                  <FileWarning className="w-3 h-3 inline mr-0.5" /> NCF ya existe ({b.duplicadoEnDB.fecha})
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest uppercase text-zinc-500 font-bold mb-0.5">{label}</div>
      {children}
    </div>
  );
}
