'use client';

import React from 'react';
import { X } from 'lucide-react';
import { formatRD, formatNum } from '../../lib/helpers/formato';

export default function ModalDetalleAprobados({ aprobadosPeriodo, montoTotal, onCerrar, onVerProyecto }) {
  const hoy = new Date();

  const diasEnAprobado = (proyecto) => {
    const fref = proyecto.fecha_inicio || proyecto.createdAt;
    if (!fref) return 0;
    return Math.floor((hoy - new Date(fref)) / (1000 * 60 * 60 * 24));
  };

  // Ordenar por monto descendente
  const ordenados = [...(aprobadosPeriodo || [])].sort((a, b) => {
    const mA = (a.areas || []).reduce((s, ar) => s + (ar.m2 || 0) * (ar.precio || 0), 0);
    const mB = (b.areas || []).reduce((s, ar) => s + (ar.m2 || 0) * (ar.precio || 0), 0);
    return mB - mA;
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-cyan-600 max-w-xl w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-cyan-500 font-bold">✅ Proyectos aprobados</div>
            <h2 className="text-xl font-black">{formatRD(montoTotal)}</h2>
            <div className="text-xs text-zinc-400">{ordenados.length} proyecto{ordenados.length !== 1 ? 's' : ''} esperando iniciar</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {ordenados.length === 0 ? (
          <div className="bg-zinc-950 border border-zinc-800 p-6 text-center text-sm text-zinc-500">
            No hay proyectos en estado "Aprobado"
          </div>
        ) : (
          <div className="space-y-1">
            {ordenados.map(p => {
              const m2Total = (p.areas || []).reduce((s, a) => s + (a.m2 || 0), 0);
              const monto = (p.areas || []).reduce((s, a) => s + (a.m2 || 0) * (a.precio || 0), 0);
              const dias = diasEnAprobado(p);
              const atrasado = dias > 7;
              return (
                <button
                  key={p.id}
                  onClick={() => onVerProyecto(p)}
                  className={`w-full border p-3 flex items-center justify-between text-left ${atrasado ? 'bg-yellow-900/10 border-yellow-700 hover:border-yellow-500' : 'bg-zinc-950 border-zinc-800 hover:border-cyan-600'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 font-mono">{p.referenciaOdoo}</span>
                      {atrasado && <span className="text-[9px] text-yellow-400 font-bold">⚠️ {dias} días</span>}
                    </div>
                    <div className="text-sm font-bold truncate">{p.cliente || p.nombre}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{p.referenciaProyecto}</div>
                    <div className="text-[10px] text-zinc-400 mt-1">
                      {formatNum(m2Total, 0)} m² · Aprobado hace {dias} día{dias !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    <div className="text-sm font-black text-cyan-400">{formatRD(monto)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] text-zinc-500">
          💡 Los proyectos en amarillo llevan más de 7 días aprobados sin arrancar. Considera moverlos a "En ejecución" o "Parado".
        </div>
      </div>
    </div>
  );
}
