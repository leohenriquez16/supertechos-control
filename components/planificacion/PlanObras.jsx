'use client';

// v8.30.1: "Plan de Obras" — la planificación de OBRAS en el tiempo (la vista
// Planificación existente es de personas por día; esta es la línea de tiempo de
// las obras: cuándo arranca y cuándo se entrega cada una, qué está sin programar,
// y qué se está solapando). Es la herramienta de planificación del gerente de
// operaciones y alimenta el futuro KPI de "entregas a tiempo" (fecha_entrega =
// fecha comprometida).

import React, { useMemo, useState } from 'react';
import { ArrowLeft, Calendar, Save, X, AlertTriangle } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta, formatRD } from '../../lib/helpers/formato';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const addDias = (fecha, n) => { const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = (fecha) => { const d = new Date(fecha + 'T12:00:00'); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

const COLOR_ESTADO = {
  aprobado: 'bg-amber-500/70 border-amber-400',
  planificado: 'bg-blue-500/70 border-blue-400',
  en_ejecucion: 'bg-green-600/80 border-green-400',
  parado: 'bg-red-600/70 border-red-400',
  finalizado_no_entregado: 'bg-purple-500/60 border-purple-400',
};
const LABEL_ESTADO = {
  aprobado: 'Aprobada', planificado: 'Planificada', en_ejecucion: 'En ejecución',
  parado: 'Parada', finalizado_no_entregado: 'Terminada s/entregar',
};

const SEMANAS = 10;

export default function PlanObras({ usuario, data, onVolver, onVerProyecto, onRecargar }) {
  const hoy = hoyRD();
  const [desde, setDesde] = useState(lunesDe(hoy));
  const [editando, setEditando] = useState(null); // { proyecto, fecha_inicio, fecha_entrega }
  const [guardando, setGuardando] = useState(false);

  const hasta = addDias(desde, SEMANAS * 7 - 1);
  const totalDias = SEMANAS * 7;
  const semanas = Array.from({ length: SEMANAS }, (_, i) => addDias(desde, i * 7));

  const nombre = (p) => p.cliente || p.nombre || p.referenciaOdoo || p.id;
  const maestroDe = (p) => (data.personal || []).find(x => x.id === p.maestroId)?.nombre?.split(' ')[0] || '';

  const activas = useMemo(() => (data.proyectos || []).filter(p => !p.archivado &&
    ['aprobado', 'planificado', 'en_ejecucion', 'parado', 'finalizado_no_entregado'].includes(p.estado)), [data.proyectos]);

  const sinProgramar = activas.filter(p => !p.fecha_inicio || !p.fecha_entrega);
  const programadas = activas
    .filter(p => p.fecha_inicio && p.fecha_entrega)
    .filter(p => p.fecha_entrega >= desde && p.fecha_inicio <= hasta)
    .sort((a, b) => (a.fecha_inicio || '').localeCompare(b.fecha_inicio || ''));

  const barra = (p) => {
    const ini = Math.max(0, diasEntre(desde, p.fecha_inicio));
    const fin = Math.min(totalDias, diasEntre(desde, p.fecha_entrega) + 1);
    return { left: (ini / totalDias) * 100, width: Math.max(1.5, ((fin - ini) / totalDias) * 100) };
  };
  const hoyPct = (diasEntre(desde, hoy) / totalDias) * 100;

  const guardarFechas = async () => {
    const { proyecto, fecha_inicio, fecha_entrega } = editando;
    if (!fecha_inicio || !fecha_entrega) { alert('Pon las dos fechas.'); return; }
    if (fecha_entrega < fecha_inicio) { alert('La entrega no puede ser antes del inicio.'); return; }
    setGuardando(true);
    try {
      await db.actualizarProyecto({ ...proyecto, fecha_inicio, fecha_entrega });
      setEditando(null);
      onRecargar?.();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setGuardando(false);
  };

  const atrasadas = programadas.filter(p => p.estado !== 'finalizado_no_entregado' && p.fecha_entrega < hoy).length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Calendar className="w-6 h-6 text-blue-400" /> Plan de Obras</h1>
            <div className="text-[11px] text-zinc-500">Cuándo arranca y cuándo se entrega cada obra · {formatFechaCorta(desde)} → {formatFechaCorta(hasta)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setDesde(addDias(desde, -28))} className="border border-zinc-700 hover:border-blue-500 text-zinc-300 text-xs font-bold px-3 py-1.5 rounded-card">← 4 sem</button>
          <button onClick={() => setDesde(lunesDe(hoy))} className="border border-zinc-700 hover:border-blue-500 text-zinc-300 text-xs font-bold px-3 py-1.5 rounded-card">Hoy</button>
          <button onClick={() => setDesde(addDias(desde, 28))} className="border border-zinc-700 hover:border-blue-500 text-zinc-300 text-xs font-bold px-3 py-1.5 rounded-card">4 sem →</button>
        </div>
      </div>

      {/* Sin programar — la cola de Miguel */}
      {sinProgramar.length > 0 && (
        <div className="bg-zinc-900 border border-amber-800/50 rounded-card p-3">
          <div className="text-[11px] tracking-widest uppercase text-amber-400 font-bold mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Sin programar ({sinProgramar.length}) — toda obra activa necesita su fecha de inicio y entrega
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sinProgramar.map(p => (
              <button key={p.id} onClick={() => setEditando({ proyecto: p, fecha_inicio: p.fecha_inicio || hoy, fecha_entrega: p.fecha_entrega || addDias(hoy, 14) })}
                className="bg-zinc-950 border border-zinc-700 hover:border-amber-500 rounded-card px-2.5 py-1.5 text-left">
                <div className="text-xs font-bold truncate max-w-[220px]">{nombre(p)}</div>
                <div className="text-[10px] text-zinc-500">{LABEL_ESTADO[p.estado] || p.estado} · programar →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Línea de tiempo */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Cabecera de semanas */}
          <div className="flex ml-[210px] border-b border-zinc-800 pb-1 mb-2 relative">
            {semanas.map(s => (
              <div key={s} className="text-[10px] text-zinc-500 font-bold uppercase" style={{ width: `${100 / SEMANAS}%` }}>
                {formatFechaCorta(s)}
              </div>
            ))}
          </div>
          {programadas.length === 0 ? (
            <div className="text-center text-zinc-500 text-sm py-8">Ninguna obra programada en esta ventana.</div>
          ) : programadas.map(p => {
            const b = barra(p);
            const atrasada = p.estado !== 'finalizado_no_entregado' && p.fecha_entrega < hoy;
            return (
              <div key={p.id} className="flex items-center gap-0 py-1 group">
                <button onClick={() => onVerProyecto?.(p)} className="w-[210px] shrink-0 text-left pr-2">
                  <div className={`text-xs font-bold truncate ${atrasada ? 'text-red-400' : ''}`}>{nombre(p)}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{maestroDe(p)}{p.valorCotizacion ? ` · ${formatRD(p.valorCotizacion)}` : ''}</div>
                </button>
                <div className="flex-1 relative h-7 bg-zinc-950 rounded-card border border-zinc-800/60">
                  {hoyPct >= 0 && hoyPct <= 100 && <div className="absolute top-0 bottom-0 w-px bg-red-500/70 z-10" style={{ left: `${hoyPct}%` }} />}
                  <button onClick={() => setEditando({ proyecto: p, fecha_inicio: p.fecha_inicio, fecha_entrega: p.fecha_entrega })}
                    title={`${formatFechaCorta(p.fecha_inicio)} → ${formatFechaCorta(p.fecha_entrega)} · clic para mover fechas`}
                    className={`absolute top-1 bottom-1 rounded-card border ${COLOR_ESTADO[p.estado] || 'bg-zinc-600/60 border-zinc-500'} ${atrasada ? 'ring-1 ring-red-500' : ''} hover:brightness-125`}
                    style={{ left: `${b.left}%`, width: `${b.width}%` }}>
                    <span className="text-[9px] font-bold text-white/90 px-1 truncate block leading-5">{atrasada ? '⚠ ' : ''}{formatFechaCorta(p.fecha_entrega)}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leyenda + alertas */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-zinc-500">
        <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-500/70 align-middle mr-1" />Aprobada</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-blue-500/70 align-middle mr-1" />Planificada</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-green-600/80 align-middle mr-1" />En ejecución</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-red-600/70 align-middle mr-1" />Parada</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-purple-500/60 align-middle mr-1" />Terminada s/entregar</span>
        <span className="ml-auto">| línea roja = hoy · clic en la barra = mover fechas · clic en el nombre = abrir la obra</span>
      </div>
      {atrasadas > 0 && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-card p-2.5 text-xs text-red-300">
          ⚠ {atrasadas} obra{atrasadas !== 1 ? 's' : ''} con fecha de entrega vencida y sin terminar — o se reprograma con el cliente (orden de cambio / acuerdo) o se termina. La fecha no puede quedarse vencida en silencio.
        </div>
      )}

      {/* Modal fechas */}
      {editando && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setEditando(null)}>
          <div className="bg-zinc-900 border-2 border-blue-600 rounded-card p-4 w-full max-w-sm space-y-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-[11px] tracking-widest uppercase font-bold text-blue-400 truncate">{nombre(editando.proyecto)}</div>
              <button onClick={() => setEditando(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <label className="text-[11px] text-zinc-400 block">Inicio
              <input type="date" value={editando.fecha_inicio || ''} onChange={e => setEditando({ ...editando, fecha_inicio: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm mt-1" />
            </label>
            <label className="text-[11px] text-zinc-400 block">Entrega comprometida
              <input type="date" value={editando.fecha_entrega || ''} onChange={e => setEditando({ ...editando, fecha_entrega: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm mt-1" />
            </label>
            {editando.fecha_inicio && editando.fecha_entrega && editando.fecha_entrega >= editando.fecha_inicio && (
              <div className="text-[10px] text-zinc-500">Duración: {diasEntre(editando.fecha_inicio, editando.fecha_entrega) + 1} días</div>
            )}
            <button onClick={guardarFechas} disabled={guardando} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-1.5">
              <Save className="w-3.5 h-3.5" /> {guardando ? 'Guardando…' : 'Guardar fechas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
