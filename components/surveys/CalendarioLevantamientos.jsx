'use client';

// v8.19.84: [Levantamientos · Fase 5] calendario de visitas. Muestra los
// levantamientos por fecha_visita_programada (coloreados por servicio); permite
// agendar / reagendar / quitar fecha. Respeta los filtros del módulo. Aditivo.

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar } from 'lucide-react';
import { SERVICE_LINES, setFechaVisitaProgramada } from '../../lib/surveys';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const iso = (d) => d.toISOString().split('T')[0];

export default function CalendarioLevantamientos({ proyectos, onReload, onAbrir }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [editando, setEditando] = useState(null);
  const [fechaEdit, setFechaEdit] = useState('');
  const [guardando, setGuardando] = useState(false);

  const porFecha = useMemo(() => {
    const m = {};
    for (const p of proyectos) { if (p.fecha_visita_programada) (m[p.fecha_visita_programada] ||= []).push(p); }
    return m;
  }, [proyectos]);
  const sinAgendar = proyectos.filter(p => !p.fecha_visita_programada);

  // Construir las celdas del mes (empezando lunes).
  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const offset = (primero.getDay() + 6) % 7; // lunes=0
    const inicio = new Date(primero); inicio.setDate(primero.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d; });
  }, [mes]);

  const abrirEdicion = (p) => { setEditando(p); setFechaEdit(p.fecha_visita_programada || ''); };
  const guardar = async (fecha) => {
    if (!editando) return;
    setGuardando(true);
    try { await setFechaVisitaProgramada(editando.id, fecha || null); setEditando(null); onReload?.(); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  const nombreMes = mes.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-black capitalize">{nombreMes}</div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1))} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-card text-[10px] font-bold uppercase hover:border-red-600">Hoy</button>
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS.map(d => <div key={d} className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold text-center py-1">{d}</div>)}
        {celdas.map((d, i) => {
          const k = iso(d);
          const items = porFecha[k] || [];
          const esMes = d.getMonth() === mes.getMonth();
          const esHoy = k === iso(hoy);
          return (
            <div key={i} className={`min-h-[78px] rounded-card border p-1 ${esHoy ? 'border-red-600 bg-red-950/10' : 'border-zinc-800 bg-zinc-950'} ${esMes ? '' : 'opacity-40'}`}>
              <div className={`text-[10px] font-bold mb-0.5 ${esHoy ? 'text-red-400' : 'text-zinc-500'}`}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {items.slice(0, 4).map(p => (
                  <button key={p.id} onClick={() => abrirEdicion(p)} className="w-full text-left text-[9px] px-1 py-0.5 rounded truncate text-white"
                    style={{ backgroundColor: (SERVICE_LINES[p.service_line]?.color || '#666') + 'cc' }} title={`${p.client_name} · ${p.asignado_a_nombre || 'sin asignar'}`}>
                    {p.client_name}
                  </button>
                ))}
                {items.length > 4 && <div className="text-[9px] text-zinc-500 px-1">+{items.length - 4} más</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sin agendar */}
      {sinAgendar.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Sin agendar ({sinAgendar.length})</div>
          <div className="flex flex-wrap gap-1">
            {sinAgendar.slice(0, 40).map(p => (
              <button key={p.id} onClick={() => abrirEdicion(p)} className="text-[10px] px-2 py-1 rounded-card border border-zinc-800 hover:border-red-600 text-zinc-300" style={{ borderLeftColor: SERVICE_LINES[p.service_line]?.color || '#666', borderLeftWidth: 3 }}>
                {p.client_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor de fecha */}
      {editando && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-3" onClick={() => setEditando(null)}>
          <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <div className="text-sm font-bold flex items-center gap-1"><Calendar className="w-4 h-4 text-red-500" /> Agendar visita</div>
              <button onClick={() => setEditando(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-2">
              <div className="text-xs text-zinc-300 font-bold truncate">{editando.client_name}</div>
              <div className="text-[10px] text-zinc-500">{SERVICE_LINES[editando.service_line]?.label || ''} · {editando.asignado_a_nombre || 'sin levantador'}</div>
              <input type="date" value={fechaEdit} onChange={e => setFechaEdit(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-2 text-white text-sm outline-none focus:border-red-600" />
              <div className="flex gap-2">
                {editando.fecha_visita_programada && <button onClick={() => guardar(null)} disabled={guardando} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-2 rounded-card">Quitar</button>}
                {onAbrir && <button onClick={() => { const p = editando; setEditando(null); onAbrir(p); }} className="px-3 bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase py-2 rounded-card">Abrir</button>}
                <button onClick={() => guardar(fechaEdit)} disabled={guardando || !fechaEdit} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase py-2 rounded-card">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
