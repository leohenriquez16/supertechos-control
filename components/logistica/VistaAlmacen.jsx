'use client';

// v8.29.0: Vista "Almacén" — la cola de requisiciones del encargado de almacén.
// Recibe los pedidos de las obras al instante (adiós grupos de WhatsApp), va marcando
// cada renglón despachado, y avanza el estado: preparando → LISTA para envío.
// Cuando está lista, Rutas la monta en un camión o en un envío pagado.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Package, RefreshCw } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';
import { ESTADOS_REQ } from './RequisicionesProyecto';

const COLS = [
  { estado: 'pendiente', titulo: '📥 Nuevas', siguiente: 'preparando', btn: 'Empezar a preparar' },
  { estado: 'preparando', titulo: '🔧 Preparando', siguiente: 'lista', btn: 'Marcar LISTA para envío' },
  { estado: 'lista', titulo: '📦 Listas para envío', siguiente: null, btn: null },
  { estado: 'en_ruta', titulo: '🚚 En ruta', siguiente: null, btn: null },
];

export default function VistaAlmacen({ usuario, data, onVolver }) {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);

  const recargar = async () => {
    setLoading(true);
    try { setReqs(await db.listarRequisiciones({})); }
    catch (e) { console.warn('Almacén:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, []);

  const proyectoDe = (r) => (data.proyectos || []).find(p => p.id === r.proyectoId);
  const etiqueta = (r) => { const p = proyectoDe(r); return p ? (p.cliente || p.nombre || p.referenciaOdoo) : r.proyectoId; };

  const avanzar = async (r, estado) => {
    setProcesando(r.id);
    try { await db.actualizarRequisicion(r.id, { estado }); await recargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
    setProcesando(null);
  };
  const toggleItem = async (r, it) => {
    try { await db.marcarItemRequisicion(it.id, !it.despachado); await recargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const entregadasHoy = useMemo(() => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
    return reqs.filter(r => r.estado === 'entregada' && (r.entregadaAt || '').slice(0, 10) === hoy);
  }, [reqs]);

  return (
    <div className="p-4 md:p-6 max-w-4xl lg:max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Package className="w-6 h-6 text-amber-400" /> Almacén</h1>
            <div className="text-[11px] text-zinc-500">Requisiciones de las obras · el pedido llega aquí, no al WhatsApp</div>
          </div>
        </div>
        <button onClick={recargar} className="text-zinc-500 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="text-center py-10"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <>
          {COLS.map(col => {
            const del = reqs.filter(r => r.estado === col.estado)
              .sort((a, b) => (b.urgente - a.urgente) || (a.createdAt || '').localeCompare(b.createdAt || ''));
            return (
              <div key={col.estado}>
                <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">{col.titulo} ({del.length})</div>
                {del.length === 0 ? (
                  <div className="text-xs text-zinc-600 italic mb-3">Nada aquí.</div>
                ) : (
                  <div className="space-y-2 mb-4">
                    {del.map(r => {
                      const todosDespachados = r.items.length > 0 && r.items.every(i => i.despachado);
                      return (
                        <div key={r.id} className={`bg-zinc-900 border rounded-card p-3 ${r.urgente ? 'border-red-800/70' : 'border-zinc-800'}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{etiqueta(r)} {r.urgente && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-red-600/20 text-red-400 align-middle">🔥 Urgente</span>}</div>
                              <div className="text-[10px] text-zinc-500">{formatFechaCorta((r.createdAt || '').slice(0, 10))} · pidió {r.solicitadoPorNombre || '—'}</div>
                            </div>
                            {col.siguiente && (
                              <button onClick={() => avanzar(r, col.siguiente)} disabled={procesando === r.id || (col.siguiente === 'lista' && !todosDespachados)}
                                title={col.siguiente === 'lista' && !todosDespachados ? 'Marca todos los renglones primero' : ''}
                                className="shrink-0 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-[10px] font-black uppercase px-3 py-2 rounded-card">
                                {procesando === r.id ? '…' : col.btn}
                              </button>
                            )}
                          </div>
                          <div className="mt-1.5 space-y-1">
                            {r.items.map(it => (
                              <label key={it.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                <input type="checkbox" checked={it.despachado} disabled={col.estado === 'en_ruta'} onChange={() => toggleItem(r, it)} className="w-3.5 h-3.5 accent-green-500" />
                                <span className={it.despachado ? 'line-through text-zinc-500' : 'text-zinc-200'}>
                                  {it.descripcion}{it.cantidad != null && it.cantidad !== '' ? ` — ${it.cantidad} ${it.unidad || ''}` : ''}
                                </span>
                              </label>
                            ))}
                          </div>
                          {r.notas && <div className="text-[10px] text-zinc-500 mt-1">📝 {r.notas}</div>}
                          {col.estado === 'lista' && <div className="text-[10px] text-purple-400 mt-1.5">Esperando que Rutas la monte en un viaje o envío pagado.</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="text-[11px] text-zinc-500 border-t border-zinc-800 pt-2">
            ✓ Entregadas hoy: <b className="text-green-400">{entregadasHoy.length}</b>
          </div>
        </>
      )}
    </div>
  );
}
