'use client';

// v8.29.0: Vista "Rutas" — planificación de viajes de camiones (adiós Excel).
// Un viaje = un chofer (o envío pagado) en una fecha, con paradas ordenadas:
//  - entregas de requisiciones LISTAS del almacén a sus obras
//  - recogidas/entregas libres (puertos, almacenes fiscales, suplidores, entre almacenes)
// El chofer ve su ruta en su teléfono y marca cada parada; sus horas de inicio/fin
// del viaje alimentan el cálculo de horas extras (resumen abajo).

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Truck, Plus, RefreshCw, Trash2, ChevronUp, ChevronDown, X, MapPin } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
const tieneRol = (p, r) => p?.roles?.includes(r);

// v8.40.0: tipos de lugar frecuente (suplidores, puertos, almacenes).
const TIPOS_LUGAR = { suplidor: '🏪 Suplidores', puerto: '⚓ Puertos', almacen_fiscal: '🏛 Almacenes fiscales', almacen: '🏭 Almacenes propios', otro: '📍 Otros' };
// Acepta "18.48, -69.91" o un link de Google Maps (…@18.48,-69.91… | …q=18.48,-69.91…)
export const parseCoords = (str) => {
  const s = String(str || '');
  const m = s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || s.match(/[?&]q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || s.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
};

export default function VistaRutas({ usuario, data, onVolver }) {
  const [fecha, setFecha] = useState(hoyRD());
  const [viajes, setViajes] = useState([]);
  const [listas, setListas] = useState([]);       // requisiciones listas sin viaje
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ choferId: '', vehiculo: '', tipoEnvio: 'camion' });
  const [paradaLibre, setParadaLibre] = useState(null); // { viajeId, tipo, lugar, descripcion, lat, lng }
  const [viajeSel, setViajeSel] = useState(null); // v8.38.0: viaje abierto en el panel (desktop)
  // v8.40.0: diligencias (retiros de sobrante), aviso de almacén, lugares y mapa
  const [diligencias, setDiligencias] = useState([]);
  const [enAlmacen, setEnAlmacen] = useState([]);      // requisiciones pendiente/preparando (aviso)
  const [verEnAlmacen, setVerEnAlmacen] = useState(false);
  const [lugares, setLugares] = useState([]);
  const [suplidores, setSuplidores] = useState([]); // v8.41.0: entidad con locaciones
  const [verMapa, setVerMapa] = useState(false);
  const [gestionLugares, setGestionLugares] = useState(false);

  const choferes = useMemo(() => (data.personal || []).filter(p => tieneRol(p, 'chofer')), [data.personal]);

  const recargar = async () => {
    setLoading(true);
    try {
      const [vs, reqs, dils, lugs, viniendo] = await Promise.all([
        db.listarViajes({ fecha }),
        db.listarRequisiciones({ estados: ['lista'] }),
        db.listarDiligencias({ estados: ['sin_planificar'] }).catch(() => []),
        db.listarLugaresLogisticos().catch(() => []),
        db.listarRequisiciones({ estados: ['pendiente', 'preparando'] }).catch(() => []),
      ]);
      db.listarSuplidores().then(setSuplidores).catch(() => {});
      const asignadas = new Set(vs.flatMap(v => v.paradas.map(p => p.requisicionId).filter(Boolean)));
      // también excluir requisiciones ya montadas en viajes de OTRAS fechas
      const otras = await db.listarViajes({ desde: hoyRD().slice(0, 8) + '01' }).catch(() => []);
      otras.forEach(v => v.paradas.forEach(p => { if (p.requisicionId) asignadas.add(p.requisicionId); }));
      setViajes(vs);
      setListas(reqs.filter(r => !asignadas.has(r.id)));
      setDiligencias(dils); setLugares(lugs); setEnAlmacen(viniendo);
    } catch (e) { console.warn('Rutas:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [fecha]);
  // v8.38.0: auto-seleccionar el primer viaje del día (el panel es solo desktop).
  useEffect(() => {
    if (loading) return;
    if (viajeSel && viajes.some(v => v.id === viajeSel)) return;
    setViajeSel(viajes[0]?.id || null);
    // eslint-disable-next-line
  }, [viajes, loading]);

  const nombreObra = (pid) => { const p = (data.proyectos || []).find(x => x.id === pid); return p ? (p.cliente || p.nombre || p.referenciaOdoo) : pid; };

  const crearViaje = async () => {
    if (nuevo.tipoEnvio === 'camion' && !nuevo.choferId) { alert('Elige el chofer.'); return; }
    const chofer = choferes.find(c => c.id === nuevo.choferId);
    try {
      await db.crearViaje({
        fecha, choferId: nuevo.tipoEnvio === 'camion' ? nuevo.choferId : null,
        choferNombre: nuevo.tipoEnvio === 'camion' ? (chofer?.nombre || '') : 'Envío pagado',
        vehiculo: nuevo.vehiculo, vehiculoId: nuevo.vehiculoId || null, // v8.41.0
        tipoEnvio: nuevo.tipoEnvio, creadoPorId: usuario.id,
      });
      setCreando(false); setNuevo({ choferId: '', vehiculo: '', vehiculoId: '', tipoEnvio: 'camion' });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const montarRequisicion = async (viaje, req) => {
    try {
      await db.agregarParada({
        viajeId: viaje.id, orden: viaje.paradas.length + 1, tipo: 'entrega',
        proyectoId: req.proyectoId, requisicionId: req.id,
        descripcion: `Entregar materiales en ${nombreObra(req.proyectoId)}`,
      });
      // el viaje "pagado" entrega directo; el camión la lleva cuando el chofer arranca
      if (viaje.tipoEnvio === 'pagado' || viaje.estado === 'en_curso') await db.actualizarRequisicion(req.id, { estado: 'en_ruta' });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const agregarLibre = async () => {
    const p = paradaLibre;
    if (!p?.lugar?.trim()) { alert('Escribe el lugar.'); return; }
    const viaje = viajes.find(v => v.id === p.viajeId);
    try {
      await db.agregarParada({
        viajeId: p.viajeId, orden: (viaje?.paradas.length || 0) + 1,
        tipo: p.tipo, lugar: p.lugar.trim(), descripcion: p.descripcion || '',
        lat: p.lat ?? null, lng: p.lng ?? null, // v8.40.0: coords del lugar frecuente
      });
      setParadaLibre(null);
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  // v8.40.0: montar un RETIRO DE SOBRANTE en un viaje — parada de recogida en la obra.
  const montarDiligencia = async (viaje, d) => {
    const proy = (data.proyectos || []).find(x => x.id === d.proyectoId);
    try {
      await db.agregarParada({
        viajeId: viaje.id, orden: viaje.paradas.length + 1, tipo: 'recogida',
        proyectoId: d.proyectoId, diligenciaId: d.id,
        lat: proy?.ubicacionLat ?? null, lng: proy?.ubicacionLng ?? null,
        descripcion: `Retirar sobrante en ${nombreObra(d.proyectoId)}: ${(d.descripcion || '').split('\n')[0]}`,
      });
      await db.actualizarDiligencia(d.id, { estado: 'asignada', viajeId: viaje.id });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const mover = async (viaje, parada, dir) => {
    const orden = [...viaje.paradas].sort((a, b) => a.orden - b.orden);
    const i = orden.findIndex(p => p.id === parada.id);
    const j = i + dir;
    if (j < 0 || j >= orden.length) return;
    try {
      await db.actualizarParada(orden[i].id, { orden: orden[j].orden });
      await db.actualizarParada(orden[j].id, { orden: orden[i].orden });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const quitarParada = async (viaje, parada) => {
    if (!confirm('¿Quitar esta parada?')) return;
    try {
      await db.eliminarParada(parada.id);
      if (parada.requisicionId) await db.actualizarRequisicion(parada.requisicionId, { estado: 'lista' });
      // v8.40.0: el retiro vuelve a "sin planificar" — no se pierde el recordatorio
      if (parada.diligenciaId) await db.actualizarDiligencia(parada.diligenciaId, { estado: 'sin_planificar' });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  // v8.40.0: MAPA de diligencias del día — rojo = sin asignar, verde = ya en un viaje.
  const coordsObra = (pid) => { const p = (data.proyectos || []).find(x => x.id === pid); return (p?.ubicacionLat != null && p?.ubicacionLng != null) ? { lat: p.ubicacionLat, lng: p.ubicacionLng } : null; };
  const marcadoresMapa = useMemo(() => {
    const ms = [];
    diligencias.forEach(d => { const c = coordsObra(d.proyectoId); if (c) ms.push({ ...c, color: 'red', label: `Retiro: ${nombreObra(d.proyectoId)}`, popup: `<b>📦 Retiro sin planificar</b><br>${nombreObra(d.proyectoId)}<br><span style="font-size:11px;color:#a1a1aa">${(d.descripcion || '').split('\n').slice(0, 3).join('<br>')}</span>` }); });
    listas.forEach(r => { const c = coordsObra(r.proyectoId); if (c) ms.push({ ...c, color: 'orange', label: `Entrega: ${nombreObra(r.proyectoId)}`, popup: `<b>📦 Lista para envío (sin viaje)</b><br>${nombreObra(r.proyectoId)}` }); });
    viajes.forEach(v => v.paradas.forEach(p => {
      const c = (p.lat != null && p.lng != null) ? { lat: p.lat, lng: p.lng } : coordsObra(p.proyectoId);
      if (c) ms.push({ ...c, color: p.estado === 'completada' ? 'green' : 'blue', label: p.lugar || nombreObra(p.proyectoId), popup: `<b>${p.tipo === 'recogida' ? '↑ Recoger' : '↓ Entregar'}${p.estado === 'completada' ? ' ✓' : ''}</b><br>${p.proyectoId ? nombreObra(p.proyectoId) : (p.lugar || '')}<br><span style="font-size:11px;color:#a1a1aa">${v.choferNombre || v.vehiculo || ''}</span>` });
    }));
    return ms;
  }, [diligencias, listas, viajes, data.proyectos]);
  const MapaDiligencias = useMemo(() => {
    if (!verMapa || marcadoresMapa.length === 0) return null;
    const MapaLeaflet = React.lazy(() => import('../common/MapaLeaflet'));
    const centro = [marcadoresMapa.reduce((s, m) => s + m.lat, 0) / marcadoresMapa.length, marcadoresMapa.reduce((s, m) => s + m.lng, 0) / marcadoresMapa.length];
    // v8.41.0: la RUTA EN ORDEN del viaje seleccionado se dibuja como línea
    const sel = viajes.find(v => v.id === viajeSel);
    const puntos = sel ? sel.paradas.map(p => (p.lat != null && p.lng != null) ? [p.lat, p.lng] : (coordsObra(p.proyectoId) ? [coordsObra(p.proyectoId).lat, coordsObra(p.proyectoId).lng] : null)).filter(Boolean) : [];
    return (
      <React.Suspense fallback={<div className="bg-zinc-950 border border-zinc-800 rounded-card flex items-center justify-center" style={{ height: 320 }}><span className="text-xs text-zinc-500">Cargando mapa…</span></div>}>
        <MapaLeaflet center={centro} zoom={10} height={320} markers={marcadoresMapa} polyline={puntos.length > 1 ? { points: puntos, color: '#22d3ee' } : null} scrollWheelZoom={false} className="border border-zinc-800" />
      </React.Suspense>
    );
  }, [verMapa, marcadoresMapa, viajeSel, viajes]);

  const borrarViaje = async (v) => {
    if (v.paradas.some(p => p.requisicionId)) { alert('Quita primero las requisiciones montadas.'); return; }
    if (!confirm('¿Eliminar este viaje?')) return;
    try { await db.eliminarViaje(v.id); await recargar(); } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  // Horas del día por chofer (para horas extras: jornada estándar de 8h)
  const horasChofer = useMemo(() => viajes.filter(v => v.choferId && v.horaInicio).map(v => {
    const fin = v.horaFin ? new Date(v.horaFin) : null;
    const horasTot = fin ? (fin - new Date(v.horaInicio)) / 3600000 : null;
    return { v, horasTot, extras: horasTot != null ? Math.max(0, horasTot - 8) : null };
  }), [viajes]);

  // v8.38.0: la tarjeta completa del viaje (cabecera + form parada libre + paradas)
  // — inline en móvil, panel sticky en desktop. Mismos handlers, cero lógica nueva.
  const DetalleViaje = ({ v }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold text-sm">{v.tipoEnvio === 'pagado' ? '📮 Envío pagado' : `🚛 ${v.choferNombre || 'Sin chofer'}`}{v.vehiculo ? ` · ${v.vehiculo}` : ''}</div>
          <div className="text-[10px] text-zinc-500">
            {v.estado === 'planificado' ? 'Planificado' : v.estado === 'en_curso' ? `En curso desde ${hora(v.horaInicio)}` : `Completado · ${hora(v.horaInicio)} → ${hora(v.horaFin)}`}
            {' · '}{v.paradas.filter(p => p.estado === 'completada').length}/{v.paradas.length} paradas
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setParadaLibre({ viajeId: v.id, tipo: 'recogida', lugar: '', descripcion: '' })} className="text-[10px] uppercase font-bold border border-zinc-700 hover:border-cyan-500 text-zinc-300 px-2 py-1.5 rounded-card">+ Parada</button>
          {v.estado === 'planificado' && v.paradas.length === 0 && <button onClick={() => borrarViaje(v)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      {paradaLibre?.viajeId === v.id && (
        <div className="bg-zinc-950 border border-cyan-800/50 rounded-card p-2 space-y-1.5">
          <div className="flex items-center justify-between"><span className="text-[10px] uppercase font-bold text-cyan-400">Parada libre</span><button onClick={() => setParadaLibre(null)} className="text-zinc-500"><X className="w-3.5 h-3.5" /></button></div>
          {/* v8.41.0: SUPLIDOR por nombre — si tiene varias locaciones, se elige cuál */}
          {suplidores.length > 0 && (
            <div className="flex gap-1.5">
              <select value={paradaLibre.suplidorId || ''} onChange={e => {
                const sup = suplidores.find(s => s.id === e.target.value);
                if (!sup) { setParadaLibre({ ...paradaLibre, suplidorId: '' }); return; }
                if (sup.locaciones.length === 1) {
                  const l = sup.locaciones[0];
                  setParadaLibre({ ...paradaLibre, suplidorId: sup.id, lugar: `${sup.nombre}${l.nombre && l.nombre !== 'Principal' ? ` — ${l.nombre}` : ''}`, lat: l.lat, lng: l.lng });
                } else {
                  setParadaLibre({ ...paradaLibre, suplidorId: sup.id, lugar: sup.nombre, lat: null, lng: null });
                }
              }} className="flex-1 bg-zinc-900 border border-orange-800/60 rounded-card px-1.5 py-1.5 text-xs text-orange-300 min-w-0">
                <option value="">🏪 Suplidor…</option>
                {suplidores.map(s => <option key={s.id} value={s.id}>{s.nombre}{s.locaciones.length > 1 ? ` (${s.locaciones.length} locaciones)` : ''}</option>)}
              </select>
              {(() => {
                const sup = suplidores.find(s => s.id === paradaLibre.suplidorId);
                return sup && sup.locaciones.length > 1 ? (
                  <select defaultValue="" onChange={e => { const l = sup.locaciones.find(x => x.id === e.target.value); if (l) setParadaLibre({ ...paradaLibre, lugar: `${sup.nombre} — ${l.nombre}`, lat: l.lat, lng: l.lng }); }}
                    className="flex-1 bg-zinc-900 border border-orange-800/60 rounded-card px-1.5 py-1.5 text-xs text-orange-300 min-w-0">
                    <option value="" disabled>¿Cuál locación?</option>
                    {sup.locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                ) : null;
              })()}
            </div>
          )}
          {/* v8.40.0: puertos y almacenes frecuentes → autollena nombre y coordenadas */}
          {lugares.length > 0 && (
            <select defaultValue="" onChange={e => { const l = lugares.find(x => x.id === e.target.value); if (l) setParadaLibre({ ...paradaLibre, suplidorId: '', lugar: l.nombre, lat: l.lat, lng: l.lng }); e.target.value = ''; }}
              className="w-full bg-zinc-900 border border-cyan-800/60 rounded-card px-1.5 py-1.5 text-xs text-cyan-300">
              <option value="" disabled>📍 Puerto / almacén frecuente…</option>
              {Object.entries(TIPOS_LUGAR).filter(([t]) => t !== 'suplidor').map(([t, label]) => {
                const del = lugares.filter(l => l.tipo === t);
                return del.length ? <optgroup key={t} label={label}>{del.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}</optgroup> : null;
              })}
            </select>
          )}
          <div className="flex gap-1.5 flex-wrap">
            <select value={paradaLibre.tipo} onChange={e => setParadaLibre({ ...paradaLibre, tipo: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-card px-1.5 py-1.5 text-xs">
              <option value="recogida">Recoger en</option>
              <option value="entrega">Entregar en</option>
            </select>
            <input value={paradaLibre.lugar} onChange={e => setParadaLibre({ ...paradaLibre, lugar: e.target.value, lat: null, lng: null })} placeholder="Puerto / almacén fiscal / suplidor / obra…" className="flex-1 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs min-w-[140px]" />
            {paradaLibre.lat != null && <span className="text-[10px] text-green-400 self-center" title={`${paradaLibre.lat}, ${paradaLibre.lng}`}>📍 con ubicación</span>}
          </div>
          <input value={paradaLibre.descripcion} onChange={e => setParadaLibre({ ...paradaLibre, descripcion: e.target.value })} placeholder="Qué (ej. contenedor MSKU123, 40 sacos)" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs" />
          <button onClick={agregarLibre} className="w-full bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-black uppercase py-2 rounded-card">Agregar al viaje</button>
        </div>
      )}

      <div className="space-y-1">
        {v.paradas.map((p, i) => (
          <div key={p.id} className={`bg-zinc-950 border rounded-card px-2 py-1.5 flex items-center gap-2 ${p.estado === 'completada' ? 'border-green-900/50' : 'border-zinc-800'}`}>
            <span className="text-[10px] font-black text-zinc-600 w-4 text-center shrink-0">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-bold truncate ${p.estado === 'completada' ? 'text-green-400' : ''}`}>
                {p.tipo === 'recogida' ? '↑ Recoger' : '↓ Entregar'} · {p.proyectoId ? nombreObra(p.proyectoId) : p.lugar}
                {p.estado === 'completada' && ` ✓ ${hora(p.completadaAt)}`}
              </div>
              {p.descripcion && <div className="text-[10px] text-zinc-500 truncate">{p.descripcion}</div>}
            </div>
            {v.estado !== 'completado' && p.estado !== 'completada' && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => mover(v, p, -1)} className="text-zinc-600 hover:text-white"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => mover(v, p, 1)} className="text-zinc-600 hover:text-white"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => quitarParada(v, p)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </div>
        ))}
        {v.paradas.length === 0 && <div className="text-[11px] text-zinc-600 italic">Sin paradas — monta requisiciones listas o agrega una parada libre.</div>}
      </div>
    </div>
  );

  const vSel = viajes.find(v => v.id === viajeSel);

  return (
    <div className="p-4 md:p-6 max-w-4xl lg:max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Truck className="w-6 h-6 text-cyan-400" /> Rutas</h1>
            <div className="text-[11px] text-zinc-500">Viajes de camiones y envíos · almacén ↔ obras ↔ puertos/fiscales</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVerMapa(!verMapa)} className={`text-[10px] font-black uppercase px-2.5 py-2 rounded-card border ${verMapa ? 'bg-cyan-700 border-cyan-700 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>🗺 Mapa</button>
          <button onClick={() => setGestionLugares(true)} className="text-[10px] font-black uppercase px-2.5 py-2 rounded-card border border-zinc-700 text-zinc-400 hover:text-white" title="Suplidores, puertos y almacenes con su ubicación"><MapPin className="w-3.5 h-3.5 inline -mt-0.5" /> Lugares</button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-sm" />
          <button onClick={recargar} className="text-zinc-500 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <div className="lg:flex lg:gap-5 lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {/* v8.40.0: mapa de diligencias — rojo sin asignar · naranja lista sin viaje · azul en viaje · verde completada */}
          {verMapa && (
            <div className="space-y-1.5">
              {marcadoresMapa.length === 0 ? (
                <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-card p-4 text-center text-xs text-zinc-600">Nada que ubicar hoy (las obras necesitan GPS en su ficha para salir aquí).</div>
              ) : MapaDiligencias}
              <div className="text-[10px] text-zinc-500 flex gap-3 flex-wrap">
                <span>🔴 Retiro sin planificar</span><span>🟠 Lista sin viaje</span><span>🔵 En viaje</span><span>🟢 Completada</span>
              </div>
            </div>
          )}

          {/* v8.40.0: retiros de material sobrante — el recordatorio vive aquí hasta montarse */}
          {diligencias.length > 0 && (
            <div className="bg-zinc-900 border border-red-800/50 rounded-card p-3">
              <div className="text-[11px] tracking-widest uppercase text-red-400 font-bold mb-1.5">📦 Retiros de sobrante sin planificar ({diligencias.length})</div>
              <div className="space-y-1.5">
                {diligencias.map(d => (
                  <div key={d.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-2 flex items-start gap-2.5">
                    {d.fotoUrl && <a href={d.fotoUrl} target="_blank" rel="noreferrer" className="shrink-0"><img src={d.fotoUrl} alt="" className="w-10 h-10 object-cover rounded-card border border-zinc-800" /></a>}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{nombreObra(d.proyectoId)}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{(d.descripcion || '').split('\n').join(' · ')}</div>
                      <div className="text-[10px] text-zinc-600">{formatFechaCorta((d.createdAt || '').slice(0, 10))} · {d.creadoPorNombre}</div>
                    </div>
                    {viajes.length > 0 && (
                      <select defaultValue="" onChange={e => { const v = viajes.find(x => x.id === e.target.value); if (v) montarDiligencia(v, d); e.target.value = ''; }}
                        className="bg-zinc-900 border border-zinc-700 rounded-card px-1.5 py-1.5 text-[11px] shrink-0">
                        <option value="" disabled>Recoger en…</option>
                        {viajes.map(v => <option key={v.id} value={v.id}>{v.choferNombre || v.vehiculo || v.id}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Requisiciones listas esperando viaje */}
          <div className="bg-zinc-900 border border-purple-800/50 rounded-card p-3">
            <div className="text-[11px] tracking-widest uppercase text-purple-400 font-bold mb-1.5">📦 Listas para envío sin viaje ({listas.length})</div>
            {listas.length === 0 ? <div className="text-xs text-zinc-500">Nada esperando.</div> : (
              <div className="space-y-1.5">
                {listas.map(r => (
                  <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{nombreObra(r.proyectoId)} {r.urgente && '🔥'}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{r.items.map(i => i.descripcion).join(', ')}</div>
                    </div>
                    {viajes.length > 0 && (
                      <select defaultValue="" onChange={e => { const v = viajes.find(x => x.id === e.target.value); if (v) montarRequisicion(v, r); e.target.value = ''; }}
                        className="bg-zinc-900 border border-zinc-700 rounded-card px-1.5 py-1.5 text-[11px] shrink-0">
                        <option value="" disabled>Montar en…</option>
                        {viajes.map(v => <option key={v.id} value={v.id}>{v.choferNombre || v.vehiculo || v.id}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* v8.40.0: aviso — lo que viene en camino del almacén (para anticipar el camión) */}
          {enAlmacen.length > 0 && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-card px-3 py-2">
              <button onClick={() => setVerEnAlmacen(!verEnAlmacen)} className="w-full flex items-center justify-between text-left">
                <span className="text-[11px] font-bold text-amber-400">🔔 En preparación en almacén: {enAlmacen.length} pedido{enAlmacen.length !== 1 ? 's' : ''} — llegarán aquí al estar listos</span>
                <span className="text-zinc-600 text-xs">{verEnAlmacen ? '▲' : '▼'}</span>
              </button>
              {verEnAlmacen && (
                <div className="mt-1.5 space-y-1">
                  {enAlmacen.map(r => (
                    <div key={r.id} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <span className={r.estado === 'preparando' ? 'text-blue-400' : 'text-amber-500'}>{r.estado === 'preparando' ? '🔧' : '📥'}</span>
                      <span className="truncate">{nombreObra(r.proyectoId)}{r.urgente ? ' 🔥' : ''} — {r.items.filter(i => i.despachado).length}/{r.items.length} despachados</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Viajes del día — móvil: tarjeta completa; desktop: fila que abre el panel */}
          {viajes.map(v => (
            <React.Fragment key={v.id}>
              <div className="lg:hidden"><DetalleViaje v={v} /></div>
              <button onClick={() => setViajeSel(v.id)}
                className={`hidden lg:flex w-full items-center gap-2.5 px-3 py-2.5 rounded-card border bg-zinc-900 text-left ${viajeSel === v.id ? 'border-cyan-500 bg-zinc-800/70' : 'border-zinc-800 hover:border-zinc-600'}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{v.tipoEnvio === 'pagado' ? '📮 Envío pagado' : `🚛 ${v.choferNombre || 'Sin chofer'}`}{v.vehiculo ? ` · ${v.vehiculo}` : ''}</div>
                  <div className="text-[10px] text-zinc-500">
                    {v.estado === 'planificado' ? 'Planificado' : v.estado === 'en_curso' ? `En curso desde ${hora(v.horaInicio)}` : `Completado · ${hora(v.horaInicio)} → ${hora(v.horaFin)}`}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-bold ${v.paradas.length > 0 && v.paradas.every(p => p.estado === 'completada') ? 'text-green-400' : 'text-zinc-400'}`}>📍 {v.paradas.filter(p => p.estado === 'completada').length}/{v.paradas.length}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 -rotate-90 ${viajeSel === v.id ? 'text-cyan-400' : 'text-zinc-600'}`} />
              </button>
            </React.Fragment>
          ))}

          {/* Crear viaje */}
          {!creando ? (
            <button onClick={() => setCreando(true)} className="w-full bg-cyan-700 hover:bg-cyan-600 text-white font-black uppercase py-2.5 text-xs flex items-center justify-center gap-1.5 rounded-card">
              <Plus className="w-3.5 h-3.5" /> Nuevo viaje / envío del {formatFechaCorta(fecha)}
            </button>
          ) : (
            <div className="bg-zinc-900 border-2 border-cyan-700 rounded-card p-3 space-y-2">
              <div className="flex items-center justify-between"><span className="text-[11px] uppercase font-bold text-cyan-400">Nuevo viaje</span><button onClick={() => setCreando(false)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
              {/* v8.41.0: PRIMERO el vehículo REAL de la flota (acumula su historial de
                  rutas); al elegirlo se sugiere el chofer responsable del camión. */}
              {nuevo.tipoEnvio === 'camion' && (
                <select value={nuevo.vehiculoId || ''} onChange={e => {
                  const v = (data.vehiculos || []).find(x => x.id === e.target.value);
                  const resp = v ? (data.personal || []).find(p => p.id === v.responsableId && (p.roles || []).includes('chofer')) : null;
                  setNuevo({
                    ...nuevo, vehiculoId: v?.id || '',
                    vehiculo: v ? `${v.marca || ''} ${v.modelo || ''}${v.placa ? ` · ${v.placa}` : ''}`.trim() : '',
                    ...(resp ? { choferId: resp.id } : {}),
                  });
                }} className="w-full bg-zinc-950 border-2 border-cyan-700 rounded-card px-2 py-2.5 text-sm font-bold">
                  <option value="">🚛 Elegir vehículo de la flota…</option>
                  {(data.vehiculos || []).filter(v => v.activo !== false).map(v => <option key={v.id} value={v.id}>{[v.marca, v.modelo, v.placa].filter(Boolean).join(' ')}</option>)}
                </select>
              )}
              <div className="flex gap-1.5 flex-wrap">
                <select value={nuevo.tipoEnvio} onChange={e => setNuevo({ ...nuevo, tipoEnvio: e.target.value })} className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm">
                  <option value="camion">Camión propio</option>
                  <option value="pagado">Envío pagado</option>
                </select>
                {nuevo.tipoEnvio === 'camion' && (
                  <select value={nuevo.choferId} onChange={e => setNuevo({ ...nuevo, choferId: e.target.value })} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm min-w-[140px]">
                    <option value="">Chofer… {choferes.length === 0 ? '(asigna el rol Chofer en Personal)' : ''}</option>
                    {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                )}
                {(nuevo.tipoEnvio === 'pagado' || !nuevo.vehiculoId) && (
                  <input value={nuevo.vehiculo} onChange={e => setNuevo({ ...nuevo, vehiculo: e.target.value, vehiculoId: '' })} placeholder={nuevo.tipoEnvio === 'pagado' ? 'Mensajería / quién lleva' : 'U otro camión (texto libre)'} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm min-w-[140px]" />
                )}
              </div>
              <button onClick={crearViaje} className="w-full bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-black uppercase py-2.5 rounded-card">Crear viaje</button>
            </div>
          )}

          {/* Horas de choferes del día */}
          {horasChofer.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">⏱ Jornada de choferes · {formatFechaCorta(fecha)} (extras sobre 8h)</div>
              {horasChofer.map(({ v, horasTot, extras }) => (
                <div key={v.id} className="flex items-center justify-between text-xs border-t border-zinc-800 py-1.5">
                  <span className="font-bold">{v.choferNombre}</span>
                  <span className="text-zinc-400">{hora(v.horaInicio)} → {hora(v.horaFin)}</span>
                  <span className="text-zinc-300 font-variant-numeric tabular-nums">{horasTot != null ? horasTot.toFixed(1) + ' h' : 'en curso'}</span>
                  <span className={`font-bold ${extras > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>{extras != null ? (extras > 0 ? `+${extras.toFixed(1)} h extra` : 'sin extras') : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Detalle del viaje (derecha, solo desktop) ===== */}
        <aside className="hidden lg:block w-[420px] xl:w-[460px] shrink-0">
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            {vSel ? (
              <DetalleViaje v={vSel} />
            ) : (
              <div className="bg-zinc-950/50 border border-dashed border-zinc-800 rounded-card p-6 text-center text-xs text-zinc-600">
                Crea o elige un viaje del día para armar su ruta aquí.
              </div>
            )}
          </div>
        </aside>
        </div>
      )}

      {gestionLugares && <ModalLugares lugares={lugares} suplidores={suplidores} onCerrar={() => setGestionLugares(false)} onCambio={recargar} />}
    </div>
  );
}

// v8.40.0: gestor de LUGARES FRECUENTES — puertos y almacenes con su ubicación.
// v8.41.0: + SUPLIDORES como entidad (espejo de Odoo) con una o VARIAS locaciones.
function ModalLugares({ lugares, suplidores = [], onCerrar, onCambio }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('puerto');
  const [ubic, setUbic] = useState('');
  const [guardando, setGuardando] = useState(false);
  const coords = parseCoords(ubic);
  // Suplidores
  const [supNombre, setSupNombre] = useState('');
  const [supRnc, setSupRnc] = useState('');
  const [supUbic, setSupUbic] = useState('');
  const [supGuardando, setSupGuardando] = useState(false);
  const [locDe, setLocDe] = useState(null);      // suplidor al que se agrega locación
  const [locNombre, setLocNombre] = useState('');
  const [locUbic, setLocUbic] = useState('');
  const [vinculando, setVinculando] = useState(null);

  const crearSup = async () => {
    if (!supNombre.trim()) { alert('Escribe el nombre del suplidor.'); return; }
    const c = parseCoords(supUbic);
    if (supUbic.trim() && !c) { alert('No entendí la ubicación — pega el link de Google Maps o "lat, lng".'); return; }
    setSupGuardando(true);
    try {
      const id = await db.crearSuplidor({ nombre: supNombre.trim(), rnc: supRnc.replace(/\D/g, '') || null });
      await db.crearLocacionSuplidor({ suplidorId: id, nombre: 'Principal', lat: c?.lat ?? null, lng: c?.lng ?? null });
      setSupNombre(''); setSupRnc(''); setSupUbic('');
      await onCambio();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setSupGuardando(false);
  };
  const agregarLoc = async (sup) => {
    if (!locNombre.trim()) { alert('Nombre de la locación (ej. "Suc. 27 de Febrero").'); return; }
    const c = parseCoords(locUbic);
    if (locUbic.trim() && !c) { alert('Ubicación no entendida — link de Maps o "lat, lng".'); return; }
    try {
      await db.crearLocacionSuplidor({ suplidorId: sup.id, nombre: locNombre.trim(), lat: c?.lat ?? null, lng: c?.lng ?? null });
      setLocDe(null); setLocNombre(''); setLocUbic('');
      await onCambio();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  // Vincular con Odoo: busca por RNC (si hay) o nombre, y alinea el nombre al de Odoo.
  const vincularOdoo = async (sup) => {
    setVinculando(sup.id);
    try {
      const res = await fetch(`/api/odoo/buscar-suplidores?q=${encodeURIComponent(sup.rnc || sup.nombre)}`);
      const d = await res.json();
      const m = (d.resultados || [])[0];
      if (!m) { alert(`No encontré "${sup.rnc || sup.nombre}" en Odoo. Créalo allá primero (con su RNC) o revisa el nombre.`); }
      else if (confirm(`Odoo: "${m.name}"${m.vat ? ` · RNC ${m.vat}` : ''}\n¿Vincular este suplidor? (el nombre del ERP se alinea al de Odoo)`)) {
        await db.actualizarSuplidor(sup.id, { nombre: m.name, rnc: (m.vat || '').replace(/\D/g, '') || sup.rnc, odooPartnerId: m.id });
        await onCambio();
      }
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setVinculando(null);
  };
  const crear = async () => {
    if (!nombre.trim()) { alert('Escribe el nombre del lugar.'); return; }
    if (ubic.trim() && !coords) { alert('No entendí la ubicación. Pega el link de Google Maps (con @lat,lng) o escribe "lat, lng".'); return; }
    setGuardando(true);
    try {
      await db.crearLugarLogistico({ tipo, nombre: nombre.trim(), lat: coords?.lat ?? null, lng: coords?.lng ?? null });
      setNombre(''); setUbic('');
      await onCambio();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setGuardando(false);
  };
  const eliminar = async (l) => {
    if (!confirm(`¿Quitar "${l.nombre}" de los lugares frecuentes?`)) return;
    try { await db.eliminarLugarLogistico(l.id); await onCambio(); } catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-cyan-700 rounded-card max-w-md w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-cyan-400 font-bold">📍 Lugares frecuentes</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Suplidores, puertos y almacenes con su ubicación — la parada se autollena y la ruta se carga de una vez.</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {/* ===== v8.41.0: SUPLIDORES (espejo de Odoo, con locaciones) ===== */}
        <div className="border border-orange-800/50 rounded-card p-2.5 space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-orange-400 font-bold">🏪 Suplidores</div>
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <input value={supNombre} onChange={e => setSupNombre(e.target.value)} placeholder="Nombre del suplidor" className="flex-1 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs min-w-0" />
              <input value={supRnc} onChange={e => setSupRnc(e.target.value)} placeholder="RNC (opcional)" className="w-28 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
            </div>
            <input value={supUbic} onChange={e => setSupUbic(e.target.value)} placeholder="Ubicación principal: link de Google Maps o lat, lng" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
            <button onClick={crearSup} disabled={supGuardando || !supNombre.trim()} className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-black text-[10px] font-black uppercase py-2 rounded-card">{supGuardando ? '…' : '+ Crear suplidor'}</button>
          </div>
          <div className="space-y-1">
            {suplidores.map(s => (
              <div key={s.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">{s.nombre} {s.odooPartnerId && <span className="text-[9px] font-black text-green-400 align-middle" title={`Vinculado a Odoo (#${s.odooPartnerId})`}>✓ Odoo</span>}</div>
                    <div className="text-[10px] text-zinc-600">{s.rnc ? `RNC ${s.rnc} · ` : ''}{s.locaciones.length} locación{s.locaciones.length !== 1 ? 'es' : ''}</div>
                  </div>
                  {!s.odooPartnerId && <button onClick={() => vincularOdoo(s)} disabled={vinculando === s.id} className="shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded-card border border-zinc-700 text-zinc-400 hover:border-green-600 hover:text-green-400">{vinculando === s.id ? '…' : '🔗 Odoo'}</button>}
                  <button onClick={() => { setLocDe(locDe === s.id ? null : s.id); setLocNombre(''); setLocUbic(''); }} className="shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded-card border border-zinc-700 text-zinc-400 hover:border-orange-500">+ Locación</button>
                </div>
                <div className="mt-1 space-y-0.5">
                  {s.locaciones.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-[10px] text-zinc-500 pl-1">
                      <span className="min-w-0 flex-1 truncate">📍 {l.nombre}{l.lat != null ? ` · ${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : ' · sin coordenadas'}</span>
                      {s.locaciones.length > 1 && <button onClick={async () => { if (confirm(`¿Quitar la locación "${l.nombre}"?`)) { await db.eliminarLocacionSuplidor(l.id); await onCambio(); } }} className="text-zinc-700 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}
                    </div>
                  ))}
                </div>
                {locDe === s.id && (
                  <div className="mt-1.5 space-y-1">
                    <input value={locNombre} onChange={e => setLocNombre(e.target.value)} placeholder='Nombre (ej. "Suc. 27 de Febrero")' className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs" />
                    <input value={locUbic} onChange={e => setLocUbic(e.target.value)} placeholder="Link de Google Maps o lat, lng" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs" />
                    <button onClick={() => agregarLoc(s)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-black uppercase py-1.5 rounded-card">Guardar locación</button>
                  </div>
                )}
              </div>
            ))}
            {suplidores.length === 0 && <div className="text-[10px] text-zinc-600 italic">Sin suplidores todavía — créalos aquí y vincúlalos a Odoo.</div>}
          </div>
        </div>

        {/* ===== Puertos y almacenes ===== */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2.5 space-y-1.5">
          <div className="flex gap-1.5">
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-card px-1.5 py-2 text-xs">
              <option value="puerto">⚓ Puerto</option>
              <option value="almacen_fiscal">🏛 Almacén fiscal</option>
              <option value="almacen">🏭 Almacén propio</option>
              <option value="otro">📍 Otro</option>
            </select>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre (ej. Ferretería Ochoa)" className="flex-1 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs min-w-0" />
          </div>
          <input value={ubic} onChange={e => setUbic(e.target.value)} placeholder="Pega el link de Google Maps o lat, lng" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
          {ubic.trim() && (coords
            ? <div className="text-[10px] text-green-400">📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} ✓</div>
            : <div className="text-[10px] text-amber-400">Aún no leo coordenadas — el link debe traer @lat,lng (ábrelo en el navegador y copia la URL completa).</div>)}
          <button onClick={crear} disabled={guardando || !nombre.trim()} className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-[10px] font-black uppercase py-2 rounded-card">
            {guardando ? '…' : '+ Guardar lugar'}
          </button>
        </div>
        <div className="space-y-1">
          {lugares.length === 0 && <div className="text-[11px] text-zinc-600 italic">Sin lugares todavía.</div>}
          {Object.entries(TIPOS_LUGAR).map(([t, label]) => {
            const del = lugares.filter(l => l.tipo === t);
            if (!del.length) return null;
            return (
              <div key={t}>
                <div className="text-[10px] tracking-widest uppercase text-zinc-600 font-bold mt-2 mb-1">{label}</div>
                {del.map(l => (
                  <div key={l.id} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-1.5 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{l.nombre}</div>
                      <div className="text-[10px] text-zinc-600">{l.lat != null ? `📍 ${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : 'sin ubicación'}</div>
                    </div>
                    <button onClick={() => eliminar(l)} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
