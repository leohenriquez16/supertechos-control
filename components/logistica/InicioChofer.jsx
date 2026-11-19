'use client';

// v8.29.0: Home del CHOFER — su ruta del día en el teléfono.
// Rediseño (rutas-chofer): pensado para el dedo y para manejar.
//  - Arriba: "Iniciar jornada" grande (sigue obligatorio para marcar paradas).
//  - La SIGUIENTE parada pendiente sale resaltada, con [Waze] [Google Maps] [✓ Finalizado].
//  - "Abrir toda la ruta en Google Maps" (por tramos de 9 si son muchas).
//  - Finalizado guarda quién la marcó (chofer) y dónde estaba el celular.
//    Entregas a obra: solo la FOTO es obligatoria; firma y nombre opcionales.
//  - Las que marcó el GPS o la oficina dicen "✓ GPS 10:38" / "✓ Oficina".
//  - También: viajes de días anteriores sin cerrar y lo de mañana (solo lectura).
//    Los viajes viejos NO se inician ni se terminan (dañaría las horas extras):
//    se marcan sus paradas y se usa "Cerrar viaje" (solo cambia el estado).
//  - Entrega a obra marcada por el GPS o la oficina sin foto: "📷 Agregar foto de
//    entrega" guarda solo la prueba, sin cambiar el estado ni quién la marcó.
//  - Se refresca solo al volver a la app.

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, Truck, Play, Flag, RefreshCw, CheckCircle2, Camera, X, Lock, AlertTriangle, CalendarDays, FileText, ChevronDown, ChevronUp, Archive } from 'lucide-react';
import * as db from '../../lib/db';
import { comprimirImagenABlob } from '../../lib/imports';
import { obtenerUbicacion } from '../../lib/geo';
import { urlWaze, urlGoogleDestino, tramosRuta, rotuloTramo } from '../../lib/helpers/navegacion';
import { viajesViejosSinCerrar } from '../../lib/helpers/rutas';
import { esHecha, esCancelada, esEntregaObra, puedeMarcarParadas, faltaFotoEntrega, camposSoloFoto, textoTipoParada, escHtml } from '../../lib/helpers/rutasChofer';
import { fetchConSesion } from '../../lib/fetchConSesion';
import FirmaPad, { firmaABlob } from '../common/FirmaPad';
import ModalBombas from '../vehiculos/ModalBombas'; // v8.51.1: bombas de la tarjeta flotilla

const MapaLeaflet = React.lazy(() => import('../common/MapaLeaflet'));

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const sumarDias = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
const fechaCorta = (ymd) => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
const DIAS_ATRAS = 60; // viajes viejos sin cerrar que todavía se le muestran al chofer

// Quién marcó la parada: GPS, oficina o el chofer.
function marcaCompletada(p) {
  const h = hora(p.completadaAt || p.llegadaGpsAt);
  if (p.completadaPor === 'gps') return `✓ GPS ${h}`.trim();
  if (p.completadaPor === 'oficina' || (!p.completadaPor && /desde oficina/i.test(p.notas || ''))) return `✓ Oficina ${h}`.trim();
  return `✓ Hecha ${h}`.trim();
}

function tipoParada(p) {
  const txt = textoTipoParada(p.tipo);
  if (p.tipo === 'recogida') return { txt, cls: 'bg-amber-600/20 text-amber-400 border-amber-700/60' };
  if (p.tipo === 'entrega') return { txt, cls: 'bg-cyan-600/20 text-cyan-400 border-cyan-700/60' };
  return { txt, cls: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
}

// onViajes(lista): avisa a quien la embebe (TarjetaRutaHoy) cada vez que se recarga,
// para que su resumen "N paradas · X hechas" no se quede viejo.
export default function InicioChofer({ usuario, data, embebido = false, onViajes }) {
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [confirmando, setConfirmando] = useState(null); // id de parada esperando "Sí, finalizada"
  const [mapaDe, setMapaDe] = useState(null); // v8.41.0: viaje cuyo mapa de ruta se muestra
  const [entregando, setEntregando] = useState(null); // v8.42.0: {v,p,soloFoto} entrega a obra confirmándose (foto)
  const [gpsUnidades, setGpsUnidades] = useState([]); // v8.43.0
  const [verBombas, setVerBombas] = useState(false); // v8.51.1
  const [verViejos, setVerViejos] = useState(null); // null = automático

  const onViajesRef = useRef(onViajes);
  onViajesRef.current = onViajes;

  const cargar = useCallback(async ({ silencioso } = {}) => {
    if (silencioso) setRefrescando(true); else setLoading(true);
    try {
      const hoy = hoyRD();
      const lista = await db.listarViajes({ desde: sumarDias(hoy, -DIAS_ATRAS), hasta: sumarDias(hoy, 1), choferId: usuario.id });
      // v8.68.0: un viaje cancelado desde la oficina ya no le sale al chofer
      const activos = lista.filter(v => v.estado !== 'cancelado');
      setViajes(activos);
      setError(null);
      try { onViajesRef.current?.(activos); } catch (e) { /* solo informativo */ }
    } catch (e) {
      console.warn('InicioChofer:', e?.message);
      setError('No se pudo cargar tu ruta. Revisa la señal y toca Refrescar.');
    }
    setLoading(false); setRefrescando(false);
  }, [usuario.id]);

  useEffect(() => { cargar(); }, [cargar]);
  // Al volver a la app (desbloquear el celular, salir de Waze) se refresca sola.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') cargar({ silencioso: true }); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);
  // v8.43.0: posición en vivo del camión (si el vehículo del viaje tiene unidad GPS).
  // Solo cuando se abre el mapa (no en cada montaje) y con sesión (la ruta la exige).
  const mapaAbierto = mapaDe != null;
  useEffect(() => {
    if (!mapaAbierto) return;
    let vivo = true;
    fetchConSesion('/api/gps/posiciones').then(r => r.ok ? r.json() : { dispositivos: [] })
      .then(d => { if (vivo) setGpsUnidades(d.dispositivos || []); }).catch(() => {});
    return () => { vivo = false; };
  }, [mapaAbierto]);

  const proyecto = (pid) => (data?.proyectos || []).find(x => x.id === pid);
  const nombreObra = (pid) => { const p = proyecto(pid); return p ? ([p.referenciaOdoo, p.cliente || p.nombre].filter(Boolean).join(' · ') || pid) : pid; }; // v8.49.2
  const lugarParada = (p) => p.proyectoId ? nombreObra(p.proyectoId) : (p.lugar || 'Sin lugar');
  const coordsParada = (p) => {
    if (p.lat != null && p.lng != null) return { lat: Number(p.lat), lng: Number(p.lng) };
    const pr = proyecto(p.proyectoId);
    return (pr?.ubicacionLat != null && pr?.ubicacionLng != null) ? { lat: Number(pr.ubicacionLat), lng: Number(pr.ubicacionLng) } : null;
  };

  // --- Acciones ---
  const iniciar = async (v) => {
    setProcesando(v.id);
    try {
      await db.actualizarViaje(v.id, { estado: 'en_curso', horaInicio: new Date().toISOString() });
      // las requisiciones montadas pasan a "en ruta" — la obra lo ve al instante
      for (const p of v.paradas.filter(x => x.requisicionId && !esCancelada(x) && !esHecha(x))) {
        try { await db.actualizarRequisicion(p.requisicionId, { estado: 'en_ruta' }); } catch (e) { /* no bloquear */ }
      }
      await cargar({ silencioso: true });
    } catch (e) { alert('No se pudo iniciar: ' + (e?.message || e)); }
    setProcesando(null);
  };

  const tocarFinalizado = (v, p, marcable) => {
    if (!marcable) return;
    if (esEntregaObra(p)) { setEntregando({ v, p }); return; } // la foto es la confirmación
    setConfirmando(p.id);
  };

  // Recogidas y paradas libres: un toque + confirmar. Guarda dónde estaba el celular
  // (si no da ubicación, se guarda igual).
  const finalizarSimple = async (v, p) => {
    setConfirmando(null); setProcesando(p.id);
    try {
      const pos = await obtenerUbicacion({ timeout: 6000 });
      const campos = { estado: 'completada', completadaPor: 'chofer' };
      if (pos) { campos.completadaLat = pos.lat; campos.completadaLng = pos.lng; }
      await db.actualizarParada(p.id, campos);
      await cargar({ silencioso: true });
    } catch (e) { alert('No se pudo guardar: ' + (e?.message || e)); }
    setProcesando(null);
  };

  const confirmarEntrega = async ({ p, fotoFile, firmaBlob, recibidoPor, soloFoto }) => {
    setProcesando(p.id);
    try {
      if (soloFoto) {
        // Parada ya completada (GPS/oficina): solo se agrega la prueba. No cambia
        // el estado, ni quién la marcó, ni la hora, ni la requisición.
        const fotoBlob = await comprimirImagenABlob(fotoFile);
        const fotoUrl = await db.subirEntregaParada(fotoBlob, p.id, 'foto');
        const firmaUrl = firmaBlob ? await db.subirEntregaParada(firmaBlob, p.id, 'firma') : null;
        await db.actualizarParada(p.id, camposSoloFoto({ fotoUrl, firmaUrl, recibidoPor }));
        setEntregando(null);
        await cargar({ silencioso: true });
        setProcesando(null);
        return;
      }
      const posP = obtenerUbicacion({ timeout: 6000 });
      const fotoBlob = await comprimirImagenABlob(fotoFile);
      const fotoUrl = await db.subirEntregaParada(fotoBlob, p.id, 'foto');
      const firmaUrl = firmaBlob ? await db.subirEntregaParada(firmaBlob, p.id, 'firma') : null;
      const pos = await posP;
      const campos = { estado: 'completada', completadaPor: 'chofer', entregaFotoUrl: fotoUrl };
      if (firmaUrl) campos.entregaFirmaUrl = firmaUrl;
      if (recibidoPor) campos.recibidoPorNombre = recibidoPor;
      if (pos) { campos.completadaLat = pos.lat; campos.completadaLng = pos.lng; }
      await db.actualizarParada(p.id, campos);
      if (p.requisicionId) { try { await db.actualizarRequisicion(p.requisicionId, { estado: 'entregada' }); } catch (e) { /* */ } }
      setEntregando(null);
      await cargar({ silencioso: true });
    } catch (e) { alert('No se pudo guardar la entrega: ' + (e?.message || e)); }
    setProcesando(null);
  };

  const terminar = async (v) => {
    const faltan = v.paradas.filter(p => !esHecha(p) && !esCancelada(p)).length;
    if (faltan > 0 && !confirm(`Te quedan ${faltan} parada${faltan !== 1 ? 's' : ''} sin marcar. ¿Terminar la jornada igual?`)) return;
    setProcesando(v.id);
    try {
      await db.actualizarViaje(v.id, { estado: 'completado', horaFin: new Date().toISOString() });
      await cargar({ silencioso: true });
    } catch (e) { alert('No se pudo terminar: ' + (e?.message || e)); }
    setProcesando(null);
  };

  // Viaje de un día anterior que quedó abierto: solo se cierra (estado 'completado').
  // No se tocan horaInicio ni horaFin: poner la hora de hoy inflaría las horas extras.
  const cerrarViejo = async (v) => {
    const faltan = v.paradas.filter(p => !esHecha(p) && !esCancelada(p)).length;
    const msg = faltan > 0
      ? `Este viaje tiene ${faltan} parada${faltan !== 1 ? 's' : ''} sin marcar. ¿Cerrarlo igual? Avísale a la oficina lo que no se hizo.`
      : '¿Cerrar este viaje?';
    if (!confirm(msg)) return;
    setProcesando(v.id);
    try {
      await db.actualizarViaje(v.id, { estado: 'completado' });
      await cargar({ silencioso: true });
    } catch (e) { alert('No se pudo cerrar: ' + (e?.message || e)); }
    setProcesando(null);
  };

  // --- Piezas ---
  const mapaRuta = (v, activas) => {
    const conCoords = activas.map((p, i) => ({ p, i, c: coordsParada(p) })).filter(x => x.c);
    if (conCoords.length === 0) return <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-card p-4 text-center text-xs text-zinc-500">Las paradas de este viaje no tienen ubicación.</div>;
    const markers = conCoords.map(({ p, i, c }) => ({
      ...c, numero: i + 1, color: esHecha(p) ? 'green' : 'blue',
      label: `${i + 1}. ${lugarParada(p)}`,
      popup: `<b>${i + 1}. ${escHtml(tipoParada(p).txt)}</b><br>${escHtml(lugarParada(p))}${p.descripcion ? `<br><span style="font-size:11px;color:#a1a1aa">${escHtml(p.descripcion)}</span>` : ''}`,
    }));
    // v8.43.0: "tú estás aquí" — el camión del viaje en vivo
    const veh = (data?.vehiculos || []).find(x => x.id === v.vehiculoId);
    const unidad = veh?.gpsDeviceId ? gpsUnidades.find(u => String(u.id) === String(veh.gpsDeviceId)) : null;
    if (unidad && unidad.lat != null) markers.push({ lat: unidad.lat, lng: unidad.lng, vehiculoTipo: veh?.tipo || 'camion', color: 'purple', label: '🛰 Tu camión', popup: `<b>🛰 Tu camión</b><br>${escHtml(unidad.velocidad)} km/h · ${escHtml(unidad.hora || '')}` });
    return (
      <React.Suspense fallback={<div className="bg-zinc-950 border border-zinc-800 rounded-card flex items-center justify-center" style={{ height: 280 }}><span className="text-xs text-zinc-500">Cargando mapa…</span></div>}>
        <MapaLeaflet center={[markers[0].lat, markers[0].lng]} zoom={11} height={280} markers={markers}
          polyline={markers.length > 1 ? { points: conCoords.map(x => [x.c.lat, x.c.lng]), color: '#22d3ee' } : null}
          scrollWheelZoom={false} className="border border-zinc-800" />
        {conCoords.length < activas.length && <div className="text-[11px] text-zinc-500 mt-1">{activas.length - conCoords.length} parada(s) sin ubicación no salen en el mapa.</div>}
      </React.Suspense>
    );
  };

  const botonesNavegar = (c, grande) => {
    const alto = grande ? 'h-14 text-sm' : 'h-12 text-xs';
    if (!c) return <div className={`${alto} rounded-card border border-dashed border-zinc-700 text-zinc-500 font-bold flex items-center justify-center`}>Sin ubicación · pregúntale a la oficina</div>;
    return (
      <div className="grid grid-cols-2 gap-2">
        <a href={urlWaze(c.lat, c.lng)} target="_blank" rel="noreferrer"
          className={`${alto} rounded-card bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-black uppercase flex items-center justify-center gap-1.5`}>🚗 Waze</a>
        <a href={urlGoogleDestino(c.lat, c.lng)} target="_blank" rel="noreferrer"
          className={`${alto} rounded-card bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white font-black uppercase flex items-center justify-center gap-1.5`}>📍 Google Maps</a>
      </div>
    );
  };

  const botonFinalizado = (v, p, grande, marcable) => {
    const alto = grande ? 'h-16 text-base' : 'h-14 text-sm';
    if (!marcable) {
      return (
        <div>
          <button disabled className={`w-full ${alto} rounded-card bg-zinc-800 text-zinc-500 font-black uppercase flex items-center justify-center gap-2 cursor-not-allowed`}>
            <Lock className="w-4 h-4" /> Finalizado
          </button>
          <div className="text-[11px] text-amber-400 font-bold text-center mt-1">Inicia la jornada para marcar paradas</div>
        </div>
      );
    }
    if (procesando === p.id) {
      return <div className={`w-full ${alto} rounded-card bg-green-700 text-white font-black uppercase flex items-center justify-center gap-2`}><Loader2 className="w-5 h-5 animate-spin" /> Guardando…</div>;
    }
    if (confirmando === p.id) {
      return (
        <div className="border-2 border-green-600 rounded-card p-2 space-y-2">
          <div className="text-sm font-bold text-center">¿Terminaste aquí? {p.tipo === 'recogida' ? '¿Ya montaste todo?' : ''}</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmando(null)} className="h-14 rounded-card border border-zinc-600 text-zinc-300 font-black uppercase text-sm">No</button>
            <button onClick={() => finalizarSimple(v, p)} className="h-14 rounded-card bg-green-600 hover:bg-green-500 text-white font-black uppercase text-sm flex items-center justify-center gap-1.5"><CheckCircle2 className="w-5 h-5" /> Sí, finalizada</button>
          </div>
        </div>
      );
    }
    return (
      <button onClick={() => tocarFinalizado(v, p, marcable)} disabled={!!procesando}
        className={`w-full ${alto} rounded-card bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-60 text-white font-black uppercase flex items-center justify-center gap-2`}>
        {esEntregaObra(p) ? <Camera className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        {esEntregaObra(p) ? '✓ Finalizado · tirar foto' : '✓ Finalizado'}
      </button>
    );
  };

  const tarjetaParada = (v, p, n, { destacada = false, soloLectura = false, marcable = false } = {}) => {
    const hecha = esHecha(p);
    const c = coordsParada(p);
    const tp = tipoParada(p);
    const borde = destacada ? 'border-2 border-cyan-500 bg-zinc-900' : hecha ? 'border border-green-900/50 bg-zinc-950 opacity-75' : 'border border-zinc-800 bg-zinc-950';
    return (
      <div key={p.id + (destacada ? '-sig' : '')} className={`${borde} rounded-card p-3 space-y-2.5`}>
        <div className="flex items-start gap-3">
          <span className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-lg font-black ${hecha ? 'bg-green-600/30 text-green-400' : destacada ? 'bg-cyan-600 text-white' : 'bg-zinc-800 text-zinc-200'}`}>{hecha ? '✓' : n}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-card border ${tp.cls}`}>{tp.txt}</span>
              {hecha && <span className="text-[11px] font-black text-green-400">{marcaCompletada(p)}</span>}
            </div>
            <div className={`text-base font-bold leading-snug mt-1 break-words ${hecha ? 'line-through text-zinc-500' : ''}`}>{lugarParada(p)}</div>
            {p.descripcion && <div className="text-sm text-zinc-400 mt-0.5 break-words">{p.descripcion}</div>}
            {hecha && p.recibidoPorNombre && <div className="text-[11px] text-zinc-500 mt-0.5">Recibió: {p.recibidoPorNombre}</div>}
          </div>
        </div>
        {p.docUrl && (
          <a href={p.docUrl} target="_blank" rel="noreferrer" className="h-11 rounded-card border border-blue-700/60 text-blue-400 font-bold text-sm flex items-center justify-center gap-1.5">
            <FileText className="w-4 h-4" /> Ver documento{p.tipo === 'recogida' ? ' (muéstralo al retirar)' : ''}
          </a>
        )}
        {!hecha && !soloLectura && (
          <>
            {botonesNavegar(c, destacada)}
            {botonFinalizado(v, p, destacada, marcable)}
          </>
        )}
        {faltaFotoEntrega(p) && (
          procesando === p.id
            ? <div className="w-full h-12 rounded-card bg-zinc-800 text-zinc-300 font-black uppercase text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</div>
            : <button onClick={() => setEntregando({ v, p, soloFoto: true })} disabled={!!procesando}
                className="w-full h-12 rounded-card border-2 border-green-600 text-green-400 hover:bg-green-900/30 disabled:opacity-60 font-black uppercase text-sm flex items-center justify-center gap-2">
                <Camera className="w-5 h-5" /> 📷 Agregar foto de entrega
              </button>
        )}
      </div>
    );
  };

  const tarjetaViaje = (v, { viejo = false } = {}) => {
    const activas = v.paradas.filter(p => !esCancelada(p));
    const canceladas = v.paradas.filter(esCancelada);
    const hechas = activas.filter(esHecha).length;
    const pendientes = activas.filter(p => !esHecha(p));
    const siguiente = v.estado !== 'completado' ? pendientes[0] : null;
    const numero = (p) => activas.indexOf(p) + 1;
    const tramos = tramosRuta(pendientes.map(p => ({ ...coordsParada(p), numero: numero(p) })).filter(x => x.lat != null), 9);
    const pct = activas.length ? Math.round((hechas / activas.length) * 100) : 0;
    const marcable = puedeMarcarParadas(v, { viejo });

    return (
      <div key={v.id} className={`bg-zinc-900 border rounded-card p-3 space-y-3 ${viejo ? 'border-amber-700/70' : 'border-zinc-800'}`}>
        {viejo && (
          <div className="bg-amber-900/30 border border-amber-700/60 rounded-card p-2.5 text-sm text-amber-300 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Este viaje es del <b>{fechaCorta(v.fecha)}</b> y quedó abierto. Marca lo que hiciste y toca <b>Cerrar viaje</b>; si no salió, avísale a la oficina.</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-black text-base flex items-center gap-1.5"><Truck className="w-5 h-5 text-cyan-400 shrink-0" /> <span className="truncate">{v.vehiculo || 'Camión'}</span></div>
            <div className="text-xs text-zinc-400">
              {v.estado === 'planificado' ? `${activas.length} parada${activas.length !== 1 ? 's' : ''} · sin iniciar` :
               v.estado === 'en_curso' ? `Iniciaste ${hora(v.horaInicio)} · ${hechas} de ${activas.length} hechas` :
               `Jornada ${hora(v.horaInicio)} → ${hora(v.horaFin)} ✓`}
            </div>
          </div>
          {activas.length > 0 && <div className="text-2xl font-black tabular-nums shrink-0">{hechas}<span className="text-zinc-500 text-base">/{activas.length}</span></div>}
        </div>
        {activas.length > 0 && v.estado !== 'planificado' && (
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
        )}
        {v.notas && <div className="text-sm text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-card p-2.5">📝 {v.notas}</div>}

        {/* Iniciar jornada: obligatorio para marcar paradas */}
        {v.estado === 'planificado' && !viejo && (
          <div className="space-y-1">
            <button onClick={() => iniciar(v)} disabled={procesando === v.id}
              className="w-full h-16 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-60 text-white text-lg font-black uppercase rounded-card flex items-center justify-center gap-2">
              {procesando === v.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-6 h-6" />} Iniciar jornada
            </button>
            <div className="text-[11px] text-zinc-500 text-center">Queda tu hora de salida. Waze y Google Maps ya funcionan; para marcar paradas tienes que iniciar.</div>
          </div>
        )}

        {/* Toda la ruta en Google Maps (por tramos si son muchas) */}
        {v.estado !== 'completado' && tramos.length > 0 && (
          tramos.length === 1 ? (
            <a href={tramos[0].url} target="_blank" rel="noreferrer"
              className="h-12 rounded-card border border-cyan-700 text-cyan-300 hover:bg-cyan-800/40 font-black uppercase text-xs flex items-center justify-center gap-1.5">
              🗺 Abrir toda la ruta en Google Maps
            </a>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[11px] font-black uppercase text-cyan-400">🗺 Abrir toda la ruta en Google Maps</div>
              <div className="grid grid-cols-2 gap-2">
                {tramos.map((t, i) => (
                  <a key={i} href={t.url} target="_blank" rel="noreferrer"
                    className="h-12 rounded-card border border-cyan-700 text-cyan-300 hover:bg-cyan-800/40 font-black uppercase text-xs flex items-center justify-center">{rotuloTramo(t, i)}</a>
                ))}
              </div>
            </div>
          )
        )}

        {siguiente && (
          <div className="space-y-1.5">
            <div className="text-xs font-black uppercase tracking-widest text-cyan-400">➜ Siguiente parada</div>
            {tarjetaParada(v, siguiente, numero(siguiente), { destacada: true, marcable })}
          </div>
        )}
        {marcable && activas.length > 0 && pendientes.length === 0 && (
          <div className="bg-green-900/30 border border-green-700/60 rounded-card p-3 text-sm text-green-300 font-bold text-center">¡Listo! Hiciste todas las paradas. {viejo ? 'Cierra el viaje abajo.' : 'Termina la jornada abajo.'}</div>
        )}

        {activas.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-xs font-black uppercase tracking-widest text-zinc-400">Toda la ruta</div>
            <button onClick={() => setMapaDe(mapaDe === v.id ? null : v.id)}
              className={`text-[11px] font-black uppercase px-3 h-9 rounded-card border ${mapaDe === v.id ? 'bg-cyan-700 border-cyan-700 text-white' : 'border-zinc-700 text-zinc-300'}`}>
              {mapaDe === v.id ? 'Ocultar mapa' : '🗺 Ver mapa'}
            </button>
          </div>
        )}
        {mapaDe === v.id && mapaRuta(v, activas)}

        <div className="space-y-2">
          {activas.map(p => p === siguiente
            ? <div key={p.id} className="border border-dashed border-cyan-700/60 rounded-card px-3 py-2 text-xs text-cyan-400 font-bold">{numero(p)}. {lugarParada(p)} · arriba, es la siguiente</div>
            : tarjetaParada(v, p, numero(p), { soloLectura: v.estado === 'completado', marcable }))}
          {activas.length === 0 && <div className="text-sm text-zinc-500 italic">La oficina aún no ha puesto paradas en este viaje.</div>}
          {canceladas.length > 0 && (
            <div className="text-[11px] text-zinc-500">{canceladas.length} parada{canceladas.length !== 1 ? 's' : ''} cancelada{canceladas.length !== 1 ? 's' : ''} por la oficina: {canceladas.map(lugarParada).join(', ')}</div>
          )}
        </div>

        {viejo && v.estado !== 'completado' && (
          <div className="space-y-1 pt-1">
            <button onClick={() => cerrarViejo(v)} disabled={procesando === v.id}
              className={`w-full h-14 disabled:opacity-60 text-white text-sm font-black uppercase rounded-card flex items-center justify-center gap-2 ${pendientes.length === 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-600'}`}>
              {procesando === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />} Cerrar viaje
            </button>
            <div className="text-[11px] text-zinc-500 text-center">Solo lo cierra. Tus horas de ese día no cambian; si hay que corregirlas, la oficina lo hace.</div>
          </div>
        )}
        {!viejo && v.estado === 'en_curso' && (
          <div className="space-y-1 pt-1">
            <button onClick={() => terminar(v)} disabled={procesando === v.id}
              className={`w-full h-14 disabled:opacity-60 text-white text-sm font-black uppercase rounded-card flex items-center justify-center gap-2 ${pendientes.length === 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-600'}`}>
              {procesando === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} Terminar jornada
            </button>
            <div className="text-[11px] text-zinc-500 text-center">Tu hora de inicio y fin quedan para el cálculo de horas extras.</div>
          </div>
        )}
      </div>
    );
  };

  // --- Datos del día ---
  const hoy = hoyRD();
  const manana = sumarDias(hoy, 1);
  const deHoy = viajes.filter(v => v.fecha === hoy);
  const viejos = viajesViejosSinCerrar(viajes, hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const deManana = viajes.filter(v => v.fecha === manana);
  const mostrarViejos = verViejos ?? (viejos.length <= 2);

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-2 ${embebido ? 'justify-end' : 'justify-between'}`}>
        {!embebido && (
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Hola, {(usuario.nombre || '').split(' ')[0]}</div>
            <h1 className="text-2xl font-black tracking-tight">Tu ruta de hoy</h1>
          </div>
        )}
        <button onClick={() => cargar({ silencioso: true })} disabled={refrescando}
          className="flex-shrink-0 px-3 h-11 rounded-card text-xs font-bold uppercase flex items-center gap-1.5 border bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-blue-500 disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Refrescar
        </button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/60 rounded-card p-3 text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <>
          {deHoy.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-6 text-center text-zinc-400 text-sm">
              <Truck className="w-7 h-7 mx-auto mb-2 opacity-50" />
              No tienes viajes asignados hoy. La oficina te avisa cuando haya ruta.
            </div>
          ) : deHoy.map(v => tarjetaViaje(v))}

          {viejos.length > 0 && (
            <div className="space-y-2">
              <button onClick={() => setVerViejos(!mostrarViejos)} className="w-full h-11 px-3 rounded-card border border-amber-700/60 text-amber-400 text-xs font-black uppercase flex items-center justify-between">
                <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {viejos.length} viaje{viejos.length !== 1 ? 's' : ''} de días anteriores sin cerrar</span>
                {mostrarViejos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {mostrarViejos && viejos.map(v => tarjetaViaje(v, { viejo: true }))}
            </div>
          )}

          {deManana.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Mañana · {fechaCorta(manana)}</div>
              {deManana.map(v => {
                const activas = v.paradas.filter(p => !esCancelada(p));
                return (
                  <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-1.5">
                    <div className="font-bold text-sm flex items-center gap-1.5"><Truck className="w-4 h-4 text-cyan-400" /> {v.vehiculo || 'Camión'} · {activas.length} parada{activas.length !== 1 ? 's' : ''}</div>
                    {activas.map((p, i) => (
                      <div key={p.id} className="text-sm text-zinc-300 flex gap-2">
                        <span className="text-zinc-500 font-bold w-5 shrink-0 text-right">{i + 1}.</span>
                        <span className="min-w-0 break-words"><span className="text-zinc-500">{tipoParada(p).txt}</span> · {lugarParada(p)}{p.descripcion ? <span className="text-zinc-500"> — {p.descripcion}</span> : null}</span>
                      </div>
                    ))}
                    {activas.length === 0 && <div className="text-xs text-zinc-500 italic">Sin paradas todavía.</div>}
                    <div className="text-[11px] text-zinc-500">Solo para que sepas. Se activa mañana.</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* v8.51.1: dónde echar combustible con la tarjeta flotilla */}
      {!embebido && (
        <button onClick={() => setVerBombas(true)} className="w-full h-12 border border-orange-800/60 text-orange-400 hover:bg-orange-700 hover:text-white text-xs font-black uppercase rounded-card">⛽ Bombas de la tarjeta flotilla (con Waze)</button>
      )}
      {verBombas && <ModalBombas onCerrar={() => setVerBombas(false)} />}

      {entregando && <ModalConfirmarEntrega p={entregando.p} data={data} soloFoto={!!entregando.soloFoto} procesando={procesando === entregando.p.id}
        onCerrar={() => setEntregando(null)} onConfirmar={confirmarEntrega} />}
    </div>
  );
}

// v8.42.0: PRUEBA DE ENTREGA a obra. Por decisión de Leo, solo la FOTO es obligatoria;
// el nombre y la firma de quien recibe quedan opcionales (si los hay, mejor).
// soloFoto: la parada ya está completada (GPS/oficina) y solo se agrega la prueba.
function ModalConfirmarEntrega({ p, data, soloFoto = false, procesando, onCerrar, onConfirmar }) {
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [tieneFirma, setTieneFirma] = useState(false);
  // El nombre NO se prellena: como es opcional, quedaría "Recibió: <maestro>" aunque
  // recibiera otra persona. El maestro de la obra sale como sugerencia tocable.
  const [recibidoPor, setRecibidoPor] = useState('');
  const sugerencia = (() => {
    const pr = (data?.proyectos || []).find(x => x.id === p.proyectoId);
    const maestro = pr ? (data?.personal || []).find(x => x.id === pr.maestroId) : null;
    return maestro?.nombre || '';
  })();
  const firmaRef = useRef(null);
  const nombreObra = (() => { const pr = (data?.proyectos || []).find(x => x.id === p.proyectoId); return pr ? ([pr.referenciaOdoo, pr.cliente || pr.nombre].filter(Boolean).join(' · ')) : (p.lugar || ''); })(); // v8.49.2

  useEffect(() => {
    if (!fotoFile) { setFotoPreview(null); return; }
    const u = URL.createObjectURL(fotoFile);
    setFotoPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [fotoFile]);

  const confirmar = async () => {
    if (!fotoFile) { alert('Tira la foto del material entregado.'); return; }
    let firmaBlob = null;
    if (tieneFirma) {
      try { firmaBlob = await firmaABlob(firmaRef.current); } catch (e) { firmaBlob = null; } // la firma es opcional: si falla, sigue sin ella
    }
    await onConfirmar({ p, fotoFile, firmaBlob, recibidoPor: recibidoPor.trim(), soloFoto });
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-start sm:items-center justify-center p-3 overflow-auto">
      <div className="bg-zinc-900 border-2 border-green-600 rounded-card max-w-sm w-full p-4 space-y-4 my-4">
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="text-xs tracking-widest uppercase text-green-400 font-bold">{soloFoto ? '📷 Foto de la entrega' : '✓ Confirmar entrega'}</div>
            <div className="text-base font-bold mt-0.5">{nombreObra}</div>
            {p.descripcion && <div className="text-sm text-zinc-400">{p.descripcion}</div>}
            {soloFoto && <div className="text-[11px] text-zinc-500 mt-1">Ya está marcada hecha; solo se guarda la prueba.</div>}
          </div>
          <button onClick={onCerrar} className="text-zinc-400 shrink-0 w-10 h-10 flex items-center justify-center -mr-2 -mt-2"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <div className="text-xs font-bold text-zinc-300 mb-1.5">1 · Foto del material entregado <span className="text-red-400">(obligatoria)</span></div>
          <label className="block cursor-pointer">
            {fotoPreview ? (
              <div className="relative">
                <img src={fotoPreview} alt="Foto de la entrega" className="w-full h-44 object-cover rounded-card border-2 border-green-600" />
                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-bold px-2 py-1 rounded-card">Cambiar foto</span>
              </div>
            ) : (
              <span className="h-20 border-2 border-dashed border-zinc-500 rounded-card flex items-center justify-center gap-2 text-sm font-black uppercase text-zinc-200">
                <Camera className="w-6 h-6" /> Tirar la foto
              </span>
            )}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setFotoFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        <div>
          <div className="text-xs font-bold text-zinc-300 mb-1.5">2 · ¿Quién recibe? <span className="text-zinc-500 font-normal">(opcional)</span></div>
          <input value={recibidoPor} onChange={e => setRecibidoPor(e.target.value)} placeholder="Nombre de quien recibe" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-3 h-12 text-base" />
          {sugerencia && !recibidoPor && (
            <button type="button" onClick={() => setRecibidoPor(sugerencia)}
              className="mt-1.5 h-10 px-3 rounded-card border border-zinc-700 text-zinc-300 text-sm font-bold">
              ¿Recibió {sugerencia}? Toca para ponerlo
            </button>
          )}
        </div>

        <div ref={firmaRef}>
          <div className="text-xs font-bold text-zinc-300 mb-1.5">3 · Firma de recibido <span className="text-zinc-500 font-normal">(opcional, pásale el teléfono)</span></div>
          <FirmaPad alto={140} onCambio={setTieneFirma} />
        </div>

        <button onClick={confirmar} disabled={procesando || !fotoFile}
          className="w-full h-14 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-base font-black uppercase rounded-card flex items-center justify-center gap-2">
          {procesando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} {procesando ? 'Guardando…' : (soloFoto ? 'Guardar foto' : 'Entregado ✓')}
        </button>
        {!fotoFile && <div className="text-[11px] text-zinc-500 text-center -mt-2">Tira la foto para poder confirmar.</div>}
      </div>
    </div>
  );
}
