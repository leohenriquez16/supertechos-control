'use client';

import React from 'react';
import { X } from 'lucide-react';
import { formatRD, formatFecha, formatNum } from '../../lib/helpers/formato';

export default function ModalDetalleProduccion({ data, rango, prodPeriodo, onCerrar, onVerProyecto }) {
  // Calcular producción por proyecto en el rango
  const reportesRango = (data.reportes || []).filter(r => r.fecha >= rango.desde && r.fecha <= rango.hasta);

  const porProyecto = {};
  const porMaestro = {};

  reportesRango.forEach(r => {
    const proy = (data.proyectos || []).find(p => p.id === r.proyectoId);
    if (!proy) return;
    const sistema = data.sistemas[proy.sistema];
    if (!sistema) return;

    // Precio de la tarea (m²)
    let precio = 0;
    const precios = proy.preciosTareasM2 || {};
    precio = precios[r.tareaId] || 0;
    // Si es m2_fijo o no hay precio por tarea, intentar m² del proyecto
    if (!precio && proy.modoPagoManoObra === 'm2_fijo') {
      // No aplica - m2_fijo es para maestros, no precio al cliente
    }
    // Fallback: usar precio de la tarea del sistema directamente
    if (!precio && sistema.tareas) {
      const tarea = sistema.tareas.find(t => t.id === r.tareaId);
      if (tarea) precio = tarea.precioM2 || 0;
    }

    const m2 = parseFloat(r.m2) || 0;
    const monto = m2 * precio;

    // Por proyecto
    if (!porProyecto[proy.id]) {
      porProyecto[proy.id] = { proyecto: proy, m2: 0, monto: 0, dias: new Set() };
    }
    porProyecto[proy.id].m2 += m2;
    porProyecto[proy.id].monto += monto;
    porProyecto[proy.id].dias.add(r.fecha);

    // Por maestro
    if (r.personaId) {
      if (!porMaestro[r.personaId]) {
        const p = (data.personal || []).find(pe => pe.id === r.personaId);
        porMaestro[r.personaId] = { persona: p, m2: 0, monto: 0 };
      }
      porMaestro[r.personaId].m2 += m2;
      porMaestro[r.personaId].monto += monto;
    }
  });

  const proyectosOrdenados = Object.values(porProyecto).sort((a, b) => b.monto - a.monto);
  const maestrosOrdenados = Object.values(porMaestro)
    .filter(m => m.persona && (m.persona.roles || []).includes('maestro'))
    .sort((a, b) => b.m2 - a.m2);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-green-600 max-w-xl w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-green-500 font-bold">💰 Producción</div>
            <h2 className="text-xl font-black">{formatRD(prodPeriodo)}</h2>
            <div className="text-xs text-zinc-400">{formatFecha(rango.desde)} → {formatFecha(rango.hasta)}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {/* Por proyecto */}
        {proyectosOrdenados.length > 0 && (
          <div>
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">📂 Por proyecto</div>
            <div className="space-y-1">
              {proyectosOrdenados.map(p => (
                <button
                  key={p.proyecto.id}
                  onClick={() => onVerProyecto(p.proyecto)}
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-green-600 p-2 flex items-center justify-between text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-zinc-500 font-mono">{p.proyecto.referenciaOdoo}</div>
                    <div className="text-sm font-bold truncate">{p.proyecto.cliente || p.proyecto.nombre}</div>
                    <div className="text-[10px] text-zinc-500">
                      {formatNum(p.m2, 1)} m² · {p.dias.size} día{p.dias.size !== 1 ? 's' : ''} activo
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    <div className="text-sm font-black text-green-400">{formatRD(p.monto)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Por maestro */}
        {maestrosOrdenados.length > 0 && (
          <div>
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">🔨 Por maestro</div>
            <div className="space-y-1">
              {maestrosOrdenados.slice(0, 10).map((m, idx) => (
                <div key={m.persona.id} className="bg-zinc-950 border border-zinc-800 p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {idx === 0 ? <span className="text-lg">🥇</span> : idx === 1 ? <span className="text-lg">🥈</span> : idx === 2 ? <span className="text-lg">🥉</span> : <span className="w-6 text-center text-zinc-500 text-xs">{idx + 1}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{m.persona.nombre}</div>
                      <div className="text-[10px] text-zinc-500">{formatNum(m.m2, 1)} m² producidos</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-green-400">{formatRD(m.monto)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {proyectosOrdenados.length === 0 && (
          <div className="bg-zinc-950 border border-zinc-800 p-6 text-center text-sm text-zinc-500">
            Sin producción en este período
          </div>
        )}
      </div>
    </div>
  );
}
