'use client';

// v8.58.0 — PROGRAMA DE LOCACIONES (Fase 1, lo que ve operaciones).
// Una campaña con un mismo cliente y muchas locaciones: Towers and Sites, 60 antenas
// antes de fin de año. Amarra cada locación con su levantamiento y su obra (que viven
// en `proyectos`) y enseña dónde está trancada: luz verde del propietario, cotización
// sin aprobar, o aprobada sin programar.
//
// Tres vistas: tablero por etapa, mapa y planificador por zona (para mandar la brigada
// a varias antenas cercanas el mismo día en vez de cruzar la ciudad por una sola).

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Check, Clock, MapPin, Loader2, Route, LayoutGrid, Search } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD } from '../../lib/helpers/formato';
import { ETAPAS, ETAPA, COLOR_ETAPA, resumenPrograma, pendientesDelCliente, agruparPorZona } from '../../lib/helpers/programaSites';

const MapaPrograma = dynamic(() => import('./MapaPrograma'), { ssr: false, loading: () => <div className="h-[420px] grid place-items-center text-zinc-500 text-xs">Cargando mapa…</div> });

const Chip = ({ color, children }) => (
  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{children}
  </span>
);

export default function VistaPrograma({ programa, locaciones = [], usuario, onVolver, onRecargar, onAbrirProyecto }) {
  const [tab, setTab] = useState('tablero');
  const [buscar, setBuscar] = useState('');
  const [guardando, setGuardando] = useState(null);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return locaciones;
    return locaciones.filter(l => `${l.nombre} ${l.codigoUt || ''} ${l.direccion || ''} ${l.cotizacionRef || ''}`.toLowerCase().includes(q));
  }, [locaciones, buscar]);

  const resumen = useMemo(() => resumenPrograma(locaciones, { fechaMeta: programa?.fechaMeta }), [locaciones, programa]);
  const pendCliente = useMemo(() => pendientesDelCliente(locaciones), [locaciones]);
  const zonas = useMemo(() => agruparPorZona(filtradas.filter(l => ['por_levantar', 'por_programar'].includes(l.etapa)), 8), [filtradas]);

  const marcarLuzVerde = async (loc, valor) => {
    setGuardando(loc.id);
    try { await db.actualizarLocacionPrograma(loc.id, { luzVerde: valor, luzVerdeAt: valor ? new Date().toISOString() : null }); await onRecargar?.(); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(null);
  };

  // Crea el levantamiento ya amarrado a la locación (nace en el módulo de Levantamientos).
  const agendarLevantamiento = async (loc) => {
    if (!loc.luzVerde && !confirm(`${loc.nombre} todavía no tiene luz verde del propietario.\n\n¿Crear el levantamiento igual?`)) return;
    setGuardando(loc.id);
    try {
      const codigo = await db.agendarLevantamientoLocacion(loc, programa, usuario);
      await onRecargar?.();
      alert(`Levantamiento ${codigo || ''} creado para ${loc.nombre}.\nAsígnalo y ponle fecha en Levantamientos.`);
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(null);
  };

  const porEtapa = useMemo(() => {
    const g = Object.fromEntries(ETAPAS.map(e => [e.id, []]));
    filtradas.forEach(l => { (g[l.etapa] = g[l.etapa] || []).push(l); });
    return g;
  }, [filtradas]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onVolver} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black uppercase tracking-tight truncate">{programa?.nombre || 'Programa'}</h1>
          <div className="text-[11px] text-zinc-500">
            {resumen.total} locaciones · {resumen.entregadas} entregadas · {resumen.pctAvance}% del programa
            {programa?.fechaMeta && <> · meta {new Date(programa.fechaMeta + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'long' })}</>}
          </div>
        </div>
      </div>

      {/* Lo que marca el ritmo */}
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-2xl font-black">{resumen.faltan}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Faltan por entregar</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-2xl font-black text-amber-400">{resumen.pendientesCliente}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Esperan al cliente</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-2xl font-black text-sky-400">{resumen.pendientesNuestros}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Nos toca a nosotros</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-2xl font-black">{resumen.ritmo ? resumen.ritmo.porSemanaNecesarias : '—'}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            {resumen.ritmo ? `por semana para llegar (${resumen.ritmo.diasRestantes} días)` : 'sin fecha meta'}
          </div>
        </div>
      </div>

      {/* Lo que el cliente tiene trancado */}
      {(pendCliente.sinLuzVerde.length > 0 || pendCliente.cotizacionesPorAprobar.length > 0) && (
        <div className="bg-amber-950/20 border border-amber-800 rounded-card p-3 text-[11px] text-amber-200">
          <b>Trancado del lado del cliente:</b> {pendCliente.sinLuzVerde.length} sin luz verde del propietario
          {pendCliente.cotizacionesPorAprobar.length > 0 && <> · {pendCliente.cotizacionesPorAprobar.length} cotización(es) por aprobar</>}
          {pendCliente.sinSupervisor.length > 0 && <> · {pendCliente.sinSupervisor.length} sin supervisor asignado</>}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {[['tablero', 'Tablero', LayoutGrid], ['mapa', 'Mapa', MapPin], ['zonas', 'Por zona', Route]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase rounded-card flex items-center gap-1.5 ${tab === id ? 'bg-red-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar locación, código o cotización…"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none rounded-card pl-7 pr-3 py-1.5 text-xs text-white placeholder-zinc-600" />
        </div>
      </div>

      {tab === 'tablero' && (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {ETAPAS.map(e => {
            const lista = porEtapa[e.id] || [];
            return (
              <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Chip color={COLOR_ETAPA[e.id]}>{e.label}</Chip>
                  <span className="text-[11px] text-zinc-500 font-bold">{lista.length}</span>
                </div>
                <div className="text-[10px] text-zinc-600">{e.detalle}</div>
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                  {lista.map(l => (
                    <div key={l.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
                      <div className="text-[11px] font-bold text-zinc-100 truncate">{l.nombre}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{l.codigoUt}{l.sector ? ` · ${l.sector}` : ''}</div>
                      {l.cotizacionRef && (
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {l.cotizacionRef}{l.cotizacionMonto ? ` · ${formatRD(l.cotizacionMonto)}` : ''}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {e.id === 'sin_luz_verde' && (
                          <button onClick={() => marcarLuzVerde(l, true)} disabled={guardando === l.id}
                            className="text-[10px] font-bold uppercase px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded-card flex items-center gap-1">
                            {guardando === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Luz verde
                          </button>
                        )}
                        {e.id === 'por_levantar' && !l.levantamientoId && (
                          <button onClick={() => agendarLevantamiento(l)} disabled={guardando === l.id}
                            className="text-[10px] font-bold uppercase px-2 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded-card flex items-center gap-1">
                            {guardando === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />} Agendar levantamiento
                          </button>
                        )}
                        {e.id === 'por_levantar' && l.levantamientoId && (
                          <span className="text-[10px] text-sky-400">Levantamiento creado · falta la visita</span>
                        )}
                        {l.proyectoId && onAbrirProyecto && (
                          <button onClick={() => onAbrirProyecto(l.proyectoId)} className="text-[10px] underline text-zinc-400 hover:text-white">ver obra</button>
                        )}
                        {l.supervisorClienteNombre && <span className="text-[10px] text-zinc-600 truncate">👤 {l.supervisorClienteNombre}</span>}
                      </div>
                    </div>
                  ))}
                  {lista.length === 0 && <div className="text-[10px] text-zinc-700 py-2 text-center">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'mapa' && (
        <div className="space-y-2">
          <MapaPrograma locaciones={filtradas} onSeleccionar={(l) => l.proyectoId && onAbrirProyecto?.(l.proyectoId)} />
          <div className="flex gap-3 flex-wrap">
            {ETAPAS.map(e => <Chip key={e.id} color={COLOR_ETAPA[e.id]}>{e.label} ({(porEtapa[e.id] || []).length})</Chip>)}
          </div>
        </div>
      )}

      {tab === 'zonas' && (
        <div className="space-y-3">
          <div className="text-[11px] text-zinc-500">
            Locaciones listas para visitar o para ejecutar, agrupadas por cercanía (8 km). La idea es mandar la brigada a todas las de un grupo el mismo viaje.
          </div>
          {zonas.map((z, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-black uppercase tracking-wide">{z.zona}</div>
                <div className="text-[11px] text-zinc-500">{z.locaciones.length} locación(es)</div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {z.locaciones.map(l => (
                  <div key={l.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
                    <div className="text-[11px] font-bold truncate">{l.nombre}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{l.direccion}</div>
                    <div className="mt-1"><Chip color={COLOR_ETAPA[l.etapa]}>{ETAPA[l.etapa]?.label}</Chip></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {zonas.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-6 text-center text-xs text-zinc-500">
              <Clock className="w-5 h-5 mx-auto mb-2 text-zinc-700" />
              Nada listo para salir: todo está esperando luz verde, cotización o aprobación.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
