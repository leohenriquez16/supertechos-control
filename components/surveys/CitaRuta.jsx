'use client';

// v8.25.25: muestra el tiempo manejando hasta la cita (Mapbox driving-traffic,
// desde la ubicación actual) y un botón para navegar con Waze.

import React, { useEffect, useState } from 'react';
import { Loader2, Navigation } from 'lucide-react';
import { obtenerUbicacion } from '../../lib/geo';

const MAPBOX = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function CitaRuta({ lat, lng }) {
  const [min, setMin] = useState(null);
  const [estado, setEstado] = useState('idle'); // idle | cargando | ok | error

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancel = false;
    (async () => {
      setEstado('cargando');
      try {
        const u = await obtenerUbicacion();
        if (!u || u.lat == null || !MAPBOX) { if (!cancel) setEstado('error'); return; }
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${u.lng},${u.lat};${lng},${lat}?access_token=${MAPBOX}&overview=false`;
        const r = await fetch(url);
        const j = await r.json();
        const dur = j?.routes?.[0]?.duration;
        if (cancel) return;
        if (dur != null) { setMin(Math.round(dur / 60)); setEstado('ok'); } else setEstado('error');
      } catch (e) { if (!cancel) setEstado('error'); }
    })();
    return () => { cancel = true; };
  }, [lat, lng]);

  if (lat == null || lng == null) return null;

  const irWaze = (e) => { e.stopPropagation(); window.open(`https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank'); };

  return (
    <div className="flex items-center gap-2 mt-1">
      {estado === 'cargando' && <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> calculando ruta…</span>}
      {estado === 'ok' && min != null && <span className="text-[11px] font-bold text-sky-300">🚗 ~{min} min manejando</span>}
      {estado === 'error' && <span className="text-[10px] text-zinc-600">ruta no disponible</span>}
      <button onClick={irWaze} className="text-[10px] font-black uppercase px-2 py-1 rounded-card bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1"><Navigation className="w-3 h-3" /> Ir con Waze</button>
    </div>
  );
}
