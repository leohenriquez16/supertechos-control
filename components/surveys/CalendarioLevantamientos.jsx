'use client';

// v8.19.84/85: [Levantamientos · Fase 5] calendario de visitas. Muestra
// LEVANTAMIENTOS (por fecha_visita_programada, color por servicio) y RECLAMACIONES
// (color ámbar) en la misma agenda; agendar/reagendar/quitar para ambos. Aditivo.

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar, AlertTriangle } from 'lucide-react';
import { SERVICE_LINES, setFechaVisitaProgramada } from '../../lib/surveys';
import * as db from '../../lib/db';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const iso = (d) => d.toISOString().split('T')[0];

export default function CalendarioLevantamientos({ proyectos = [], reclamaciones = [], onReload, onAbrir }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [editando, setEditando] = useState(null); // evento
  const [fechaEdit, setFechaEdit] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Modelo unificado de eventos.
  const eventos = useMemo(() => {
    const a = proyectos.map(p => ({
      kind: 'lev', id: p.id, fecha: p.fecha_visita_programada || null,
      label: p.client_name || p.name || 'Levantamiento', color: SERVICE_LINES[p.service_line]?.color || '#666',
      sub: p.asignado_a_nombre || 'sin levantador', raw: p,
    }));
    const b = reclamaciones.map(r => ({
      kind: 'rec', id: r.id, fecha: r.fechaVisitaProgramada || null,
      label: r.clienteNombre || (r.descripcion || '').slice(0, 30) || 'Reclamación', color: '#fb923c',
      sub: `reclamación${r.severidad ? ' · ' + r.severidad : ''}`, raw: r,
    }));
    return [...a, ...b];
  }, [proyectos, reclamaciones]);

  const porFecha = useMemo(() => {
    const m = {};
    for (const e of eventos) { if (e.fecha) (m[e.fecha] ||= []).push(e); }
    return m;
  }, [eventos]);
  const sinAgendar = eventos.filter(e => !e.fecha);

  const celdas = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const offset = (primero.getDay() + 6) % 7;
    const inicio = new Date(primero); inicio.setDate(primero.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d; });
  }, [mes]);

  const abrirEdicion = (e) => { setEditando(e); setFechaEdit(e.fecha || ''); };
  const guardar = async (fecha) => {
    if (!editando) return;
    setGuardando(true);
    try {
      if (editando.kind === 'lev') await setFechaVisitaProgramada(editando.id, fecha || null);
      else await db.actualizarReclamacion(editando.id, { fechaVisitaProgramada: fecha || null });
      setEditando(null); onReload?.();
    } catch (err) { alert('Error: ' + (err.message || err)); }
    setGuardando(false);
  };

  const nombreMes = mes.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-black capitalize">{nombreMes}</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#0066CC' }} /> Levantamiento</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#fb923c' }} /> Reclamación</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1))} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-card text-[10px] font-bold uppercase hover:border-red-600">Hoy</button>
            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600"><ChevronRight className="w-4 h-4" /></button>
          </div>
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
                {items.slice(0, 4).map(e => (
                  <button key={e.kind + e.id} onClick={() => abrirEdicion(e)} className="w-full text-left text-[9px] px-1 py-0.5 rounded truncate text-white flex items-center gap-0.5"
                    style={{ backgroundColor: e.color + 'cc' }} title={`${e.label} · ${e.sub}`}>
                    {e.kind === 'rec' && <AlertTriangle className="w-2.5 h-2.5 shrink-0" />}{e.label}
                  </button>
                ))}
                {items.length > 4 && <div className="text-[9px] text-zinc-500 px-1">+{items.length - 4} más</div>}
              </div>
            </div>
          );
        })}
      </div>

      {sinAgendar.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Sin agendar ({sinAgendar.length})</div>
          <div className="flex flex-wrap gap-1">
            {sinAgendar.slice(0, 50).map(e => (
              <button key={e.kind + e.id} onClick={() => abrirEdicion(e)} className="text-[10px] px-2 py-1 rounded-card border border-zinc-800 hover:border-red-600 text-zinc-300 flex items-center gap-1" style={{ borderLeftColor: e.color, borderLeftWidth: 3 }}>
                {e.kind === 'rec' && <AlertTriangle className="w-3 h-3 text-amber-400" />}{e.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-3" onClick={() => setEditando(null)}>
          <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <div className="text-sm font-bold flex items-center gap-1"><Calendar className="w-4 h-4 text-red-500" /> Agendar {editando.kind === 'rec' ? 'reclamación' : 'visita'}</div>
              <button onClick={() => setEditando(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-2">
              <div className="text-xs text-zinc-300 font-bold truncate">{editando.label}</div>
              <div className="text-[10px] text-zinc-500">{editando.sub}</div>
              <input type="date" value={fechaEdit} onChange={e => setFechaEdit(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-2 text-white text-sm outline-none focus:border-red-600" />
              <div className="flex gap-2">
                {editando.fecha && <button onClick={() => guardar(null)} disabled={guardando} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-2 rounded-card">Quitar</button>}
                {onAbrir && editando.kind === 'lev' && <button onClick={() => { const p = editando.raw; setEditando(null); onAbrir(p); }} className="px-3 bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase py-2 rounded-card">Abrir</button>}
                <button onClick={() => guardar(fechaEdit)} disabled={guardando || !fechaEdit} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase py-2 rounded-card">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
