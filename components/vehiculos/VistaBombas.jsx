'use client';

// v8.49.13: "⛽ Bombas" — estaciones TotalEnergies habilitadas para la tarjeta flotilla
// (listado oficial oct-2025). Mapa + lista ordenada por cercanía a tu GPS, con botón
// para navegar con Waze directo a la bomba. Visible a todo el que entre a Vehículos.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import * as db from '../../lib/db';

const distanciaKm = (a, b) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const wazeUrl = (e) => `https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes`;

export default function VistaBombas() {
  const [estaciones, setEstaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState(null);       // {lat,lng}
  const [gpsError, setGpsError] = useState(null);
  const [provincia, setProvincia] = useState('');

  useEffect(() => {
    db.listarEstacionesCombustible().then(setEstaciones).catch(() => {}).finally(() => setLoading(false));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setGpsError('No pudimos leer tu ubicación — activa el GPS para ordenar por cercanía.'),
        { enableHighAccuracy: true, timeout: 12000 },
      );
    } else setGpsError('Este navegador no da ubicación.');
  }, []);

  const provincias = useMemo(() => [...new Set(estaciones.map(e => e.provincia).filter(Boolean))], [estaciones]);
  const lista = useMemo(() => {
    let l = estaciones.filter(e => e.lat != null);
    if (provincia) l = l.filter(e => e.provincia === provincia);
    if (pos) l = l.map(e => ({ ...e, km: distanciaKm(pos, e) })).sort((a, b) => a.km - b.km);
    else l = [...l].sort((a, b) => (a.provincia || '').localeCompare(b.provincia || '') || a.nombre.localeCompare(b.nombre));
    return l;
  }, [estaciones, pos, provincia]);

  const markers = useMemo(() => {
    const ms = lista.map((e, i) => ({
      lat: e.lat, lng: e.lng, color: i === 0 && pos ? 'green' : 'red', label: e.nombre,
      popup: `<b>⛽ ${e.nombre}</b><br/>${e.direccion || ''}${e.km != null ? `<br/><b>${e.km.toFixed(1)} km</b>` : ''}<br/><a href="${wazeUrl(e)}" target="_blank" style="color:#22d3ee;font-weight:bold;">🚗 Ir con Waze</a>`,
    }));
    if (pos) ms.push({ lat: pos.lat, lng: pos.lng, color: 'blue', label: '📍 Tú', popup: '<b>📍 Tu ubicación</b>' });
    return ms;
  }, [lista, pos]);

  const Mapa = useMemo(() => {
    if (!markers.length) return null;
    const MapaLeaflet = React.lazy(() => import('../common/MapaLeaflet'));
    const centro = pos ? [pos.lat, pos.lng] : [18.75, -70.0];
    return (
      <React.Suspense fallback={<div className="bg-zinc-950 border border-zinc-800 rounded-card flex items-center justify-center" style={{ height: 300 }}><span className="text-xs text-zinc-500">Cargando mapa…</span></div>}>
        <MapaLeaflet center={centro} zoom={pos ? 12 : 8} height={300} markers={markers} scrollWheelZoom={false} className="border border-zinc-800" />
      </React.Suspense>
    );
  }, [markers, pos]);

  if (loading) return <div className="text-center py-10"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-zinc-500">
          ⛽ Estaciones <b className="text-zinc-300">TotalEnergies</b> que aceptan la tarjeta flotilla ({estaciones.length}) · listado oct-2025.
          {pos ? <span className="text-green-400"> 📍 Ordenadas por cercanía a ti.</span> : gpsError ? <span className="text-amber-400"> {gpsError}</span> : ' Leyendo tu ubicación…'}
        </div>
        <select value={provincia} onChange={e => setProvincia(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs">
          <option value="">Todas las zonas</option>
          {provincias.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {Mapa}

      <div className="space-y-1.5">
        {lista.map((e, i) => (
          <div key={e.id} className={`bg-zinc-900 border rounded-card px-3 py-2 flex items-center gap-3 ${i === 0 && pos ? 'border-green-700' : 'border-zinc-800'}`}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate">{i === 0 && pos && '⭐ '}{e.nombre}</div>
              <div className="text-[11px] text-zinc-500 truncate">{e.direccion || ''} · {e.provincia}</div>
            </div>
            {e.km != null && <div className="shrink-0 text-xs font-black text-zinc-300 tabular-nums">{e.km.toFixed(1)} km</div>}
            <a href={wazeUrl(e)} target="_blank" rel="noreferrer"
              className="shrink-0 bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-black uppercase px-3 py-2 rounded-card flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5" /> Waze
            </a>
          </div>
        ))}
        {lista.length === 0 && <div className="text-xs text-zinc-600 italic">Sin estaciones con ubicación en esta zona.</div>}
      </div>
      <div className="text-[10px] text-zinc-600 flex items-center gap-1"><MapPin className="w-3 h-3" /> Si una bomba está mal ubicada o falta, repórtalo en Gotera.</div>
    </div>
  );
}
