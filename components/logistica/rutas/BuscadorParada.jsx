'use client';

// v8.75: buscador ÚNICO para agregar paradas — obras, locaciones de clientes,
// suplidores, puertos/almacenes y la Oficina, todo en un solo campo.
// Flujo: escribes → flechas/Enter → eliges tipo (ya viene uno sugerido) → Enter.
// También acepta un punto del mapa (clic) o un link de Google Maps pegado.
// Si eliges una OBRA que tiene requisición lista o retiro de sobrante en «Por montar»,
// ofrece montarlo con un clic (en vez de una parada libre que dejaría la requisición
// sin amarrar y nunca pasaría a entregada).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { buscarCandidatos, GRUPOS_LUGAR, TIPOS_PARADA } from '../../../lib/helpers/rutasOficina';
import { parseCoords } from '../../../lib/helpers/geo';
import { geocodificarInverso } from '../../../lib/geo';
import useLugaresMapa from './useLugaresMapa';

const TITULO_GRUPO = Object.fromEntries([...GRUPOS_LUGAR.map(g => [g.id, g.titulo]), ['recientes', 'Recientes'], ['pegado', 'Link pegado'], ['enmapa', '📍 Lugares en el mapa (negocios, plazas, calles)']]);

export default function BuscadorParada({ candidatos, recientes = [], puntoMapa = null, onLimpiarPuntoMapa, onAgregar, onMasOpciones,
  autoFocus = false, porMontarObra = null, nombreObra = null, onMontarRequisicion = null, onMontarDiligencia = null, onElegirLugarMapa = null }) {
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
  const montarRef = useRef(null);
  const [montando, setMontando] = useState(null); // id de la requisición/retiro que se está montando

  useEffect(() => { if (autoFocus) setTimeout(() => inputRef.current?.focus(), 50); }, [autoFocus]);

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
    elegir({ key: null, grupo: 'mapa', icono: puntoMapa.nombre ? '📍' : '📌', label: puntoMapa.nombre || 'Punto marcado en el mapa',
      sub: puntoMapa.detalle || `${puntoMapa.lat.toFixed(5)}, ${puntoMapa.lng.toFixed(5)}`, lugar: '', lat: puntoMapa.lat, lng: puntoMapa.lng,
      proyectoId: null, tipoDefecto: puntoMapa.nombre ? 'recogida' : 'visita', pedirNombre: true });
    // Lugar buscado en el mapa: ya trae nombre (editable). Clic suelto: se sugiere por la dirección.
    if (puntoMapa.nombre) { setNombre(puntoMapa.nombre); return; }
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
  // Lugares del mapa (negocios, plazas, calles en RD) debajo de lo del ERP.
  const { lugares: lugaresMapa, cargando: buscandoMapa } = useLugaresMapa(texto, { activo: abierto && !!onElegirLugarMapa });
  const todos = useMemo(() => [...resultados, ...lugaresMapa.map(l => ({ key: null, grupo: 'enmapa', grupoMostrado: 'enmapa', icono: '📍',
    label: l.nombre, sub: l.detalle, lugarMapa: l }))], [resultados, lugaresMapa]);
  useEffect(() => { setActivo(0); }, [texto]);

  const pmDe = (c) => (c?.proyectoId && porMontarObra) ? porMontarObra(c.proyectoId) : { requisiciones: [], retiros: [], total: 0 };
  function elegir(c) {
    // Lugar del mapa: el mapa vuela ahí y entra como punto (con nombre ya puesto).
    if (c.lugarMapa) { setAbierto(false); setTexto(''); onElegirLugarMapa?.(c.lugarMapa); return; }
    setElegido(c); setTipo(c.tipoDefecto || 'entrega'); setNota(''); setNombre(c.pedirNombre ? '' : c.lugar);
    setAbierto(false); setTexto('');
    const hayPorMontar = pmDe(c).total > 0;
    setTimeout(() => (c.pedirNombre ? nombreRef.current : hayPorMontar ? montarRef.current : notaRef.current)?.focus(), 30);
  }
  const limpiar = () => { setElegido(null); setNota(''); setNombre(''); setTimeout(() => inputRef.current?.focus(), 30); };
  const montar = async (item, esRetiro) => {
    if (montando) return;
    setMontando(item.id);
    const ok = await (esRetiro ? onMontarDiligencia?.(item) : onMontarRequisicion?.(item));
    setMontando(null);
    if (ok) limpiar();
  };
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
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo(i => Math.min(i + 1, todos.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (todos[activo]) elegir(todos[activo]); }
    else if (e.key === 'Escape') { setTexto(''); setAbierto(false); }
  };
  const teclaFormulario = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); agregar(); }
    else if (e.key === 'Escape') cancelar();
  };

  if (elegido) {
    const pm = pmDe(elegido);
    const resumenItems = (r) => (r.items || []).map(i => i.descripcion).filter(Boolean).join(', ');
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
        {pm.total > 0 && (
          <div className="bg-orange-950/40 border border-orange-700/70 rounded-card p-2 space-y-1.5">
            <div className="text-xs font-bold text-orange-300">Esta obra tiene {pm.total === 1 ? 'algo' : `${pm.total} cosas`} en «Por montar». Móntalo aquí para que quede amarrado:</div>
            {pm.requisiciones.map((r, i) => (
              <button key={r.id} ref={i === 0 ? montarRef : null} onClick={() => montar(r, false)} disabled={!!montando}
                onKeyDown={e => { if (e.key === 'Escape') cancelar(); }}
                className="w-full text-left bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white rounded-card px-2.5 py-2 flex items-center gap-2">
                {montando === r.id ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <span className="shrink-0">📦</span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black">Montar {r.codigo ? `el pedido ${r.codigo}` : 'la requisición'}{r.urgente ? ' · urgente' : ''}</span>
                  {resumenItems(r) && <span className="block text-[11px] opacity-90 truncate">{resumenItems(r)}</span>}
                </span>
                {i === 0 && <span className="text-[10px] font-bold opacity-70 shrink-0">Enter</span>}
              </button>
            ))}
            {pm.retiros.map((d, i) => (
              <button key={d.id} ref={pm.requisiciones.length === 0 && i === 0 ? montarRef : null} onClick={() => montar(d, true)} disabled={!!montando}
                onKeyDown={e => { if (e.key === 'Escape') cancelar(); }}
                className="w-full text-left bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white rounded-card px-2.5 py-2 flex items-center gap-2">
                {montando === d.id ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <span className="shrink-0">♻</span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black">Montar el retiro de sobrante</span>
                  {d.descripcion && <span className="block text-[11px] opacity-90 truncate">{d.descripcion.split('\n')[0]}</span>}
                </span>
                {pm.requisiciones.length === 0 && i === 0 && <span className="text-[10px] font-bold opacity-70 shrink-0">Enter</span>}
              </button>
            ))}
            <div className="text-[11px] text-zinc-400">¿Es otra cosa? Agrégala abajo como parada aparte.</div>
          </div>
        )}
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
          className={`w-full disabled:opacity-40 text-sm font-black py-2.5 rounded-card flex items-center justify-center gap-2 ${pm.total > 0 ? 'border border-zinc-600 text-zinc-300 hover:text-white hover:border-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}>
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />} {pm.total > 0 ? 'Agregar como parada aparte' : 'Agregar a la ruta'} {pm.total === 0 && <span className="text-[10px] font-bold opacity-70">Enter</span>}
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
          placeholder="Agregar parada: obra, cliente, suplidor, oficina, o cualquier lugar…" className="flex-1 bg-transparent outline-none py-2.5 text-sm min-w-0" />
        <span className="hidden xl:inline text-[10px] text-zinc-600 border border-zinc-800 rounded px-1 shrink-0">/</span>
      </div>
      {abierto && (todos.length > 0 || texto.trim().length >= 2) && (
        <div className="mt-1.5 bg-zinc-900 border border-zinc-700 rounded-card shadow-pop max-h-[60vh] overflow-y-auto overscroll-contain">
          {todos.map((c, i) => {
            const cab = c.grupoMostrado !== ultimoGrupo ? (ultimoGrupo = c.grupoMostrado, TITULO_GRUPO[c.grupoMostrado]) : null;
            return (
              <React.Fragment key={(c.key || 'pt') + i}>
                {cab && <div className="px-2.5 pt-2 pb-1 text-[10px] uppercase tracking-widest font-bold text-zinc-500">{cab}</div>}
                <button key={'b' + i} onMouseDown={e => { e.preventDefault(); elegir(c); }} onMouseEnter={() => setActivo(i)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 ${i === activo ? 'bg-zinc-800' : ''}`}>
                  <span className="shrink-0 text-base leading-tight">{c.icono}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug break-words">{c.label}</span>
                    {c.sub && <span className="block text-xs text-zinc-500 leading-snug break-words">{c.sub}</span>}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
          {buscandoMapa && lugaresMapa.length === 0 && texto.trim().length >= 3 && (
            <div className="px-2.5 py-2 text-[11px] text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Buscando también en el mapa…</div>
          )}
          {texto.trim().length >= 2 && (
            <button onMouseDown={e => { e.preventDefault(); onMasOpciones?.(texto.trim()); setTexto(''); }}
              className="w-full text-left px-2.5 py-2 border-t border-zinc-800 text-[12px] text-cyan-400 hover:bg-zinc-800">
              {todos.length === 0 && !buscandoMapa ? `No encontré "${texto.trim()}". ` : ''}Escribirlo a mano y pegar el link de Google Maps →
            </button>
          )}
          {todos.length === 0 && !buscandoMapa && texto.trim().length >= 2 && (
            <div className="px-2.5 pb-2 text-[11px] text-zinc-500">También puedes hacer clic en el mapa donde queda.</div>
          )}
        </div>
      )}
    </div>
  );
}
