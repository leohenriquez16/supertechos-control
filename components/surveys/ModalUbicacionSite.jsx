'use client';

// v8.45.0: asignar UBICACIÓN a un levantamiento que no la tiene — eligiendo el
// punto con CLIC EN EL MAPA o pegando el link de Google Maps. La ubicación se
// guarda en el site del levantamiento Y nace como LOCACIÓN DEL CLIENTE
// (cliente_ubicaciones), quedando amarrada para proyectos, garantías,
// mantenimientos y reclamaciones futuras (Cliente 360).

import React, { useState } from 'react';
import { X, MapPin, Loader2, Save } from 'lucide-react';
import * as db from '../../lib/db';
import { actualizarSiteSurvey } from '../../lib/surveys';
import { parseCoords } from '../../lib/helpers/geo';

export default function ModalUbicacionSite({ site, cliente, onCerrar, onGuardado }) {
  const [coords, setCoords] = useState(site?.latitude != null ? { lat: Number(site.latitude), lng: Number(site.longitude) } : null);
  const [link, setLink] = useState('');
  const [nombre, setNombre] = useState(site?.name || site?.address || 'Principal');
  const [guardando, setGuardando] = useState(false);
  const MapaLeaflet = React.useMemo(() => React.lazy(() => import('../common/MapaLeaflet')), []);

  const usarLink = (v) => {
    setLink(v);
    const c = parseCoords(v);
    if (c) setCoords(c);
  };

  const guardar = async () => {
    if (!coords) { alert('Elige el punto en el mapa o pega el link de Google Maps.'); return; }
    setGuardando(true);
    try {
      let ubicacionId = site?.ubicacion_id || null;
      let clienteId = site?.cliente_id || cliente?.id || null;
      // La ubicación VIVE EN EL CLIENTE: crear la locación (o actualizar la ya amarrada).
      if (clienteId) {
        if (ubicacionId) {
          await db.actualizarCoordsUbicacionCliente(ubicacionId, coords.lat, coords.lng).catch(() => {});
        } else {
          const u = await db.crearUbicacionCliente({
            clienteId, nombre: (nombre || 'Principal').trim(),
            direccion: site?.address || null, ciudad: site?.city || null, provincia: site?.province || null,
            latitud: coords.lat, longitud: coords.lng,
            contactoNombre: site?.contact_name || null, contactoTelefono: site?.mobile_phone || site?.office_phone || null,
          });
          ubicacionId = u.id;
        }
      }
      await actualizarSiteSurvey(site.id, {
        latitude: coords.lat, longitude: coords.lng,
        ...(clienteId ? { clienteId } : {}), ...(ubicacionId ? { ubicacionId } : {}),
      });
      onGuardado?.({ siteId: site.id, lat: coords.lat, lng: coords.lng, clienteId, ubicacionId });
    } catch (e) { alert('Error: ' + (e?.message || e)); setGuardando(false); return; }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-lg w-full p-5 my-8 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Ubicación del levantamiento</div>
            <div className="text-sm font-bold truncate mt-0.5">{site?.name || site?.address || 'Sitio'}</div>
            {cliente && <div className="text-[11px] text-zinc-400">La ubicación quedará guardada en el cliente <b className="text-zinc-200">{cliente.nombre}</b> (Cliente 360).</div>}
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <div className="text-[10px] font-bold text-zinc-300 mb-1">Opción A · Pega el link de Google Maps (o "lat, lng")</div>
          <input value={link} onChange={e => usarLink(e.target.value)} placeholder="https://maps.google.com/… con @lat,lng"
            className={`w-full bg-zinc-950 border-2 rounded-card px-3 py-2.5 text-sm outline-none ${link && parseCoords(link) ? 'border-green-700' : link ? 'border-amber-700' : 'border-zinc-700 focus:border-red-600'}`} />
          {link && !parseCoords(link) && <div className="text-[10px] text-amber-400 mt-0.5">Aún no leo coordenadas — abre el lugar en Maps y copia la URL completa (trae @lat,lng).</div>}
        </div>

        <div>
          <div className="text-[10px] font-bold text-zinc-300 mb-1">Opción B · Haz clic en el punto exacto del mapa</div>
          <React.Suspense fallback={<div className="bg-zinc-950 border border-zinc-800 rounded-card" style={{ height: 260 }} />}>
            <MapaLeaflet
              center={coords ? [coords.lat, coords.lng] : [18.4861, -69.9312]}
              zoom={coords ? 16 : 11} height={260} scrollWheelZoom={true}
              markers={coords ? [{ lat: coords.lat, lng: coords.lng, color: 'red', label: 'Ubicación elegida' }] : []}
              onMapClick={(lat, lng) => { setCoords({ lat, lng }); setLink(''); }}
              className="border border-zinc-800" />
          </React.Suspense>
          {coords
            ? <div className="text-[11px] text-green-400 mt-1">📍 {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)} ✓ (haz clic de nuevo para moverlo)</div>
            : <div className="text-[11px] text-zinc-500 mt-1">Acércate con zoom y toca el techo exacto.</div>}
        </div>

        {!site?.ubicacion_id && (cliente || site?.cliente_id) && (
          <div>
            <div className="text-[10px] font-bold text-zinc-300 mb-1">Nombre de esta locación del cliente</div>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder='Ej: "Sucursal Naco", "Torre principal"'
              className="w-full bg-zinc-950 border-2 border-zinc-700 focus:border-red-600 rounded-card px-3 py-2.5 text-sm outline-none" />
          </div>
        )}

        <button onClick={guardar} disabled={guardando || !coords}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-3 rounded-card flex items-center justify-center gap-1.5">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar ubicación
        </button>
      </div>
    </div>
  );
}
