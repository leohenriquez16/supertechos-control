'use client';

// v8.28.3: "Mis Pendientes" — el task manager del ERP (estilo Asana, pero sin
// mantenimiento): las tareas diarias se GENERAN solas para cada responsable desde
// el estado real de proyectos, jornadas, levantamientos, reclamaciones y nómina,
// y desaparecen solas cuando lo pendiente de verdad se hizo. Las tareas manuales
// (módulo Tareas) se integran a la misma lista y sí se marcan completadas aquí.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, CircleCheck, RefreshCw, ChevronRight, AlertTriangle } from 'lucide-react';
import * as db from '../../lib/db';
import { listarProyectosSurveys } from '../../lib/surveys';
import { generarPendientes, GRUPOS, AREAS_PENDIENTES } from '../../lib/helpers/pendientes';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

export default function MisPendientes({ usuario, data, esAdmin = false, compact = false, onIrAProyecto, onIrAReportar, onIrAVista }) {
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [extras, setExtras] = useState(null); // { jornadas7d, surveys, reclamaciones, tareas, cortes }
  const [areaFiltro, setAreaFiltro] = useState('Todas'); // v8.33.0: filtro por área
  const [completando, setCompletando] = useState(null);

  const cargar = async ({ silent } = {}) => {
    if (silent) setRefrescando(true); else setLoading(true);
    try {
      const hoy = hoyRD();
      const hace7 = (() => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();
      const esAlmacen = (usuario.roles || []).includes('almacen');
      const [jornadas7d, surveys, reclamaciones, tareas, cortes, requisiciones, vehiculoEventos] = await Promise.all([
        db.listarJornadasEnRango(hace7, hoy).catch(() => []),
        listarProyectosSurveys().catch(() => []),
        db.listarReclamaciones().catch(() => []),
        db.listarTareas({ completadas: false }).catch(() => []),
        esAdmin ? db.listarCortes().catch(() => []) : Promise.resolve([]),
        (esAdmin || esAlmacen) ? db.listarRequisiciones({ estados: ['pendiente', 'preparando', 'lista'] }).catch(() => []) : Promise.resolve([]),
        (esAdmin || esAlmacen) ? db.listarEventosVehiculo({ soloAbiertos: true }).catch(() => []) : Promise.resolve([]),
      ]);
      setExtras({ jornadas7d, surveys, reclamaciones, tareas, cortes, requisiciones, vehiculoEventos, esAlmacen });
    } catch (e) { console.warn('MisPendientes:', e?.message); }
    setLoading(false); setRefrescando(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [usuario.id]);

  const pendientes = useMemo(() => {
    if (!extras) return [];
    return generarPendientes({ usuario, data, ...extras, esAdmin });
  }, [extras, usuario, data, esAdmin]);

  const urgentes = pendientes.filter(p => p.urgente).length;

  const ejecutarAccion = (p) => {
    const a = p.accion;
    if (!a) return;
    const proy = a.proyectoId ? (data.proyectos || []).find(x => x.id === a.proyectoId) : null;
    if (a.tipo === 'proyecto' && proy && onIrAProyecto) onIrAProyecto(proy, a.tab);
    else if (a.tipo === 'reportar' && proy && onIrAReportar) onIrAReportar(proy);
    else if (a.tipo === 'vista' && onIrAVista) onIrAVista(a.vista);
  };

  const completarManual = async (p) => {
    if (!p.tareaId) return;
    setCompletando(p.tareaId);
    try { await db.completarTarea(p.tareaId, usuario.id); await cargar({ silent: true }); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
    setCompletando(null);
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando tus pendientes de hoy…
      </div>
    );
  }

  // Agrupar manteniendo el orden (urgentes ya vienen primero dentro del sort global).
  // v8.33.0: filtro por ÁREA (Proyectos, Logística, Comercial, Postventa, Gerencia…).
  const grupos = Object.entries(GRUPOS)
    .sort((a, b) => a[1].orden - b[1].orden)
    .map(([key, def]) => ({ key, def, items: pendientes.filter(p => p.grupo === key) }))
    .filter(g => g.items.length > 0)
    .filter(g => areaFiltro === 'Todas' || g.def.area === areaFiltro);
  const areasConItems = ['Todas', ...AREAS_PENDIENTES.filter(a => a !== 'Todas' && pendientes.some(p => GRUPOS[p.grupo]?.area === a))];

  return (
    <div className={`bg-zinc-900 border rounded-card p-3 space-y-2 ${urgentes > 0 ? 'border-red-800/60' : 'border-zinc-800'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CircleCheck className={`w-4 h-4 ${pendientes.length === 0 ? 'text-green-400' : urgentes > 0 ? 'text-red-400' : 'text-blue-400'}`} />
          <span className="text-[11px] tracking-widest uppercase font-bold text-zinc-300">Mis pendientes de hoy</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-card ${pendientes.length === 0 ? 'bg-green-600/20 text-green-400' : urgentes > 0 ? 'bg-red-600/20 text-red-400' : 'bg-blue-600/20 text-blue-400'}`}>
            {pendientes.length === 0 ? '¡al día!' : `${pendientes.length}${urgentes ? ` · ${urgentes} urgente${urgentes !== 1 ? 's' : ''}` : ''}`}
          </span>
        </div>
        <button onClick={() => cargar({ silent: true })} disabled={refrescando} className="text-zinc-500 hover:text-white disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${refrescando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!compact && pendientes.length > 0 && areasConItems.length > 2 && (
        <div className="flex flex-wrap gap-1">
          {areasConItems.map(a => (
            <button key={a} onClick={() => setAreaFiltro(a)}
              className={`text-[10px] font-bold uppercase px-2 py-1 rounded-card border ${areaFiltro === a ? 'bg-blue-600 border-blue-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
              {a}{a !== 'Todas' ? ` (${pendientes.filter(p => GRUPOS[p.grupo]?.area === a).length})` : ''}
            </button>
          ))}
        </div>
      )}
      {pendientes.length === 0 ? (
        <div className="text-xs text-zinc-500">Nada pendiente por tu lado. 🎉 Las tareas de mañana aparecerán solas.</div>
      ) : (
        <div className="space-y-2">
          {grupos.map(g => (
            <div key={g.key}>
              <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">{g.def.label} ({g.items.length})</div>
              <div className="space-y-1">
                {(compact ? g.items.slice(0, 5) : g.items).map(p => (
                  <div key={p.id} className={`bg-zinc-950 border rounded-card px-2.5 py-2 flex items-center gap-2 ${p.urgente ? 'border-red-800/60' : 'border-zinc-800'}`}>
                    {p.tareaId ? (
                      <button onClick={() => completarManual(p)} disabled={completando === p.tareaId} title="Marcar completada"
                        className="w-4 h-4 shrink-0 rounded-full border-2 border-zinc-600 hover:border-green-400 hover:bg-green-500/20 flex items-center justify-center">
                        {completando === p.tareaId && <Loader2 className="w-2.5 h-2.5 animate-spin text-green-400" />}
                      </button>
                    ) : p.urgente ? (
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 ml-1 mr-1" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{p.titulo}</div>
                      {p.detalle && <div className={`text-[10px] truncate ${p.urgente ? 'text-red-400' : 'text-zinc-500'}`}>{p.detalle}</div>}
                    </div>
                    {p.accion && (
                      <button onClick={() => ejecutarAccion(p)} className="shrink-0 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
                        Ir <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {compact && g.items.length > 5 && <div className="text-[10px] text-zinc-600 pl-1">+{g.items.length - 5} más…</div>}
              </div>
            </div>
          ))}
          <div className="text-[10px] text-zinc-600">Las tareas automáticas desaparecen solas cuando lo pendiente se hace en el sistema; las manuales se marcan con el círculo.</div>
        </div>
      )}
    </div>
  );
}
