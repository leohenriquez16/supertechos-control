'use client';

// v8.29.0: Tab "Materiales" del proyecto — requisiciones de materiales desde la obra.
// Reemplaza los pedidos por WhatsApp: el supervisor/maestro pide aquí, almacén lo ve
// al instante, y la obra ve el estado real (pendiente → preparando → lista → en ruta
// → entregada) sin preguntar en el grupo.

import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Package, X, Trash2 } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';

export const ESTADOS_REQ = {
  pendiente:  { label: 'Pendiente en almacén', color: 'bg-amber-600/20 text-amber-400' },
  preparando: { label: 'Preparando', color: 'bg-blue-600/20 text-blue-400' },
  lista:      { label: 'Lista para envío', color: 'bg-purple-600/20 text-purple-400' },
  en_ruta:    { label: 'En ruta 🚚', color: 'bg-cyan-600/20 text-cyan-400' },
  entregada:  { label: 'Entregada ✓', color: 'bg-green-600/20 text-green-400' },
  cancelada:  { label: 'Cancelada', color: 'bg-zinc-700/40 text-zinc-500' },
};

const itemVacio = () => ({ descripcion: '', cantidad: '', unidad: '' });

export default function RequisicionesProyecto({ usuario, proyecto, esAdmin }) {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [items, setItems] = useState([itemVacio()]);
  const [urgente, setUrgente] = useState(false);
  const [notas, setNotas] = useState('');

  const recargar = async () => {
    setLoading(true);
    try { setReqs(await db.listarRequisiciones({ proyectoId: proyecto.id })); }
    catch (e) { console.warn('Requisiciones:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [proyecto.id]);

  const setItem = (i, campo, v) => setItems(items.map((x, n) => n === i ? { ...x, [campo]: v } : x));

  const guardar = async () => {
    const validos = items.filter(i => i.descripcion.trim());
    if (validos.length === 0) { alert('Agrega al menos un material.'); return; }
    setGuardando(true);
    try {
      await db.crearRequisicion({
        proyectoId: proyecto.id,
        solicitadoPorId: usuario.id, solicitadoPorNombre: usuario.nombre,
        urgente, notas, items: validos,
      });
      setCreando(false); setItems([itemVacio()]); setUrgente(false); setNotas('');
      await recargar();
    } catch (e) { alert('Error creando la requisición: ' + (e?.message || e)); }
    setGuardando(false);
  };

  const cancelar = async (r) => {
    if (!confirm('¿Cancelar esta requisición?')) return;
    try { await db.actualizarRequisicion(r.id, { estado: 'cancelada' }); await recargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      {!creando ? (
        <button onClick={() => setCreando(true)} className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Pedir materiales al almacén
        </button>
      ) : (
        <div className="bg-zinc-900 border-2 border-red-600 rounded-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-widest uppercase font-bold text-red-500">Nueva requisición</div>
            <button onClick={() => setCreando(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)} placeholder="Material (ej. Lona SBS 3mm)" className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm min-w-0" />
              <input value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} placeholder="Cant." type="number" className="w-16 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
              <input value={it.unidad} onChange={e => setItem(i, 'unidad', e.target.value)} placeholder="Ud." className="w-16 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
              {items.length > 1 && <button onClick={() => setItems(items.filter((_, n) => n !== i))} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button onClick={() => setItems([...items, itemVacio()])} className="text-xs text-blue-400 hover:text-blue-300 font-bold">+ Otro material</button>
          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Nota para almacén (opcional)" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={urgente} onChange={e => setUrgente(e.target.checked)} className="w-3.5 h-3.5 accent-red-500" /> 🔥 Urgente — la obra está parada esperando esto
          </label>
          <button onClick={guardar} disabled={guardando} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1.5">
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />} Enviar al almacén
          </button>
        </div>
      )}

      {reqs.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-5 text-center text-zinc-500 text-sm">
          Esta obra no ha pedido materiales todavía.
        </div>
      ) : (
        <div className="space-y-2">
          {reqs.map(r => {
            const est = ESTADOS_REQ[r.estado] || ESTADOS_REQ.pendiente;
            return (
              <div key={r.id} className={`bg-zinc-950 border rounded-card p-3 ${r.urgente && r.estado !== 'entregada' && r.estado !== 'cancelada' ? 'border-red-800/70' : 'border-zinc-800'}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-card ${est.color}`}>{est.label}</span>
                    {r.urgente && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-red-600/20 text-red-400">🔥 Urgente</span>}
                    <span className="text-[10px] text-zinc-500">{formatFechaCorta((r.createdAt || '').slice(0, 10))} · {r.solicitadoPorNombre || ''}</span>
                  </div>
                  {(r.estado === 'pendiente') && (esAdmin || r.solicitadoPorId === usuario.id) && (
                    <button onClick={() => cancelar(r)} className="text-[10px] text-zinc-500 hover:text-red-400 uppercase font-bold">Cancelar</button>
                  )}
                </div>
                <div className="mt-1.5 space-y-0.5">
                  {r.items.map(it => (
                    <div key={it.id} className="text-xs text-zinc-300 flex items-center gap-1.5">
                      <span className={it.despachado ? 'text-green-400' : 'text-zinc-600'}>{it.despachado ? '✓' : '•'}</span>
                      <span className={it.despachado ? 'line-through text-zinc-500' : ''}>{it.descripcion}{it.cantidad != null && it.cantidad !== '' ? ` — ${it.cantidad} ${it.unidad || ''}` : ''}</span>
                    </div>
                  ))}
                </div>
                {r.notas && <div className="text-[10px] text-zinc-500 mt-1">📝 {r.notas}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
