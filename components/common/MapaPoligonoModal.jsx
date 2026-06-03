'use client';

// v8.24.0: Dibuja un polígono sobre el techo (capa satelital Esri, sin token).
// Toca para agregar vértices; calcula el área (m²). Devuelve { vertices, areaM2 }.
//
// Props:
//  - initialLat, initialLng : centro inicial (ubicación del sitio)
//  - value                  : { vertices: [[lat,lng],...] } o array de vértices
//  - onSelect({vertices, areaM2})
//  - onCerrar()

import React, { useEffect, useRef, useState } from 'react';
import { X, Undo2, Trash2, Check, Crosshair, Loader2 } from 'lucide-react';
import { areaPoligonoM2 } from '../../lib/surveys';
import { obtenerUbicacion } from '../../lib/geo';

export default function MapaPoligonoModal({ initialLat, initialLng, value, onSelect, onCerrar }) {
  const contRef = useRef(null);
  const mapRef = useRef(null);
  const Lref = useRef(null);
  const polyRef = useRef(null);
  const markersRef = useRef([]);
  const iniciales = Array.isArray(value?.vertices) ? value.vertices : (Array.isArray(value) ? value : []);
  const [puntos, setPuntos] = useState(iniciales);
  const [gpsCargando, setGpsCargando] = useState(false);
  const puntosRef = useRef(puntos);
  puntosRef.current = puntos;
  const tieneCentro = initialLat != null && initialLng != null;

  const redibujar = () => {
    const L = Lref.current, map = mapRef.current;
    if (!L || !map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (polyRef.current) { polyRef.current.remove(); polyRef.current = null; }
    const pts = puntosRef.current;
    if (pts.length >= 3) polyRef.current = L.polygon(pts, { color: '#ef4444', weight: 2, fillOpacity: 0.25 }).addTo(map);
    else if (pts.length === 2) polyRef.current = L.polyline(pts, { color: '#ef4444', weight: 2 }).addTo(map);
    pts.forEach(p => {
      const mk = L.circleMarker(p, { radius: 5, color: '#fff', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }).addTo(map);
      markersRef.current.push(mk);
    });
  };

  const setPts = (np) => { setPuntos(np); puntosRef.current = np; redibujar(); };

  useEffect(() => {
    if (typeof window === 'undefined' || !contRef.current) return;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    import('leaflet').then((L) => {
      Lref.current = L;
      if (mapRef.current) return;
      const center = tieneCentro ? [Number(initialLat), Number(initialLng)] : (iniciales[0] || [18.4861, -69.9312]);
      const map = L.map(contRef.current, { center, zoom: (tieneCentro || iniciales.length) ? 19 : 13, zoomControl: true });
      mapRef.current = map;
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, attribution: 'Tiles © Esri' }).addTo(map);
      map.on('click', (e) => { setPts([...puntosRef.current, [e.latlng.lat, e.latlng.lng]]); });
      setTimeout(() => { map.invalidateSize(); redibujar(); }, 120);
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deshacer = () => setPts(puntosRef.current.slice(0, -1));
  const limpiar = () => setPts([]);
  const usarGps = async () => {
    setGpsCargando(true);
    try { const u = await obtenerUbicacion(); if (u && u.lat != null && mapRef.current) mapRef.current.setView([u.lat, u.lng], 20); } catch {}
    finally { setGpsCargando(false); }
  };
  const area = areaPoligonoM2(puntos);
  const confirmar = () => onSelect?.({ vertices: puntosRef.current, areaM2: Math.round(areaPoligonoM2(puntosRef.current)) });

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex items-center justify-between p-3 border-b border-zinc-800">
          <div className="text-sm font-bold">Dibujar el área en el mapa</div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-3 pt-2 text-[11px] text-zinc-400">Toca el techo para marcar las esquinas del área. Mínimo 3 puntos.</div>
        <div className="p-3">
          <div ref={contRef} className="w-full rounded-card overflow-hidden" style={{ height: '52vh', minHeight: 280, background: '#18181b' }} />
        </div>
        <div className="flex items-center justify-between gap-2 p-3 border-t border-zinc-800 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={usarGps} disabled={gpsCargando} className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">{gpsCargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />} Mi GPS</button>
            <button onClick={deshacer} disabled={!puntos.length} className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 disabled:opacity-40"><Undo2 className="w-3.5 h-3.5" /> Deshacer</button>
            <button onClick={limpiar} disabled={!puntos.length} className="text-[11px] text-zinc-400 hover:text-red-400 flex items-center gap-1 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /> Limpiar</button>
          </div>
          <div className="text-[11px] text-zinc-300">{puntos.length} pts · <span className="text-red-300 font-bold">{area > 0 ? `${Math.round(area)} m²` : '—'}</span></div>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-3 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2 rounded-card">Cancelar</button>
            <button onClick={confirmar} disabled={puntos.length < 3} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase px-4 py-2 rounded-card flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Usar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
