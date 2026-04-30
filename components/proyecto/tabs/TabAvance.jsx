'use client';

import React, { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { formatRD, formatFecha } from '../../../lib/helpers/formato';
import { getM2Reporte, getPrecioVentaArea, calcAvanceArea } from '../../../lib/helpers/calculos';

// v8.10.23: Mini donut SVG reutilizable
function MiniDonut({ porcentaje, size = 80, strokeWidth = 8, className = '' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (porcentaje / 100) * circumference;
  // Color según nivel de avance
  const color = porcentaje >= 75 ? '#22c55e' : porcentaje >= 40 ? '#eab308' : '#ef4444';
  const textColor = porcentaje >= 75 ? 'text-green-400' : porcentaje >= 40 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-black ${textColor}`}>{porcentaje.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// v8.10.23: Barra de progreso con gradiente por nivel
function BarraProgreso({ porcentaje, m2Ejecutados, m2Total, nombreTarea, colorIndex = 0 }) {
  const pct = Math.min(porcentaje, 100);
  const colores = [
    { dot: 'bg-cyan-500', bar: 'bg-gradient-to-r from-cyan-600 to-cyan-400' },
    { dot: 'bg-purple-500', bar: 'bg-gradient-to-r from-purple-600 to-purple-400' },
    { dot: 'bg-blue-500', bar: 'bg-gradient-to-r from-blue-600 to-blue-400' },
    { dot: 'bg-amber-500', bar: 'bg-gradient-to-r from-amber-600 to-amber-400' },
    { dot: 'bg-rose-500', bar: 'bg-gradient-to-r from-rose-600 to-rose-400' },
  ];
  const c = colores[colorIndex % colores.length];
  const textColor = pct >= 75 ? 'text-green-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
          <span className="text-xs font-semibold">{nombreTarea}</span>
        </div>
        <span className={`text-xs font-bold ${textColor}`}>
          {m2Ejecutados.toFixed(0)}/{m2Total.toFixed(0)} m² · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${c.bar}`}
          style={{ width: `${pct}%`, transition: 'width 0.8s ease' }}
        />
      </div>
    </div>
  );
}

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
          return (
            <div key={area.id} className="bg-zinc-900 border border-zinc-800 p-4">
              {/* v8.10.23: Header con mini-donut + info */}
              <div className="flex items-center gap-4 mb-4">
                <MiniDonut porcentaje={porcentaje} size={72} strokeWidth={7} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg truncate">{area.nombre}</div>
                  <div className="text-xs text-zinc-500">{area.m2} m² · <span className="text-red-400">{sistemaArea.nombre}</span></div>
                  {!esSupervisor && (
                    <div className="text-xs text-zinc-400 mt-1">
                      Producción: <span className="text-green-400 font-bold">{formatRD(produccionRD)}</span>
                      <span className="text-zinc-600 ml-2">/ {formatRD(area.m2 * getPrecioVentaArea(area, sistemaArea))}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* v8.10.23: Barras por tarea */}
              <div className="space-y-3 border-t border-zinc-800 pt-3">
                {sistemaArea.tareas.map((t, idx) => {
                  const m2 = Math.min(m2PorTarea[t.id] || 0, area.m2);
                  const pct = area.m2 > 0 ? (m2 / area.m2) * 100 : 0;
                  return (
                    <BarraProgreso
                      key={t.id}
                      porcentaje={pct}
                      m2Ejecutados={m2}
                      m2Total={area.m2}
                      nombreTarea={t.nombre}
                      colorIndex={idx}
                    />
                  );
                })}
              </div>
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
