'use client';

import React from 'react';
import { X, Briefcase, ChevronRight, UserCircle } from 'lucide-react';

// v8.9.29: Modal "Personal en Obra Ahora"
export default function ModalDetallePersonalAhora({ personalPorProyecto, totalPersonas, onCerrar, onVerProyecto }) {
  const rolLabel = (persona) => {
    if (!persona?.roles) return '—';
    if (persona.roles.includes('supervisor')) return '👔 Sup';
    if (persona.roles.includes('maestro')) return '🔨 Maestro';
    if (persona.roles.includes('ayudante')) return '🛠️ Ayud';
    return persona.roles[0];
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-blue-600 max-w-xl w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-blue-500 font-bold">👷 Personal en Obra Ahora</div>
            <h2 className="text-xl font-black">{totalPersonas} persona{totalPersonas !== 1 ? 's' : ''} · {personalPorProyecto.length} obra{personalPorProyecto.length !== 1 ? 's' : ''}</h2>
            <div className="text-[10px] text-zinc-500 mt-0.5">Jornadas abiertas (check-in sin check-out)</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {personalPorProyecto.length === 0 ? (
          <div className="bg-zinc-950 border border-zinc-800 p-6 text-center text-sm text-zinc-500">
            No hay jornadas abiertas en este momento
          </div>
        ) : (
          <div className="space-y-3">
            {personalPorProyecto.map(({ proyecto, personas, jornada }) => (
              <div key={proyecto.id} className="bg-zinc-950 border border-zinc-800 overflow-hidden">
                <button
                  onClick={() => onVerProyecto(proyecto)}
                  className="w-full p-3 text-left hover:bg-zinc-900 flex items-start gap-2"
                >
                  <Briefcase className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-zinc-500 font-mono">{proyecto.referenciaOdoo || '—'}</div>
                    <div className="font-bold text-sm truncate">{proyecto.cliente || proyecto.nombre}</div>
                    <div className="text-[10px] text-blue-400 mt-1">
                      {personas.length} persona{personas.length !== 1 ? 's' : ''} presente{personas.length !== 1 ? 's' : ''}
                      {jornada && jornada.horaInicio && <span className="text-zinc-500"> · desde {jornada.horaInicio}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-zinc-500" />
                </button>

                <div className="border-t border-zinc-800 p-2 space-y-1">
                  {personas.map(persona => (
                    <div key={persona.id} className="flex items-center gap-2 bg-zinc-900 p-2 text-xs">
                      {persona.foto2x2 ? (
                        <img src={persona.foto2x2} alt="" className="w-7 h-7 object-cover border border-zinc-700 flex-shrink-0" />
                      ) : (
                        <UserCircle className="w-7 h-7 text-zinc-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{persona.nombre}</div>
                        <div className="text-[9px] text-zinc-500">{rolLabel(persona)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
