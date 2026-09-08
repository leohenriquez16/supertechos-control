'use client';

// v8.51.0 (caso "¿está de mantenimiento el KIA?" por WhatsApp): vista FLOTA de
// SOLO LECTURA para todo el equipo — cada vehículo con su estado en vivo
// (disponible / en taller / fuera de servicio), por qué y desde cuándo.
// El que necesita un vehículo MIRA aquí en vez de preguntar en el grupo.

import React, { useEffect, useState } from 'react';
import { Car, Loader2 } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';

const ESTADOS = {
  activo: { label: '🟢 Disponible', cls: 'bg-emerald-600/15 text-emerald-300 border-emerald-800/60' },
  en_taller: { label: '🔧 En taller', cls: 'bg-amber-600/15 text-amber-300 border-amber-800/60' },
  fuera_servicio: { label: '🔴 Fuera de servicio', cls: 'bg-red-600/15 text-red-300 border-red-800/60' },
};

export default function FlotaEstado({ data }) {
  const vehiculos = (data.vehiculos || []).filter(v => v.activo !== false);
  const [eventos, setEventos] = useState(null); // abiertos de toda la flota
  useEffect(() => {
    db.listarEventosVehiculo({ soloAbiertos: true }).then(setEventos).catch(() => setEventos([]));
  }, []);

  const noDisponibles = vehiculos.filter(v => v.estadoOperativo === 'en_taller' || v.estadoOperativo === 'fuera_servicio');
  const disponibles = vehiculos.filter(v => !noDisponibles.includes(v));
  const eventoDe = (v) => (eventos || []).find(e => e.vehiculoId === v.id);
  const respDe = (v) => (data.personal || []).find(p => p.id === v.responsableId)?.nombre || null;

  const Tarjeta = ({ v }) => {
    const est = ESTADOS[v.estadoOperativo] || ESTADOS.activo;
    const ev = eventoDe(v);
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-bold text-sm">{[v.marca, v.modelo].filter(Boolean).join(' ')} {v.placa && <span className="font-mono text-[10px] text-zinc-500">· {v.placa}</span>}</div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${est.cls}`}>{est.label}</span>
        </div>
        {ev && (
          <div className="text-[11px] text-zinc-400 mt-1">
            {ev.descripcion}
            <span className="text-zinc-600"> — desde el {formatFechaCorta(ev.fecha)}{ev.taller ? ` · ${ev.taller}` : ''}</span>
          </div>
        )}
        {ev?.citaFecha && ev.estado !== 'resuelto' && (
          <div className="text-[11px] font-bold text-sky-300 mt-0.5">🗓 Cita de mantenimiento: {formatFechaCorta(ev.citaFecha)}{ev.citaTaller ? ` en ${ev.citaTaller}` : ''}</div>
        )}
        <div className="text-[10px] text-zinc-600 mt-0.5">
          {respDe(v) ? `Responsable: ${respDe(v)}` : 'Sin responsable asignado'}
          {v.proximoMantFecha ? ` · próx. mantenimiento ${formatFechaCorta(v.proximoMantFecha)}` : v.proximoMantKm ? ` · próx. mant. ${Number(v.proximoMantKm).toLocaleString()} km` : ''}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Flota</div>
        <h1 className="text-2xl font-black flex items-center gap-2"><Car className="w-6 h-6 text-red-500" /> Estado de los vehículos</h1>
        <div className="text-[11px] text-zinc-500">En vivo — antes de preguntar por el grupo, mira aquí. ¿Tu vehículo falló? Repórtalo desde "Mi vehículo".</div>
      </div>

      {eventos === null ? (
        <div className="text-center py-8"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <>
          {noDisponibles.length > 0 && (
            <div>
              <div className="text-[10px] tracking-widest uppercase text-amber-400 font-bold mb-1.5">No disponibles ({noDisponibles.length})</div>
              <div className="space-y-1.5">{noDisponibles.map(v => <Tarjeta key={v.id} v={v} />)}</div>
            </div>
          )}
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1.5">Disponibles ({disponibles.length})</div>
            <div className="space-y-1.5">{disponibles.map(v => <Tarjeta key={v.id} v={v} />)}</div>
          </div>
          {vehiculos.length === 0 && <div className="text-sm text-zinc-500 italic text-center py-6">Sin vehículos registrados.</div>}
        </>
      )}
    </div>
  );
}
