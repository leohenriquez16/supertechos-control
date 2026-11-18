'use client';

// v8.75: bandeja "Por montar" — requisiciones listas del almacén y retiros de
// sobrante sin planificar. Un clic y quedan en la ruta que tienes abierta.

import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { formatFechaCorta } from '../../../lib/helpers/formato';

export default function BandejaPorMontar({ listas, diligencias, enAlmacen, nombreObra, tieneGps, destino, onMontarRequisicion, onMontarDiligencia }) {
  const [ocupado, setOcupado] = useState(null);
  const [verAlmacen, setVerAlmacen] = useState(false);
  const total = listas.length + diligencias.length;
  const correr = async (id, fn) => { setOcupado(id); try { await fn(); } finally { setOcupado(null); } };

  const BotonAgregar = ({ id, onClick, proyectoId }) => {
    const sinGps = !tieneGps(proyectoId);
    return (
      <button onClick={() => correr(id, onClick)} disabled={!destino || ocupado === id || sinGps}
        title={sinGps ? 'La obra no tiene ubicación GPS — asígnala en el proyecto' : !destino ? 'Abre o crea una ruta primero' : `Agregar a la ruta de ${destino}`}
        className="shrink-0 text-[11px] font-black bg-cyan-700 hover:bg-cyan-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-2 py-1.5 rounded-card flex items-center gap-1">
        {ocupado === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {sinGps ? 'Sin GPS' : 'Agregar'}
      </button>
    );
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wider text-purple-300">Por montar {total > 0 && <span className="text-zinc-400">({total})</span>}</div>
        {destino && total > 0 && <div className="text-[11px] text-zinc-500 truncate">→ {destino}</div>}
      </div>
      {total === 0 && <div className="text-xs text-zinc-500">Nada esperando camión.</div>}

      {listas.map(r => (
        <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate">📦 {nombreObra(r.proyectoId)} {r.urgente && <span className="text-red-400">· urgente</span>}</div>
            <div className="text-[11px] text-zinc-500 truncate">{(r.items || []).map(i => i.descripcion).join(', ')}</div>
          </div>
          <BotonAgregar id={r.id} proyectoId={r.proyectoId} onClick={() => onMontarRequisicion(r)} />
        </div>
      ))}

      {diligencias.map(d => (
        <div key={d.id} className="bg-zinc-950 border border-red-900/50 rounded-card px-2.5 py-2 flex items-center gap-2">
          {d.fotoUrl && <a href={d.fotoUrl} target="_blank" rel="noreferrer" className="shrink-0"><img src={d.fotoUrl} alt="" className="w-9 h-9 object-cover rounded-card border border-zinc-800" /></a>}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate">♻ Retiro de sobrante · {nombreObra(d.proyectoId)}</div>
            <div className="text-[11px] text-zinc-500 truncate">{(d.descripcion || '').split('\n').join(' · ')}</div>
            <div className="text-[10px] text-zinc-600">{formatFechaCorta((d.createdAt || '').slice(0, 10))}{d.creadoPorNombre ? ` · ${d.creadoPorNombre}` : ''}</div>
          </div>
          <BotonAgregar id={d.id} proyectoId={d.proyectoId} onClick={() => onMontarDiligencia(d)} />
        </div>
      ))}

      {enAlmacen.length > 0 && (
        <div className="border-t border-zinc-800 pt-2">
          <button onClick={() => setVerAlmacen(!verAlmacen)} className="w-full flex items-center justify-between text-left">
            <span className="text-[11px] font-bold text-amber-400">Preparándose en almacén: {enAlmacen.length}</span>
            <span className="text-zinc-600 text-xs">{verAlmacen ? '▲' : '▼'}</span>
          </button>
          {verAlmacen && (
            <div className="mt-1.5 space-y-1">
              {enAlmacen.map(r => (
                <div key={r.id} className="text-[11px] text-zinc-400 truncate">
                  {r.estado === 'preparando' ? '🔧' : '📥'} {nombreObra(r.proyectoId)}{r.urgente ? ' · urgente' : ''} — {(r.items || []).filter(i => i.despachado).length}/{(r.items || []).length} despachados
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
