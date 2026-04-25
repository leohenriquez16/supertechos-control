'use client';

import React from 'react';
import { X, Briefcase, ChevronRight } from 'lucide-react';
import { calcAvanceProyecto } from '../../lib/helpers/calculos';

// v8.9.29: Modal "Proyectos en Ejecución"
export default function ModalDetalleEnEjecucion({ proyectos, data, jornadasHoy, onCerrar, onVerProyecto }) {
  // Ordenar por avance (de menor a mayor)
  const proyectosConAvance = proyectos.map(p => {
    const sisIdP = p.sistema;
    const sisP = data.sistemas && data.sistemas[sisIdP];
    const avance = calcAvanceProyecto(p, data.reportes || [], sisP, data.sistemas || {});
    const jornada = (jornadasHoy || []).find(j => j.proyectoId === p.id);
    const personasHoy = (jornada && jornada.horaInicio && !jornada.horaFin) ? (jornada.personasPresentesIds || []).length : 0;
    return { ...p, pctAvance: avance.porcentaje, personasHoy };
  }).sort((a, b) => a.pctAvance - b.pctAvance);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 max-w-xl w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-red-500 font-bold">🏗️ Proyectos en Ejecución</div>
            <h2 className="text-xl font-black">{proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''} activo{proyectos.length !== 1 ? 's' : ''}</h2>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {proyectos.length === 0 ? (
          <div className="bg-zinc-950 border border-zinc-800 p-6 text-center text-sm text-zinc-500">
            No hay proyectos en ejecución actualmente
          </div>
        ) : (
          <div className="space-y-2">
            {proyectosConAvance.map(p => (
              <button
                key={p.id}
                onClick={() => onVerProyecto(p)}
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-red-600 p-3 text-left flex items-start gap-2 transition-all"
              >
                <Briefcase className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-zinc-500 font-mono">{p.referenciaOdoo || '—'}</div>
                  <div className="font-bold text-sm truncate">{p.cliente || p.nombre}</div>
                  {p.referenciaProyecto && <div className="text-[11px] text-zinc-400 truncate">{p.referenciaProyecto}</div>}
                  <div className="flex items-center gap-3 mt-1">
                    <div className="text-[10px] text-zinc-400">
                      <span className={p.pctAvance >= 80 ? 'text-green-400' : p.pctAvance >= 40 ? 'text-yellow-400' : 'text-red-400'}>
                        {p.pctAvance.toFixed(0)}% avance
                      </span>
                    </div>
                    {p.personasHoy > 0 && (
                      <div className="text-[10px] text-blue-400">· 👷 {p.personasHoy} hoy</div>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0 mt-1" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
