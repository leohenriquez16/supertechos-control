'use client';

// v8.75: búsqueda de lugares en el mapa mientras escribes (negocios, ferreterías, plazas,
// calles en RD). Espera 350 ms después de la última tecla y cancela la búsqueda anterior.
import { useEffect, useState } from 'react';
import { buscarLugaresMapa } from '../../../lib/geo';

export default function useLugaresMapa(texto, { activo = true } = {}) {
  const [lugares, setLugares] = useState([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    const q = (texto || '').trim();
    if (!activo || q.length < 3) { setLugares([]); setCargando(false); return; }
    const ctrl = new AbortController();
    setCargando(true);
    const t = setTimeout(async () => {
      const r = await buscarLugaresMapa(q, { signal: ctrl.signal }).catch(() => []);
      if (!ctrl.signal.aborted) { setLugares(r); setCargando(false); }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [texto, activo]);
  return { lugares, cargando };
}
