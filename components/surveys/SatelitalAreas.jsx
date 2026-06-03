'use client';

// v8.19.86: [Levantamientos · Fase 6 — OPCIONAL] vista satelital con dibujo de
// áreas. Capa satelital gratuita (Esri World Imagery, sin token). Dibuja polígonos
// tocando vértices; calcula el área (m²) y la guarda en metadata.poligonos. Aditivo.

import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil, Check, Undo2, Trash2, Loader2, MapPin } from 'lucide-react';
import { areaPoligonoM2, setPoligonosProyecto, obtenerProyectoSurvey } from '../../lib/surveys';
import { formatNum } from '../../lib/helpers/formato';

const COLORES = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899'];

// Token opcional de Mapbox (capa HD). Si no está, solo se ofrece Esri (gratis).
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Fábrica de la capa base satelital según el proveedor elegido.
function crearCapaBase(L, capa) {
  if (capa === 'mapbox' && MAPBOX_TOKEN) {
    return L.tileLayer(`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.png?access_token=${MAPBOX_TOKEN}`, {
      maxZoom: 22, attribution: '© Mapbox © Maxar',
    });
  }
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 21, attribution: 'Tiles © Esri',
  });
}

export default function SatelitalAreas({ site, proyecto, onCerrar }) {
  const center = (site?.latitude != null && site?.longitude != null)
    ? [Number(site.latitude), Number(site.longitude)]
    : [18.4861, -69.9312]; // Santo Domingo por defecto

  const [poligonos, setPoligonos] = useState(() => (proyecto?.metadata?.poligonos || []));
  const [dibujando, setDibujando] = useState(false);
  const [puntos, setPuntos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [capa, setCapa] = useState('esri'); // esri (gratis) | mapbox (HD)
  const [editIdx, setEditIdx] = useState(null); // índice del área en edición de vértices

  const contRef = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const tempRef = useRef(null);
  const savedRef = useRef(null);
  const editLayerRef = useRef(null);
  const baseRef = useRef(null);
  const dibujandoRef = useRef(false);
  const puntosRef = useRef([]);
  useEffect(() => { dibujandoRef.current = dibujando; }, [dibujando]);
  useEffect(() => { puntosRef.current = puntos; }, [puntos]);

  // Recargar los polígonos guardados desde la BD al abrir (evita ver datos viejos).
  useEffect(() => {
    let cancel = false;
    (async () => {
      try { const fresh = await obtenerProyectoSurvey(proyecto.id); if (!cancel && fresh?.metadata?.poligonos) setPoligonos(fresh.metadata.poligonos); } catch {}
    })();
    return () => { cancel = true; };
  }, [proyecto.id]);

  // Cambiar de capa base sin recrear el mapa.
  useEffect(() => {
    const L = LRef.current, map = mapRef.current; if (!L || !map) return;
    if (baseRef.current) map.removeLayer(baseRef.current);
    baseRef.current = crearCapaBase(L, capa).addTo(map);
    baseRef.current.bringToBack();
  }, [capa]);

  const elegirCapa = (c) => {
    if (c === 'mapbox' && !MAPBOX_TOKEN) { alert('La capa Mapbox (HD) requiere un token. Configura NEXT_PUBLIC_MAPBOX_TOKEN en el entorno para activarla. Mientras tanto puedes usar la capa Satélite (gratis).'); return; }
    setCapa(c);
  };

  // Montaje del mapa
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    let disposed = false;
    import('leaflet').then((L) => {
      if (disposed || !contRef.current) return;
      LRef.current = L;
      const map = L.map(contRef.current, { center, zoom: 19, zoomControl: true });
      mapRef.current = map;
      baseRef.current = crearCapaBase(L, 'esri').addTo(map);
      savedRef.current = L.layerGroup().addTo(map);
      editLayerRef.current = L.layerGroup().addTo(map);
      tempRef.current = L.layerGroup().addTo(map);
      map.on('click', (e) => {
        if (!dibujandoRef.current) return;
        setPuntos((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
      });
      redibujarGuardados();
    });
    return () => { disposed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line
  }, []);

  // Redibujar polígono en progreso
  useEffect(() => {
    const L = LRef.current, layer = tempRef.current; if (!L || !layer) return;
    layer.clearLayers();
    if (puntos.length > 0) {
      L.polyline(puntos, { color: '#fff', weight: 2, dashArray: '4' }).addTo(layer);
      puntos.forEach((p) => L.circleMarker(p, { radius: 4, color: '#fff', fillColor: '#ef4444', fillOpacity: 1 }).addTo(layer));
    }
  }, [puntos]);

  // Redibujar polígonos guardados
  const redibujarGuardados = () => {
    const L = LRef.current, layer = savedRef.current; if (!L || !layer) return;
    layer.clearLayers();
    poligonos.forEach((pg, i) => {
      const color = COLORES[i % COLORES.length];
      L.polygon(pg.latlngs, { color, weight: 2, fillOpacity: 0.25 })
        .bindTooltip(`${pg.nombre} · ${formatNum(pg.area)} m²`, { permanent: false })
        .addTo(layer);
    });
  };
  useEffect(redibujarGuardados, [poligonos]);

  // Vértices arrastrables del área en edición.
  useEffect(() => {
    const L = LRef.current, layer = editLayerRef.current; if (!L || !layer) return;
    layer.clearLayers();
    if (editIdx == null || !poligonos[editIdx]) return;
    const icon = L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #ef4444;box-shadow:0 0 0 1px #000"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
    poligonos[editIdx].latlngs.forEach((pt, i) => {
      const mk = L.marker(pt, { draggable: true, icon }).addTo(layer);
      mk.on('dragend', () => {
        const ll = mk.getLatLng();
        setPoligonos(prev => prev.map((pg, idx) => {
          if (idx !== editIdx) return pg;
          const latlngs = pg.latlngs.map((p, j) => j === i ? [ll.lat, ll.lng] : p);
          return { ...pg, latlngs, area: Math.round(areaPoligonoM2(latlngs)) };
        }));
      });
    });
    // eslint-disable-next-line
  }, [editIdx]);

  const terminarEdicion = async () => {
    const idx = editIdx; setEditIdx(null);
    if (idx != null) await persistir(poligonos);
  };

  const persistir = async (nuevos) => {
    setGuardando(true);
    try { await setPoligonosProyecto(proyecto.id, nuevos); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  const cerrarArea = async () => {
    if (puntos.length < 3) { alert('Marca al menos 3 puntos.'); return; }
    const area = areaPoligonoM2(puntos);
    const nombre = (prompt('Nombre del área:', `Área ${poligonos.length + 1}`) || `Área ${poligonos.length + 1}`).trim();
    const nuevos = [...poligonos, { nombre, latlngs: puntos, area: Math.round(area) }];
    setPoligonos(nuevos); setPuntos([]); setDibujando(false);
    await persistir(nuevos);
  };
  const borrar = async (i) => {
    if (editIdx === i) setEditIdx(null);
    const nuevos = poligonos.filter((_, idx) => idx !== i);
    setPoligonos(nuevos); await persistir(nuevos);
  };
  const renombrar = async (i) => {
    const nombre = prompt('Nombre del área:', poligonos[i].nombre);
    if (nombre == null) return;
    const nuevos = poligonos.map((pg, idx) => idx === i ? { ...pg, nombre: nombre.trim() || pg.nombre } : pg);
    setPoligonos(nuevos); await persistir(nuevos);
  };

  const areaTotal = poligonos.reduce((a, p) => a + (Number(p.area) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] overflow-y-auto" onClick={onCerrar}>
      <div className="min-h-full p-2 sm:p-4">
        <div className="bg-zinc-950 border-2 border-red-600 rounded-card max-w-4xl mx-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-3 border-b border-zinc-800">
            <div className="font-black text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-red-500" /> Vista satelital — áreas <span className="text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 uppercase font-bold rounded">Opcional</span></div>
            <div className="flex items-center gap-2">{guardando && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}<button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button></div>
          </div>

          <div className="p-3 space-y-2">
            {/* Controles de dibujo */}
            <div className="flex items-center gap-2 flex-wrap">
              {!dibujando ? (
                <button onClick={() => { setDibujando(true); setPuntos([]); }} className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold uppercase px-3 py-1.5 rounded-card flex items-center gap-1"><Pencil className="w-3 h-3" /> Dibujar área</button>
              ) : (
                <>
                  <span className="text-[11px] text-amber-300">Toca el mapa para marcar los vértices ({puntos.length}).</span>
                  <button onClick={() => setPuntos(p => p.slice(0, -1))} disabled={!puntos.length} className="bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase px-2 py-1.5 rounded-card flex items-center gap-1 disabled:opacity-40"><Undo2 className="w-3 h-3" /> Deshacer</button>
                  <button onClick={cerrarArea} className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded-card flex items-center gap-1"><Check className="w-3 h-3" /> Cerrar área</button>
                  <button onClick={() => { setDibujando(false); setPuntos([]); }} className="text-zinc-500 text-[10px] underline">cancelar</button>
                </>
              )}
              {/* Selector de capa — el levantador elige */}
              <div className="ml-auto flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-0.5">
                <button onClick={() => elegirCapa('esri')} className={`px-2 py-1 text-[10px] font-bold uppercase rounded-card ${capa === 'esri' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Satélite (gratis)</button>
                <button onClick={() => elegirCapa('mapbox')} title={MAPBOX_TOKEN ? '' : 'Requiere token NEXT_PUBLIC_MAPBOX_TOKEN'} className={`px-2 py-1 text-[10px] font-bold uppercase rounded-card ${capa === 'mapbox' ? 'bg-red-600 text-white' : MAPBOX_TOKEN ? 'text-zinc-400' : 'text-zinc-600'}`}>Mapbox HD{!MAPBOX_TOKEN && ' 🔒'}</button>
              </div>
            </div>

            {editIdx != null && poligonos[editIdx] && (
              <div className="text-[11px] text-amber-300 bg-amber-900/15 border border-amber-800/40 rounded-card px-2 py-1.5 flex items-center justify-between gap-2">
                <span>Editando <b>{poligonos[editIdx].nombre}</b>: arrastra los puntos blancos para mover los vértices. El m² se recalcula solo.</span>
                <button onClick={terminarEdicion} className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold uppercase px-2 py-1 rounded-card flex items-center gap-1 shrink-0"><Check className="w-3 h-3" /> Listo</button>
              </div>
            )}

            <div ref={contRef} style={{ height: 420 }} className="rounded-card overflow-hidden border border-zinc-800" />

            {/* Lista de áreas */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Áreas dibujadas ({poligonos.length})</div>
                <div className="text-xs font-black text-green-300">Total {formatNum(areaTotal)} m²</div>
              </div>
              {poligonos.length === 0 ? <div className="text-xs text-zinc-600">Aún no hay áreas. Usa "Dibujar área" para trazar sobre el techo.</div> :
                <div className="space-y-1">{poligonos.map((p, i) => (
                  <div key={i} className={`flex items-center justify-between text-xs rounded px-1 -mx-1 ${editIdx === i ? 'bg-amber-900/20' : ''}`}>
                    <button onClick={() => renombrar(i)} className="flex items-center gap-2 hover:text-white" title="Renombrar"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORES[i % COLORES.length] }} />{p.nombre}</button>
                    <span className="flex items-center gap-3">
                      <span className="font-bold tabular-nums">{formatNum(p.area)} m²</span>
                      <button onClick={() => (editIdx === i ? terminarEdicion() : setEditIdx(i))} title={editIdx === i ? 'Terminar edición' : 'Editar puntos'} className={editIdx === i ? 'text-green-400' : 'text-zinc-500 hover:text-amber-400'}>{editIdx === i ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}</button>
                      <button onClick={() => borrar(i)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  </div>
                ))}</div>}
              <div className="text-[10px] text-zinc-600 mt-2">El área se calcula del polígono satelital (referencia). Valídala con cinta en la captura.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
