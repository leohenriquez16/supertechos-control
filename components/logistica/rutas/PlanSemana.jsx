'use client';

// v8.49.6 → v8.75: planificador semanal — flota × 7 días para ver compromisos a
// futuro. Clic en una ruta = abrirla; clic en un día libre = crear ruta ahí.

import React from 'react';
import { formatFechaCorta } from '../../../lib/helpers/formato';

export default function PlanSemana({ diasSemana, viajesSemana, fecha, hoy, vehiculos, personal, onAbrir, onIrDia, onPlanificar }) {
  const flota = (vehiculos || []).filter(v => v.activo !== false);
  const viajesDe = (dia, vh) => viajesSemana.filter(x => x.fecha === dia && x.estado !== 'cancelado' && (x.vehiculoId === vh.id || (!x.vehiculoId && x.vehiculo && x.vehiculo.includes(vh.placa || '§'))));
  const otros = (dia) => viajesSemana.filter(x => x.fecha === dia && x.estado !== 'cancelado' && (x.tipoEnvio !== 'camion' || !flota.some(vh => x.vehiculoId === vh.id || (!x.vehiculoId && x.vehiculo && x.vehiculo.includes(vh.placa || '§')))));
  const chip = (x) => {
    const done = x.paradas.length > 0 && x.paradas.every(pp => pp.estado === 'completada' || pp.estado === 'cancelada');
    const color = x.estado === 'en_curso' ? 'bg-cyan-700/40 text-cyan-200' : (done || x.estado === 'completado') ? 'bg-green-800/40 text-green-300' : 'bg-zinc-700/50 text-zinc-200';
    return (
      <button key={x.id} onClick={() => onAbrir(x)}
        className={`block w-full text-left text-[11px] font-bold px-1.5 py-1 rounded ${color} truncate hover:brightness-125`}
        title={`${x.choferNombre || x.vehiculo} · ${x.paradas.length} paradas`}>
        {x.tipoEnvio === 'pagado' ? '📮 ' : x.tipoEnvio === 'subcontratado' ? '🚚 ' : ''}{(x.choferNombre || x.vehiculo || '').split(' ')[0]} · {x.paradas.length}
      </button>
    );
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 overflow-x-auto">
      <div className="text-xs font-black uppercase tracking-wider text-cyan-400 mb-2">Semana del {formatFechaCorta(diasSemana[0])} — rutas por vehículo</div>
      <table className="w-full border-collapse min-w-[860px]">
        <thead>
          <tr>
            <th className="text-left text-[11px] text-zinc-500 font-bold uppercase px-1.5 py-1 w-44">Vehículo</th>
            {diasSemana.map(d => (
              <th key={d} className={`px-1 py-1 ${d === hoy ? 'bg-cyan-950/50 rounded-t' : ''}`}>
                <button onClick={() => onIrDia(d)} className={`text-[11px] font-bold uppercase w-full ${d === fecha ? 'text-cyan-300' : d === hoy ? 'text-cyan-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {new Date(d + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'short' })}<br />{formatFechaCorta(d)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flota.map(vh => {
            const chofer = (personal || []).find(pp => pp.id === vh.responsableId);
            return (
              <tr key={vh.id} className="border-t border-zinc-800">
                <td className="px-1.5 py-1.5 align-top">
                  <div className="text-xs font-bold truncate">{[vh.marca, vh.modelo].filter(Boolean).join(' ')}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{vh.placa || ''}{chofer ? ` · ${chofer.nombre.split(' ')[0]}` : ''}</div>
                </td>
                {diasSemana.map(d => {
                  const del = viajesDe(d, vh);
                  return (
                    <td key={d} className={`px-0.5 py-1 align-top ${d === hoy ? 'bg-cyan-950/30' : ''}`}>
                      {del.length ? <div className="space-y-0.5">{del.map(chip)}</div>
                        : <button onClick={() => onPlanificar(d, vh, chofer)} className="w-full text-xs text-zinc-700 hover:text-cyan-400 py-1" title="Libre — clic para crear una ruta">＋</button>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="border-t border-zinc-800">
            <td className="px-1.5 py-1.5 text-[11px] text-zinc-500 font-bold align-top">Envíos, sub-contratados y otros</td>
            {diasSemana.map(d => {
              const del = otros(d);
              return <td key={d} className={`px-0.5 py-1 align-top ${d === hoy ? 'bg-cyan-950/30' : ''}`}>{del.length ? <div className="space-y-0.5">{del.map(chip)}</div> : null}</td>;
            })}
          </tr>
        </tbody>
      </table>
      <div className="text-[11px] text-zinc-500 mt-2">Gris: por salir · Azul: en la calle · Verde: terminada · ＋ día libre (clic para crear la ruta).</div>
    </div>
  );
}
