'use client';

import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

// Hook que persiste la preferencia de densidad por vista en localStorage.
// Devuelve [valor, setter, classes] donde classes es un objeto con shorthands
// para usar en componentes hijos sin if/else verbosos.
//
// Uso:
//   const [densidad, setDensidad, dx] = useDensidad('caja-chica-admin');
//   <div className={dx.cardPad}>...</div>
export function useDensidad(key, defecto = 'detallado') {
  const [d, setD] = useState(defecto);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem('densidad_' + key);
      if (v === 'compacto' || v === 'detallado') setD(v);
    } catch {}
  }, [key]);
  const change = (nueva) => {
    setD(nueva);
    try { window.localStorage.setItem('densidad_' + key, nueva); } catch {}
  };
  const compacto = d === 'compacto';
  const dx = {
    compacto,
    // Card / item paddings
    cardPad:    compacto ? 'p-2'        : 'p-3',
    rowPad:     compacto ? 'p-1.5'      : 'p-3',
    rowGap:     compacto ? 'gap-2'      : 'gap-3',
    // Avatar / icono cuadrado
    iconBox:    compacto ? 'w-6 h-6'    : 'w-9 h-9',
    iconSize:   compacto ? 'text-sm'    : 'text-base',
    // Tipografía principal
    title:      compacto ? 'text-[11px]' : 'text-xs',
    subtitle:   compacto ? 'text-[9px]'  : 'text-[10px]',
    monto:      compacto ? 'text-xs'     : 'text-base',
    // Spacing entre items
    listGap:    compacto ? 'space-y-1'   : 'space-y-2',
    sectionGap: compacto ? 'space-y-3'   : 'space-y-5',
  };
  return [d, change, dx];
}

export default function ToggleDensidad({ valor, onChange, className = '' }) {
  return (
    <div className={`inline-flex bg-zinc-900 border border-zinc-800 ${className}`}>
      <button
        type="button"
        onClick={() => onChange('compacto')}
        className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${valor === 'compacto' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}
        title="Vista compacta — más filas en pantalla"
      >
        <Minimize2 className="w-3 h-3" /> Compacto
      </button>
      <button
        type="button"
        onClick={() => onChange('detallado')}
        className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${valor === 'detallado' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}
        title="Vista detallada — más espacio y datos"
      >
        <Maximize2 className="w-3 h-3" /> Detallado
      </button>
    </div>
  );
}
