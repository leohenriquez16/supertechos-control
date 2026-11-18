'use client';

// v8.75: buscador ÚNICO para agregar paradas — obras, locaciones de clientes,
// suplidores, puertos/almacenes y la Oficina, todo en un solo campo.
// Flujo: escribes → flechas/Enter → eliges tipo (ya viene uno sugerido) → Enter.
// También acepta un punto del mapa (clic) o un link de Google Maps pegado.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { buscarCandidatos, GRUPOS_LUGAR, TIPOS_PARADA } from '../../../lib/helpers/rutasOficina';
import { parseCoords } from '../../../lib/helpers/geo';
import { geocodificarInverso } from '../../../lib/geo';

const TITULO_GRUPO = Object.fromEntries([...GRUPOS_LUGAR.map(g => [g.id, g.titulo]), ['recientes', 'Recientes'], ['pegado', 'Link pegado']]);

export default function BuscadorParada({ candidatos, recientes = [], puntoMapa = null, onLimpiarPuntoMapa, onAgregar, onMasOpciones }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [elegido, setElegido] = useState(null);   // candidato elegido
  const [tipo, setTipo] = useState('entrega');
  const [nota, setNota] = useState('');
  const [nombre, setNombre] = useState('');       // solo para puntos sin nombre (mapa / link)
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef(null);
  const notaRef = useRef(null);
  const nombreRef = useRef(null);

  // Atajo: "/" enfoca el buscador (si no estás escribiendo en otro campo).
  useEffect(() => {
    const h = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault(); inputRef.current?.focus();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Clic en el mapa → ese punto queda elegido, pidiendo nombre.
  useEffect(() => {
    if (!puntoMapa) return;
    elegir({ key: null, grupo: 'mapa', icono: '📌', label: 'Punto marcado en el mapa', sub: `${puntoMapa.lat.toFixed(5)}, ${puntoMapa.lng.toFixed(5)}`, lugar: '', lat: puntoMapa.lat, lng: puntoMapa.lng, proyectoId: null, tipoDefecto: 'visita', pedirNombre: true });
    let vivo = true;
    geocodificarInverso(puntoMapa.lat, puntoMapa.lng).then(g => {
      if (!vivo || !g) return;
      const sug = [g.nombre, g.direccion, g.sector].filter(Boolean)[0] || '';
      if (sug) setNombre(n => n || sug);
    }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line
  }, [puntoMapa?.lat, puntoMapa?.lng]);

  const resultados = useMemo(() => {
    const r = buscarCandidatos(candidatos, texto, { recientes });
    const c = parseCoords(texto);
    if (c) r.unshift({ key: null, grupo: 'pegado', grupoMostrado: 'pegado', icono: '📌', label: 'Usar el punto del link pegado', sub: `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`, lugar: '', lat: c.lat, lng: c.lng, proyectoId: null, tipoDefecto: 'visita', pedirNombre: true });
    return r;
  }, [candidatos, texto, recientes]);
  useEffect(() => { setActivo(0); }, [texto]);

  function elegir(c) {
    setElegido(c); setTipo(c.tipoDefecto || 'entrega'); setNota(''); setNombre(c.pedirNombre ? '' : c.lugar);
    setAbierto(false); setTexto('');
    setTimeout(() => (c.pedirNombre ? nombreRef.current : notaRef.current)?.focus(), 30);
  }
  const cancelar = () => {
    setElegido(null); setNota(''); setNombre('');
    if (elegido?.grupo === 'mapa') onLimpiarPuntoMapa?.();
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const agregar = async () => {
    if (!elegido || guardando) return;
    if (elegido.pedirNombre && !nombre.trim()) { nombreRef.current?.focus(); return; }
    setGuardando(true);
    const ok = await onAgregar({ cand: { ...elegido, lugar: elegido.pedirNombre ? nombre.trim() : elegido.lugar }, tipo, nota: nota.trim() });
    setGuardando(false);
    if (ok !== false) {
      if (elegido.grupo === 'mapa') onLimpiarPuntoMapa?.();
      setElegido(null); setNota(''); setNombre('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const teclaBusqueda = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo(i => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (resultados[activo]) elegir(resultados[activo]); }
    else if (e.key === 'Escape') { setTexto(''); setAbierto(false); }
  };
  const teclaFormulario = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); agregar(); }
    else if (e.key === 'Escape') cancelar();
  };

  if (elegido) {
    return (
      <div className="bg-zinc-950 border-2 border-cyan-700 rounded-card p-2.5 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-lg leading-none mt-0.5">{elegido.icono}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold truncate">{elegido.label}</div>
            {elegido.sub && <div className="text-[11px] text-zinc-500 truncate">{elegido.sub}</div>}
          </div>
          <button onClick={cancelar} className="text-zinc-500 hover:text-white shrink-0" title="Cambiar (Esc)"><X className="w-4 h-4" /></button>
        </div>
        {elegido.pedirNombre && (
          <input ref={nombreRef} value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={teclaFormulario}
            placeholder="¿Cómo se llama este lugar? (lo ve el chofer)" className="w-full bg-zinc-900 border border-amber-700 focus:border-cyan-600 outline-none rounded-card px-2.5 py-2 text-sm" />
        )}
        <div className="grid grid-cols-3 gap-1.5">
          {TIPOS_PARADA.map(t => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`text-xs font-bold py-2 rounded-card border ${tipo === t.id ? 'bg-cyan-700 border-cyan-700 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}>
              {t.icono} {t.label}
            </button>
          ))}
        </div>
        <input ref={notaRef} value={nota} onChange={e => setNota(e.target.value)} onKeyDown={teclaFormulario}
          placeholder="Nota para el chofer (opcional): qué lleva, a quién buscar…" className="w-full bg-zinc-900 border border-zinc-700 focus:border-cyan-600 outline-none rounded-card px-2.5 py-2 text-sm" />
        <button onClick={agregar} disabled={guardando || (elegido.pedirNombre && !nombre.trim())}
          className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm font-black py-2.5 rounded-card flex items-center justify-center gap-2">
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Agregar a la ruta <span className="text-[10px] font-bold opacity-70">Enter</span>
        </button>
      </div>
    );
  }

  let ultimoGrupo = null;
  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-zinc-950 border-2 border-zinc-700 focus-within:border-cyan-600 rounded-card px-2.5">
        <Search className="w-4 h-4 text-zinc-500 shrink-0" />
        <input ref={inputRef} value={texto} onChange={e => { setTexto(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} onKeyDown={teclaBusqueda}
          placeholder="Agregar parada: obra, cliente, suplidor, oficina…" className="flex-1 bg-transparent outline-none py-2.5 text-sm min-w-0" />
        <span className="hidden xl:inline text-[10px] text-zinc-600 border border-zinc-800 rounded px-1 shrink-0">/</span>
      </div>
      {abierto && (resultados.length > 0 || texto.trim().length >= 2) && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-card shadow-pop max-h-80 overflow-y-auto">
          {resultados.map((c, i) => {
            const cab = c.grupoMostrado !== ultimoGrupo ? (ultimoGrupo = c.grupoMostrado, TITULO_GRUPO[c.grupoMostrado]) : null;
            return (
              <React.Fragment key={(c.key || 'pt') + i}>
                {cab && <div className="px-2.5 pt-2 pb-1 text-[10px] uppercase tracking-widest font-bold text-zinc-500">{cab}</div>}
                <button onMouseDown={e => { e.preventDefault(); elegir(c); }} onMouseEnter={() => setActivo(i)}
                  className={`w-full text-left px-2.5 py-2 flex items-center gap-2 ${i === activo ? 'bg-zinc-800' : ''}`}>
                  <span className="shrink-0">{c.icono}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{c.label}</span>
                    {c.sub && <span className="block text-[11px] text-zinc-500 truncate">{c.sub}</span>}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
          {texto.trim().length >= 2 && (
            <button onMouseDown={e => { e.preventDefault(); onMasOpciones?.(texto.trim()); setTexto(''); }}
              className="w-full text-left px-2.5 py-2 border-t border-zinc-800 text-[12px] text-cyan-400 hover:bg-zinc-800">
              {resultados.length === 0 ? `No encontré "${texto.trim()}". ` : ''}Escribirlo a mano y pegar el link de Google Maps →
            </button>
          )}
          {resultados.length === 0 && texto.trim().length >= 2 && (
            <div className="px-2.5 pb-2 text-[11px] text-zinc-500">También puedes hacer clic en el mapa donde queda.</div>
          )}
        </div>
      )}
    </div>
  );
}
