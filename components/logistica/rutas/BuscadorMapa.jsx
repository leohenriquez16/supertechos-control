'use client';

// v8.75: barra de búsqueda ENCIMA del mapa, como en Google Maps. Escribes un negocio,
// una ferretería o una dirección → eliges → el mapa vuela ahí y queda el pin listo para
// «Agregar a la ruta» (el mismo flujo que hacer clic en el mapa, pero ya con nombre).
import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import useLugaresMapa from './useLugaresMapa';

export default function BuscadorMapa({ onElegir, deshabilitado = false }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const { lugares, cargando } = useLugaresMapa(texto, { activo: abierto });
  const inputRef = useRef(null);
  useEffect(() => { setActivo(0); }, [lugares]);

  const elegir = (l) => { onElegir?.(l); setTexto(''); setAbierto(false); inputRef.current?.blur(); };
  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(i + 1, lugares.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (lugares[activo]) elegir(lugares[activo]); }
    else if (e.key === 'Escape') { setTexto(''); setAbierto(false); }
  };
  const q = texto.trim();

  return (
    <div className="absolute top-2.5 left-12 right-2.5 sm:right-auto sm:w-80 z-[500]">
      <div className={`flex items-center gap-2 bg-zinc-900 border-2 ${deshabilitado ? 'border-zinc-800 opacity-60' : 'border-zinc-700 focus-within:border-cyan-600'} rounded-card px-2.5 shadow-pop`}>
        {cargando ? <Loader2 className="w-4 h-4 text-cyan-500 animate-spin shrink-0" /> : <Search className="w-4 h-4 text-zinc-500 shrink-0" />}
        <input ref={inputRef} value={texto} disabled={deshabilitado}
          onChange={e => { setTexto(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} onKeyDown={tecla}
          placeholder={deshabilitado ? 'Abre o crea una ruta para buscar' : 'Buscar en el mapa: ferretería, plaza, calle…'}
          className="flex-1 bg-transparent outline-none py-2 text-sm min-w-0" />
        {texto && <button onMouseDown={e => { e.preventDefault(); setTexto(''); }} className="text-zinc-500 hover:text-white shrink-0"><X className="w-4 h-4" /></button>}
      </div>
      {abierto && q.length >= 3 && (
        <div className="mt-1 bg-zinc-900 border border-zinc-700 rounded-card shadow-pop max-h-[50vh] overflow-y-auto">
          {lugares.map((l, i) => (
            <button key={`${l.nombre}-${l.lat}-${l.lng}`} onMouseDown={e => { e.preventDefault(); elegir(l); }} onMouseEnter={() => setActivo(i)}
              className={`w-full text-left px-2.5 py-2 flex items-start gap-2 ${i === activo ? 'bg-zinc-800' : ''}`}>
              <span className="shrink-0 mt-0.5">📍</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate">{l.nombre}</span>
                {l.detalle && <span className="block text-[11px] text-zinc-500 truncate">{l.detalle}</span>}
              </span>
            </button>
          ))}
          {!cargando && lugares.length === 0 && (
            <div className="px-2.5 py-2 text-[12px] text-zinc-500">No encontré «{q}» en el mapa. Prueba con otro nombre o haz clic donde queda.</div>
          )}
          {cargando && lugares.length === 0 && <div className="px-2.5 py-2 text-[12px] text-zinc-500">Buscando…</div>}
        </div>
      )}
    </div>
  );
}
