'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, TrendingUp, ShoppingBag, Wallet, Receipt } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatNum, formatFechaCorta } from '../../lib/helpers/formato';
import { periodoSemana } from '../../lib/helpers/cuadreCajaChica';
import { calcDashboard, generarPathSparkline } from '../../lib/helpers/dashboardCajaChica';
import DonutChart, { DonutLegend } from '../common/DonutChart';
import BarChartHorizontal from '../common/BarChartHorizontal';

// Dashboard gráfico del módulo Caja Chica (admin).
// Muestra KPIs + donut de categorías + top proveedores + por persona + tendencia diaria.
export default function DashboardCajaChica({ data }) {
  const [presetPeriodo, setPresetPeriodo] = useState('mes_actual');
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);

  const semanaPasada = periodoSemana({ pasada: true });
  const semanaActual = periodoSemana({ pasada: false });
  const hoy = new Date();
  const mesActual = {
    fechaInicio: new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0],
    fechaFin: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0],
  };

  const periodo = presetPeriodo === 'semana_pasada' ? semanaPasada
    : presetPeriodo === 'semana_actual' ? semanaActual
    : presetPeriodo === 'mes_actual' ? mesActual
    : { fechaInicio: '2020-01-01', fechaFin: '2099-12-31' };

  const cargar = async () => {
    setLoading(true);
    try {
      const movs = await db.listarMovimientosCajaChica({
        fechaDesde: periodo.fechaInicio,
        fechaHasta: periodo.fechaFin,
      });
      setMovimientos(movs);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [presetPeriodo]);

  const dash = useMemo(
    () => calcDashboard({ movimientos, data, fechaInicio: periodo.fechaInicio, fechaFin: periodo.fechaFin }),
    [movimientos, data, periodo.fechaInicio, periodo.fechaFin],
  );

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      {/* Selector de período */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 p-1 flex-wrap">
        <PeriodoBtn activo={presetPeriodo === 'semana_pasada'} onClick={() => setPresetPeriodo('semana_pasada')}>Semana pasada</PeriodoBtn>
        <PeriodoBtn activo={presetPeriodo === 'semana_actual'} onClick={() => setPresetPeriodo('semana_actual')}>Semana actual</PeriodoBtn>
        <PeriodoBtn activo={presetPeriodo === 'mes_actual'} onClick={() => setPresetPeriodo('mes_actual')}>Mes actual</PeriodoBtn>
        <PeriodoBtn activo={presetPeriodo === 'todo'} onClick={() => setPresetPeriodo('todo')}>Histórico</PeriodoBtn>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icono={<Wallet className="w-3 h-3" />} label="Total entregado" valor={formatRD(dash.totalEntregado)} sub="al período" color="green" />
        <KPI icono={<Receipt className="w-3 h-3" />} label="Gastos aprobados" valor={formatRD(dash.totalGastosAprob)} sub={`${dash.countAprobados} factura${dash.countAprobados !== 1 ? 's' : ''} · ticket prom. ${formatRD(dash.ticketPromedio)}`} color="orange" />
        <KPI icono={<ShoppingBag className="w-3 h-3" />} label="Dietas" valor={formatRD(dash.totalDietas)} sub="aprobadas" color="blue" />
        <KPI icono={<AlertCircle className="w-3 h-3" />} label={`Pendientes (${dash.countPendientes})`} valor={formatRD(dash.totalPendientes)} sub="por aprobar" color={dash.countPendientes > 0 ? 'yellow' : 'zinc'} highlight={dash.countPendientes > 0} />
      </div>

      {/* Donut de categorías + leyenda */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">Gastos por categoría</div>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <DonutChart
            data={dash.donutCategorias}
            size={220}
            stroke={32}
            centerLabel={formatRD(dash.totalGastosAprob)}
            centerSub="Gasto total"
            formatTooltip={(v) => formatRD(v)}
          />
          <div className="flex-1 w-full">
            <DonutLegend data={dash.donutCategorias} formatTooltip={(v) => formatRD(v)} />
          </div>
        </div>
      </div>

      {/* Top proveedores y por persona */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">
            Top proveedores <span className="text-zinc-600 normal-case tracking-normal">({dash.proveedoresUnicos} únicos)</span>
          </div>
          <BarChartHorizontal data={dash.topProveedores} maxBars={8} formatValue={(v) => formatRD(v)} />
          {dash.proveedoresSinRNC > 0 && (
            <div className="text-[10px] text-yellow-400 mt-2">⚠️ {dash.proveedoresSinRNC} factura{dash.proveedoresSinRNC !== 1 ? 's' : ''} sin RNC del proveedor</div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">Gasto por persona</div>
          <BarChartHorizontal data={dash.barrasPersonas} maxBars={10} formatValue={(v) => formatRD(v)} />
        </div>
      </div>

      {/* Por proyecto + tendencia diaria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">
            Por proyecto <span className="text-zinc-600 normal-case tracking-normal">{dash.sinAsignarAProyecto > 0 ? `· ${dash.sinAsignarAProyecto} sin proyecto` : ''}</span>
          </div>
          {dash.barrasProyectos.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4">Sin gastos asociados a proyectos</div>
          ) : (
            <BarChartHorizontal data={dash.barrasProyectos} maxBars={8} formatValue={(v) => formatRD(v)} />
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">Tendencia diaria</div>
          <Sparkline data={dash.tendenciaDiaria} />
        </div>
      </div>
    </div>
  );
}

function PeriodoBtn({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${activo ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function KPI({ icono, label, valor, sub, color, highlight }) {
  const colors = {
    green: 'text-green-400',
    orange: 'text-orange-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    zinc: 'text-zinc-300',
    white: 'text-white',
  };
  return (
    <div className={`p-3 border ${highlight ? 'bg-zinc-950 border-yellow-700/40' : 'bg-zinc-900 border-zinc-800'}`}>
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-zinc-500 font-bold">{icono}{label}</div>
      <div className={`text-base sm:text-lg font-black mt-1 ${colors[color] || colors.zinc}`}>{valor}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Sparkline({ data }) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-zinc-500 text-center py-4">Sin movimientos en el período</div>;
  }
  const W = 320, H = 100;
  const path = generarPathSparkline(data, W, H, 8);
  const max = Math.max(...data.map(d => d.monto));
  const total = data.reduce((s, d) => s + d.monto, 0);
  const promedio = total / data.length;

  return (
    <div className="space-y-2">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <path d={path} stroke="#dc2626" strokeWidth={2} fill="none" />
        {data.map((d, i) => {
          const stepX = (W - 16) / Math.max(data.length - 1, 1);
          const x = 8 + i * stepX;
          const y = H - 8 - (d.monto / max) * (H - 16);
          return <circle key={i} cx={x} cy={y} r={3} fill="#dc2626" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span>{formatFechaCorta(data[0].fecha)}</span>
        <span>Promedio diario: <span className="text-white font-bold">{formatRD(promedio)}</span></span>
        <span>{formatFechaCorta(data[data.length - 1].fecha)}</span>
      </div>
    </div>
  );
}
