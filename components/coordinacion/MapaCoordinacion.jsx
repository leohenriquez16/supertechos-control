'use client';

// v8.95.0 — Mapa de la Coordinación de levantamientos por campaña.
// Leaflet imperativo (como components/programas/MapaPrograma.jsx), se importa con next/dynamic ssr:false.
// - Un L.circleMarker por oficina sobre canvas (preferCanvas): con ~330 pines no hacen falta clusters.
// - Los pines se crean una vez por lista de oficinas; selección, filtros y color se actualizan con setStyle().
// - Selección: clic en el pin; rectángulo con Shift + arrastrar (escritorio) o con «Modo selección» (iPad);
//   «Seleccionar lo que ves» toma las oficinas filtradas dentro del encuadre.
// - fitBounds solo cuando cambia `fitKey` (la firma de los filtros), nunca al seleccionar.

import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ESTADO_OFICINA, estadoOficina, colorTecnico, FRANJAS, diaCorto } from '../../lib/helpers/coordinacion';

const tieneUbicacion = (s) => s.latitude != null && s.longitude != null && Number(s.latitude) && Number(s.longitude);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function MapaCoordinacion({
  sites = [], visibles, seleccion, colorPor = 'estado', tecnicos = [], fitKey = '',
  onToggle, onSeleccionarVarias, alto = 520,
}) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const capaRef = useRef(null);
  const pinesRef = useRef(new Map()); // id → circleMarker
  const cbRef = useRef({ onToggle, onSeleccionarVarias });
  cbRef.current = { onToggle, onSeleccionarVarias };
  const visiblesRef = useRef(visibles);
  visiblesRef.current = visibles;
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const modoRef = useRef(false);
  modoRef.current = modoSeleccion;

  // Crear el mapa + rectángulo de selección
  useEffect(() => {
    if (mapRef.current || !ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: true, preferCanvas: true, boxZoom: false }).setView([18.8, -70.0], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);

    const cont = map.getContainer();
    let inicio = null; let rect = null; let pointerId = null;
    const empezar = (e) => {
      const conShift = e.shiftKey && e.pointerType === 'mouse';
      if (!modoRef.current && !conShift) return;
      if (e.button != null && e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      map.dragging.disable();
      inicio = map.mouseEventToLatLng(e);
      pointerId = e.pointerId;
      try { cont.setPointerCapture(e.pointerId); } catch {}
      rect = L.rectangle(L.latLngBounds(inicio, inicio), { color: '#ef4444', weight: 2, fillOpacity: 0.08, dashArray: '4 4', interactive: false }).addTo(map);
    };
    const mover = (e) => {
      if (!inicio || e.pointerId !== pointerId) return;
      e.stopPropagation(); e.preventDefault();
      rect.setBounds(L.latLngBounds(inicio, map.mouseEventToLatLng(e)));
    };
    const terminar = (e) => {
      if (!inicio || e.pointerId !== pointerId) return;
      e.stopPropagation();
      const b = rect.getBounds();
      rect.remove(); rect = null; inicio = null;
      try { cont.releasePointerCapture(e.pointerId); } catch {}
      if (!modoRef.current) map.dragging.enable();
      const ids = [];
      const vis = visiblesRef.current;
      pinesRef.current.forEach((m, id) => { if ((!vis || vis.has(id)) && b.contains(m.getLatLng())) ids.push(id); });
      if (ids.length) cbRef.current.onSeleccionarVarias?.(ids);
    };
    // Evita que Leaflet empiece a arrastrar el mapa mientras se dibuja el rectángulo.
    const bloquear = (e) => { if (inicio || modoRef.current || (e.shiftKey && e.type === 'mousedown')) e.stopPropagation(); };
    cont.addEventListener('pointerdown', empezar, true);
    cont.addEventListener('pointermove', mover, true);
    cont.addEventListener('pointerup', terminar, true);
    cont.addEventListener('pointercancel', terminar, true);
    cont.addEventListener('mousedown', bloquear, true);
    cont.addEventListener('touchstart', bloquear, { capture: true, passive: true });
    return () => {
      cont.removeEventListener('pointerdown', empezar, true);
      cont.removeEventListener('pointermove', mover, true);
      cont.removeEventListener('pointerup', terminar, true);
      cont.removeEventListener('pointercancel', terminar, true);
      cont.removeEventListener('mousedown', bloquear, true);
      cont.removeEventListener('touchstart', bloquear, { capture: true });
      map.remove(); mapRef.current = null; pinesRef.current = new Map();
    };
  }, []);

  // Modo selección (iPad): el arrastre dibuja el rectángulo en vez de mover el mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const cont = map.getContainer();
    if (modoSeleccion) { map.dragging.disable(); cont.style.touchAction = 'none'; cont.style.cursor = 'crosshair'; }
    else { map.dragging.enable(); cont.style.touchAction = ''; cont.style.cursor = ''; }
  }, [modoSeleccion]);

  // Pines: se rehacen solo cuando cambia la lista de oficinas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (capaRef.current) { capaRef.current.remove(); capaRef.current = null; }
    const capa = L.layerGroup().addTo(map);
    const pines = new Map();
    sites.forEach((s) => {
      if (!tieneUbicacion(s)) return;
      const m = L.circleMarker([Number(s.latitude), Number(s.longitude)], { radius: 7, weight: 1, color: '#ffffff', fillOpacity: 0.9 }).addTo(capa);
      m.on('click', (ev) => { L.DomEvent.stopPropagation(ev); cbRef.current.onToggle?.(s.id); });
      pines.set(s.id, m);
    });
    capaRef.current = capa;
    pinesRef.current = pines;
  }, [sites]);

  // Estilo + tooltip: selección, filtros y color.
  useEffect(() => {
    const porId = new Map(sites.map((s) => [s.id, s]));
    pinesRef.current.forEach((m, id) => {
      const s = porId.get(id);
      if (!s) return;
      const est = estadoOficina(s);
      const fill = colorPor === 'tecnico' ? colorTecnico(s.asignado_a_id, tecnicos) : (ESTADO_OFICINA[est]?.color || '#71717a');
      const sel = seleccion?.has(id);
      const fuera = visibles && !visibles.has(id);
      m.setStyle({
        fillColor: fill,
        color: sel ? '#000000' : '#ffffff',
        weight: sel ? 4 : 1,
        radius: sel ? 9 : 7,
        opacity: fuera ? 0.15 : 1,
        fillOpacity: fuera ? 0.15 : 0.9,
      });
      if (sel) m.bringToFront();
      const cuando = s.visita_fecha ? `${diaCorto(s.visita_fecha)}${s.visita_franja ? ' · ' + (FRANJAS[s.visita_franja] || '') : ''}` : 'Sin día';
      m.unbindTooltip();
      m.bindTooltip(
        `<b>${esc(s.external_code || '')}</b> ${esc(s.name)}<br>${esc(ESTADO_OFICINA[est]?.label || '')}<br>${esc(s.asignado_a_nombre || 'Sin técnico')} · ${esc(cuando)}`,
        { direction: 'top', offset: [0, -8] },
      );
    });
  }, [sites, seleccion, visibles, colorPor, tecnicos]);

  // Encuadre: en la primera carga con pines y cuando cambian los filtros; NO tras cada acción (Edwin no pierde su zoom).
  const encuadreRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pinesRef.current.size) return;
    if (encuadreRef.current === fitKey) return;
    encuadreRef.current = fitKey;
    const puntos = [];
    pinesRef.current.forEach((m, id) => { if (!visibles || visibles.has(id)) puntos.push(m.getLatLng()); });
    if (puntos.length) map.fitBounds(L.latLngBounds(puntos).pad(0.1), { maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, sites]);

  const seleccionarLoQueVes = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const ids = [];
    pinesRef.current.forEach((m, id) => { if ((!visibles || visibles.has(id)) && b.contains(m.getLatLng())) ids.push(id); });
    if (ids.length) onSeleccionarVarias?.(ids);
  };

  const sinUbicacion = useMemo(() => sites.filter((s) => !tieneUbicacion(s) && (!visibles || visibles.has(s.id))), [sites, visibles]);
  const leyenda = useMemo(() => {
    if (colorPor === 'tecnico') {
      const ids = [...new Set(sites.map((s) => s.asignado_a_id || ''))];
      const nombre = (id) => tecnicos.find((t) => t.id === id)?.nombre || sites.find((s) => s.asignado_a_id === id)?.asignado_a_nombre || id;
      return ids.map((id) => ({ k: id || 'sin', label: id ? nombre(id) : 'Sin técnico', color: colorTecnico(id || null, tecnicos) }));
    }
    return Object.entries(ESTADO_OFICINA).sort((a, b) => a[1].orden - b[1].orden).map(([k, v]) => ({ k, label: v.label, color: v.color }));
  }, [colorPor, sites, tecnicos]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setModoSeleccion((v) => !v)}
          className={`px-3 py-2 rounded-lg text-xs font-bold border ${modoSeleccion ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}
        >
          {modoSeleccion ? 'Modo selección: arrastra un rectángulo' : 'Modo selección'}
        </button>
        <button onClick={seleccionarLoQueVes} className="px-3 py-2 rounded-lg text-xs font-bold border bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500">
          Seleccionar lo que ves
        </button>
        <span className="text-[11px] text-zinc-500 hidden md:inline">En escritorio: Shift + arrastrar para seleccionar varias.</span>
      </div>
      {/* v8.95.1: isolation aísla las capas de Leaflet (z-index 400-1000): sin esto el mapa tapaba la barra de
          «Asignar y programar», su ventana y la ficha de la oficina que se abre encima. */}
      <div ref={ref} style={{ height: alto, width: '100%', borderRadius: 8, overflow: 'hidden', isolation: 'isolate', position: 'relative', zIndex: 0 }} />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {leyenda.map((l) => (
          <span key={l.k} className="flex items-center gap-1 text-[11px] text-zinc-400">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: l.color }} /> {l.label}
          </span>
        ))}
      </div>
      {sinUbicacion.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Sin ubicación ({sinUbicacion.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {sinUbicacion.map((s) => {
              const sel = seleccion?.has(s.id);
              return (
                <button key={s.id} onClick={() => onToggle?.(s.id)}
                  className={`px-2 py-1 rounded text-[11px] border ${sel ? 'bg-red-600/20 border-red-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-300'}`}>
                  {s.external_code ? `${s.external_code} · ` : ''}{s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
