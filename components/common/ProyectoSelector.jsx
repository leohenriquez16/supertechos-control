'use client';

// v8.17.25: Selector de proyecto con buscador integrado.
// v8.17.69: el panel del dropdown se renderiza con position:fixed anclado al
//           botón trigger para escapar de cualquier padre con overflow:hidden/auto
//           (modales como ModalCrearGastoAdmin que recortaban la lista).
//
// Props:
//   value           id del proyecto seleccionado o '' / null
//   onChange(id)    callback al seleccionar (id puede ser '' para "sin proyecto")
//   proyectos       array de proyectos (cada uno con id, cliente, referenciaOdoo, archivado)
//   placeholder     texto del input cuando no hay nada elegido (default: 'Buscar proyecto...')
//   permitirVacio   si true (default), la primera opción es "Sin proyecto / Gasto general"
//   etiquetaVacio   texto para la opción vacía
//   disabled

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

export default function ProyectoSelector({
  value,
  onChange,
  proyectos = [],
  placeholder = 'Buscar proyecto…',
  permitirVacio = true,
  etiquetaVacio = '— Sin proyecto / gasto general —',
  disabled = false,
  className = '',
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [panelPos, setPanelPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  // Recalcular posición del panel a partir del rect del botón.
  const recalcPos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const panelH = 300; // max-h del panel
    const margin = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < panelH + margin && rect.top > spaceBelow;
    setPanelPos({
      top: openUp ? Math.max(8, rect.top - panelH - margin) : rect.bottom + margin,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  // Al abrir, calcular posición inicial.
  useEffect(() => {
    if (abierto) recalcPos();
    else setPanelPos(null);
  }, [abierto, recalcPos]);

  // Re-calcular en scroll/resize mientras está abierto (el modal padre puede scrollear).
  useEffect(() => {
    if (!abierto) return;
    const onScrollOrResize = () => recalcPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [abierto, recalcPos]);

  // Cerrar al click fuera (incluye el panel, que ya no está dentro del wrap).
  useEffect(() => {
    if (!abierto) return;
    const onClick = (e) => {
      const inWrap = wrapRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inWrap && !inPanel) {
        setAbierto(false);
        setBusqueda('');
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [abierto]);

  const proyectoSel = useMemo(() => proyectos.find(p => p.id === value) || null, [proyectos, value]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const matches = (p) => {
      if (!q) return true;
      const hay = `${p.referenciaOdoo || ''} ${p.cliente || ''} ${p.nombre || ''} ${p.referenciaProyecto || ''}`.toLowerCase();
      return hay.includes(q);
    };
    const activos = proyectos.filter(p => !p.archivado && matches(p));
    const archivados = proyectos.filter(p => p.archivado && matches(p));
    return { activos, archivados };
  }, [proyectos, busqueda]);

  const seleccionar = (id) => {
    onChange?.(id);
    setAbierto(false);
    setBusqueda('');
  };

  const labelProy = (p) => `${p.referenciaOdoo ? p.referenciaOdoo + ' · ' : ''}${p.cliente || p.nombre || ''}`;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Botón que abre el dropdown — se ve como un <select> */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => !disabled && setAbierto(!abierto)}
        disabled={disabled}
        className={`w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-2 text-white text-sm text-left flex items-center justify-between gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <span className={`truncate ${proyectoSel ? '' : 'text-zinc-500'}`}>
          {proyectoSel ? labelProy(proyectoSel) : etiquetaVacio}
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel — position:fixed para escapar de overflow del padre */}
      {abierto && !disabled && panelPos && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
            maxHeight: 300,
            zIndex: 1000,
          }}
          className="bg-zinc-950 border-2 border-red-600 shadow-2xl flex flex-col">
          {/* Search box */}
          <div className="p-2 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900">
            <Search className="w-3 h-3 text-zinc-500 shrink-0" />
            <input
              type="text"
              autoFocus
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent outline-none text-white text-sm placeholder:text-zinc-600"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} className="text-zinc-500 hover:text-white shrink-0">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {permitirVacio && !busqueda && (
              <button
                type="button"
                onClick={() => seleccionar('')}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 ${!value ? 'bg-red-900/30 text-red-300' : 'text-zinc-300'}`}
              >
                {etiquetaVacio}
              </button>
            )}
            {lista.activos.length === 0 && lista.archivados.length === 0 && (
              <div className="text-center text-zinc-500 text-xs py-4">Sin resultados para "{busqueda}"</div>
            )}
            {lista.activos.length > 0 && (
              <>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold px-3 pt-2 pb-1 border-t border-zinc-800">
                  Tus proyectos activos · más recientes primero
                </div>
                {lista.activos.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => seleccionar(p.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 ${value === p.id ? 'bg-red-900/30 text-red-300' : 'text-zinc-300'}`}
                  >
                    <div className="font-bold truncate">{p.cliente || p.nombre}</div>
                    {p.referenciaOdoo && <div className="text-[10px] text-zinc-500 font-mono">{p.referenciaOdoo}</div>}
                  </button>
                ))}
              </>
            )}
            {lista.archivados.length > 0 && (
              <>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold px-3 pt-2 pb-1 border-t border-zinc-800">
                  Archivados
                </div>
                {lista.archivados.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => seleccionar(p.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 opacity-60 ${value === p.id ? 'bg-red-900/30 text-red-300 opacity-100' : 'text-zinc-300'}`}
                  >
                    <div className="font-bold truncate">{p.cliente || p.nombre}</div>
                    {p.referenciaOdoo && <div className="text-[10px] text-zinc-500 font-mono">{p.referenciaOdoo}</div>}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
