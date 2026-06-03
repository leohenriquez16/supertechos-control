'use client';

// v8.20.7: Selector de ubicación en mapa con PIN. Leaflet + OpenStreetMap (sin API key).
// Click en el mapa coloca/mueve el pin; el pin también es arrastrable. Devuelve {lat,lng}.
//
// Props:
//  - initialLat, initialLng : posición inicial del pin (opcional)
//  - onSelect(lat, lng)     : confirmar la ubicación elegida
//  - onCerrar()             : cerrar sin elegir

import React, { useEffect, useRef, useState } from 'react';
import { X, MapPin, Crosshair, Loader2, Check, Search } from 'lucide-react';
import { obtenerUbicacion, buscarDireccion } from '../../lib/geo';

const PIN_SVG = (color = '#dc2626', size = 34) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.3}" viewBox="0 0 32 42">
    <path d="M16 0 C7.16 0 0 7.16 0 16 C0 28 16 42 16 42 C16 42 32 28 32 16 C32 7.16 24.84 0 16 0Z" fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export default function MapaPickerModal({ initialLat, initialLng, onSelect, onCerrar }) {
  const contRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const Lref = useRef(null);
  const tieneInicial = initialLat != null && initialLng != null;
  const [pos, setPos] = useState(tieneInicial ? { lat: Number(initialLat), lng: Number(initialLng) } : null);
  const [gpsCargando, setGpsCargando] = useState(false);
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;

  const buscar = async () => {
    if (!q.trim()) return;
    setBuscando(true);
    try { setResultados(await buscarDireccion(q)); } catch { setResultados([]); }
    finally { setBuscando(false); }
  };
  const irAResultado = (r) => {
    setResultados([]); setQ(r.label.split(',').slice(0, 2).join(','));
    setMarcador(r.lat, r.lng);
    if (mapRef.current) mapRef.current.setView([r.lat, r.lng], 18);
  };

  // Coloca/mueve el marcador y actualiza el estado.
  const setMarcador = (lat, lng) => {
    setPos({ lat, lng });
    const L = Lref.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!markerRef.current) {
      const icon = L.icon({ iconUrl: PIN_SVG(), iconSize: [30, 39], iconAnchor: [15, 39] });
      markerRef.current = L.marker([lat, lng], { draggable: true, icon }).addTo(map);
      markerRef.current.on('dragend', () => {
        const ll = markerRef.current.getLatLng();
        setPos({ lat: ll.lat, lng: ll.lng });
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !contRef.current) return;
    // CSS de Leaflet
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    import('leaflet').then((L) => {
      Lref.current = L;
      if (mapRef.current) return;
      const center = tieneInicial ? [Number(initialLat), Number(initialLng)] : [18.4861, -69.9312]; // Santo Domingo
      const map = L.map(contRef.current, { center, zoom: tieneInicial ? 17 : 13, zoomControl: true, scrollWheelZoom: true });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map);
      if (tieneInicial) setMarcador(Number(initialLat), Number(initialLng));
      map.on('click', (e) => setMarcador(e.latlng.lat, e.latlng.lng));
      setTimeout(() => map.invalidateSize(), 120);
    });
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usarGps = async () => {
    setGpsCargando(true);
    try {
      const u = await obtenerUbicacion();
      if (u && u.lat != null) {
        setMarcador(u.lat, u.lng);
        if (mapRef.current) mapRef.current.setView([u.lat, u.lng], 18);
      }
    } catch { /* ignore */ }
    finally { setGpsCargando(false); }
  };

  const confirmar = () => { if (posRef.current) onSelect?.(posRef.current.lat, posRef.current.lng); };

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex items-center justify-between p-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-500" />
            <div className="text-sm font-bold">Elegir ubicación en el mapa</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {/* Buscador de dirección */}
        <div className="px-3 pt-2 relative">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') buscar(); }}
                placeholder="Buscar dirección o lugar…"
                className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none rounded-card pl-8 pr-3 py-2 text-sm text-white"
              />
            </div>
            <button onClick={buscar} disabled={buscando || !q.trim()} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold uppercase px-3 rounded-card">
              {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </button>
          </div>
          {resultados.length > 0 && (
            <div className="absolute z-[80] left-3 right-3 mt-1 bg-zinc-900 border-2 border-zinc-700 rounded-card max-h-48 overflow-y-auto shadow-xl">
              {resultados.map((r, i) => (
                <button key={i} onClick={() => irAResultado(r)} className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 border-b border-zinc-800/60 flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" /> <span>{r.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 pt-1.5 text-[11px] text-zinc-400">Toca el mapa para colocar el PIN, o arrástralo para ajustarlo.</div>

        <div className="p-3">
          <div ref={contRef} className="w-full rounded-card overflow-hidden" style={{ height: '52vh', minHeight: 280, background: '#18181b' }} />
        </div>

        <div className="flex items-center justify-between gap-2 p-3 border-t border-zinc-800">
          <button onClick={usarGps} disabled={gpsCargando} className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
            {gpsCargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />} Mi GPS
          </button>
          <div className="text-[11px] text-zinc-400 flex-1 text-center">
            {pos ? <span className="text-green-300">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</span> : 'Sin pin'}
          </div>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-3 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2 rounded-card">Cancelar</button>
            <button onClick={confirmar} disabled={!pos} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase px-4 py-2 rounded-card flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Usar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
