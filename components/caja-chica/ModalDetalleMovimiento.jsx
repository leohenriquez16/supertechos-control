'use client';

// v8.15.2: Modal de detalle de un movimiento de caja chica.
// Layout vertical (foto arriba, datos abajo) para que funcione bien en
// cualquier ancho. Header sticky con botón cerrar prominente. Toolbar
// de rotar visible arriba de la foto.

import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Save, Camera, AlertCircle, Building2, FileText, User as UserIcon, Calendar, DollarSign, RotateCcw, RotateCw, Maximize2 } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';

export default function ModalDetalleMovimiento({ usuario, movimiento, data, onCerrar, onActualizado }) {
  const persona = data.personal.find(p => p.id === movimiento.personaId);
  const proyectosActivos = (data.proyectos || []).filter(p => !p.archivado);
  const categoriasActivas = (data.categoriasCajaChica || []).filter(c => c.activa);

  const [campos, setCampos] = useState({
    fecha: movimiento.fecha || '',
    monto: String(movimiento.monto ?? ''),
    proveedor: movimiento.proveedor || '',
    rnc: movimiento.rnc || '',
    ncf: movimiento.datosIA?.ncf || '',
    categoria: movimiento.datosIA?.categoria_sugerida || '',
    concepto: movimiento.concepto || '',
    proyectoId: movimiento.proyectoId || '',
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [fotoUrl, setFotoUrl] = useState(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [rotacion, setRotacion] = useState(0);
  const [verGrande, setVerGrande] = useState(false);

  const tieneFoto = !!movimiento.tieneFoto;

  useEffect(() => {
    if (!tieneFoto) return;
    setCargandoFoto(true);
    db.obtenerFotoFacturaCajaChica(movimiento.id)
      .then(url => setFotoUrl(url))
      .catch(e => console.error('No se pudo cargar foto:', e))
      .finally(() => setCargandoFoto(false));
  }, [movimiento.id, tieneFoto]);

  const set = (k, v) => setCampos(prev => ({ ...prev, [k]: v }));
  const rotar = (delta) => setRotacion(r => (((r + delta) % 360) + 360) % 360);

  const diff = useMemo(() => {
    const d = {};
    if (campos.fecha !== (movimiento.fecha || '')) d.fecha = campos.fecha;
    if (Number(campos.monto) !== Number(movimiento.monto || 0)) d.monto = Number(campos.monto);
    if ((campos.proveedor || '') !== (movimiento.proveedor || '')) d.proveedor = campos.proveedor;
    if ((campos.rnc || '') !== (movimiento.rnc || '')) d.rnc = campos.rnc;
    if ((campos.concepto || '') !== (movimiento.concepto || '')) d.concepto = campos.concepto;
    if ((campos.proyectoId || '') !== (movimiento.proyectoId || '')) d.proyectoId = campos.proyectoId || null;
    const ncfActual = movimiento.datosIA?.ncf || '';
    const catActual = movimiento.datosIA?.categoria_sugerida || '';
    if (campos.ncf !== ncfActual || campos.categoria !== catActual) {
      d.datosIA = {
        ...(movimiento.datosIA || {}),
        ncf: campos.ncf || null,
        categoria_sugerida: campos.categoria || null,
      };
    }
    return d;
  }, [campos, movimiento]);

  const hayCambios = Object.keys(diff).length > 0;

  const guardar = async () => {
    if (guardando || !hayCambios) return;
    if (diff.monto != null && (!Number.isFinite(diff.monto) || diff.monto <= 0)) {
      setError('Monto debe ser mayor a 0.'); return;
    }
    setGuardando(true); setError('');
    try {
      await db.actualizarMovimientoCajaChica(movimiento.id, diff);
      onActualizado?.();
      onCerrar();
    } catch (e) {
      setError(e.message || 'Error guardando');
    }
    setGuardando(false);
  };

  // Cerrar al presionar Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onCerrar}>
      <div
        className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 1rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER sticky con cerrar prominente */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 flex-shrink-0 bg-zinc-900">
          <div className="font-black uppercase tracking-wider text-sm">📋 Detalle del gasto</div>
          <button
            onClick={onCerrar}
            className="bg-zinc-800 hover:bg-red-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-colors"
            title="Cerrar (ESC)"
          >
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {/* CUERPO scrolleable */}
        <div className="flex-1 overflow-y-auto">
          {/* FOTO con toolbar de rotar arriba */}
          {tieneFoto && (
            <div className="bg-black border-b border-zinc-800">
              <div className="flex items-center justify-between px-3 py-2 bg-zinc-950 border-b border-zinc-800">
                <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">📷 Foto de la factura</div>
                {fotoUrl && (
                  <div className="flex gap-1">
                    <button onClick={() => rotar(-90)} className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5" title="Rotar a la izquierda">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => rotar(90)} className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5" title="Rotar a la derecha">
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setVerGrande(true)} className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5" title="Ver foto en grande">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center p-2" style={{ minHeight: '200px', maxHeight: '50vh' }}>
                {cargandoFoto ? (
                  <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
                ) : fotoUrl ? (
                  <img
                    src={fotoUrl}
                    alt="Factura"
                    className="max-w-full max-h-[50vh] object-contain transition-transform duration-200 cursor-zoom-in"
                    style={{ transform: `rotate(${rotacion}deg)` }}
                    onClick={() => setVerGrande(true)}
                  />
                ) : (
                  <div className="text-zinc-500 text-xs py-12">No se pudo cargar la foto</div>
                )}
              </div>
            </div>
          )}

          {!tieneFoto && (
            <div className="bg-black border-b border-zinc-800 p-6 text-center">
              {movimiento.datosIA?.foto_por_ws ? (
                <div className="text-yellow-400 text-xs">
                  <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  📱 Pendiente de foto por WhatsApp
                </div>
              ) : (
                <div className="text-zinc-600 text-xs">
                  <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Sin foto adjunta
                </div>
              )}
            </div>
          )}

          {/* DATOS editables */}
          <div className="p-4 space-y-3">
            <Item icon={<UserIcon className="w-3 h-3" />} label="Persona">
              {persona?.nombre || movimiento.personaId}
            </Item>

            <Item icon={<FileText className="w-3 h-3" />} label="Tipo · Status">
              <span className="capitalize">{movimiento.tipo}</span> · <span className={`font-bold ${movimiento.status === 'aprobado' ? 'text-green-400' : movimiento.status === 'rechazado' ? 'text-red-400' : 'text-orange-400'}`}>{movimiento.status}</span>
            </Item>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha" icon={<Calendar className="w-3 h-3" />}>
                <input
                  type="date"
                  value={campos.fecha}
                  onChange={e => set('fecha', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
                />
              </Field>
              <Field label="Monto RD$" icon={<DollarSign className="w-3 h-3" />}>
                <input
                  type="number" step="0.01"
                  value={campos.monto}
                  onChange={e => set('monto', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-base font-bold text-right text-orange-400"
                />
              </Field>
            </div>

            <Field label="Proveedor (razón social)">
              <input
                type="text"
                value={campos.proveedor}
                onChange={e => set('proveedor', e.target.value)}
                placeholder="Razón social del emisor"
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
              />
              <div className="text-[9px] text-zinc-500 mt-0.5 italic">⚠ Si la AI puso el RNC de Super Techos en lugar del proveedor, corrige aquí.</div>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="RNC del proveedor">
                <input
                  type="text"
                  value={campos.rnc}
                  onChange={e => set('rnc', e.target.value)}
                  placeholder="000-00000-0"
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm font-mono"
                />
              </Field>
              <Field label="NCF">
                <input
                  type="text"
                  value={campos.ncf}
                  onChange={e => set('ncf', e.target.value.toUpperCase())}
                  placeholder="B0100..."
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm font-mono"
                />
              </Field>
            </div>

            <Field label="Categoría">
              <select
                value={campos.categoria}
                onChange={e => set('categoria', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
              >
                <option value="">— Seleccionar —</option>
                {categoriasActivas.map(c => (
                  <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>
                ))}
              </select>
            </Field>

            <Field label="Concepto">
              <textarea
                value={campos.concepto}
                onChange={e => set('concepto', e.target.value)}
                rows={2}
                placeholder="Descripción breve"
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
              />
            </Field>

            {movimiento.datosIA?.confianza && (
              <div className="text-[10px] text-zinc-500">
                Confianza original AI: <span className={
                  movimiento.datosIA.confianza === 'alta' ? 'text-green-400' :
                  movimiento.datosIA.confianza === 'media' ? 'text-yellow-400' : 'text-red-400'
                }>{movimiento.datosIA.confianza}</span>
              </div>
            )}

            {movimiento.motivoRechazo && (
              <div className="bg-red-950/30 border border-red-800 px-3 py-2 text-xs text-red-200">
                <div className="font-bold mb-1">Motivo de rechazo:</div>
                {movimiento.motivoRechazo}
              </div>
            )}
          </div>

          {/* PROYECTO */}
          <div className="border-t border-zinc-800 p-4 bg-zinc-950">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-3 h-3 text-zinc-400" />
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Proyecto / Obra asignado</div>
            </div>

            {!campos.proyectoId && (
              <div className="bg-yellow-950/30 border border-yellow-800 px-3 py-2 mb-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-yellow-200">
                  Este gasto <strong>no tiene proyecto asignado</strong>. Asígnale uno para que se impute al margen de esa obra.
                </div>
              </div>
            )}

            <select
              value={campos.proyectoId}
              onChange={e => set('proyectoId', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
            >
              <option value="">— Sin proyecto —</option>
              {proyectosActivos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre}{p.cliente ? ` · ${p.cliente}` : ''}{p.referenciaOdoo ? ` · ${p.referenciaOdoo}` : ''}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800 px-3 py-2 m-4 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* FOOTER fijo */}
        <div className="border-t border-zinc-800 px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0 bg-zinc-950">
          <div className="text-[10px] text-zinc-500 truncate">
            {hayCambios
              ? <span className="text-yellow-400">⚠ {Object.keys(diff).length} {Object.keys(diff).length === 1 ? 'cambio' : 'cambios'} sin guardar</span>
              : 'Sin cambios'}
          </div>
          <button
            onClick={guardar}
            disabled={!hayCambios || guardando}
            className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center gap-1 flex-shrink-0"
          >
            {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Guardar
          </button>
        </div>
      </div>

      {/* VISOR FULLSCREEN de la foto */}
      {verGrande && fotoUrl && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col" onClick={() => setVerGrande(false)}>
          <div className="flex items-center justify-between px-3 py-2 bg-black/80 border-b border-zinc-800" onClick={e => e.stopPropagation()}>
            <div className="text-xs text-zinc-400 uppercase tracking-widest">Foto de factura</div>
            <div className="flex items-center gap-2">
              <button onClick={() => rotar(-90)} className="bg-zinc-800 hover:bg-zinc-700 text-white p-2" title="Rotar izq"><RotateCcw className="w-4 h-4" /></button>
              <button onClick={() => rotar(90)} className="bg-zinc-800 hover:bg-zinc-700 text-white p-2" title="Rotar der"><RotateCw className="w-4 h-4" /></button>
              <button onClick={() => setVerGrande(false)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-xs font-black uppercase flex items-center gap-1"><X className="w-4 h-4" /> Cerrar</button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-auto p-4" onClick={e => e.stopPropagation()}>
            <img
              src={fotoUrl}
              alt=""
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{ transform: `rotate(${rotacion}deg)` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-0.5">
        {icon}{label}
      </div>
      <div className="text-sm text-zinc-200">{children}</div>
    </div>
  );
}

function Field({ icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-0.5">
        {icon}{label}
      </div>
      {children}
    </div>
  );
}
