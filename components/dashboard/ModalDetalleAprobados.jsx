'use client';

import React from 'react';
import { X } from 'lucide-react';
import { formatRD } from '../../lib/helpers/formato';
import { getPrecioTotalM2Area } from '../../lib/helpers/calculos';

// Helper local
const labelProyecto = (p) => p?.referenciaOdoo ? `${p.referenciaOdoo} · ${p.cliente || p.nombre}` : (p?.cliente || p?.nombre || 'Sin nombre');

export default function ModalDetalleAprobados({ proyectos, data, onCerrar }) {
  // v8.10.22: ordenar por fechaAprobacion (con fallback a fecha_inicio para proyectos viejos)
  const ordenados = [...proyectos].sort((a, b) => {
    const fa = a.fechaAprobacion || a.fecha_inicio || '';
    const fb = b.fechaAprobacion || b.fecha_inicio || '';
    return fb.localeCompare(fa); // descendente: más reciente primero
  });

  // Calcular monto por proyecto: suma de áreas usando precio del sistema (con override custom si aplica)
  const calcularMonto = (p) => {
    const sistemas = data?.sistemas || {};
    return (p.areas || []).reduce((sum, area) => {
      const sistemaArea = area.sistemaId || p.sistema;
      const sistema = sistemas[sistemaArea];
      if (!sistema) return sum;
      return sum + getPrecioTotalM2Area(area, sistema, sistemas);
    }, 0);
  };

  const totalGeneral = ordenados.reduce((s, p) => s + calcularMonto(p), 0);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-green-600 max-w-3xl w-full p-5 space-y-4 max-h-[90vh] overflow-auto my-8">
        <div className="flex justify-between items-start sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800">
          <div>
            <div className="text-xs tracking-widest uppercase text-green-500 font-bold">Detalle aprobados</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{ordenados.length} proyecto{ordenados.length !== 1 ? 's' : ''} · Total {formatRD(totalGeneral)}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {ordenados.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center py-8">No hay proyectos aprobados en este rango.</div>
        ) : (
          <div className="space-y-2">
            {ordenados.map(p => {
              const monto = calcularMonto(p);
              const fechaAprob = p.fechaAprobacion || p.fecha_inicio || null;
              return (
                <div key={p.id} className="bg-zinc-950 border border-zinc-800 p-3 hover:border-green-700 transition-colors">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{labelProyecto(p)}</div>
                      {p.referenciaProyecto && (
                        <div className="text-[10px] text-zinc-500 truncate">{p.referenciaProyecto}</div>
                      )}
                      <div className="text-[10px] text-zinc-400 mt-1">
                        {fechaAprob ? (
                          <span>📅 Aprobado: <span className="text-green-400">{fechaAprob}</span></span>
                        ) : (
                          <span className="text-zinc-600 italic">sin fecha de aprobación</span>
                        )}
                        {p.estado && p.estado !== 'aprobado' && (
                          <span className="ml-2 text-zinc-500">· estado actual: <span className="text-yellow-400">{p.estado}</span></span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-green-400">{formatRD(monto)}</div>
                      <div className="text-[10px] text-zinc-600">
                        {(p.areas || []).reduce((s, a) => s + (a.m2 || 0), 0).toFixed(0)} m²
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="sticky bottom-0 bg-zinc-900 pt-3 border-t border-zinc-800 flex justify-between items-center">
          <div className="text-[10px] text-zinc-500">
            Ordenado por fecha de aprobación (más reciente primero)
          </div>
          <button onClick={onCerrar} className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-bold uppercase px-4 py-2">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
