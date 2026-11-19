'use client';

// v8.41.1 → v8.75: "Más opciones" para una parada — lo que el buscador rápido no
// cubre: RECOGER Y ENTREGAR (dos paradas encadenadas), lugar escrito a mano con
// link de Google Maps, y el documento para retirar (OC / cotización / factura).
// Misma lógica que la parada libre de antes (GPS obligatorio).

import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import * as db from '../../../lib/db';
import { parseCoords } from '../../../lib/helpers/geo';
import { toast } from '../../../lib/toast';
import { siguienteOrden, normalizar } from '../../../lib/helpers/rutasOficina';

export default function FormParadaAvanzada({ viaje, candidatos, textoInicial = '', onCerrar, onGuardado }) {
  const [p, setP] = useState({ tipo: 'recogida', lugar: textoInicial, descripcion: '', lat: null, lng: null, proyectoId: null });
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const base = siguienteOrden(viaje.paradas) - 1; // max(orden): no choca con paradas que quedaron tras quitar otras
    const cOri = p.lat == null ? parseCoords(p.lugarMaps || '') : null;
    const cDes = p.destinoLat == null ? parseCoords(p.destinoMaps || '') : null;
    const origen = p.lugar?.trim() ? { lugar: p.lugar.trim(), lat: p.lat ?? cOri?.lat ?? null, lng: p.lng ?? cOri?.lng ?? null, proyectoId: p.proyectoId || null } : null;
    if (!origen) { toast.warning(p.tipo === 'entrega' ? 'Escribe o elige dónde se entrega.' : 'Escribe o elige dónde se recoge.'); return; }
    if (origen.lat == null) { toast.warning('Ese lugar no tiene ubicación. Elígelo de la lista o pega el link de Google Maps.'); return; }
    let destino = null;
    if (p.tipo === 'par') {
      destino = p.destinoLugar?.trim() ? { lugar: p.destinoLugar.trim(), lat: p.destinoLat ?? cDes?.lat ?? null, lng: p.destinoLng ?? cDes?.lng ?? null, proyectoId: p.destinoProyectoId || null } : null;
      if (!destino) { toast.warning('Escribe o elige dónde se entrega.'); return; }
      if (destino.lat == null) { toast.warning('El destino no tiene ubicación. Elígelo de la lista o pega el link de Google Maps.'); return; }
    }
    setGuardando(true);
    try {
      let docUrl = null, docNombre = null;
      if (p.docFile && (p.tipo === 'recogida' || p.tipo === 'par')) {
        try { docUrl = await db.subirDocParada(p.docFile, viaje.id); docNombre = p.docFile.name || 'documento'; }
        catch (e) { toast.error('El documento no se pudo subir: ' + (e?.message || e)); setGuardando(false); return; }
      }
      if (p.tipo === 'par') {
        await db.agregarParada({ viajeId: viaje.id, orden: base + 1, tipo: 'recogida', lugar: origen.lugar, proyectoId: origen.proyectoId, lat: origen.lat, lng: origen.lng, docUrl, docNombre,
          descripcion: [p.descripcion || '', `→ llevar a ${destino.lugar}`].filter(Boolean).join(' ') });
        await db.agregarParada({ viajeId: viaje.id, orden: base + 2, tipo: 'entrega', lugar: destino.lugar, proyectoId: destino.proyectoId, lat: destino.lat, lng: destino.lng,
          descripcion: [p.descripcion || '', `(recogido en ${origen.lugar})`].filter(Boolean).join(' ') });
      } else {
        await db.agregarParada({ viajeId: viaje.id, orden: base + 1, tipo: p.tipo, lugar: origen.lugar, proyectoId: origen.proyectoId,
          docUrl: p.tipo === 'recogida' ? docUrl : null, docNombre: p.tipo === 'recogida' ? docNombre : null,
          descripcion: p.descripcion || '', lat: origen.lat, lng: origen.lng });
      }
      await onGuardado();
      onCerrar();
    } catch (e) { toast.error('No se pudo agregar: ' + (e?.message || e)); }
    setGuardando(false);
  };

  return (
    <div className="bg-zinc-950 border border-cyan-800/60 rounded-card p-3 space-y-2.5">
      <div className="flex items-center justify-between"><span className="text-xs font-black text-cyan-400">Más opciones de parada</span><button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button></div>
      <div>
        <div className="text-[11px] font-bold text-zinc-400 mb-1">1 · ¿Qué va a hacer el camión?</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[['recogida', '↑ Recoger'], ['entrega', '↓ Entregar'], ['par', '↑↓ Recoger y entregar']].map(([v2, l]) => (
            <button key={v2} onClick={() => setP({ ...p, tipo: v2 })}
              className={`text-xs font-bold py-2 px-1 rounded-card border ${p.tipo === v2 ? 'bg-cyan-700 border-cyan-700 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold text-zinc-400 mb-1">2 · ¿Dónde {p.tipo === 'entrega' ? 'entrega' : 'recoge'}?</div>
        <BuscadorLugar autoFocus candidatos={candidatos} valor={p.lugar || ''} conGps={p.lat != null}
          placeholder="Ej: Ferretería Americana, Caucedo, o el nombre de la obra…"
          onCambiar={(c) => setP(c.elegir ? { ...p, lugar: c.elegir.lugar, lat: c.elegir.lat, lng: c.elegir.lng, proyectoId: c.elegir.proyectoId, lugarMaps: '' } : { ...p, lugar: c.texto, lat: null, lng: null, proyectoId: null })} />
        {(p.lugar || '').trim() && p.lat == null && (
          <input value={p.lugarMaps || ''} onChange={e => setP({ ...p, lugarMaps: e.target.value })}
            placeholder="📍 Pega el link de Google Maps de este lugar" className={`w-full mt-1 bg-zinc-900 border rounded-card px-2.5 py-2 text-sm ${parseCoords(p.lugarMaps) ? 'border-green-700' : 'border-amber-700'}`} />
        )}
      </div>
      {p.tipo === 'par' && (
        <div>
          <div className="text-[11px] font-bold text-zinc-400 mb-1">3 · ¿Dónde lo entrega?</div>
          <BuscadorLugar candidatos={candidatos} valor={p.destinoLugar || ''} conGps={p.destinoLat != null}
            placeholder="Ej: la obra donde se va a dejar…"
            onCambiar={(c) => setP(c.elegir ? { ...p, destinoLugar: c.elegir.lugar, destinoLat: c.elegir.lat, destinoLng: c.elegir.lng, destinoProyectoId: c.elegir.proyectoId, destinoMaps: '' } : { ...p, destinoLugar: c.texto, destinoLat: null, destinoLng: null, destinoProyectoId: null })} />
          {(p.destinoLugar || '').trim() && p.destinoLat == null && (
            <input value={p.destinoMaps || ''} onChange={e => setP({ ...p, destinoMaps: e.target.value })}
              placeholder="📍 Pega el link de Google Maps de este lugar" className={`w-full mt-1 bg-zinc-900 border rounded-card px-2.5 py-2 text-sm ${parseCoords(p.destinoMaps) ? 'border-green-700' : 'border-amber-700'}`} />
          )}
        </div>
      )}
      <div>
        <div className="text-[11px] font-bold text-zinc-400 mb-1">{p.tipo === 'par' ? '4' : '3'} · ¿Qué lleva?</div>
        <input value={p.descripcion} onChange={e => setP({ ...p, descripcion: e.target.value })} placeholder="Ej: contenedor MSKU123 · 40 sacos de cemento" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2.5 py-2 text-sm" />
      </div>
      {(p.tipo === 'recogida' || p.tipo === 'par') && (
        <div>
          <div className="text-[11px] font-bold text-zinc-400 mb-1">📎 Documento para retirar (opcional): OC, cotización o factura</div>
          <input type="file" accept="image/*,application/pdf" onChange={e => setP({ ...p, docFile: e.target.files?.[0] || null })}
            className="w-full text-[11px] text-zinc-400 file:bg-zinc-700 file:text-white file:border-0 file:rounded-card file:px-2.5 file:py-1.5 file:text-[11px] file:font-bold file:mr-2" />
        </div>
      )}
      <button onClick={guardar} disabled={guardando} className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm font-black py-2.5 rounded-card flex items-center justify-center gap-2">
        {guardando && <Loader2 className="w-4 h-4 animate-spin" />}{p.tipo === 'par' ? 'Agregar las 2 paradas' : 'Agregar a la ruta'}
      </button>
    </div>
  );
}

// v8.41.1: buscador de lugar con sugerencias en vivo. Texto libre también vale.
function BuscadorLugar({ candidatos, valor, conGps, placeholder, onCambiar, autoFocus = false }) {
  const [foco, setFoco] = useState(false);
  const q = normalizar(valor);
  // sin acentos y por palabras (igual que el buscador principal): "nunez" encuentra "Núñez"
  const sugerencias = q.length >= 2 ? candidatos.filter(c => { const hay = normalizar(`${c.label} ${c.sub || ''}`); return q.split(' ').every(w => hay.includes(w)); }).slice(0, 8) : [];
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-card px-2 focus-within:border-cyan-600">
        <input value={valor} onChange={e => onCambiar({ texto: e.target.value })}
          onFocus={() => setFoco(true)} onBlur={() => setTimeout(() => setFoco(false), 200)}
          autoFocus={autoFocus} placeholder={placeholder} className="flex-1 bg-transparent outline-none py-2 text-sm min-w-0" />
        {conGps && <span className="shrink-0 text-[11px] text-green-400" title="Con ubicación GPS">📍</span>}
      </div>
      {foco && sugerencias.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-card overflow-hidden shadow-pop max-h-52 overflow-y-auto">
          {sugerencias.map((c, i) => (
            <button key={i} onMouseDown={(e) => { e.preventDefault(); onCambiar({ elegir: c }); setFoco(false); }}
              className="w-full text-left px-2.5 py-2 text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 border-t border-zinc-800 first:border-t-0">
              <span className="shrink-0">{c.icono}</span>
              <span className="truncate">{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
