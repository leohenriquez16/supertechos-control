'use client';

// v8.58.0 — Mapa del programa: un pin por locación, del color de su etapa.
// Leaflet + OpenStreetMap (sin API key), imperativo como MapaPicker.
// Se importa con ssr:false porque usa window.

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { COLOR_ETAPA, ETAPA } from '../../lib/helpers/programaSites';

const pin = (color) => L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,.5)"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 16],
});

export default function MapaPrograma({ locaciones = [], onSeleccionar, alto = 420 }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const capaRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: true }).setView([18.8, -70.0], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (capaRef.current) { capaRef.current.remove(); capaRef.current = null; }
    const capa = L.layerGroup().addTo(map);
    const puntos = [];
    locaciones.forEach(l => {
      const lat = Number(l.lat), lng = Number(l.lng);
      if (!lat || !lng) return;
      puntos.push([lat, lng]);
      const color = COLOR_ETAPA[l.etapa] || '#71717a';
      const m = L.marker([lat, lng], { icon: pin(color) }).addTo(capa);
      m.bindTooltip(
        `<b>${l.nombre}</b><br>${ETAPA[l.etapa]?.label || ''}${l.cotizacionRef ? `<br>${l.cotizacionRef}` : ''}`,
        { direction: 'top', offset: [0, -14] },
      );
      if (onSeleccionar) m.on('click', () => onSeleccionar(l));
    });
    capaRef.current = capa;
    if (puntos.length) map.fitBounds(L.latLngBounds(puntos).pad(0.15));
  }, [locaciones, onSeleccionar]);

  return <div ref={ref} style={{ height: alto, width: '100%', borderRadius: 8, overflow: 'hidden' }} />;
}
