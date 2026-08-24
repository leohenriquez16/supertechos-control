'use client';

// v8.29.0: Home del CHOFER — su ruta del día en el teléfono.
// Ve las paradas en orden, arranca la jornada (queda la hora), marca cada parada al
// completarla (si la parada entrega una requisición, la obra la ve "entregada" al
// instante), y termina la jornada — esas horas alimentan el cálculo de horas extras.

import React, { useEffect, useState, useRef } from 'react';
import { Loader2, Truck, Play, Flag, RefreshCw, CheckCircle2, Camera, X } from 'lucide-react';
import * as db from '../../lib/db';
import { comprimirImagenABlob } from '../../lib/imports';
import FirmaPad, { firmaABlob } from '../common/FirmaPad';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

export default function InicioChofer({ usuario, data }) {
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const [mapaDe, setMapaDe] = useState(null); // v8.41.0: viaje cuyo mapa de ruta se muestra
  const [entregando, setEntregando] = useState(null); // v8.42.0: {v,p} parada de ENTREGA confirmándose (foto + firma)

  const recargar = async () => {
    setLoading(true);
    try { setViajes(await db.listarViajes({ fecha: hoyRD(), choferId: usuario.id })); }
    catch (e) { console.warn('InicioChofer:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [usuario.id]);

  const nombreObra = (pid) => { const p = (data.proyectos || []).find(x => x.id === pid); return p ? (p.cliente || p.nombre || p.referenciaOdoo) : pid; };

  // v8.41.0: la RUTA EN ORDEN en el mapa — pines numerados + línea del recorrido.
  const coordsParada = (p) => {
    if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
    const pr = (data.proyectos || []).find(x => x.id === p.proyectoId);
    return (pr?.ubicacionLat != null && pr?.ubicacionLng != null) ? { lat: pr.ubicacionLat, lng: pr.ubicacionLng } : null;
  };
  const MapaRuta = ({ v }) => {
    const conCoords = v.paradas.map((p, i) => ({ p, i, c: coordsParada(p) })).filter(x => x.c);
    if (conCoords.length === 0) return <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded-card p-4 text-center text-[11px] text-zinc-600">Las paradas de este viaje no tienen ubicación GPS.</div>;
    const MapaLeaflet = React.lazy(() => import('../common/MapaLeaflet'));
    const markers = conCoords.map(({ p, i, c }) => ({
      ...c, numero: i + 1, color: p.estado === 'completada' ? 'green' : 'blue',
      label: `${i + 1}. ${p.proyectoId ? nombreObra(p.proyectoId) : p.lugar}`,
      popup: `<b>${i + 1}. ${p.tipo === 'recogida' ? '↑ Recoger' : '↓ Entregar'}</b><br>${p.proyectoId ? nombreObra(p.proyectoId) : (p.lugar || '')}${p.descripcion ? `<br><span style="font-size:11px;color:#a1a1aa">${p.descripcion}</span>` : ''}`,
    }));
    return (
      <React.Suspense fallback={<div className="bg-zinc-950 border border-zinc-800 rounded-card flex items-center justify-center" style={{ height: 260 }}><span className="text-xs text-zinc-500">Cargando mapa…</span></div>}>
        <MapaLeaflet center={[markers[0].lat, markers[0].lng]} zoom={11} height={260} markers={markers}
          polyline={markers.length > 1 ? { points: markers.map(m => [m.lat, m.lng]), color: '#22d3ee' } : null}
          scrollWheelZoom={false} className="border border-zinc-800" />
        {conCoords.length < v.paradas.length && <div className="text-[10px] text-zinc-600 mt-1">{v.paradas.length - conCoords.length} parada(s) sin GPS no salen en el mapa.</div>}
      </React.Suspense>
    );
  };

  const iniciar = async (v) => {
    setProcesando(v.id);
    try {
      await db.actualizarViaje(v.id, { estado: 'en_curso', horaInicio: new Date().toISOString() });
      // las requisiciones montadas pasan a "en ruta" — la obra lo ve al instante
      for (const p of v.paradas.filter(x => x.requisicionId)) {
        try { await db.actualizarRequisicion(p.requisicionId, { estado: 'en_ruta' }); } catch (e) { /* no bloquear */ }
      }
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setProcesando(null);
  };

  // v8.42.0: las ENTREGAS a obra piden PRUEBA — foto del material + firma de quien
  // recibe. Las recogidas y paradas libres se marcan directo.
  const completarParada = async (v, p) => {
    if (p.tipo === 'entrega' && (p.requisicionId || p.proyectoId)) { setEntregando({ v, p }); return; }
    setProcesando(p.id);
    try {
      await db.actualizarParada(p.id, { estado: 'completada' });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setProcesando(null);
  };

  const confirmarEntrega = async ({ v, p, fotoFile, firmaBlob, recibidoPor }) => {
    setProcesando(p.id);
    try {
      const fotoBlob = await comprimirImagenABlob(fotoFile);
      const fotoUrl = await db.subirEntregaParada(fotoBlob, p.id, 'foto');
      const firmaUrl = await db.subirEntregaParada(firmaBlob, p.id, 'firma');
      await db.actualizarParada(p.id, { estado: 'completada', entregaFotoUrl: fotoUrl, entregaFirmaUrl: firmaUrl, recibidoPorNombre: recibidoPor });
      if (p.requisicionId) { try { await db.actualizarRequisicion(p.requisicionId, { estado: 'entregada' }); } catch (e) { /* */ } }
      setEntregando(null);
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setProcesando(null);
  };

  const terminar = async (v) => {
    const faltan = v.paradas.filter(p => p.estado !== 'completada').length;
    if (faltan > 0 && !confirm(`Te quedan ${faltan} parada${faltan !== 1 ? 's' : ''} sin marcar. ¿Terminar igual?`)) return;
    setProcesando(v.id);
    try {
      await db.actualizarViaje(v.id, { estado: 'completado', horaFin: new Date().toISOString() });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setProcesando(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Hola, {usuario.nombre.split(' ')[0]}</div>
          <h1 className="text-2xl font-black tracking-tight">Tu ruta de hoy</h1>
        </div>
        <button onClick={recargar} className="flex-shrink-0 px-3 py-2 rounded-card text-xs font-bold uppercase flex items-center gap-1.5 border bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-blue-500">
          <RefreshCw className="w-3.5 h-3.5" /> Refrescar
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : viajes.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-6 text-center text-zinc-500 text-sm">
          <Truck className="w-6 h-6 mx-auto mb-2 opacity-50" />
          No tienes viajes asignados hoy. La oficina te avisa cuando haya ruta.
        </div>
      ) : viajes.map(v => {
        const hechas = v.paradas.filter(p => p.estado === 'completada').length;
        return (
          <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-sm flex items-center gap-1.5"><Truck className="w-4 h-4 text-cyan-400" /> {v.vehiculo || 'Camión'}</div>
                <div className="text-[10px] text-zinc-500">
                  {v.estado === 'planificado' ? `${v.paradas.length} paradas planificadas` :
                   v.estado === 'en_curso' ? `Jornada iniciada ${hora(v.horaInicio)} · ${hechas}/${v.paradas.length} paradas` :
                   `Jornada: ${hora(v.horaInicio)} → ${hora(v.horaFin)} ✓`}
                </div>
              </div>
              {v.estado === 'planificado' && (
                <button onClick={() => iniciar(v)} disabled={procesando === v.id} className="bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-xs font-black uppercase px-4 py-2.5 rounded-card flex items-center gap-1.5">
                  {procesando === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Iniciar jornada
                </button>
              )}
              {v.estado === 'en_curso' && (
                <button onClick={() => terminar(v)} disabled={procesando === v.id} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black uppercase px-4 py-2.5 rounded-card flex items-center gap-1.5">
                  {procesando === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />} Terminar jornada
                </button>
              )}
            </div>

            {v.paradas.length > 0 && (
              <button onClick={() => setMapaDe(mapaDe === v.id ? null : v.id)}
                className={`w-full text-[11px] font-black uppercase py-2 rounded-card border ${mapaDe === v.id ? 'bg-cyan-700 border-cyan-700 text-white' : 'border-zinc-700 text-zinc-300'}`}>
                🗺 {mapaDe === v.id ? 'Ocultar mapa' : 'Ver mi ruta en el mapa'}
              </button>
            )}
            {mapaDe === v.id && <MapaRuta v={v} />}

            <div className="space-y-1.5">
              {v.paradas.map((p, i) => (
                <div key={p.id} className={`bg-zinc-950 border rounded-card p-2.5 flex items-center gap-2.5 ${p.estado === 'completada' ? 'border-green-900/50 opacity-70' : 'border-zinc-800'}`}>
                  <span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black ${p.estado === 'completada' ? 'bg-green-600/30 text-green-400' : 'bg-zinc-800 text-zinc-300'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-bold ${p.estado === 'completada' ? 'line-through text-zinc-500' : ''}`}>
                      {p.tipo === 'recogida' ? '↑ Recoger' : '↓ Entregar'} · {p.proyectoId ? nombreObra(p.proyectoId) : p.lugar}
                    </div>
                    {p.descripcion && <div className="text-[11px] text-zinc-500">{p.descripcion}</div>}
                    {p.docUrl && <a href={p.docUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 font-bold">📄 Ver documento (muéstralo al retirar)</a>}
                    {p.estado === 'completada' && <div className="text-[10px] text-green-500">✓ {hora(p.completadaAt)}{p.recibidoPorNombre ? ` · recibió ${p.recibidoPorNombre}` : ''}</div>}
                  </div>
                  {v.estado === 'en_curso' && p.estado !== 'completada' && (
                    <button onClick={() => completarParada(v, p)} disabled={procesando === p.id} className="shrink-0 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-[11px] font-black uppercase px-3 py-2.5 rounded-card flex items-center gap-1">
                      {procesando === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Hecha
                    </button>
                  )}
                </div>
              ))}
              {v.paradas.length === 0 && <div className="text-xs text-zinc-600 italic">La oficina aún no ha puesto paradas en este viaje.</div>}
            </div>
            {v.estado === 'en_curso' && <div className="text-[10px] text-zinc-600">Tu hora de inicio y fin quedan registradas para el cálculo de horas extras.</div>}
          </div>
        );
      })}

      {entregando && <ModalConfirmarEntrega v={entregando.v} p={entregando.p} data={data} procesando={procesando === entregando.p.id}
        onCerrar={() => setEntregando(null)} onConfirmar={confirmarEntrega} />}
    </div>
  );
}

// v8.42.0: PRUEBA DE ENTREGA — foto del material entregado + firma de quien recibe
// (el maestro firma en el celular del chofer) + nombre. Todo obligatorio.
function ModalConfirmarEntrega({ v, p, data, procesando, onCerrar, onConfirmar }) {
  const [fotoFile, setFotoFile] = useState(null);
  const [tieneFirma, setTieneFirma] = useState(false);
  const [recibidoPor, setRecibidoPor] = useState(() => {
    const pr = (data.proyectos || []).find(x => x.id === p.proyectoId);
    const maestro = pr ? (data.personal || []).find(x => x.id === pr.maestroId) : null;
    return maestro?.nombre || '';
  });
  const firmaRef = useRef(null);
  const nombreObra = (() => { const pr = (data.proyectos || []).find(x => x.id === p.proyectoId); return pr ? (pr.cliente || pr.nombre) : (p.lugar || ''); })();

  const confirmar = async () => {
    if (!fotoFile) { alert('Tira la foto del material entregado.'); return; }
    if (!tieneFirma) { alert('Falta la firma de quien recibe.'); return; }
    if (!recibidoPor.trim()) { alert('¿Quién recibió? Escribe el nombre.'); return; }
    let firmaBlob;
    try { firmaBlob = await firmaABlob(firmaRef.current); } catch (e) { alert('Firma inválida — vuelve a firmar.'); return; }
    await onConfirmar({ v, p, fotoFile, firmaBlob, recibidoPor: recibidoPor.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-green-600 rounded-card max-w-sm w-full p-4 space-y-3 my-6">
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="text-xs tracking-widest uppercase text-green-400 font-bold">✓ Confirmar entrega</div>
            <div className="text-sm font-bold mt-0.5">{nombreObra}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <div className="text-[10px] font-bold text-zinc-400 mb-1">1 · Foto del material entregado</div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className={`flex-1 border-2 rounded-card px-3 py-3 flex items-center justify-center gap-2 text-xs font-black uppercase ${fotoFile ? 'border-green-600 text-green-400' : 'border-zinc-600 text-zinc-300'}`}>
              <Camera className="w-4 h-4" /> {fotoFile ? '📷 Foto lista — cambiar' : 'Tirar la foto'}
            </span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setFotoFile(e.target.files?.[0] || null)} />
          </label>
        </div>

        <div>
          <div className="text-[10px] font-bold text-zinc-400 mb-1">2 · ¿Quién recibe?</div>
          <input value={recibidoPor} onChange={e => setRecibidoPor(e.target.value)} placeholder="Nombre del maestro que recibe" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2.5 py-2.5 text-sm" />
        </div>

        <div ref={firmaRef}>
          <div className="text-[10px] font-bold text-zinc-400 mb-1">3 · Firma de recibido (pásale el teléfono)</div>
          <FirmaPad alto={150} onCambio={setTieneFirma} />
        </div>

        <button onClick={confirmar} disabled={procesando} className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-xs font-black uppercase py-3 rounded-card flex items-center justify-center gap-1.5">
          {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Entregado ✓
        </button>
      </div>
    </div>
  );
}
