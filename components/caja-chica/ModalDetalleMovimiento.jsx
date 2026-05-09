'use client';

// v8.15.1: Modal de detalle de un movimiento de caja chica.
// Muestra foto + datos AI + permite asignar/cambiar proyecto si no tenía.
// Funciona como acción de "abrir" desde la lista de movimientos.

import React, { useState, useEffect } from 'react';
import { X, Loader2, Save, Camera, AlertCircle, Building2, FileText, User as UserIcon, Calendar, DollarSign } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFechaCorta } from '../../lib/helpers/formato';

export default function ModalDetalleMovimiento({ usuario, movimiento, data, onCerrar, onActualizado }) {
  const persona = data.personal.find(p => p.id === movimiento.personaId);
  const proyectoActual = movimiento.proyectoId ? data.proyectos.find(p => p.id === movimiento.proyectoId) : null;
  const proyectosActivos = (data.proyectos || []).filter(p => !p.archivado);
  const cat = (data.categoriasCajaChica || []).find(c => c.id === movimiento.datosIA?.categoria_sugerida);

  const [proyectoIdNuevo, setProyectoIdNuevo] = useState(movimiento.proyectoId || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [fotoUrl, setFotoUrl] = useState(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);

  const tieneFoto = !!movimiento.tieneFoto;
  const cambioProyecto = (proyectoIdNuevo || '') !== (movimiento.proyectoId || '');

  useEffect(() => {
    if (!tieneFoto) return;
    setCargandoFoto(true);
    db.obtenerFotoFacturaCajaChica(movimiento.id)
      .then(url => setFotoUrl(url))
      .catch(e => console.error('No se pudo cargar foto:', e))
      .finally(() => setCargandoFoto(false));
  }, [movimiento.id, tieneFoto]);

  const guardarProyecto = async () => {
    if (guardando || !cambioProyecto) return;
    setGuardando(true); setError('');
    try {
      await db.actualizarMovimientoCajaChica(movimiento.id, {
        proyectoId: proyectoIdNuevo || null,
      });
      onActualizado?.();
      onCerrar();
    } catch (e) {
      setError(e.message || 'Error guardando');
    }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-2xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 flex-shrink-0">
          <div className="font-black uppercase tracking-wider text-sm">Detalle del gasto</div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Top: foto + datos básicos en grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Foto */}
            <div className="bg-black border-r border-zinc-800 flex items-center justify-center min-h-[300px] p-2">
              {tieneFoto ? (
                cargandoFoto ? (
                  <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
                ) : fotoUrl ? (
                  <img src={fotoUrl} alt="Factura" className="max-w-full max-h-[400px] object-contain" />
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

            {/* Datos */}
            <div className="p-4 space-y-3">
              <div className="flex items-baseline gap-2">
                <DollarSign className="w-5 h-5 text-orange-400" />
                <div className="text-3xl font-black text-orange-400">{formatRD(movimiento.monto)}</div>
              </div>

              <Item icon={<UserIcon className="w-3 h-3" />} label="Persona">
                {persona?.nombre || movimiento.personaId}
              </Item>

              <Item icon={<Calendar className="w-3 h-3" />} label="Fecha">
                {formatFechaCorta(movimiento.fecha)}
              </Item>

              <Item icon={<FileText className="w-3 h-3" />} label="Tipo">
                {movimiento.tipo} · status: <span className={`font-bold ${movimiento.status === 'aprobado' ? 'text-green-400' : movimiento.status === 'rechazado' ? 'text-red-400' : 'text-orange-400'}`}>{movimiento.status}</span>
              </Item>

              {(movimiento.proveedor || movimiento.rnc) && (
                <Item label="Proveedor">
                  <div>{movimiento.proveedor || <span className="text-zinc-500">—</span>}</div>
                  {movimiento.rnc && <div className="text-[10px] text-zinc-500 font-mono">RNC: {movimiento.rnc}</div>}
                </Item>
              )}

              {movimiento.datosIA?.ncf && (
                <Item label="NCF">
                  <span className="font-mono text-xs">{movimiento.datosIA.ncf}</span>
                </Item>
              )}

              {cat && (
                <Item label="Categoría">
                  <span style={{ color: cat.color }}>{cat.icono} {cat.nombre}</span>
                </Item>
              )}

              {movimiento.concepto && (
                <Item label="Concepto">
                  <span className="text-xs">{movimiento.concepto}</span>
                </Item>
              )}

              {movimiento.datosIA?.confianza && (
                <Item label="Confianza AI">
                  <span className={
                    movimiento.datosIA.confianza === 'alta' ? 'text-green-400' :
                    movimiento.datosIA.confianza === 'media' ? 'text-yellow-400' : 'text-red-400'
                  }>{movimiento.datosIA.confianza}</span>
                </Item>
              )}

              {movimiento.motivoRechazo && (
                <div className="bg-red-950/30 border border-red-800 px-3 py-2 text-xs text-red-200">
                  <div className="font-bold mb-1">Motivo de rechazo:</div>
                  {movimiento.motivoRechazo}
                </div>
              )}
            </div>
          </div>

          {/* Sección de Proyecto — siempre visible, editable */}
          <div className="border-t border-zinc-800 p-4 bg-zinc-950">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-3 h-3 text-zinc-400" />
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Proyecto / Obra asignado</div>
            </div>

            {proyectoActual ? (
              <div className="bg-zinc-900 border border-zinc-800 px-3 py-2 mb-2">
                <div className="text-sm font-bold">{proyectoActual.nombre}</div>
                <div className="text-[10px] text-zinc-500">
                  {proyectoActual.cliente}
                  {proyectoActual.referenciaOdoo && ` · ${proyectoActual.referenciaOdoo}`}
                </div>
              </div>
            ) : (
              <div className="bg-yellow-950/30 border border-yellow-800 px-3 py-2 mb-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-yellow-200">
                  Este gasto <strong>no tiene proyecto asignado</strong>. Asígnale uno para que se impute al margen de esa obra.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <select
                value={proyectoIdNuevo}
                onChange={e => setProyectoIdNuevo(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
              >
                <option value="">— Sin proyecto —</option>
                {proyectosActivos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}{p.cliente ? ` · ${p.cliente}` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={guardarProyecto}
                disabled={!cambioProyecto || guardando}
                className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center justify-center gap-1"
              >
                {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {cambioProyecto
                  ? (proyectoIdNuevo ? 'Asignar proyecto' : 'Quitar proyecto')
                  : 'Sin cambios'}
              </button>
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-800 px-3 py-2 text-xs text-red-300 mt-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}
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
        {icon}
        {label}
      </div>
      <div className="text-sm text-zinc-200">{children}</div>
    </div>
  );
}
