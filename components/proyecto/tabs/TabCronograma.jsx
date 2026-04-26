'use client';

import React, { useState } from 'react';
import { Edit2, Save } from 'lucide-react';
import { formatFechaCorta } from '../../../lib/helpers/formato';
import { getM2Reporte, calcAvanceArea, diasDePausaEnRango, pausaActiva } from '../../../lib/helpers/calculos';
import Campo from '../../common/Campo';
import Input from '../../common/Input';

export default function TabCronograma({ proyecto, porcentajeActual, onActualizarProyecto, esSupervisor, reportes, sistema, sistemas }) {
  const [edit, setEdit] = useState(false);
  const [fechas, setFechas] = useState({ fecha_inicio: proyecto.fecha_inicio, fecha_entrega: proyecto.fecha_entrega });
  const [areasExpand, setAreasExpand] = useState(() => new Set(proyecto.areas.map(a => a.id))); // todas expandidas por defecto
  const fi = new Date(proyecto.fecha_inicio + 'T12:00:00');
  const fe = new Date(proyecto.fecha_entrega + 'T12:00:00');
  const hoy = new Date();
  const hoyStrCron = hoy.toISOString().split('T')[0];
  // v8.9.13: días de pausa se restan de transcurridos (no cuentan como atraso)
  const diasPausaTotales = diasDePausaEnRango(proyecto, proyecto.fecha_inicio, proyecto.fecha_entrega);
  const diasPausaHastaHoy = diasDePausaEnRango(proyecto, proyecto.fecha_inicio, hoyStrCron);
  const totalDias = Math.max(1, Math.round((fe - fi) / (1000 * 60 * 60 * 24)) - diasPausaTotales);
  const transcurridosBrutos = Math.max(0, Math.round((hoy - fi) / (1000 * 60 * 60 * 24)));
  const transcurridos = Math.max(0, transcurridosBrutos - diasPausaHastaHoy);
  const pctT = Math.min(100, (transcurridos / totalDias) * 100);
  const enPausa = !!pausaActiva(proyecto);
  const estado = porcentajeActual >= 100 ? { t: 'Completado', c: 'text-green-400' } :
    enPausa ? { t: 'En pausa', c: 'text-yellow-400' } :
    pctT > porcentajeActual + 10 ? { t: 'Atrasado', c: 'text-red-400' } :
    pctT < porcentajeActual - 5 ? { t: 'Adelantado', c: 'text-green-400' } :
    { t: 'En tiempo', c: 'text-blue-400' };

  const reportesProy = (reportes || []).filter(r => r.proyectoId === proyecto.id);
  const toggleArea = (aid) => { const n = new Set(areasExpand); if (n.has(aid)) n.delete(aid); else n.add(aid); setAreasExpand(n); };

  // Para cada área calculamos primer y último reporte (fecha real de inicio/fin parciales)
  // y para cada tarea dentro del área hacemos lo mismo.
  const calcRango = (filtroFn) => {
    const rs = reportesProy.filter(filtroFn);
    if (rs.length === 0) return null;
    const fechasR = rs.map(r => r.fecha).sort();
    return { inicio: fechasR[0], fin: fechasR[fechasR.length - 1] };
  };
  const fechaAFraccion = (fecha) => {
    if (!fecha) return null;
    const d = new Date(fecha + 'T12:00:00');
    return Math.max(0, Math.min(100, ((d - fi) / (fe - fi)) * 100));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2"><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Avance</div><div className="text-xl font-black">{porcentajeActual.toFixed(1)}%</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Tiempo</div><div className="text-xl font-black">{pctT.toFixed(0)}%</div></div><div className="bg-zinc-900 border border-zinc-800 p-3"><div className="text-[10px] text-zinc-500 uppercase">Estado</div><div className={`text-xl font-black ${estado.c}`}>{estado.t}</div></div></div>

      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex justify-between items-center mb-3"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Fechas</div>{!esSupervisor && (edit ? <div className="flex gap-1"><button onClick={() => { setEdit(false); setFechas({ fecha_inicio: proyecto.fecha_inicio, fecha_entrega: proyecto.fecha_entrega }); }} className="text-xs text-zinc-500">Cancelar</button><button onClick={() => { onActualizarProyecto({ ...proyecto, ...fechas }); setEdit(false); }} className="text-xs text-red-500 font-bold flex items-center gap-1"><Save className="w-3 h-3" /> Guardar</button></div> : <button onClick={() => setEdit(true)} className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1"><Edit2 className="w-3 h-3" /> Editar</button>)}</div>
        {edit ? <div className="grid grid-cols-2 gap-3"><Campo label="Inicio"><Input type="date" value={fechas.fecha_inicio} onChange={v => setFechas({ ...fechas, fecha_inicio: v })} /></Campo><Campo label="Entrega"><Input type="date" value={fechas.fecha_entrega} onChange={v => setFechas({ ...fechas, fecha_entrega: v })} /></Campo></div> : <div className="grid grid-cols-2 gap-3 text-sm"><div><div className="text-[10px] text-zinc-500">Inicio</div><div className="font-bold">{proyecto.fecha_inicio ? formatFechaCorta(proyecto.fecha_inicio) : <span className="text-yellow-500">📅 Por definir</span>}</div></div><div><div className="text-[10px] text-zinc-500">Entrega</div><div className="font-bold">{proyecto.fecha_entrega ? formatFechaCorta(proyecto.fecha_entrega) : <span className="text-zinc-500">—</span>}</div></div></div>}
      </div>

      {/* GANTT JERÁRQUICO */}
      <div className="bg-zinc-950 border border-zinc-800 p-4">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-4">Gantt</div>

        {/* Escala de tiempo arriba */}
        <div className="relative mb-2" style={{ paddingLeft: '40%' }}>
          <div className="relative h-5 text-[9px] text-zinc-500">
            {[0, 25, 50, 75, 100].map(p => (
              <div key={p} className="absolute" style={{ left: `${p}%`, transform: 'translateX(-50%)' }}>
                {p === 0 ? formatFechaCorta(proyecto.fecha_inicio) : p === 100 ? formatFechaCorta(proyecto.fecha_entrega) : `${p}%`}
              </div>
            ))}
          </div>
        </div>

        {/* Filas */}
        <div className="space-y-1">
          {proyecto.areas.map(area => {
            // v8.9.2: sistema del área
            const sistemaIdArea = area.sistemaId || proyecto.sistema;
            const sistemaArea = (sistemas && sistemas[sistemaIdArea]) || sistema;
            const { porcentaje: pctArea } = calcAvanceArea(proyecto, area.id, reportesProy, sistemaArea);
            const rango = calcRango(r => r.areaId === area.id);
            const leftPct = rango ? fechaAFraccion(rango.inicio) : null;
            const rightPct = rango ? fechaAFraccion(rango.fin) : null;
            const widthPct = (rango && leftPct !== null && rightPct !== null) ? Math.max(2, rightPct - leftPct) : null;
            const expandida = areasExpand.has(area.id);
            return (
              <div key={area.id}>
                {/* Fila del área */}
                <div className="flex items-center gap-2 h-7 hover:bg-zinc-900 transition-colors">
                  <button onClick={() => toggleArea(area.id)} className="text-zinc-500 hover:text-white" style={{ width: 16 }}>
                    {expandida ? '▾' : '▸'}
                  </button>
                  <div className="text-xs font-bold truncate" style={{ width: 'calc(40% - 24px)' }}>{area.nombre}</div>
                  <div className="flex-1 relative h-5 bg-zinc-900/50">
                    {rango && widthPct !== null && (
                      <div className="absolute inset-y-0 flex items-center px-1 text-[9px] font-bold text-white overflow-hidden" style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: pctArea >= 100 ? '#16a34a' : pctArea >= 50 ? '#CC0000' : '#ea580c' }}>
                        {widthPct > 8 ? `${pctArea.toFixed(0)}%` : ''}
                      </div>
                    )}
                    {/* marcador de hoy */}
                    <div className="absolute top-0 bottom-0 w-px bg-blue-500" style={{ left: `${pctT}%` }} />
                  </div>
                  <div className="text-[10px] text-zinc-500 w-10 text-right">{pctArea.toFixed(0)}%</div>
                </div>

                {/* Tareas del área cuando está expandida */}
                {expandida && sistemaArea?.tareas && (
                  <div className="pl-6">
                    {sistemaArea.tareas.map(t => {
                      const rt = calcRango(r => r.areaId === area.id && r.tareaId === t.id);
                      const lP = rt ? fechaAFraccion(rt.inicio) : null;
                      const rP = rt ? fechaAFraccion(rt.fin) : null;
                      const w = (rt && lP !== null && rP !== null) ? Math.max(2, rP - lP) : null;
                      const m2Tarea = reportesProy.filter(r => r.areaId === area.id && r.tareaId === t.id).reduce((s, r) => s + getM2Reporte(r, sistemaArea), 0);
                      const pctTarea = area.m2 > 0 ? Math.min(100, (m2Tarea / area.m2) * 100) : 0;
                      return (
                        <div key={t.id} className="flex items-center gap-2 h-5 hover:bg-zinc-900/70">
                          <div className="text-[10px] text-zinc-500 truncate" style={{ width: 'calc(40% - 24px)', marginLeft: 16 }}>{t.nombre} <span className="text-zinc-600">({t.peso}%)</span></div>
                          <div className="flex-1 relative h-3 bg-zinc-900/30">
                            {rt && w !== null && (
                              <div className="absolute inset-y-0" style={{ left: `${lP}%`, width: `${w}%`, backgroundColor: pctTarea >= 100 ? '#16a34a88' : pctTarea >= 50 ? '#CC000088' : '#ea580c88' }} />
                            )}
                            <div className="absolute top-0 bottom-0 w-px bg-blue-500/60" style={{ left: `${pctT}%` }} />
                          </div>
                          <div className="text-[9px] text-zinc-500 w-10 text-right">{pctTarea.toFixed(0)}%</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-zinc-600 mt-3 flex items-center gap-3">
          <span><span className="inline-block w-3 h-2 bg-blue-500 align-middle" /> Hoy</span>
          <span><span className="inline-block w-3 h-2 align-middle" style={{ background: '#16a34a' }} /> 100%</span>
          <span><span className="inline-block w-3 h-2 align-middle" style={{ background: '#CC0000' }} /> ≥50%</span>
          <span><span className="inline-block w-3 h-2 align-middle" style={{ background: '#ea580c' }} /> &lt;50%</span>
          <span className="text-zinc-700">· Click en ▸ para expandir tareas</span>
        </div>
      </div>
    </div>
  );
}
