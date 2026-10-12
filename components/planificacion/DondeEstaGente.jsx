'use client';

// v8.64.0 — "¿Dónde está la gente?": quién está en qué obra en el día elegido, visible para todos.
// Solo obras con gente y solo personal en obra; el resto queda en contadores que se abren a pedido.
// Fuente: jornadas del día (la asistencia real). El plan a futuro se suma aquí cuando exista.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Users } from 'lucide-react';
import * as db from '../../lib/db';
import { dondeEstaLaGente, diasPorPersona } from '../../lib/helpers/dondeGente';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const addDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const etiquetaDia = (f, hoy) => {
  if (f === hoy) return 'Hoy';
  if (f === addDias(hoy, -1)) return 'Ayer';
  if (f === addDias(hoy, 1)) return 'Mañana';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'short' });
};
const COLOR_ROL = { supervisor: 'text-sky-400', maestro: 'text-amber-400', ayudante: 'text-zinc-500' };
const nombreObra = (p) => [p.referenciaOdoo, p.cliente || p.nombre].filter(Boolean).join(' · ');

export default function DondeEstaGente({ data, onVerProyecto }) {
  const hoy = hoyRD();
  const [fecha, setFecha] = useState(hoy);
  const [jornadas, setJornadas] = useState(null);
  const [abierto, setAbierto] = useState(''); // 'sinObra' | 'sinGente' | 'porProgramar'
  const [verTodos, setVerTodos] = useState(false);
  const [frecuencia, setFrecuencia] = useState(null); // días trabajados en los últimos 60

  useEffect(() => {
    db.listarJornadasEnRango(addDias(hoy, -60), hoy).then(js => setFrecuencia(diasPorPersona(js))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let vivo = true;
    setJornadas(null);
    db.listarJornadasEnRango(fecha, fecha).then(js => { if (vivo) setJornadas(js); }).catch(() => vivo && setJornadas([]));
    return () => { vivo = false; };
  }, [fecha]);

  const r = useMemo(() => jornadas && dondeEstaLaGente({
    proyectos: (data.proyectos || []).filter(p => !p.archivado),
    personal: data.personal || [],
    jornadas, fecha, frecuencia,
  }), [jornadas, data.proyectos, data.personal, fecha, frecuencia]);

  const esFuturo = fecha > hoy;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setFecha(addDias(fecha, -1))} className="bg-zinc-900 border border-zinc-800 rounded-card p-2 hover:border-red-500"><ChevronLeft className="w-4 h-4" /></button>
          <div className="min-w-[140px] text-center">
            <div className="text-sm font-black capitalize">{etiquetaDia(fecha, hoy)}</div>
            <div className="text-[10px] text-zinc-500 tabular-nums">{fecha}</div>
          </div>
          <button onClick={() => setFecha(addDias(fecha, 1))} className="bg-zinc-900 border border-zinc-800 rounded-card p-2 hover:border-red-500"><ChevronRight className="w-4 h-4" /></button>
          {fecha !== hoy && <button onClick={() => setFecha(hoy)} className="text-[11px] font-bold uppercase px-3 py-2 bg-zinc-800 rounded-card">Hoy</button>}
        </div>
        {r && (
          <div className="text-xs text-zinc-400 tabular-nums">
            <b className="text-white">{r.totalPersonas}</b> personas en <b className="text-white">{r.totalObras}</b> obras
          </div>
        )}
      </div>

      {!r && <div className="py-8 text-center"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>}

      {r && esFuturo && r.totalObras === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 text-xs text-zinc-400">
          Todavía no hay plan para este día. La planificación a futuro se activa cuando Miguel, Erisdania y los supervisores empiecen a asignar.
        </div>
      )}

      {r && r.enDosObras.length > 0 && (
        <div className="bg-red-950/40 border border-red-800 rounded-card px-3 py-2 text-xs text-red-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <div>
            <b>{r.enDosObras.length} {r.enDosObras.length === 1 ? 'persona aparece' : 'personas aparecen'} en dos obras el mismo día:</b>{' '}
            {r.enDosObras.map(d => `${d.persona.nombre} (${d.proyectos.map(p => p.referenciaOdoo || p.nombre).join(' y ')})`).join(' · ')}
          </div>
        </div>
      )}

      {r && r.grupos.map(g => (
        <div key={g.supervisor?.id || 'sin'} className="space-y-2">
          <div className="flex items-baseline justify-between border-b border-zinc-800 pb-1">
            <div className="text-[11px] tracking-widest uppercase font-bold text-sky-400">{g.supervisor ? `Equipo de ${g.supervisor.nombre}` : 'Obras sin supervisor'}</div>
            <div className="text-[10px] text-zinc-500 tabular-nums">{g.obras.length} obras · {g.total} personas</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.obras.map(({ proyecto, personas }) => (
              <div key={proyecto.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
                <button onClick={() => onVerProyecto?.(proyecto)} className="w-full text-left flex items-start justify-between gap-2 group">
                  <div className="min-w-0">
                    <div className="text-xs font-black truncate group-hover:text-red-400">{nombreObra(proyecto)}</div>
                    {proyecto.ubicacion && <div className="text-[10px] text-zinc-500 truncate">{proyecto.ubicacion}</div>}
                  </div>
                  <div className="shrink-0 text-[11px] font-black tabular-nums flex items-center gap-1 text-zinc-300"><Users className="w-3 h-3" />{personas.length}</div>
                </button>
                <div className="flex flex-wrap gap-1">
                  {personas.map(({ persona, rol, doble }) => (
                    <span key={persona.id} className={`text-[11px] px-2 py-0.5 rounded-full border ${doble ? 'border-red-600 bg-red-950/40' : 'border-zinc-700 bg-zinc-950'}`}>
                      <span className={`font-bold ${COLOR_ROL[rol] || 'text-zinc-500'}`}>{rol === 'maestro' ? 'M' : rol === 'supervisor' ? 'S' : ''}</span>{rol !== 'ayudante' && rol !== 'otro' ? ' ' : ''}{persona.nombre}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {r && (
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            ['sinObra', `${r.sinObraFrecuentes.length} personas frecuentes sin obra`, r.sinObra.length],
            ['sinGente', `${r.obrasSinGente.length} obras en ejecución sin gente`, r.obrasSinGente.length],
            ['porProgramar', `${r.porProgramar.length} obras aprobadas/planificadas sin gente`, r.porProgramar.length],
          ].filter(([, , n]) => n > 0).map(([k, txt]) => (
            <button key={k} onClick={() => setAbierto(abierto === k ? '' : k)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-card border ${abierto === k ? 'border-red-500 text-white bg-zinc-800' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}>{txt}</button>
          ))}
        </div>
      )}
      {r && abierto === 'sinObra' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex flex-wrap gap-1">
          {(verTodos ? r.sinObra : r.sinObraFrecuentes).map(p => (
            <span key={p.id} className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-700">
              {p.nombre}{p.diasRecientes > 0 && <span className="text-zinc-500 tabular-nums"> · {p.diasRecientes}d</span>}
            </span>
          ))}
          <div className="w-full text-[10px] text-zinc-500 pt-1">
            {verTodos ? 'Todo el personal de campo activo.' : 'Los que han trabajado en los últimos 60 días, de más a menos días.'}{' '}
            {r.sinObra.length > r.sinObraFrecuentes.length && (
              <button onClick={() => setVerTodos(!verTodos)} className="underline text-zinc-300">{verTodos ? 'Ver solo frecuentes' : `Ver todos (${r.sinObra.length})`}</button>
            )}
          </div>
        </div>
      )}
      {r && (abierto === 'sinGente' || abierto === 'porProgramar') && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card divide-y divide-zinc-800">
          {(abierto === 'sinGente' ? r.obrasSinGente : r.porProgramar).map(p => (
            <button key={p.id} onClick={() => onVerProyecto?.(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 flex justify-between gap-2">
              <span className="truncate">{nombreObra(p)}</span>
              <span className="text-zinc-500 shrink-0">{(data.personal || []).find(x => x.id === p.supervisorId)?.nombre || 'sin supervisor'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
