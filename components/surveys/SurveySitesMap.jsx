'use client';

// v8.19.3: Mapa Leaflet con los sites de un proyecto de surveys.
// Cada pin coloreado por survey_status. Click → abre detalle del site.
// Sigue el patrón de components/proyecto/VistaMapa.jsx.

import React, { useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { SITE_STATUS } from '../../lib/surveys';

function makeSvgIcon(color = '#dc2626') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
    <path d="M14 0 C6.27 0 0 6.27 0 14 C0 24.5 14 38 14 38 C14 38 28 24.5 28 14 C28 6.27 21.73 0 14 0Z"
      fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function SurveySitesMap({ sites, onAbrirSite }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const conGeo = sites.filter(s => s.latitude != null && s.longitude != null);
  const sinGeo = sites.filter(s => s.latitude == null || s.longitude == null);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    // Cargar CSS de Leaflet
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Estilos de popup oscuro (reusa el id del ERP si ya existe)
    if (!document.getElementById('st-map-styles')) {
      const style = document.createElement('style');
      style.id = 'st-map-styles';
      style.textContent = `
        .st-popup .leaflet-popup-content-wrapper {
          background: #18181b; color: #f4f4f5;
          border: 1px solid #3f3f46; border-radius: 4px;
          font-family: inherit; font-size: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.6);
          min-width: 220px;
        }
        .st-popup .leaflet-popup-content { margin: 12px 14px; }
        .st-popup .leaflet-popup-tip { background: #18181b; }
        .st-popup .leaflet-popup-close-button { color: #71717a; font-size: 16px; }
        .leaflet-tooltip {
          background: #18181b; color: #f4f4f5;
          border: 1px solid #3f3f46; font-size: 11px; border-radius: 3px;
        }
      `;
      document.head.appendChild(style);
    }

    import('leaflet').then((L) => {
      if (!mapRef.current) {
        const lats = conGeo.map(s => Number(s.latitude));
        const lngs = conGeo.map(s => Number(s.longitude));
        const centerLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 18.4861;
        const centerLng = lngs.length ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : -69.9312;

        mapRef.current = L.map(containerRef.current, {
          center: [centerLat, centerLng],
          zoom: 11,
          scrollWheelZoom: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;

      // Limpiar marcadores anteriores
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      conGeo.forEach((s) => {
        const status = SITE_STATUS[s.survey_status] || SITE_STATUS.pending;
        const icon = L.icon({
          iconUrl: makeSvgIcon(status.color),
          iconSize: [28, 38],
          iconAnchor: [14, 38],
          popupAnchor: [0, -40],
          tooltipAnchor: [14, -22],
        });

        const popupHtml = `
          <div style="line-height:1.5">
            ${s.external_code ? `<div style="font-family:monospace;font-size:10px;color:#a1a1aa;margin-bottom:4px;background:#27272a;padding:2px 6px;display:inline-block">${s.external_code}</div>` : ''}
            <div style="font-weight:800;font-size:13px;margin:4px 0">${s.name || '—'}</div>
            <div style="margin-bottom:6px">
              <span style="display:inline-block;padding:2px 7px;font-size:10px;font-weight:700;background:${status.color}22;color:${status.color};border:1px solid ${status.color}66;text-transform:uppercase;letter-spacing:.05em">${status.label}</span>
            </div>
            ${s.address ? `<div style="font-size:11px;color:#a1a1aa">${s.address}${s.city ? ', ' + s.city : ''}</div>` : ''}
            <div style="margin-top:10px;display:flex;gap:8px">
              <button onclick="window.__surveysAbrirSite && window.__surveysAbrirSite('${s.id}')" style="background:#dc2626;color:white;border:none;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;border-radius:2px;text-transform:uppercase">Ver detalle</button>
              <a href="https://www.google.com/maps?q=${s.latitude},${s.longitude}" target="_blank" style="color:#dc2626;font-size:11px;display:flex;align-items:center;gap:3px;text-decoration:none">↗ Maps</a>
            </div>
          </div>`;

        const marker = L.marker([Number(s.latitude), Number(s.longitude)], { icon });
        marker.bindPopup(popupHtml, { maxWidth: 300, className: 'st-popup' });
        marker.bindTooltip(s.name || '—', { direction: 'top', offset: [0, -30] });
        marker.addTo(map);
        markersRef.current.push(marker);
      });

      if (conGeo.length > 1) {
        const bounds = L.latLngBounds(conGeo.map(s => [Number(s.latitude), Number(s.longitude)]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      } else if (conGeo.length === 1) {
        map.setView([Number(conGeo[0].latitude), Number(conGeo[0].longitude)], 15);
      }

      setTimeout(() => map.invalidateSize(), 150);
    });
  }, [conGeo.length, JSON.stringify(conGeo.map(s => s.id))]);

  // Callback global para botón "Ver detalle" del popup
  useEffect(() => {
    window.__surveysAbrirSite = (id) => {
      const s = sites.find(x => x.id === id);
      if (s) onAbrirSite(s);
    };
    return () => { delete window.__surveysAbrirSite; };
  }, [sites, onAbrirSite]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-card"
        style={{ height: '500px' }}
      />
      {sinGeo.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700 text-amber-300 p-3 text-xs flex items-start gap-2">
          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-bold">{sinGeo.length} sitio{sinGeo.length === 1 ? '' : 's'} sin coordenadas</span> — no aparecen en el mapa pero sí en la lista:
            <div className="mt-1 opacity-80">
              {sinGeo.map(s => (
                <button
                  key={s.id}
                  onClick={() => onAbrirSite(s)}
                  className="inline-block bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 mr-1 mb-1 text-[11px] text-amber-200"
                >
                  {s.external_code ? `[${s.external_code}] ` : ''}{s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
