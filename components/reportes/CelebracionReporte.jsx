'use client';

// v8.30.4: Celebración al guardar un reporte — recompensa INMEDIATA ("reportar
// premia"): m² sumados, racha 🔥 y Brigada de la Semana. Se cierra con un toque
// o sola a los 6 segundos.

import React, { useEffect } from 'react';
import { calcularRacha, brigadaDeLaSemana } from '../../lib/helpers/reconocimiento';

export default function CelebracionReporte({ usuario, data, m2, onCerrar }) {
  const racha = calcularRacha(data, usuario.id);
  const brigada = brigadaDeLaSemana(data);
  const esBrigadaDeLaSemana = brigada?.id === usuario.id;

  useEffect(() => {
    const t = setTimeout(() => onCerrar?.(), 6000);
    return () => clearTimeout(t);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-green-500 rounded-card p-6 w-full max-w-sm text-center space-y-3" onClick={e => e.stopPropagation()}>
        <div className="text-5xl">✅</div>
        <div className="text-xl font-black text-white">¡Reporte guardado!</div>
        {m2 > 0 && <div className="text-3xl font-black text-green-400">+{Math.round(m2 * 10) / 10} m²</div>}
        <div className="text-sm text-zinc-300">sumados a tu producción de la quincena 💰</div>
        {racha >= 2 && (
          <div className="bg-zinc-950 border border-amber-700/50 rounded-card py-2 px-3 text-amber-400 font-bold text-sm">
            🔥 ¡{racha} días seguidos reportando!
          </div>
        )}
        {esBrigadaDeLaSemana ? (
          <div className="bg-zinc-950 border border-amber-500/60 rounded-card py-2 px-3 text-amber-300 font-bold text-sm">
            🏆 Tu brigada es la Brigada de la Semana
          </div>
        ) : brigada && (
          <div className="text-[11px] text-zinc-500">🏆 Brigada de la semana: <b className="text-zinc-300">{brigada.nombre}</b> ({brigada.dias} días · {brigada.m2} m²)</div>
        )}
        <button onClick={onCerrar} className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-black uppercase py-2.5 rounded-card">Seguir</button>
      </div>
    </div>
  );
}
