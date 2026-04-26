'use client';

import React, { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { formatRD, formatFecha } from '../../../lib/helpers/formato';
import { getM2Reporte, getPrecioVentaArea, calcAvanceArea } from '../../../lib/helpers/calculos';

export default function TabAvance({ proyecto, reportes, sistema, sistemas, esSupervisor, onEliminarReporte, onEditarReporte, data, usuario }) {
  const [reporteEditando, setReporteEditando] = useState(null);
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold mb-3">Áreas</h2>
        <div className="space-y-3">{proyecto.areas.map(area => {
          // v8.9.2: usar sistema específico del área
          const sistemaIdArea = area.sistemaId || proyecto.sistema;
          const sistemaArea = (sistemas && sistemas[sistemaIdArea]) || sistema;
          if (!sistemaArea) {
            return (
              <div key={area.id} className="bg-zinc-900 border border-red-800 p-4">
                <div className="font-bold">{area.nombre}</div>
                <div className="text-xs text-red-400 mt-1">⚠️ Sin sistema asignado. Edita el proyecto y asigna uno.</div>
              </div>
            );
          }
          const { porcentaje, produccionRD, m2PorTarea } = calcAvanceArea(proyecto, area.id, reportes, sistemaArea);
          const colsClass = sistemaArea.tareas.length <= 3 ? `grid-cols-${sistemaArea.tareas.length}` : sistemaArea.tareas.length === 4 ? 'grid-cols-4' : 'grid-cols-5';
          return (
            <div key={area.id} className="bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold">{area.nombre}</div>
                  <div className="text-xs text-zinc-500">{area.m2} m² · <span className="text-red-400">{sistemaArea.nombre}</span>{!esSupervisor && ` · ${formatRD(area.m2 * getPrecioVentaArea(area, sistemaArea))}`}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black">{porcentaje.toFixed(1)}%</div>
                  {!esSupervisor && <div className="text-xs text-zinc-500">{formatRD(produccionRD)}</div>}
                </div>
              </div>
              <div className="h-2 bg-zinc-800 mb-2"><div className="h-full bg-red-600" style={{ width: `${porcentaje}%` }} /></div>
              <div className={`grid ${colsClass} gap-1 text-[10px]`}>{sistemaArea.tareas.map(t => {
                const m2 = m2PorTarea[t.id] || 0;
                const pct = area.m2 > 0 ? (m2 / area.m2) * 100 : 0;
                return (
                  <div key={t.id} className="bg-zinc-950 p-1.5 text-center">
                    <div className="text-zinc-500 truncate">{t.nombre}</div>
                    <div className="font-bold">{pct.toFixed(0)}%</div>
                  </div>
                );
              })}</div>
            </div>
          );
        })}</div>
      </div>

      <div>
        <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold mb-3">Reportes ({reportesProy.length})</h2>
        <div className="space-y-2">{reportesProy.map(r => {
          const area = proyecto.areas.find(a => a.id === r.areaId);
          const sistemaIdArea = area?.sistemaId || proyecto.sistema;
          const sistemaR = (sistemas && sistemas[sistemaIdArea]) || sistema;
          if (!sistemaR) return null;
          const tarea = sistemaR.tareas.find(t => t.id === r.tareaId);
          const m2 = getM2Reporte(r, sistemaR);
          return (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 p-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-zinc-500">{formatFecha(r.fecha)}</div>
                <div className="text-sm font-bold">{area?.nombre || '—'} · {tarea?.nombre || '—'}</div>
                <div className="text-xs text-zinc-400">{m2.toFixed(2)} m²{r.rollos ? ` · ${r.rollos} rollos` : ''}{r.cubetas ? ` · ${r.cubetas} cubetas` : ''}</div>
                {r.nota && <div className="text-[10px] text-zinc-500 mt-1 italic">{r.nota}</div>}
                {r.supervisor && <div className="text-[10px] text-zinc-600">— {r.supervisor}</div>}
              </div>
              {!esSupervisor && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => onEditarReporte && onEditarReporte(r)} className="text-zinc-500 hover:text-blue-500 p-1"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={() => onEliminarReporte && onEliminarReporte(r)} className="text-zinc-500 hover:text-red-500 p-1"><Trash2 className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          );
        })}{reportesProy.length === 0 && <div className="text-center text-zinc-500 text-sm py-8">Sin reportes</div>}</div>
      </div>
    </div>
  );
}
