'use client';

// v8.15.1: Modal de detalle de un movimiento de caja chica.
// Muestra foto + datos editables + permite asignar/cambiar proyecto.
// Editable: fecha, monto, proveedor, RNC, NCF, concepto, categoría, proyecto.

import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Save, Camera, AlertCircle, Building2, FileText, User as UserIcon, Calendar, DollarSign, RotateCcw, RotateCw, Maximize2 } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFechaCorta } from '../../lib/helpers/formato';

export default function ModalDetalleMovimiento({ usuario, movimiento, data, onCerrar, onActualizado }) {
  const persona = data.personal.find(p => p.id === movimiento.personaId);
  const proyectoActual = movimiento.proyectoId ? data.proyectos.find(p => p.id === movimiento.proyectoId) : null;
  const proyectosActivos = (data.proyectos || []).filter(p => !p.archivado);
  const categoriasActivas = (data.categoriasCajaChica || []).filter(c => c.activa);

  // Estado editable — se inicializa desde el movimiento al abrir.
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

  const rotar = (delta) => setRotacion(r => (((r + delta) % 360) + 360) % 360);

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

  // Detectar qué campos cambiaron
  const diff = useMemo(() => {
    const d = {};
    if (campos.fecha !== (movimiento.fecha || '')) d.fecha = campos.fecha;
    if (Number(campos.monto) !== Number(movimiento.monto || 0)) d.monto = Number(campos.monto);
    if ((campos.proveedor || '') !== (movimiento.proveedor || '')) d.proveedor = campos.proveedor;
    if ((campos.rnc || '') !== (movimiento.rnc || '')) d.rnc = campos.rnc;
    if ((campos.concepto || '') !== (movimiento.concepto || '')) d.concepto = campos.concepto;
    if ((campos.proyectoId || '') !== (movimiento.proyectoId || '')) d.proyectoId = campos.proyectoId || null;
    // NCF y categoría viven en datos_ia
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

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-3xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 flex-shrink-0">
          <div className="font-black uppercase tracking-wider text-sm">Detalle del gasto</div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Top: foto + datos básicos en grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Foto */}
            <div className="bg-black border-r border-zinc-800 flex items-center justify-center min-h-[300px] p-2 relative">
              {tieneFoto ? (
                cargandoFoto ? (
                  <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
                ) : fotoUrl ? (
                  <>
                    <img
                      src={fotoUrl}
                      alt="Factura"
                      className="max-w-full max-h-[450px] object-contain transition-transform duration-200"
                      style={{ transform: `rotate(${rotacion}deg)` }}
                    />
                    {/* Toolbar superpuesta arriba a la derecha */}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={() => rotar(-90)}
                        className="bg-black/70 hover:bg-black text-white p-1.5"
                        title="Rotar a la izquierda"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => rotar(90)}
                        className="bg-black/70 hover:bg-black text-white p-1.5"
                        title="Rotar a la derecha"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setVerGrande(true)}
                        className="bg-black/70 hover:bg-black text-white p-1.5"
                        title="Ver foto en grande"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-zinc-500 text-xs">No se pudo cargar la foto</div>
                )
              ) : movimiento.datosIA?.foto_por_ws ? (
                <div className="text-center text-yellow-400 text-xs px-4">
                  <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  📱 Pendiente de foto por WhatsApp
                </div>
              ) : (
                <div className="text-center text-zinc-600 text-xs px-4">
                  <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Sin foto adjunta
                </div>
              )}
            </div>

            {/* Visor fullscreen de la foto del modal de detalle */}
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

            {/* Datos editables */}
            <div className="p-4 space-y-3">
              {/* Persona y status — no editables */}
              <Item icon={<UserIcon className="w-3 h-3" />} label="Persona">
                {persona?.nombre || movimiento.personaId}
              </Item>

              <Item icon={<FileText className="w-3 h-3" />} label="Tipo · Status">
                <span className="capitalize">{movimiento.tipo}</span> · <span className={`font-bold ${movimiento.status === 'aprobado' ? 'text-green-400' : movimiento.status === 'rechazado' ? 'text-red-400' : 'text-orange-400'}`}>{movimiento.status}</span>
              </Item>

              {/* Fecha — editable */}
              <Field label="Fecha" icon={<Calendar className="w-3 h-3" />}>
                <input
                  type="date"
                  value={campos.fecha}
                  onChange={e => set('fecha', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-sm"
                />
              </Field>

              {/* Monto — editable */}
              <Field label="Monto RD$" icon={<DollarSign className="w-3 h-3" />}>
                <input
                  type="number" step="0.01"
                  value={campos.monto}
                  onChange={e => set('monto', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-base font-bold text-right text-orange-400"
                />
              </Field>

              {/* Proveedor — editable */}
              <Field label="Proveedor (razón social)">
                <input
                  type="text"
                  value={campos.proveedor}
                  onChange={e => set('proveedor', e.target.value)}
                  placeholder="Razón social del emisor"
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-sm"
                />
                <div className="text-[9px] text-zinc-500 mt-0.5 italic">⚠ A veces la AI lee el RNC de Super Techos en lugar del proveedor — corrige aquí.</div>
              </Field>

              {/* RNC + NCF en grid */}
              <div className="grid grid-cols-2 gap-2">
                <Field label="RNC del proveedor">
                  <input
                    type="text"
                    value={campos.rnc}
                    onChange={e => set('rnc', e.target.value)}
                    placeholder="000-00000-0"
                    className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-sm font-mono"
                  />
                </Field>
                <Field label="NCF">
                  <input
                    type="text"
                    value={campos.ncf}
                    onChange={e => set('ncf', e.target.value.toUpperCase())}
                    placeholder="B0100..."
                    className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-sm font-mono"
                  />
                </Field>
              </div>

              {/* Categoría — editable */}
              <Field label="Categoría">
                <select
                  value={campos.categoria}
                  onChange={e => set('categoria', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-sm"
                >
                  <option value="">— Seleccionar —</option>
                  {categoriasActivas.map(c => (
                    <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>
                  ))}
                </select>
              </Field>

              {/* Concepto — editable */}
              <Field label="Concepto">
                <textarea
                  value={campos.concepto}
                  onChange={e => set('concepto', e.target.value)}
                  rows={2}
                  placeholder="Descripción breve"
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-sm"
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
          </div>

          {/* Sección de Proyecto — full width abajo */}
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

        {/* Footer fijo con botón guardar */}
        <div className="border-t border-zinc-800 px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0 bg-zinc-950">
          <div className="text-[10px] text-zinc-500">
            {hayCambios
              ? <span className="text-yellow-400">⚠ Hay cambios sin guardar ({Object.keys(diff).length} {Object.keys(diff).length === 1 ? 'campo' : 'campos'})</span>
              : 'Sin cambios'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCerrar}
              disabled={guardando}
              className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-bold uppercase"
            >
              {hayCambios ? 'Descartar' : 'Cerrar'}
            </button>
            <button
              onClick={guardar}
              disabled={!hayCambios || guardando}
              className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center gap-1"
            >
              {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
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
