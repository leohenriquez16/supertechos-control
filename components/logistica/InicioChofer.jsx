'use client';

// v8.29.0: Home del CHOFER — su ruta del día en el teléfono.
// Ve las paradas en orden, arranca la jornada (queda la hora), marca cada parada al
// completarla (si la parada entrega una requisición, la obra la ve "entregada" al
// instante), y termina la jornada — esas horas alimentan el cálculo de horas extras.

import React, { useEffect, useState } from 'react';
import { Loader2, Truck, Play, Flag, RefreshCw, CheckCircle2 } from 'lucide-react';
import * as db from '../../lib/db';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

export default function InicioChofer({ usuario, data }) {
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);

  const recargar = async () => {
    setLoading(true);
    try { setViajes(await db.listarViajes({ fecha: hoyRD(), choferId: usuario.id })); }
    catch (e) { console.warn('InicioChofer:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [usuario.id]);

  const nombreObra = (pid) => { const p = (data.proyectos || []).find(x => x.id === pid); return p ? (p.cliente || p.nombre || p.referenciaOdoo) : pid; };

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

  const completarParada = async (v, p) => {
    setProcesando(p.id);
    try {
      await db.actualizarParada(p.id, { estado: 'completada' });
      if (p.requisicionId) { try { await db.actualizarRequisicion(p.requisicionId, { estado: 'entregada' }); } catch (e) { /* */ } }
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

            <div className="space-y-1.5">
              {v.paradas.map((p, i) => (
                <div key={p.id} className={`bg-zinc-950 border rounded-card p-2.5 flex items-center gap-2.5 ${p.estado === 'completada' ? 'border-green-900/50 opacity-70' : 'border-zinc-800'}`}>
                  <span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black ${p.estado === 'completada' ? 'bg-green-600/30 text-green-400' : 'bg-zinc-800 text-zinc-300'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-bold ${p.estado === 'completada' ? 'line-through text-zinc-500' : ''}`}>
                      {p.tipo === 'recogida' ? '↑ Recoger' : '↓ Entregar'} · {p.proyectoId ? nombreObra(p.proyectoId) : p.lugar}
                    </div>
                    {p.descripcion && <div className="text-[11px] text-zinc-500">{p.descripcion}</div>}
                    {p.estado === 'completada' && <div className="text-[10px] text-green-500">✓ {hora(p.completadaAt)}</div>}
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
    </div>
  );
}
