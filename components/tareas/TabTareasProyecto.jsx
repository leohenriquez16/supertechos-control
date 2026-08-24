'use client';

// v8.33.3: Tab "Tareas" del PROYECTO — las tareas amarradas a la obra, creables
// desde aquí mismo (y también desde el módulo Tareas eligiendo el proyecto).
// Misma mecánica: responsable + supervisor, prioridad, fecha, completar.

import React, { useEffect, useState } from 'react';
import { Loader2, Plus, CircleCheck, CircleDashed } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';
import { ModalCrearTarea, ModalDelegarTarea } from './VistaTareas';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

export default function TabTareasProyecto({ usuario, proyecto, data, esAdmin }) {
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crear, setCrear] = useState(false);
  const [delegando, setDelegando] = useState(null);
  const [verCompletadas, setVerCompletadas] = useState(false);

  const recargar = async () => {
    setLoading(true);
    try {
      const [pend, comp] = await Promise.all([
        db.listarTareas({ completadas: false }),
        verCompletadas ? db.listarTareas({ completadas: true }) : Promise.resolve([]),
      ]);
      setTareas([...pend, ...comp].filter(t => t.proyectoId === proyecto.id));
    } catch (e) { console.warn(e); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [proyecto.id, verCompletadas]);

  const hoy = hoyRD();
  const avisar = (personaId, titulo, fecha) => {
    try {
      const p = (data.personal || []).find(x => x.id === personaId);
      if (!p?.email || !p.email.includes('@')) return;
      db.enviarCorreoReporte([p.email], `📌 Nueva tarea para ti: ${titulo}`,
        `<div style="font-family:Arial,sans-serif;max-width:520px"><h3 style="color:#D71920">📌 ${titulo}</h3><p style="font-size:13px">${usuario.nombre} te asignó esta tarea en la obra <b>${proyecto.cliente || proyecto.nombre}</b>${fecha ? ` con fecha límite <b>${fecha}</b>` : ''}.</p><p style="font-size:12px;color:#666">— ERP Super Techos</p></div>`);
    } catch (e) { /* */ }
  };

  const pendientes = tareas.filter(t => !t.completada).sort((a, b) => (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999'));
  const completadas = tareas.filter(t => t.completada);

  const Fila = ({ t }) => {
    const vencida = t.fechaLimite && t.fechaLimite.slice(0, 10) < hoy && !t.completada;
    const puede = !t.completada && (t.asignadaAId === usuario.id || t.supervisorId === usuario.id || esAdmin);
    return (
      <div className={`group flex items-center gap-2.5 px-3 py-2 rounded-card border bg-zinc-900 ${vencida ? 'border-red-900/60' : 'border-zinc-800'} ${t.completada ? 'opacity-60' : ''}`}>
        <button onClick={async () => { if (!t.completada) { await db.completarTarea(t.id, usuario.id); recargar(); } }} disabled={t.completada} className="shrink-0">
          {t.completada ? <CircleCheck className="w-5 h-5 text-green-500" /> : <CircleDashed className="w-5 h-5 text-zinc-600 hover:text-green-400" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold ${t.completada ? 'line-through text-zinc-500' : ''}`}>{t.prioridad === 'alta' ? '🔥 ' : ''}{t.titulo}</div>
          <div className="text-[10px] text-zinc-500 flex gap-2 flex-wrap mt-0.5">
            {t.asignadaANombre && <span className={t.asignadaAId === usuario.id ? 'text-blue-400 font-bold' : ''}>👤 {t.asignadaANombre}</span>}
            {t.supervisorNombre && <span>👁 {t.supervisorNombre.split(' ')[0]}</span>}
            {(t.comentarios || []).length > 0 && <span>💬 {t.comentarios.length}</span>}
          </div>
        </div>
        {t.fechaLimite && <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${vencida ? 'bg-red-900/40 border-red-700 text-red-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{formatFechaCorta(t.fechaLimite)}</span>}
        {puede && <button onClick={() => setDelegando(t)} className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] font-black px-1.5 py-1 rounded-card border border-zinc-700 hover:border-blue-500 text-zinc-400">↪</button>}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setVerCompletadas(!verCompletadas)} className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-card border ${verCompletadas ? 'bg-green-700 border-green-700 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>✓ Ver completadas</button>
        <button onClick={() => setCrear(true)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-3 py-2 rounded-card flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Nueva tarea</button>
      </div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div> : (
        <div className="space-y-1.5">
          {pendientes.length === 0 && !verCompletadas && <div className="text-center py-8 text-zinc-500 text-sm">Sin tareas pendientes en esta obra.</div>}
          {pendientes.map(t => <Fila key={t.id} t={t} />)}
          {verCompletadas && completadas.map(t => <Fila key={t.id} t={t} />)}
        </div>
      )}
      {crear && <ModalCrearTarea usuario={usuario} proyectos={data.proyectos || []} personal={data.personal || []} proyectoFijo={proyecto.id}
        onCerrar={() => setCrear(false)}
        onCrear={async (t) => { await db.crearTarea(t); if (t.asignadaAId && t.asignadaAId !== usuario.id) avisar(t.asignadaAId, t.titulo, t.fechaLimite); setCrear(false); recargar(); }} />}
      {delegando && <ModalDelegarTarea tarea={delegando} personal={data.personal || []} onCerrar={() => setDelegando(null)}
        onDelegar={async (tarea, personaId, fecha) => {
          const p = (data.personal || []).find(x => x.id === personaId);
          if (!p) return;
          avisar(p.id, tarea.titulo, fecha);
          await db.actualizarTarea(tarea.id, { asignadaAId: p.id, asignadaANombre: p.nombre, ...(tarea.supervisorId ? {} : { supervisorId: usuario.id, supervisorNombre: usuario.nombre }), ...(fecha !== undefined ? { fechaLimite: fecha } : {}) });
          setDelegando(null); recargar();
        }} />}
    </div>
  );
}
