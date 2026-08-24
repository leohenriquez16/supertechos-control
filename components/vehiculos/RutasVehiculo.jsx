'use client';

// v8.41.0: RUTAS DEL VEHÍCULO — historial de viajes de un camión de la flota:
// los asignados a futuro (incluye hoy) y los pasados. Requiere que el viaje se
// haya creado eligiendo el camión de la flota (viajes.vehiculo_id).

import React, { useEffect, useState } from 'react';
import { Loader2, X, Truck } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

export default function RutasVehiculo({ vehiculo, onCerrar }) {
  const [viajes, setViajes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.listarViajes({ vehiculoId: vehiculo.id })
      .then(setViajes).catch(e => console.warn('RutasVehiculo:', e?.message))
      .finally(() => setLoading(false));
  }, [vehiculo.id]);

  const hoy = hoyRD();
  const futuras = viajes.filter(v => v.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasadas = viajes.filter(v => v.fecha < hoy).slice(0, 15);

  const Fila = ({ v }) => (
    <div className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-2 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold">{formatFechaCorta(v.fecha)} · {v.choferNombre || 'Sin chofer'}</div>
        <div className="text-[10px] text-zinc-500 truncate">
          {v.paradas.length} parada{v.paradas.length !== 1 ? 's' : ''}
          {v.paradas.length > 0 ? ` — ${v.paradas.map(p => p.lugar || '').filter(Boolean).slice(0, 3).join(' → ') || 'entregas a obras'}` : ''}
        </div>
      </div>
      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-card ${v.estado === 'completado' ? 'bg-green-600/20 text-green-400' : v.estado === 'en_curso' ? 'bg-cyan-600/20 text-cyan-300' : 'bg-zinc-800 text-zinc-400'}`}>
        {v.estado === 'completado' ? '✓ Completado' : v.estado === 'en_curso' ? 'En curso' : 'Planificado'}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-cyan-700 rounded-card max-w-md w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <div className="text-xs tracking-widest uppercase text-cyan-400 font-bold flex items-center gap-1.5"><Truck className="w-4 h-4" /> Rutas del vehículo</div>
            <div className="text-sm font-black truncate mt-0.5">{[vehiculo.marca, vehiculo.modelo, vehiculo.placa].filter(Boolean).join(' ')}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>
        {loading ? <div className="text-center py-6"><Loader2 className="w-5 h-5 text-cyan-500 animate-spin mx-auto" /></div> : (
          <>
            <div>
              <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">📅 Próximas y de hoy ({futuras.length})</div>
              <div className="space-y-1">
                {futuras.length === 0 && <div className="text-[11px] text-zinc-600 italic">Sin rutas asignadas a futuro.</div>}
                {futuras.map(v => <Fila key={v.id} v={v} />)}
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">🕘 Pasadas (últimas {pasadas.length})</div>
              <div className="space-y-1">
                {pasadas.length === 0 && <div className="text-[11px] text-zinc-600 italic">Sin historial todavía — los viajes cuentan desde que se crean eligiendo el camión de la flota.</div>}
                {pasadas.map(v => <Fila key={v.id} v={v} />)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
