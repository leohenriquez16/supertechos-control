'use client';
// Selector de ubicación con Leaflet + OpenStreetMap (sin API key). Imperativo para no
// depender de la versión de react-leaflet. Se importa dinámico con ssr:false (usa window).
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const PIN_HTML =
  '<div style="width:18px;height:18px;background:#CC0000;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 6px rgba(0,0,0,.4)"></div>';
const icon = () => L.divIcon({ className: '', html: PIN_HTML, iconSize: [18, 18], iconAnchor: [9, 18] });

export default function MapaPicker({ pos, onPick }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false })
      .setView(pos || [18.4861, -69.9312], pos ? 16 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else markerRef.current = L.marker([lat, lng], { icon: icon() }).addTo(map);
      onPick && onPick(lat, lng);
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflejar una posición externa (p. ej. GPS)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pos) return;
    if (markerRef.current) markerRef.current.setLatLng(pos);
    else markerRef.current = L.marker(pos, { icon: icon() }).addTo(map);
    map.setView(pos, 16);
  }, [pos && pos[0], pos && pos[1]]);

  return (
    <div ref={ref}
      style={{ height: '220px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid #E8E2DB' }}
      aria-label="Mapa para marcar la ubicación de la obra" />
  );
}
