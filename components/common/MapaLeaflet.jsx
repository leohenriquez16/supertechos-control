'use client';

/**
 * MapaLeaflet.jsx — Componente base de mapa interactivo con Leaflet + OpenStreetMap
 * Sin API key requerida. Carga dinámicamente en el cliente (no SSR).
 *
 * Props:
 *  - center: [lat, lng]          — centro inicial del mapa
 *  - zoom: number                — nivel de zoom inicial (default 13)
 *  - height: string|number       — altura del contenedor (default 320)
 *  - markers: Array<{            — lista de marcadores
 *      lat, lng,
 *      color,                    — 'red'|'green'|'blue'|'yellow'|'gray'|'orange'
 *      label,                    — texto del tooltip
 *      popup,                    — contenido HTML del popup
 *      onClick,                  — callback al hacer click
 *    }>
 *  - circle: { lat, lng, radius, color } — círculo opcional (ej. radio de check-in)
 *  - scrollWheelZoom: bool       — permitir zoom con scroll (default false)
 */

import React, { useEffect, useRef } from 'react';

// Colores para los marcadores SVG
const MARKER_COLORS = {
  red:    '#dc2626',
  green:  '#16a34a',
  blue:   '#2563eb',
  yellow: '#ca8a04',
  gray:   '#6b7280',
  orange: '#ea580c',
  purple: '#9333ea',
};

// Genera un ícono SVG de pin personalizado
function makeSvgIcon(color = '#dc2626', size = 32) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.3}" viewBox="0 0 32 42">
      <path d="M16 0 C7.16 0 0 7.16 0 16 C0 28 16 42 16 42 C16 42 32 28 32 16 C32 7.16 24.84 0 16 0Z"
        fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="white" opacity="0.9"/>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function MapaLeaflet({
  center,
  zoom = 13,
  height = 320,
  markers = [],
  circle = null,
  scrollWheelZoom = false,
  className = '',
  // v8.17.85: bounds opcionales para restringir el área visible (uso en módulo Banreservas)
  maxBounds = null,    // [[swLat, swLng], [neLat, neLng]] — fuerza panning dentro de este rectángulo
  minZoom = null,      // impide alejarse más allá de este nivel
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const circleRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!containerRef.current) return;

    // Importar Leaflet dinámicamente en el cliente
    import('leaflet').then((L) => {
      // Corregir íconos por defecto de Leaflet (problema conocido con webpack)
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Inicializar mapa si no existe
      if (!mapRef.current) {
        const initialCenter = center || [18.4861, -69.9312]; // Santo Domingo por defecto
        const opts = {
          center: initialCenter,
          zoom,
          scrollWheelZoom,
          zoomControl: true,
          attributionControl: true,
        };
        if (maxBounds) {
          opts.maxBounds = L.latLngBounds(maxBounds[0], maxBounds[1]);
          opts.maxBoundsViscosity = 1.0; // bordes "pegajosos" — no se puede arrastrar afuera
        }
        if (minZoom != null) opts.minZoom = minZoom;
        mapRef.current = L.map(containerRef.current, opts);

        // Tile layer OpenStreetMap (sin API key)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;

      // Limpiar marcadores anteriores
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // Limpiar círculo anterior
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }

      // Agregar nuevos marcadores
      markers.forEach((m) => {
        if (m.lat == null || m.lng == null) return;
        const colorHex = MARKER_COLORS[m.color] || m.color || MARKER_COLORS.red;
        const iconUrl = makeSvgIcon(colorHex, 28);
        const icon = L.icon({
          iconUrl,
          iconSize: [28, 36],
          iconAnchor: [14, 36],
          popupAnchor: [0, -36],
          tooltipAnchor: [14, -20],
        });

        const marker = L.marker([m.lat, m.lng], { icon });

        if (m.popup) {
          marker.bindPopup(m.popup, { maxWidth: 260, className: 'st-popup' });
        }
        if (m.label) {
          marker.bindTooltip(m.label, { permanent: false, direction: 'top' });
        }
        if (m.onClick) {
          marker.on('click', m.onClick);
        }

        marker.addTo(map);
        markersRef.current.push(marker);
      });

      // Agregar círculo (radio de check-in)
      if (circle && circle.lat != null && circle.lng != null && circle.radius > 0) {
        circleRef.current = L.circle([circle.lat, circle.lng], {
          radius: circle.radius,
          color: circle.color || '#dc2626',
          fillColor: circle.color || '#dc2626',
          fillOpacity: 0.08,
          weight: 2,
          dashArray: '6 4',
        }).addTo(map);
      }

      // Ajustar vista: si hay múltiples marcadores, hacer fitBounds
      if (markers.length > 1) {
        const validMarkers = markers.filter(m => m.lat != null && m.lng != null);
        if (validMarkers.length > 1) {
          const bounds = L.latLngBounds(validMarkers.map(m => [m.lat, m.lng]));
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
      } else if (center) {
        map.setView(center, zoom);
      }

      // Forzar redibujado (necesario cuando el contenedor cambia de tamaño)
      setTimeout(() => map.invalidateSize(), 100);
    });

    // Cargar CSS de Leaflet dinámicamente
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Inyectar estilos personalizados para popups
    if (!document.getElementById('st-map-styles')) {
      const style = document.createElement('style');
      style.id = 'st-map-styles';
      style.textContent = `
        .st-popup .leaflet-popup-content-wrapper {
          background: #18181b;
          color: #f4f4f5;
          border: 1px solid #3f3f46;
          border-radius: 4px;
          font-family: inherit;
          font-size: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        }
        .st-popup .leaflet-popup-tip {
          background: #18181b;
        }
        .st-popup .leaflet-popup-close-button {
          color: #a1a1aa;
        }
        .leaflet-tooltip {
          background: #18181b;
          color: #f4f4f5;
          border: 1px solid #3f3f46;
          font-size: 11px;
          border-radius: 3px;
        }
        .leaflet-tooltip::before {
          border-top-color: #3f3f46;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      // No destruir el mapa al desmontar para evitar re-inicializaciones costosas
      // Solo limpiar marcadores
    };
  }, [center?.[0], center?.[1], zoom, JSON.stringify(markers), JSON.stringify(circle)]);

  // Destruir mapa al desmontar el componente completamente
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`w-full ${className}`}
      style={{ height, minHeight: 180, background: '#18181b', zIndex: 0 }}
    />
  );
}
