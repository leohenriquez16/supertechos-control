'use client';

// v8.61.0 — Bandeja de reportes atrasados (más de 3 días). Hasta aprobarse no cuentan en nómina
// ni en producción. Cada aprobación le llega por correo a Leo.

import React, { useEffect, useState } from 'react';
import { Check, Clock, Loader2, X } from 'lucide-react';
import * as db from '../../lib/db';

const fmt = (d) => (d ? d.split('-').reverse().join('/') : '');

export default function ReportesAtrasados({ usuario, data, onCambio }) {
  const [lista, setLista] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState('');

  const cargar = async () => { try { setLista(await db.listarReportesAtrasadosPendientes()); } catch { setLista([]); } };
  useEffect(() => { cargar(); }, []);
  if (!lista || !lista.length) return null;

  const proy = (id) => (data.proyectos || []).find(p => p.id === id);
  const resolver = async (r, aprobar) => {
    let nota = '';
    if (!aprobar) {
      nota = (window.prompt('¿Por qué se rechaza? (lo verá quien reportó)') || '').trim();
      if (!nota) return;
    }
    setOcupado(r.id); setError('');
    try {
      await db.resolverReporteAtrasado(r.id, { aprobar, nota, usuario });
      await cargar(); onCambio?.();
    } catch (e) { setError(e?.message || String(e)); }
    setOcupado(null);
  };

  return (
    <div className="bg-amber-950/30 border border-amber-700 rounded-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-400" />
        <div className="text-sm font-black uppercase tracking-wider text-amber-200">Reportes atrasados por aprobar ({lista.length})</div>
      </div>
      <div className="text-[11px] text-amber-300/80">No cuentan en nómina ni en producción hasta que se aprueben. Cada aprobación le llega a Leo.</div>
      {lista.map(r => {
        const p = proy(r.proyectoId);
        const area = (p?.areas || []).find(a => a.id === r.areaId);
        const tarea = (data.sistemas?.[area?.sistemaId || p?.sistema]?.tareas || []).find(t => t.id === r.tareaId);
        return (
          <div key={r.id} className="bg-zinc-950/60 border border-zinc-800 rounded-card p-2 flex items-start gap-2">
            <div className="flex-1 min-w-0 text-xs">
              <div className="font-bold truncate">{[p?.referenciaOdoo, p?.cliente || p?.nombre].filter(Boolean).join(' · ') || 'Obra'}</div>
              <div className="text-zinc-400">{[area?.nombre, tarea?.nombre, r.m2 != null ? `${r.m2} m²` : (r.rollos != null ? `${r.rollos} rollos` : '')].filter(Boolean).join(' · ')}</div>
              <div className="text-[11px] text-amber-300">Del {fmt(r.fecha)} · {r.atrasoDias} días tarde · {r.supervisor}</div>
              <div className="text-[11px] text-zinc-400 italic">“{r.atrasoMotivo || 'sin motivo'}”</div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button disabled={ocupado === r.id} onClick={() => resolver(r, true)} className="bg-green-700 hover:bg-green-600 text-white text-[11px] font-black uppercase px-2.5 py-1.5 rounded-card flex items-center gap-1">
                {ocupado === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Aprobar
              </button>
              <button disabled={ocupado === r.id} onClick={() => resolver(r, false)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold uppercase px-2.5 py-1.5 rounded-card flex items-center gap-1">
                <X className="w-3 h-3" /> Rechazar
              </button>
            </div>
          </div>
        );
      })}
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
