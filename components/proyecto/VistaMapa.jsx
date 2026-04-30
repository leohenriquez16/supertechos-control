'use client';

/**
 * VistaMapa.jsx — Mapa interactivo de todos los proyectos con Leaflet
 * Mejora A: Reemplaza el iframe estático con un mapa real con marcadores por proyecto.
 *
 * Cada proyecto se muestra como un pin con color según su estado:
 *   - Aprobado       → azul (cyan)
 *   - En ejecución   → rojo
 *   - Parado         → amarillo
 *   - Finalizado     → naranja / verde
 *   - Facturado      → verde oscuro
 */

import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, MapPin, AlertTriangle, Filter } from 'lucide-react';

// Mapa de estado → color hex para los marcadores
const ESTADO_COLOR_HEX = {
  aprobado:                     '#0891b2', // cyan-600
  en_ejecucion:                 '#dc2626', // red-600
  parado:                       '#ca8a04', // yellow-600
  finalizado_no_entregado:      '#ea580c', // orange-600
  finalizado_recibido_conforme: '#16a34a', // green-600
  facturado:                    '#059669', // emerald-600
};

const ESTADO_LABEL = {
  aprobado:                     'Aprobado',
  en_ejecucion:                 'En ejecución',
  parado:                       'Parado',
  finalizado_no_entregado:      'Finalizado No Entregado',
  finalizado_recibido_conforme: 'Finalizado Recibido Conforme',
  facturado:                    'Facturado',
};

const ESTADO_BG = {
  aprobado:                     'bg-cyan-600',
  en_ejecucion:                 'bg-red-600',
  parado:                       'bg-yellow-600',
  finalizado_no_entregado:      'bg-orange-600',
  finalizado_recibido_conforme: 'bg-green-600',
  facturado:                    'bg-emerald-700',
};

function makeSvgIcon(color = '#dc2626') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
    <path d="M14 0 C6.27 0 0 6.27 0 14 C0 24.5 14 38 14 38 C14 38 28 24.5 28 14 C28 6.27 21.73 0 14 0Z"
      fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function VistaMapa({ proyectos, data, onVerProyecto }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('');

  const conUbicacion = proyectos.filter(p => p.ubicacionLat != null && p.ubicacionLng != null);
  const sinUbicacion = proyectos.filter(p => p.ubicacionLat == null || p.ubicacionLng == null);
  const proyectosFiltrados = filtroEstado
    ? conUbicacion.filter(p => p.estado === filtroEstado)
    : conUbicacion;

  // Inicializar y actualizar el mapa
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

    // Inyectar estilos de popup oscuro
    if (!document.getElementById('st-map-styles')) {
      const style = document.createElement('style');
      style.id = 'st-map-styles';
      style.textContent = `
        .st-popup .leaflet-popup-content-wrapper {
          background: #18181b; color: #f4f4f5;
          border: 1px solid #3f3f46; border-radius: 4px;
          font-family: inherit; font-size: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.6);
          min-width: 200px;
        }
        .st-popup .leaflet-popup-content { margin: 12px 14px; }
        .st-popup .leaflet-popup-tip { background: #18181b; }
        .st-popup .leaflet-popup-close-button { color: #71717a; font-size: 16px; }
        .leaflet-tooltip {
          background: #18181b; color: #f4f4f5;
          border: 1px solid #3f3f46; font-size: 11px; border-radius: 3px;
        }
        .leaflet-tooltip::before { border-top-color: #3f3f46; }
      `;
      document.head.appendChild(style);
    }

    import('leaflet').then((L) => {
      // Inicializar mapa
      if (!mapRef.current) {
        const lats = conUbicacion.map(p => p.ubicacionLat);
        const lngs = conUbicacion.map(p => p.ubicacionLng);
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

      // Agregar marcadores por proyecto
      proyectosFiltrados.forEach((p) => {
        const color = ESTADO_COLOR_HEX[p.estado] || '#6b7280';
        const sistema = data.sistemas[p.sistema];
        const icon = L.icon({
          iconUrl: makeSvgIcon(color),
          iconSize: [28, 38],
          iconAnchor: [14, 38],
          popupAnchor: [0, -40],
          tooltipAnchor: [14, -22],
        });

        const estadoBadge = `<span style="display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;background:${color};color:white;text-transform:uppercase;letter-spacing:.05em">${ESTADO_LABEL[p.estado] || p.estado}</span>`;
        const popupHtml = `
          <div style="line-height:1.5">
            <div style="font-weight:800;font-size:13px;margin-bottom:4px">${p.cliente || p.nombre || '—'}</div>
            ${p.referenciaOdoo ? `<div style="font-size:10px;color:#a1a1aa;margin-bottom:4px">${p.referenciaOdoo}</div>` : ''}
            <div style="margin-bottom:6px">${estadoBadge}</div>
            ${sistema ? `<div style="font-size:11px;color:#a1a1aa">Sistema: ${sistema.nombre}</div>` : ''}
            ${p.ubicacionDireccionTexto ? `<div style="font-size:11px;color:#71717a;margin-top:3px">${p.ubicacionDireccionTexto}</div>` : ''}
            <div style="margin-top:10px;display:flex;gap:8px">
              <button onclick="window.__stVerProyecto && window.__stVerProyecto('${p.id}')" style="background:#dc2626;color:white;border:none;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;border-radius:2px;text-transform:uppercase">Ver proyecto</button>
              <a href="https://www.google.com/maps?q=${p.ubicacionLat},${p.ubicacionLng}" target="_blank" style="color:#dc2626;font-size:11px;display:flex;align-items:center;gap:3px;text-decoration:none">↗ Maps</a>
            </div>
          </div>`;

        const marker = L.marker([p.ubicacionLat, p.ubicacionLng], { icon });
        marker.bindPopup(popupHtml, { maxWidth: 280, className: 'st-popup' });
        marker.bindTooltip(p.cliente || p.nombre || '—', { direction: 'top', offset: [0, -30] });
        marker.on('click', () => setProyectoSeleccionado(p));
        marker.addTo(map);
        markersRef.current.push(marker);
      });

      // Ajustar bounds si hay múltiples marcadores
      if (proyectosFiltrados.length > 1) {
        const bounds = L.latLngBounds(proyectosFiltrados.map(p => [p.ubicacionLat, p.ubicacionLng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      } else if (proyectosFiltrados.length === 1) {
        map.setView([proyectosFiltrados[0].ubicacionLat, proyectosFiltrados[0].ubicacionLng], 15);
      }

      setTimeout(() => map.invalidateSize(), 150);
    });

    return () => {};
  }, [proyectosFiltrados.length, filtroEstado, JSON.stringify(proyectosFiltrados.map(p => p.id))]);

  // Exponer callback global para el botón dentro del popup HTML
  useEffect(() => {
    window.__stVerProyecto = (id) => {
      const p = proyectos.find(x => x.id === id);
      if (p) onVerProyecto(p);
    };
    return () => { delete window.__stVerProyecto; };
  }, [proyectos, onVerProyecto]);

  // Destruir mapa al desmontar
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Estados únicos presentes en los proyectos con ubicación
  const estadosPresentes = [...new Set(conUbicacion.map(p => p.estado))];

  return (
    <div className="space-y-3">
      {/* Controles superiores */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <MapPin className="w-3 h-3 text-red-500" />
          <span><strong className="text-white">{conUbicacion.length}</strong> proyectos en el mapa</span>
          {sinUbicacion.length > 0 && <span className="text-zinc-600">· {sinUbicacion.length} sin ubicación</span>}
        </div>
        {estadosPresentes.length > 1 && (
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-zinc-500" />
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-xs text-white px-2 py-1 outline-none focus:border-red-600"
            >
              <option value="">Todos los estados</option>
              {estadosPresentes.map(e => (
                <option key={e} value={e}>{ESTADO_LABEL[e] || e}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Leyenda de colores */}
      <div className="flex flex-wrap gap-2">
        {estadosPresentes.map(e => (
          <button
            key={e}
            onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider border transition-all ${filtroEstado === e ? 'border-white' : 'border-zinc-800 opacity-70 hover:opacity-100'}`}
          >
            <span className={`w-2 h-2 rounded-full ${ESTADO_BG[e]}`} />
            {ESTADO_LABEL[e] || e} ({conUbicacion.filter(p => p.estado === e).length})
          </button>
        ))}
      </div>

      {/* Mapa principal */}
      <div className="border border-zinc-800 overflow-hidden" style={{ borderRadius: 2 }}>
        {conUbicacion.length === 0 ? (
          <div className="bg-zinc-900 flex items-center justify-center" style={{ height: 400 }}>
            <div className="text-center text-zinc-500 text-sm">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <div>Ningún proyecto tiene ubicación registrada.</div>
              <div className="text-xs mt-1">Agrega coordenadas desde Editar Proyecto → Google Maps.</div>
            </div>
          </div>
        ) : (
          <div ref={containerRef} style={{ height: 440, background: '#18181b' }} />
        )}
      </div>

      {/* Instrucción de uso */}
      {conUbicacion.length > 0 && (
        <div className="text-[10px] text-zinc-600 text-center">
          Haz clic en un marcador para ver los detalles del proyecto
        </div>
      )}

      {/* Lista de proyectos con ubicación */}
      {proyectosFiltrados.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {proyectosFiltrados.map(p => {
            const sistema = data.sistemas[p.sistema];
            return (
              <button
                key={p.id}
                onClick={() => onVerProyecto(p)}
                className="bg-zinc-900 border border-zinc-800 hover:border-red-600 p-3 text-left flex items-center gap-2 transition-colors"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: ESTADO_COLOR_HEX[p.estado] || '#6b7280' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{p.cliente || p.nombre}</div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {sistema?.nombre && `${sistema.nombre} · `}{ESTADO_LABEL[p.estado] || p.estado}
                  </div>
                  {p.ubicacionDireccionTexto && (
                    <div className="text-[10px] text-zinc-600 truncate">{p.ubicacionDireccionTexto}</div>
                  )}
                </div>
                <a
                  href={`https://www.google.com/maps?q=${p.ubicacionLat},${p.ubicacionLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-red-500 hover:text-red-400 flex-shrink-0"
                  title="Abrir en Google Maps"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </button>
            );
          })}
        </div>
      )}

      {/* Alerta proyectos sin ubicación */}
      {sinUbicacion.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 text-xs text-yellow-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold mb-1">{sinUbicacion.length} proyecto{sinUbicacion.length > 1 ? 's' : ''} sin ubicación</div>
            <div className="text-[10px] text-yellow-400/70">
              {sinUbicacion.map(p => p.cliente || p.nombre).join(', ')}
            </div>
            <div className="text-[10px] text-yellow-500/60 mt-1">
              Edita cada proyecto y pega un link de Google Maps para agregarlo al mapa.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
