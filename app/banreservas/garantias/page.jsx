'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { obtenerGarantias, sucursales } from '../../../lib/data/banreservas-mock';

function fmtMes(d) {
  return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function GarantiasPage() {
  const g = useMemo(() => obtenerGarantias(), []);
  const pctPrograma = ((g.conGarantia / sucursales.length) * 100).toFixed(0);

  const maxBarra = Math.max(...g.vencimientosPorMes.map(v => v.verde + v.amber + v.rojo), 1);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Gestión de Garantías</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Trazabilidad y alertas anticipadas del estado de garantías por sucursal
          </p>
        </div>
        <button className="px-4 py-2 bg-zinc-900 text-white text-xs font-semibold rounded hover:bg-zinc-800">
          Generar Informe
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Con Garantía"     value={g.conGarantia}     sub={`${pctPrograma}% del programa`}  stripe="#16a34a" />
        <KpiCard label="Vencen ≤6 meses"  value={g.accionInmediata} sub="Acción inmediata"                 stripe="#f59e0b" />
        <KpiCard label="Vencen ≤12 meses" value={g.vencen12m}       sub="Programar cierre"                 stripe="#f59e0b" />
        <KpiCard label="Vencidas"         value={g.vencidas}        sub="Fuera de cobertura"               stripe="#dc2626" />
      </div>

      {/* Línea de tiempo + Próximas a vencer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Línea de tiempo - 2/3 */}
        <div className="lg:col-span-2 bg-white border border-zinc-200 rounded shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-200">
            <div className="text-sm font-semibold text-zinc-900">Línea de Tiempo de Vencimientos (próximos 12 meses)</div>
            <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-4">
              <span className="flex items-center gap-1"><Dot c="#16a34a" /> Verde: cobertura activa</span>
              <span className="flex items-center gap-1"><Dot c="#f59e0b" /> Amber: alerta cierre</span>
              <span className="flex items-center gap-1"><Dot c="#dc2626" /> Rojo: vencen ≤12m</span>
            </div>
          </div>
          <div className="p-4">
            <svg width="100%" height={220} viewBox="0 0 600 200" preserveAspectRatio="none">
              {g.vencimientosPorMes.map((m, i) => {
                const x = i * (600 / Math.max(g.vencimientosPorMes.length, 1));
                const w = (600 / Math.max(g.vencimientosPorMes.length, 1)) - 10;
                const total = m.verde + m.amber + m.rojo;
                const hVerde = (m.verde / maxBarra) * 160;
                const hAmber = (m.amber / maxBarra) * 160;
                const hRojo  = (m.rojo  / maxBarra) * 160;
                let y = 180;
                return (
                  <g key={i}>
                    <text x={x + w/2 + 5} y={180 - (hVerde + hAmber + hRojo) - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#18181b">
                      {total}
                    </text>
                    {hRojo > 0 && <rect x={x + 5} y={(y -= hRojo)} width={w} height={hRojo} fill="#dc2626" />}
                    {hAmber > 0 && <rect x={x + 5} y={(y -= hAmber)} width={w} height={hAmber} fill="#f59e0b" />}
                    {hVerde > 0 && <rect x={x + 5} y={(y -= hVerde)} width={w} height={hVerde} fill="#16a34a" />}
                    <text x={x + w/2 + 5} y={195} textAnchor="middle" fontSize={9} fill="#71717a">{m.mes}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Próximas a vencer */}
        <div className="bg-white border border-zinc-200 rounded shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-200">
            <div className="text-sm font-semibold text-zinc-900">Próximas a Vencer · Acción Recomendada</div>
          </div>
          <div className="divide-y divide-zinc-100">
            {g.proximasAVencer.map((s, i) => (
              <Link key={i} href={`/banreservas/sucursal/${s.codigo_br}`} className="block px-4 py-2.5 hover:bg-zinc-50">
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-zinc-900 truncate">
                      {s.zona}
                    </div>
                    <div className="text-[10px] text-zinc-500">Vence {fmtMes(s.vencimiento_garantia)}</div>
                    <div className="text-[11px] text-red-600 mt-0.5">
                      Inspección de cierre + reclamo aplicador
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla aplicadores */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm">
        <div className="px-4 py-3 border-b border-zinc-200">
          <div className="text-sm font-semibold text-zinc-900">Distribución por Aplicador Original y Sistema</div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <tr>
              <th className="text-left px-4 py-2">Aplicador</th>
              <th className="text-left px-4 py-2">Sistemas</th>
              <th className="text-right px-4 py-2"># Sucursales</th>
              <th className="text-right px-4 py-2">Garantía Activa</th>
              <th className="text-right px-4 py-2">Vence &lt;12m</th>
              <th className="text-right px-4 py-2">Vencidas</th>
              <th className="text-left px-4 py-2">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {g.aplicadores.sort((a, b) => b.sucursales - a.sucursales).map((a, i) => {
              const accion = a.vencidas > a.vigentes
                ? 'Auditoría completa'
                : a.vence12m > a.vigentes / 2
                  ? 'Plan de cierre garantías'
                  : a.vencidas > 0
                    ? 'Inspección conjunta'
                    : 'Continuar monitoreo';
              const accionColor = accion === 'Continuar monitoreo' ? 'text-zinc-700' : 'text-red-600';
              return (
                <tr key={i} className="hover:bg-zinc-50">
                  <td className="px-4 py-2.5 text-zinc-900 font-medium">{a.aplicador}</td>
                  <td className="px-4 py-2.5 text-zinc-600 text-xs">{a.sistemas}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-900 tabular-nums">{a.sucursales}</td>
                  <td className="px-4 py-2.5 text-right text-green-700 font-semibold tabular-nums">{a.vigentes}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700 tabular-nums">{a.vence12m}</td>
                  <td className="px-4 py-2.5 text-right text-red-600 font-semibold tabular-nums">{a.vencidas}</td>
                  <td className={`px-4 py-2.5 text-xs font-medium ${accionColor}`}>{accion}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, stripe }) {
  return (
    <div className="bg-white border border-zinc-200 rounded shadow-sm p-4 relative overflow-hidden">
      <div className="absolute left-0 right-0 top-0 h-0.5" style={{ background: stripe }} />
      <div className="text-[10px] text-zinc-500 uppercase tracking-[1.5px] font-semibold">{label}</div>
      <div className="text-3xl font-bold text-zinc-900 mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}

function Dot({ c }) {
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />;
}
