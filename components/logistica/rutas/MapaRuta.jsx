'use client';

// v8.75: mapa grande de la ruta abierta.
//  - pines NUMERADOS en el orden de la ruta, color por estado
//  - línea punteada = lo planificado; línea continua = lo que recorrió el camión (GPS)
//  - camiones en vivo, lo que está por montar y la oficina
//  - clic en el mapa = poner una parada en ese punto

import React, { useMemo } from 'react';
import { OFICINA, coordsParada, estadoVisualParada, etiquetaTipo } from '../../../lib/helpers/rutasOficina';

const MapaLeaflet = React.lazy(() => import('../../common/MapaLeaflet'));
// Colores de las líneas (contrastan sobre el mapa claro de OpenStreetMap).
const COLOR_PLAN = '#0e7490';
const COLOR_REAL = '#be123c';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default function MapaRuta({ viaje, proyectos, nombreObra, listas, diligencias, gpsUnidades, vehiculos, recorrido, puntoMapa, onMapClick, height, verCamiones = true }) {
  const { markers, polylines, centro } = useMemo(() => {
    const ms = [];
    const lineas = [];
    const conParadas = !!viaje && viaje.paradas.some(p => coordsParada(p, proyectos));
    // Oficina (referencia fija)
    ms.push({ lat: OFICINA.lat, lng: OFICINA.lng, color: '#0f172a', label: '🏢 Oficina Super Techos', popup: '<b>🏢 Oficina Super Techos</b><br>Calle Arena 1, Mar Azul', sinEncuadre: conParadas });
    // Paradas de la ruta abierta, numeradas
    const plan = [];
    if (viaje) {
      let n = 0;
      viaje.paradas.forEach(p => {
        const c = coordsParada(p, proyectos);
        const cancelada = p.estado === 'cancelada';
        if (!cancelada) n += 1;
        if (!c) return;
        const ev = estadoVisualParada(p);
        const nombre = p.proyectoId ? nombreObra(p.proyectoId) : (p.lugar || '');
        ms.push({ ...c, color: ev.color, borde: ev.borde, numero: cancelada ? null : n, label: `${cancelada ? '' : n + '. '}${nombre}`,
          popup: `<b>${cancelada ? '' : n + '. '}${esc(etiquetaTipo(p.tipo))}</b> · ${esc(ev.texto)}<br>${esc(nombre)}${p.descripcion ? `<br><span style="font-size:11px;color:#a1a1aa">${esc(p.descripcion)}</span>` : ''}` });
        if (!cancelada) plan.push([c.lat, c.lng]);
      });
    }
    if (plan.length > 1) lineas.push({ points: plan, color: COLOR_PLAN, dashed: true, weight: 4, opacity: 0.9 });
    if (recorrido && recorrido.length > 1) lineas.push({ points: recorrido.map(p => [p.lat, p.lng]), color: COLOR_REAL, weight: 5, opacity: 0.75 });
    // Por montar (naranja = requisición lista, rojo = retiro de sobrante)
    const coordsObra = (pid) => { const p = (proyectos || []).find(x => x.id === pid); return (p?.ubicacionLat != null && p?.ubicacionLng != null) ? { lat: Number(p.ubicacionLat), lng: Number(p.ubicacionLng) } : null; };
    listas.forEach(r => { const c = coordsObra(r.proyectoId); if (c) ms.push({ ...c, color: 'orange', sinEncuadre: conParadas, label: `Por montar: ${nombreObra(r.proyectoId)}`, popup: `<b>📦 Lista para envío</b><br>${esc(nombreObra(r.proyectoId))}` }); });
    diligencias.forEach(d => { const c = coordsObra(d.proyectoId); if (c) ms.push({ ...c, color: 'red', sinEncuadre: conParadas, label: `Retiro: ${nombreObra(d.proyectoId)}`, popup: `<b>♻ Retiro de sobrante</b><br>${esc(nombreObra(d.proyectoId))}` }); });
    // Camiones en vivo (solo cuenta para el encuadre el de esta ruta)
    if (verCamiones) (gpsUnidades || []).forEach(u => {
      if (u.lat == null || u.lng == null) return;
      const veh = (vehiculos || []).find(x => String(x.gpsDeviceId) === String(u.id));
      const deEsta = !!viaje && !!veh && veh.id === viaje.vehiculoId;
      ms.push({ lat: u.lat, lng: u.lng, vehiculoTipo: veh?.tipo || 'camion', color: deEsta ? 'purple' : u.velocidad > 2 ? 'green' : u.online === 'online' ? 'yellow' : 'gray',
        sinEncuadre: !deEsta || conParadas,
        label: `🛰 ${veh ? `${veh.marca} ${veh.modelo}` : u.nombre}${deEsta ? ' (esta ruta)' : ''}`,
        popup: `<b>🛰 ${esc(u.nombre)}</b><br>${u.velocidad} km/h · ${u.velocidad > 2 ? 'en movimiento' : u.online === 'online' ? 'encendido detenido' : 'apagado'}<br><span style="font-size:11px;color:#a1a1aa">${esc(u.hora || '')}</span>` });
    });
    if (puntoMapa) ms.push({ lat: puntoMapa.lat, lng: puntoMapa.lng, color: 'yellow', label: 'Parada nueva aquí', sinEncuadre: true });
    const primero = ms.find(m => !m.sinEncuadre) || ms[0];
    return { markers: ms, polylines: lineas, centro: [primero.lat, primero.lng] };
  }, [viaje, proyectos, nombreObra, listas, diligencias, gpsUnidades, vehiculos, recorrido, puntoMapa, verCamiones]);

  return (
    <div className="relative">
      <React.Suspense fallback={<div className="bg-zinc-950 border border-zinc-800 rounded-card flex items-center justify-center" style={{ height }}><span className="text-xs text-zinc-500">Cargando mapa…</span></div>}>
        <MapaLeaflet center={centro} zoom={12} height={height} markers={markers} polylines={polylines} onMapClick={onMapClick} scrollWheelZoom className="border border-zinc-800 rounded-card" />
      </React.Suspense>
      <div className="flex gap-x-3 gap-y-1 flex-wrap text-[11px] text-zinc-400 mt-1.5">
        <span><b className="text-blue-400">●</b> Pendiente</span>
        <span><b className="text-green-400">●</b> Hecha</span>
        <span><b className="text-purple-400">●</b> El GPS la vio, falta marcar</span>
        <span><b className="text-zinc-500">●</b> Cancelada</span>
        <span><b style={{ color: COLOR_PLAN }}>┄┄</b> planificado</span>
        <span><b style={{ color: COLOR_REAL }}>━━</b> recorrido real (GPS)</span>
        <span><b className="text-orange-400">●</b> Por montar</span>
        {onMapClick && <span className="text-zinc-500">· Clic en el mapa para poner una parada ahí</span>}
      </div>
    </div>
  );
}
