'use client';

// v8.19.19: Widget "Mi Producción" — muestra al usuario logueado (maestro o
// admin) cómo va su acumulado dentro del corte abierto.
// Se renderiza solo cuando data.config.mostrarMiProduccionNomina === true.

import React, { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFechaCorta, formatNum } from '../../lib/helpers/formato';
import { calcularDetalle } from '../nomina/VistaNomina';

export default function MiProduccionCard({ usuario, data }) {
  const [loading, setLoading] = useState(true);
  const [corte, setCorte] = useState(null);
  const [mio, setMio] = useState(null); // { dias, m2, monto, misDias, porProyecto }
  const [verDias, setVerDias] = useState(false); // v8.27.72: desplegar días reportados

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const cortes = await db.listarCortes();
        const abierto = cortes.find(c => c.estado === 'abierto');
        if (!abierto) { if (!cancel) { setCorte(null); setMio(null); setLoading(false); } return; }
        const [jornadas, ajustes] = await Promise.all([
          db.listarJornadasEnRango(abierto.fechaInicio, abierto.fechaFin),
          db.listarAjustes({ sinCorte: true }).catch(() => []),
        ]);
        const ajustesPeriodo = (ajustes || []).filter(a => a.fecha >= abierto.fechaInicio && a.fecha <= abierto.fechaFin);
        const filas = await calcularDetalle(jornadas, data, abierto, ajustesPeriodo);
        const mias = filas.filter(f => f.personaId === usuario.id);
        const dias = mias.reduce((s, f) => s + (f.diasTrabajados || 0), 0);
        const m2 = mias.reduce((s, f) => s + (f.m2Producidos || 0), 0);
        const monto = mias.reduce((s, f) => s + (f.montoTotal || 0), 0);
        // v8.27.72 (ticket "ver los días reportados"): lista de FECHAS con asistencia del
        // usuario en el corte, con su obra — para que el maestro verifique día por día.
        const misDias = (jornadas || [])
          .filter(j => (j.personasPresentesIds || []).includes(usuario.id))
          .map(j => {
            const proy = (data.proyectos || []).find(p => p.id === j.proyectoId);
            return { fecha: j.fecha, proyecto: proy?.referenciaOdoo || proy?.cliente || '—', diaDoble: !!j.diaDoble };
          })
          .sort((a, b) => a.fecha.localeCompare(b.fecha));
        if (!cancel) {
          setCorte(abierto);
          setMio({ dias, m2, monto, misDias, porProyecto: mias.sort((a, b) => b.montoTotal - a.montoTotal) });
          setLoading(false);
        }
      } catch (e) { console.warn('MiProduccionCard:', e?.message); if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [usuario.id, data.proyectos, data.reportes, data.personal]);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-red-500" />
      </div>
    );
  }
  if (!corte) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 text-center text-zinc-500 text-sm">
        <Wallet className="w-5 h-5 mx-auto mb-1 opacity-50" />
        No hay un corte de nómina abierto en este momento.
      </div>
    );
  }

  const max = Math.max(1, ...(mio?.porProyecto || []).map(p => p.montoTotal || 0));

  return (
    <div className="bg-zinc-900 border-l-4 border-red-600 p-4 lg:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] tracking-widest uppercase text-red-300 font-bold flex items-center gap-1">
            <Wallet className="w-3 h-3" /> Mi producción · corte en curso
          </div>
          <div className="font-bold text-sm sm:text-base text-white mt-0.5">
            {formatFechaCorta(corte.fechaInicio)} → {formatFechaCorta(corte.fechaFin)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
            {mio.dias} día{mio.dias !== 1 ? 's' : ''} trabajado{mio.dias !== 1 ? 's' : ''}
            {mio.m2 > 0 ? ` · ${formatNum(mio.m2)} m² producidos` : ''}
            {/* v8.27.72: ver el detalle de fechas reportadas */}
            {(mio.misDias || []).length > 0 && (
              <button onClick={() => setVerDias(v => !v)} className="ml-2 underline text-zinc-400 hover:text-white">
                {verDias ? 'ocultar días' : 'ver mis días'}
              </button>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500">Acumulado</div>
          <div className="text-2xl sm:text-3xl font-black text-green-400 leading-tight">{formatRD(mio.monto)}</div>
          <div className="text-[10px] text-zinc-500">se actualiza con cada jornada / avance</div>
        </div>
      </div>

      {/* v8.27.72 (ticket Yamel/Miguel H.): días reportados, uno por uno con su obra */}
      {verDias && (mio.misDias || []).length > 0 && (
        <div className="border-t border-zinc-800 pt-2">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Mis días reportados ({mio.misDias.length})</div>
          <div className="flex flex-wrap gap-1">
            {mio.misDias.map((d, i) => (
              <span key={i} className={`text-[10px] px-2 py-1 border rounded-card ${d.diaDoble ? 'bg-amber-900/30 border-amber-700 text-amber-300' : 'bg-zinc-950 border-zinc-800 text-zinc-300'}`}>
                {formatFechaCorta(d.fecha)} · {d.proyecto}{d.diaDoble ? ' ×2' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {mio.porProyecto.length === 0 ? (
        <div className="text-[11px] text-zinc-500 italic border-t border-zinc-800 pt-2">
          Aún no tienes asistencias ni avances asignados en este corte.
        </div>
      ) : (
        <div className="border-t border-zinc-800 pt-3 space-y-1">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Por proyecto</div>
          {mio.porProyecto.slice(0, 8).map(p => {
            const pct = max > 0 ? Math.min(100, (p.montoTotal / max) * 100) : 0;
            return (
              <div key={p.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5">
                <div className="flex items-center justify-between text-[11px] gap-2">
                  <div className="font-bold truncate flex-1">{p.proyectoNombre || '—'}</div>
                  <div className="text-zinc-500 text-[10px] shrink-0">
                    {p.modoPago === 'dia'
                      ? `${p.diasTrabajados}d${p.diasDobles ? ` (${p.diasDobles}×2)` : ''}`
                      : p.modoPago === 'dia_m2'
                        ? `${p.diasTrabajados}d + ${formatNum(typeof p.m2Efectivo === 'number' ? p.m2Efectivo : p.m2Producidos)} m²`
                      : (p.modoPago === 'm2' || p.modoPago === 'm2_fijo' || p.modoPago === 'tarea')
                        ? `${formatNum(p.m2Producidos)} m²`
                        : 'ajuste'}
                  </div>
                  <div className="font-bold text-green-400 shrink-0">{formatRD(p.montoTotal)}</div>
                </div>
                <div className="w-full h-1 bg-zinc-800 mt-1 overflow-hidden">
                  <div className="h-full bg-green-500/60" style={{ width: pct + '%' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
