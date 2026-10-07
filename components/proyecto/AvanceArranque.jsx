'use client';

// v8.61.0 — Avance de arranque: lo que la obra ya traía hecho al entrar al ERP. Suma al % de
// avance pero NO a producción ni a nómina (se hizo y pagó fuera del ERP). Evita inventar
// reportes con fechas pasadas para cuadrar el avance.

import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import * as db from '../../lib/db';

export default function AvanceArranque({ proyecto, data, usuario, onRecargar }) {
  const [abierto, setAbierto] = useState(false);
  const [pcts, setPcts] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const yaTiene = useMemo(() => (data.reportes || []).some(r => r.proyectoId === proyecto.id && r.arranque), [data.reportes, proyecto.id]);
  if (!(proyecto.areas || []).length) return null;

  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      await db.registrarAvanceArranque({ proyecto, sistemas: data.sistemas || {}, porcentajes: pcts, usuario });
      setAbierto(false); setPcts({}); onRecargar?.();
    } catch (e) { setError(e?.message || String(e)); }
    setGuardando(false);
  };

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] tracking-widest uppercase text-sky-400 font-bold">Avance de arranque</div>
          <div className="text-[10px] text-zinc-500">{yaTiene ? 'Ya registrado. Lo que la obra traía al entrar al ERP (no cuenta como producción ni nómina).' : '¿La obra entró al ERP ya empezada? Registra lo que traía, en vez de reportes con fechas pasadas.'}</div>
        </div>
        <button onClick={() => { setAbierto(true); setError(''); }} className="shrink-0 text-[11px] font-bold uppercase px-2.5 py-1 rounded-card bg-zinc-800 hover:bg-zinc-700 text-zinc-200">{yaTiene ? 'Agregar' : 'Registrar'}</button>
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={() => !guardando && setAbierto(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-black uppercase tracking-wider">¿Cuánto traía cada área?</div>
              <button onClick={() => setAbierto(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-[11px] text-zinc-500">Porcentaje terminado de cada área al entrar al ERP. Se aplica a todas sus tareas.</div>
            {(proyecto.areas || []).map(a => (
              <div key={a.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0 text-xs truncate">{a.nombre || 'Área'} <span className="text-zinc-500">· {a.m2} m²</span></div>
                <input type="number" inputMode="decimal" min="0" max="100" value={pcts[a.id] ?? ''} onChange={e => setPcts({ ...pcts, [a.id]: e.target.value })}
                  placeholder="0" className="w-20 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1 text-sm text-white text-right" />
                <span className="text-xs text-zinc-400">%</span>
              </div>
            ))}
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button onClick={guardar} disabled={guardando} className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black uppercase py-2.5 text-xs rounded-card flex items-center justify-center gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar avance de arranque
            </button>
          </div>
        </div>
      )}
    </>
  );
}
