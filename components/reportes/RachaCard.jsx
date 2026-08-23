'use client';

// v8.30.4: Tarjeta de racha 🔥 + Brigada de la Semana 🏆 para el home/producción
// del maestro. Premiar antes que castigar: la racha se cuida sola.

import React from 'react';
import { calcularRacha, brigadaDeLaSemana } from '../../lib/helpers/reconocimiento';

export default function RachaCard({ usuario, data }) {
  const racha = calcularRacha(data, usuario.id);
  const brigada = brigadaDeLaSemana(data);
  const soyYo = brigada?.id === usuario.id;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{racha >= 2 ? '🔥' : '📋'}</span>
        <div>
          <div className="font-black text-sm">{racha >= 2 ? `¡${racha} días seguidos reportando!` : racha === 1 ? '1 día reportando — ¡arranca tu racha!' : 'Reporta hoy y arranca tu racha'}</div>
          <div className="text-[10px] text-zinc-500">Cada reporte suma a tu producción al instante</div>
        </div>
      </div>
      {brigada && (
        <div className={`text-[11px] font-bold px-2.5 py-1.5 rounded-card ${soyYo ? 'bg-amber-500/20 text-amber-300 border border-amber-600/50' : 'bg-zinc-950 border border-zinc-800 text-zinc-400'}`}>
          🏆 Brigada de la semana: {soyYo ? '¡LA TUYA!' : brigada.nombre.split(' ').slice(0, 2).join(' ')}
        </div>
      )}
    </div>
  );
}
