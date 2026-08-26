'use client';

// v8.46.0: Portafolio "Rentabilidad" (FINANZAS, solo owner) — todas las obras con su
// presupuesto vigente: venta, costo ppto/real, proyección al cierre y margen con
// semáforo vs config.margen_objetivo_pct. Carga en 3 queries (sin N+1): presupuestos
// aprobados + detalle_nomina global + caja chica global; la MDO real por m²/tarea se
// computa de data.reportes (modo ligero — sin jornadas/costosDia por obra). El detalle
// exacto vive en la pestaña Rentabilidad de cada ficha.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, TrendingUp } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD } from '../../lib/helpers/formato';
import { calcRentabilidadObra } from '../../lib/helpers/presupuestoObra';

const SEM = {
  verde: { dot: 'bg-green-500', txt: 'text-green-400' },
  ambar: { dot: 'bg-yellow-500', txt: 'text-yellow-400' },
  rojo:  { dot: 'bg-red-500',   txt: 'text-red-400' },
};

export default function VistaRentabilidad({ usuario, data, onVolver, onVerProyecto }) {
  const [loading, setLoading] = useState(true);
  const [pptos, setPptos] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [soloEjecucion, setSoloEjecucion] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [pp, det, movs] = await Promise.all([
          db.listarPresupuestosAprobados().catch(() => []),
          db.listarTodosDetalles(),
          db.listarMovimientosCajaChica({}).catch(() => []),
        ]);
        if (cancel) return;
        setPptos(pp); setDetalles(det); setMovimientos(movs || []);
      } catch (e) { console.error('rentabilidad portafolio:', e); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const filas = useMemo(() => {
    const pptoPorProyecto = {};
    pptos.forEach(p => { pptoPorProyecto[p.proyectoId] = p; });
    const mdoPagadaPorProyecto = {};
    detalles.forEach(d => {
      if (d.proyectoId) mdoPagadaPorProyecto[d.proyectoId] = (mdoPagadaPorProyecto[d.proyectoId] || 0) + (d.montoTotal || 0);
    });
    const proyectos = (data.proyectos || []).filter(p => !p.archivado &&
      (!soloEjecucion || ['en_ejecucion', 'aprobado'].includes(p.estado)));
    return proyectos.map(proy => {
      const ppto = pptoPorProyecto[proy.id] || null;
      if (!ppto) return { proyecto: proy, ppto: null };
      const rent = calcRentabilidadObra({
        presupuesto: ppto, proyecto: proy, sistemas: data.sistemas,
        reportes: data.reportes, envios: data.envios || [],
        movimientosCajaChica: movimientos, estadoPago: null,
        mdoPagadoRd: mdoPagadaPorProyecto[proy.id] ?? null, config: data.config || {},
      });
      return { proyecto: proy, ppto, rent };
    }).sort((a, b) => (a.rent?.totales.margenPctProyectado ?? 999) - (b.rent?.totales.margenPctProyectado ?? 999));
  }, [pptos, detalles, movimientos, data, soloEjecucion]);

  const tot = useMemo(() => {
    const conPpto = filas.filter(f => f.rent);
    const s = (fn) => conPpto.reduce((acc, f) => acc + fn(f.rent.totales), 0);
    const venta = s(t => t.ventaSinItbisRd), proy = s(t => t.costoProyectado);
    return {
      obras: conPpto.length, sinPpto: filas.length - conPpto.length,
      venta, costoReal: s(t => t.costoReal), costoProyectado: proy,
      margen: venta - proy, margenPct: venta > 0 ? ((venta - proy) / venta) * 100 : 0,
    };
  }, [filas]);

  const objetivo = Number(data.config?.margen_objetivo_pct) || 30;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        {onVolver && <button onClick={onVolver} className="p-1.5 border border-zinc-800 hover:border-zinc-600"><ArrowLeft className="w-4 h-4" /></button>}
        <div>
          <h1 className="text-lg font-black uppercase tracking-wider flex items-center gap-2"><TrendingUp className="w-5 h-5 text-red-500" />Rentabilidad de obras</h1>
          <p className="text-[11px] text-zinc-500">Presupuesto vigente vs real vs proyección · objetivo {objetivo}%</p>
        </div>
        <div className="flex-1" />
        <button onClick={() => setSoloEjecucion(v => !v)}
          className={`text-[10px] px-2 py-1 border uppercase tracking-wider font-bold ${soloEjecucion ? 'border-red-600 text-white' : 'border-zinc-700 text-zinc-400'}`}>
          {soloEjecucion ? 'En ejecución' : 'Todas'}
        </button>
      </div>

      {/* KPIs del portafolio */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Obras con presupuesto', `${tot.obras}`, tot.sinPpto ? `${tot.sinPpto} sin presupuesto` : ''],
          ['Venta s/ITBIS', formatRD(tot.venta), ''],
          ['Costo proyectado', formatRD(tot.costoProyectado), `real ${formatRD(tot.costoReal)}`],
          ['Margen proyectado', formatRD(tot.margen), `${tot.margenPct.toFixed(1)}%`],
        ].map(([l, v, s]) => (
          <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{l}</div>
            <div className="text-lg font-black mt-1">{v}</div>
            {s && <div className="text-[10px] text-zinc-500 mt-0.5">{s}</div>}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-red-500" /></div>
      ) : (
        <div className="bg-zinc-950/50 border border-zinc-800 overflow-x-auto">
          <table className="w-full text-[11px] min-w-[820px]">
            <thead><tr className="text-[9px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
              <th className="text-left px-3 py-2">Obra</th>
              <th className="text-right px-2 py-2">Avance</th>
              <th className="text-right px-2 py-2">Venta s/ITBIS</th>
              <th className="text-right px-2 py-2">Costo ppto</th>
              <th className="text-right px-2 py-2">Costo real</th>
              <th className="text-right px-2 py-2">Proyección</th>
              <th className="text-right px-2 py-2">Margen proy.</th>
              <th className="text-right px-3 py-2">%</th>
            </tr></thead>
            <tbody>
              {filas.map(({ proyecto, ppto, rent }) => {
                const t = rent?.totales;
                const sem = rent ? (SEM[rent.semaforo] || SEM.ambar) : null;
                return (
                  <tr key={proyecto.id}
                    onClick={() => onVerProyecto && onVerProyecto(proyecto)}
                    className="border-t border-zinc-900 hover:bg-zinc-900/60 cursor-pointer">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {sem && <span className={`w-2 h-2 rounded-full shrink-0 ${sem.dot}`} />}
                        <span className="text-zinc-200 font-bold truncate max-w-[260px]">{proyecto.nombre}</span>
                      </div>
                    </td>
                    {!ppto ? (
                      <td colSpan={7} className="px-2 py-2 text-right">
                        <span className="text-[9px] uppercase tracking-wider bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5">sin presupuesto → generar en la ficha</span>
                      </td>
                    ) : (<>
                      <td className="text-right tabular-nums px-2 py-2 text-zinc-400">{t.avanceGlobalPct != null ? `${t.avanceGlobalPct.toFixed(0)}%` : '—'}</td>
                      <td className="text-right tabular-nums px-2 py-2 text-zinc-300">{formatRD(t.ventaSinItbisRd)}</td>
                      <td className="text-right tabular-nums px-2 py-2 text-zinc-400">{formatRD(t.costoPpto)}</td>
                      <td className="text-right tabular-nums px-2 py-2 text-zinc-400">{formatRD(t.costoReal)}</td>
                      <td className="text-right tabular-nums px-2 py-2 text-zinc-300">{formatRD(t.costoProyectado)}</td>
                      <td className={`text-right tabular-nums px-2 py-2 font-bold ${sem.txt}`}>{formatRD(t.margenProyectado)}</td>
                      <td className={`text-right tabular-nums px-3 py-2 font-black ${sem.txt}`}>{(t.margenPctProyectado || 0).toFixed(1)}%</td>
                    </>)}
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-zinc-500 italic">No hay obras {soloEjecucion ? 'en ejecución' : ''}.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-red-600 font-black">
                <td className="px-3 py-2 uppercase text-[10px] text-white">Total portafolio ({tot.obras})</td>
                <td />
                <td className="text-right tabular-nums px-2 py-2">{formatRD(tot.venta)}</td>
                <td />
                <td className="text-right tabular-nums px-2 py-2 text-zinc-300">{formatRD(tot.costoReal)}</td>
                <td className="text-right tabular-nums px-2 py-2">{formatRD(tot.costoProyectado)}</td>
                <td className={`text-right tabular-nums px-2 py-2 ${tot.margen >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatRD(tot.margen)}</td>
                <td className={`text-right tabular-nums px-3 py-2 ${tot.margenPct >= objetivo ? 'text-green-400' : 'text-yellow-400'}`}>{tot.margenPct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="text-[10px] text-zinc-500 italic">
        MDO real en modo ligero (reportes × precios cuadrados; modo por día usa lo pagado en nómina). El detalle exacto está en la pestaña Rentabilidad de cada obra.
      </div>
    </div>
  );
}
