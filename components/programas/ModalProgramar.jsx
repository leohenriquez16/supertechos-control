'use client';

// v8.91.0 — PROGRAMAR EN BLOQUE desde el programa. Se eligen varias locaciones y se les pone
// a sus obras el supervisor (y el maestro, si se quiere) y las fechas planificadas de inicio
// y fin. No cambia el estado de la obra: pasarla a «planificado» sigue pidiendo la obra
// completa en su ficha (maestro, precio de mano de obra…).

import React, { useMemo, useState } from 'react';
import { X, Loader2, CalendarDays } from 'lucide-react';
import * as db from '../../lib/db';

const tieneRol = (p, r) => p?.roles?.includes(r);

export default function ModalProgramar({ seleccion = [], tipo = 'techo', personal = [], usuario, onCerrar, onListo }) {
  const [supervisorId, setSupervisorId] = useState('');
  const [maestroId, setMaestroId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [guardando, setGuardando] = useState(false);
  const activos = useMemo(() => personal.filter(p => p.activo !== false), [personal]);
  const supervisores = useMemo(() => activos.filter(p => tieneRol(p, 'supervisor')).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')), [activos]);
  const maestros = useMemo(() => activos.filter(p => tieneRol(p, 'maestro')).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')), [activos]);

  const obraDe = (l) => (tipo === 'pintura' ? l.proyectoPinturaId : l.proyectoId);
  const conObra = seleccion.filter(obraDe);
  const sinObra = seleccion.filter(l => !obraDe(l));

  const guardar = async () => {
    if (!supervisorId && !maestroId && !inicio && !fin) { alert('Elige al menos el supervisor o una fecha.'); return; }
    if (inicio && fin && fin < inicio) { alert('La fecha de fin es anterior a la de inicio.'); return; }
    setGuardando(true);
    try {
      const n = await db.programarObrasPrograma(conObra.map(obraDe), { supervisorId, maestroId, inicio, fin }, usuario);
      await onListo?.(n);
    } catch (e) { alert('No se pudo programar: ' + (e.message || e)); }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-3 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-lg my-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-4 border-b border-zinc-800">
          <CalendarDays className="w-5 h-5 text-red-500 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black uppercase tracking-wide">Programar {tipo === 'pintura' ? 'pintura (Recubre)' : 'techo'}</div>
            <div className="text-[11px] text-zinc-500">{conObra.length} obra(s). Se les pone supervisor y fechas; el estado de la obra no cambia.</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3 text-[12px]">
          <div className="max-h-32 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-card p-2 space-y-0.5">
            {conObra.map(l => <div key={l.id} className="truncate text-zinc-300">{l.nombre} <span className="text-zinc-600">{l.codigoUt}</span></div>)}
            {sinObra.map(l => <div key={l.id} className="truncate text-red-400">{l.nombre} — sin obra {tipo === 'pintura' ? 'de pintura ' : ''}en el ERP, no se programa</div>)}
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Supervisor</span>
            <select id="prog-supervisor" value={supervisorId} onChange={e => setSupervisorId(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-white">
              <option value="">— no cambiar —</option>
              {supervisores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Maestro (opcional)</span>
            <select id="prog-maestro" value={maestroId} onChange={e => setMaestroId(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-white">
              <option value="">— no cambiar —</option>
              {maestros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Inicio</span>
              <input id="prog-inicio" type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-white" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Fin</span>
              <input id="prog-fin" type="date" value={fin} onChange={e => setFin(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-white" />
            </label>
          </div>
          {conObra.length > 1 && <div className="text-[11px] text-zinc-500">Las mismas fechas van a todas las seleccionadas. Si cada una lleva fechas distintas, prográmalas de una en una.</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={onCerrar} className="px-3 bg-zinc-800 text-zinc-300 font-bold uppercase py-2 text-[11px] rounded-card">Cancelar</button>
            <button onClick={guardar} disabled={guardando || !conObra.length}
              className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold uppercase py-2 text-[11px] rounded-card flex items-center justify-center gap-1">
              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />} Programar {conObra.length}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
