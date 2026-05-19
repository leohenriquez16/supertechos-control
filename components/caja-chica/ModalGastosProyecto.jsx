'use client';

// v8.17.74: Modal de detalle de gastos de un proyecto.
// Abre cuando el admin hace click en una fila de la pestaña "Por Proyecto".
// Muestra: stats agrupados por categoría + tabla/lista de movimientos del proyecto.
// Click en un movimiento → abre ModalDetalleMovimiento.

import React, { useState, useMemo, useEffect } from 'react';
import { X, Building, FileText, Receipt } from 'lucide-react';
import { formatRD, formatNum, formatFechaCorta } from '../../lib/helpers/formato';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';
import ModalDetalleMovimiento from './ModalDetalleMovimiento';

export default function ModalGastosProyecto({ proyecto, movimientos, usuario, data, onCerrar, onCambio }) {
  const [seleccionado, setSeleccionado] = useState(null);
  const [filtroCategoria, setFiltroCategoria] = useState(''); // click en categoría filtra la lista

  // Cerrar con ESC (solo si el sub-modal no está abierto)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !seleccionado) onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar, seleccionado]);

  const categoriasMap = useMemo(() => {
    const m = new Map();
    (data.categoriasCajaChica || []).forEach(c => m.set(c.id, c));
    return m;
  }, [data.categoriasCajaChica]);

  // Agrupación por categoría (incluye sin categoría como "Sin categoría")
  const porCategoria = useMemo(() => {
    const map = new Map();
    movimientos.forEach(m => {
      // Para entregas y ajustes, no hay categoría real; los agrupamos aparte
      if (m.tipo === 'entrega') return;
      const catId = m.datosIA?.categoria_sugerida || '__sin__';
      if (!map.has(catId)) {
        const cat = catId === '__sin__' ? null : categoriasMap.get(catId);
        map.set(catId, {
          id: catId,
          nombre: cat?.nombre || 'Sin categoría',
          color: cat?.color || null,
          icono: cat?.icono || null,
          count: 0,
          total: 0,
          aprobado: 0,
          pendiente: 0,
        });
      }
      const g = map.get(catId);
      g.count++;
      g.total += Number(m.monto || 0);
      if (m.status === 'aprobado') g.aprobado += Number(m.monto || 0);
      else if (m.status === 'pendiente_revision') g.pendiente += Number(m.monto || 0);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [movimientos, categoriasMap]);

  const movimientosFiltrados = useMemo(() => {
    let arr = movimientos.filter(m => m.tipo !== 'entrega'); // entregas no son consumos
    if (filtroCategoria) {
      arr = arr.filter(m => (m.datosIA?.categoria_sugerida || '__sin__') === filtroCategoria);
    }
    // ordenar por fecha desc
    return arr.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [movimientos, filtroCategoria]);

  const totales = useMemo(() => {
    const t = { facturas: 0, dietas: 0, ajustes: 0, count: 0, aprobado: 0, pendiente: 0 };
    movimientos.forEach(m => {
      if (m.tipo === 'entrega') return;
      t.count++;
      if (m.tipo === 'gasto_factura' || m.tipo === 'gasto_sin_factura') t.facturas += Number(m.monto || 0);
      else if (m.tipo === 'dieta' || m.tipo === 'hospedaje') t.dietas += Number(m.monto || 0);
      else if (m.tipo === 'ajuste') t.ajustes += Number(m.monto || 0);
      if (m.status === 'aprobado') t.aprobado += Number(m.monto || 0);
      if (m.status === 'pendiente_revision') t.pendiente += Number(m.monto || 0);
    });
    return t;
  }, [movimientos]);

  const onActualizado = () => {
    onCambio?.();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-2 sm:p-4" onClick={onCerrar}>
        <div
          className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-6xl flex flex-col"
          style={{ maxHeight: 'calc(100vh - 1rem)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 flex-shrink-0 bg-zinc-900 gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] tracking-widest uppercase text-red-500 font-bold flex items-center gap-1">
                <Building className="w-3 h-3" /> Gastos del proyecto
              </div>
              <div className="text-base font-black truncate">{proyecto.nombre}</div>
              {proyecto.referenciaOdoo && <div className="text-[11px] text-zinc-500 font-mono">{proyecto.referenciaOdoo}</div>}
            </div>
            <button
              onClick={onCerrar}
              className="bg-zinc-800 hover:bg-red-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1 flex-shrink-0"
              title="Cerrar (ESC)"
            >
              <X className="w-4 h-4" /> Cerrar
            </button>
          </div>

          {/* Stats row */}
          <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-2 flex-shrink-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
              <span>📋 <b className="text-white">{totales.count}</b> movs</span>
              {totales.facturas > 0 && <span>🧾 Facturas <b className="text-orange-400">{formatRD(totales.facturas)}</b></span>}
              {totales.dietas > 0 && <span>🍽️ Dietas <b className="text-blue-400">{formatRD(totales.dietas)}</b></span>}
              {totales.ajustes !== 0 && <span>⚙️ Ajustes <b className="text-zinc-300">{formatRD(totales.ajustes)}</b></span>}
              <span>✓ Aprobado <b className="text-green-400">{formatRD(totales.aprobado)}</b></span>
              {totales.pendiente > 0 && <span>⏳ Pendiente <b className="text-orange-300">{formatRD(totales.pendiente)}</b></span>}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {/* Por categoría */}
            {porCategoria.length > 0 && (
              <div className="border-b border-zinc-800">
                <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center justify-between">
                  <span>Por categoría · click para filtrar</span>
                  {filtroCategoria && (
                    <button
                      onClick={() => setFiltroCategoria('')}
                      className="text-red-400 hover:text-red-300 normal-case text-[10px]"
                    >
                      Limpiar filtro ×
                    </button>
                  )}
                </div>
                <div className="px-4 pb-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {porCategoria.map(c => {
                      const activo = filtroCategoria === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setFiltroCategoria(activo ? '' : c.id)}
                          className={`text-left p-2 border-2 transition ${
                            activo
                              ? 'bg-red-600/10 border-red-600'
                              : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate flex items-center gap-1">
                                {c.icono && <span>{c.icono}</span>}
                                {c.nombre}
                              </div>
                              <div className="text-[10px] text-zinc-500">{c.count} mov{c.count !== 1 ? 's' : ''}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-black text-orange-400 whitespace-nowrap">{formatRD(c.total)}</div>
                              {c.pendiente > 0 && <div className="text-[9px] text-orange-300">{formatRD(c.pendiente)} pend</div>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Movimientos */}
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
                Movimientos{filtroCategoria && ' · filtrado'} ({movimientosFiltrados.length})
              </div>

              {movimientosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">Sin movimientos.</div>
              ) : (
                <>
                  {/* DESKTOP: tabla */}
                  <table className="hidden md:table w-full text-sm">
                    <thead className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-10">
                      <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                        <th className="px-2 py-2 text-left">Fecha</th>
                        <th className="px-2 py-2 text-left">Persona</th>
                        <th className="px-2 py-2 text-left">Categoría</th>
                        <th className="px-2 py-2 text-left">Proveedor / concepto</th>
                        <th className="px-2 py-2 text-left">Empresa</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientosFiltrados.map(m => {
                        const persona = data.personal.find(p => p.id === m.personaId);
                        const catId = m.datosIA?.categoria_sugerida;
                        const cat = catId ? categoriasMap.get(catId) : null;
                        const emp = m.empresaReceptora ? EMPRESAS_RECEPTORAS[m.empresaReceptora] : null;
                        return (
                          <tr
                            key={m.id}
                            onClick={() => setSeleccionado(m)}
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer"
                          >
                            <td className="px-2 py-2 text-zinc-300 whitespace-nowrap">{formatFechaCorta(m.fecha)}</td>
                            <td className="px-2 py-2 text-zinc-300 text-[11px] truncate max-w-[140px]">{persona?.nombre || '—'}</td>
                            <td className="px-2 py-2 text-zinc-300 text-[11px]">
                              {cat ? (
                                <span className="inline-flex items-center gap-1">
                                  {cat.icono && <span>{cat.icono}</span>}
                                  <span className="truncate max-w-[120px]">{cat.nombre}</span>
                                </span>
                              ) : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="px-2 py-2 text-zinc-300 truncate max-w-[280px]" title={m.concepto || ''}>
                              <div className="font-bold text-xs truncate">{m.proveedor || m.concepto || <span className="text-zinc-500 italic">sin concepto</span>}</div>
                              {m.proveedor && m.concepto && <div className="text-[10px] text-zinc-500 truncate">{m.concepto}</div>}
                            </td>
                            <td className="px-2 py-2 text-[11px]">
                              {emp ? <span className={`font-bold ${emp.textColor}`}>{emp.label}</span> : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="px-2 py-2">
                              <span className={`text-[10px] uppercase font-bold ${
                                m.status === 'aprobado' ? 'text-green-400' :
                                m.status === 'rechazado' ? 'text-red-400' : 'text-orange-400'
                              }`}>{m.status}</span>
                            </td>
                            <td className="px-2 py-2 text-right font-bold text-orange-400 whitespace-nowrap">{formatRD(m.monto)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-zinc-950 border-t border-zinc-800">
                      <tr>
                        <td colSpan={6} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Total</td>
                        <td className="px-2 py-2 text-right font-black text-orange-400">
                          {formatRD(movimientosFiltrados.reduce((s, m) => s + Number(m.monto || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* MOBILE: cards */}
                  <div className="md:hidden space-y-2">
                    {movimientosFiltrados.map(m => {
                      const persona = data.personal.find(p => p.id === m.personaId);
                      const catId = m.datosIA?.categoria_sugerida;
                      const cat = catId ? categoriasMap.get(catId) : null;
                      const emp = m.empresaReceptora ? EMPRESAS_RECEPTORAS[m.empresaReceptora] : null;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setSeleccionado(m)}
                          className="w-full bg-zinc-950 border border-zinc-800 hover:border-red-600 p-3 text-left"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] text-zinc-500 mb-0.5">{formatFechaCorta(m.fecha)} · {persona?.nombre || '—'}</div>
                              <div className="text-xs font-bold truncate">{m.proveedor || m.concepto || <span className="text-zinc-500 italic">sin concepto</span>}</div>
                              <div className="flex gap-2 mt-1 flex-wrap">
                                {cat && <span className="text-[9px] uppercase font-bold text-zinc-300">{cat.icono} {cat.nombre}</span>}
                                {emp && <span className={`text-[9px] uppercase font-bold ${emp.textColor}`}>{emp.label}</span>}
                                <span className={`text-[9px] uppercase font-bold ${
                                  m.status === 'aprobado' ? 'text-green-400' :
                                  m.status === 'rechazado' ? 'text-red-400' : 'text-orange-400'
                                }`}>{m.status}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-base font-black text-orange-400 whitespace-nowrap">{formatRD(m.monto)}</div>
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
      </div>

      {/* Sub-modal: detalle del movimiento al click en una fila */}
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
    </>
  );
}
