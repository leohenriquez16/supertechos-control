'use client';

// v8.17.73: Modal para ver el detalle de facturas asociadas a un proveedor de
// caja chica. Lista todas las gasto_factura aprobadas que matchean el RNC del
// proveedor. Desktop: tabla. Mobile: cards.
// Click en una fila → abre el ModalDetalleMovimiento para editar.

import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ExternalLink, Building2 } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFechaCorta, formatRNC } from '../../lib/helpers/formato';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';
import ModalDetalleMovimiento from './ModalDetalleMovimiento';

export default function ModalFacturasProveedor({ proveedor, usuario, data, onCerrar, onCambio }) {
  const [movimientos, setMovimientos] = useState(null); // null = cargando
  const [seleccionado, setSeleccionado] = useState(null);

  const cargar = async () => {
    setMovimientos(null);
    try {
      // Solo gasto_factura — filtramos status en el cliente para mostrar también pendientes/rechazados
      const movs = await db.listarMovimientosCajaChica({ rnc: proveedor.rnc, tipo: 'gasto_factura' });
      setMovimientos(movs);
    } catch (e) {
      console.error(e);
      setMovimientos([]);
    }
  };
  useEffect(() => { cargar(); }, [proveedor.rnc]);

  const total = useMemo(
    () => (movimientos || []).reduce((s, m) => s + Number(m.monto || 0), 0),
    [movimientos]
  );
  const aprobados = useMemo(
    () => (movimientos || []).filter(m => m.status === 'aprobado').length,
    [movimientos]
  );

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !seleccionado) onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar, seleccionado]);

  const onActualizado = () => {
    cargar();
    onCambio?.();
  };

  // v8.17.85: Portal a document.body para escapar de cualquier containing
  // block del shell (md:ml-60, transform) que podría recortar el modal.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-2 sm:p-4" onClick={onCerrar}>
        <div
          className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-5xl flex flex-col"
          style={{ maxHeight: 'calc(100vh - 1rem)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 flex-shrink-0 bg-zinc-900 gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] tracking-widest uppercase text-red-500 font-bold flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Proveedor
              </div>
              <div className="text-base font-black truncate">{proveedor.nombre}</div>
              <div className="text-[11px] text-zinc-500 font-mono">RNC {formatRNC(proveedor.rnc)}</div>
            </div>
            <button
              onClick={onCerrar}
              className="bg-zinc-800 hover:bg-red-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1 flex-shrink-0"
              title="Cerrar (ESC)"
            >
              <X className="w-4 h-4" /> Cerrar
            </button>
          </div>

          {/* Stats */}
          {movimientos && movimientos.length > 0 && (
            <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 flex-shrink-0">
              <span>📋 <b className="text-white">{movimientos.length}</b> factura{movimientos.length !== 1 ? 's' : ''}</span>
              <span>✓ <b className="text-green-400">{aprobados}</b> aprobada{aprobados !== 1 ? 's' : ''}</span>
              <span>💰 Total <b className="text-orange-400">{formatRD(total)}</b></span>
              {proveedor.categoria && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300">{proveedor.categoria}</span>
              )}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {movimientos === null ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
              </div>
            ) : movimientos.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">
                Sin facturas registradas con este RNC todavía.
              </div>
            ) : (
              <>
                {/* DESKTOP: tabla */}
                <table className="hidden md:table w-full text-sm">
                  <thead className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-10">
                    <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                      <th className="px-2 py-2 text-left">Fecha</th>
                      <th className="px-2 py-2 text-left">Proyecto</th>
                      <th className="px-2 py-2 text-left">Empresa</th>
                      <th className="px-2 py-2 text-left">NCF</th>
                      <th className="px-2 py-2 text-left">Concepto</th>
                      <th className="px-2 py-2 text-left">Persona</th>
                      <th className="px-2 py-2 text-left">Status</th>
                      <th className="px-2 py-2 text-right">Monto</th>
                      <th className="px-2 py-2 text-right w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map(m => {
                      const persona = data.personal.find(p => p.id === m.personaId);
                      const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
                      const emp = m.empresaReceptora ? EMPRESAS_RECEPTORAS[m.empresaReceptora] : null;
                      return (
                        <tr
                          key={m.id}
                          onClick={() => setSeleccionado(m)}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer"
                        >
                          <td className="px-2 py-2 text-zinc-300 whitespace-nowrap">{formatFechaCorta(m.fecha)}</td>
                          <td className="px-2 py-2 text-zinc-300 truncate max-w-[180px]">
                            {proy ? (
                              <>
                                <div className="font-bold text-xs truncate">{proy.cliente || proy.nombre}</div>
                                {proy.referenciaOdoo && <div className="text-[9px] text-zinc-500 font-mono">{proy.referenciaOdoo}</div>}
                              </>
                            ) : <span className="text-zinc-600 italic">—</span>}
                          </td>
                          <td className="px-2 py-2 text-zinc-300 text-[11px]">
                            {emp ? <span className={`font-bold ${emp.textColor}`}>{emp.label}</span> : <span className="text-zinc-600">—</span>}
                          </td>
                          <td className="px-2 py-2 text-zinc-400 font-mono text-[11px]">{m.datosIA?.ncf || <span className="text-zinc-600">—</span>}</td>
                          <td className="px-2 py-2 text-zinc-300 truncate max-w-[200px]" title={m.concepto || ''}>
                            {m.concepto || <span className="text-zinc-600 italic">sin concepto</span>}
                          </td>
                          <td className="px-2 py-2 text-zinc-400 text-[11px] truncate max-w-[120px]">{persona?.nombre || '—'}</td>
                          <td className="px-2 py-2">
                            <span className={`text-[10px] uppercase font-bold ${
                              m.status === 'aprobado' ? 'text-green-400' :
                              m.status === 'rechazado' ? 'text-red-400' : 'text-orange-400'
                            }`}>{m.status}</span>
                          </td>
                          <td className="px-2 py-2 text-right font-bold text-orange-400 whitespace-nowrap">{formatRD(m.monto)}</td>
                          <td className="px-2 py-2 text-right">
                            <ExternalLink className="w-3 h-3 text-zinc-500 inline" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-zinc-950 border-t border-zinc-800">
                    <tr>
                      <td colSpan={7} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Total</td>
                      <td className="px-2 py-2 text-right font-black text-orange-400">{formatRD(total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* MOBILE: cards */}
                <div className="md:hidden p-2 space-y-2">
                  {movimientos.map(m => {
                    const persona = data.personal.find(p => p.id === m.personaId);
                    const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
                    const emp = m.empresaReceptora ? EMPRESAS_RECEPTORAS[m.empresaReceptora] : null;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSeleccionado(m)}
                        className="w-full bg-zinc-950 border border-zinc-800 hover:border-red-600 p-3 text-left"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] text-zinc-500 mb-0.5">{formatFechaCorta(m.fecha)}</div>
                            <div className="text-xs font-bold truncate">
                              {proy ? (proy.cliente || proy.nombre) : <span className="text-zinc-500 italic">sin proyecto</span>}
                            </div>
                            {m.concepto && <div className="text-[10px] text-zinc-400 truncate mt-0.5">{m.concepto}</div>}
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {emp && <span className={`text-[9px] uppercase font-bold ${emp.textColor}`}>{emp.label}</span>}
                              {m.datosIA?.ncf && <span className="text-[9px] text-zinc-500 font-mono">{m.datosIA.ncf}</span>}
                              <span className={`text-[9px] uppercase font-bold ${
                                m.status === 'aprobado' ? 'text-green-400' :
                                m.status === 'rechazado' ? 'text-red-400' : 'text-orange-400'
                              }`}>{m.status}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-base font-black text-orange-400 whitespace-nowrap">{formatRD(m.monto)}</div>
                            {persona && <div className="text-[9px] text-zinc-500 mt-0.5">{persona.nombre}</div>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sub-modal: detalle de movimiento al click en una fila */}
      {seleccionado && (
        <ModalDetalleMovimiento
          usuario={usuario}
          movimiento={seleccionado}
          data={data}
          movimientos={movimientos}
          onCerrar={() => setSeleccionado(null)}
          onActualizado={onActualizado}
        />
      )}
    </>,
    document.body
  );
}
