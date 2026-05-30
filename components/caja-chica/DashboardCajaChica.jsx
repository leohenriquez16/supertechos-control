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
// v8.17.12: helper para detectar datos incompletos (alineado con VistaCajaChicaAdmin)
function tieneDatosIncompletos(m) {
  if (m.tipo !== 'gasto_factura') return false;
  const sinFactura = !!m.datosIA?.sin_factura;
  if (!m.categoria && !m.datosIA?.categoria_sugerida) return true;
  if ((m.concepto || '').trim().length < 5) return true;
  if (!sinFactura && !m.proveedor) return true;
  return false;
}

export default function DashboardCajaChica({ data }) {
  const [presetPeriodo, setPresetPeriodo] = useState('mes_actual');
  const [movimientos, setMovimientos] = useState([]);
  const [movimientos8Sem, setMovimientos8Sem] = useState([]); // v8.17.12
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

  // v8.17.12: cargar últimas 8 semanas (independiente del filtro de período)
  useEffect(() => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 56);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date();
    hasta.setHours(23, 59, 59, 999);
    db.listarMovimientosCajaChica({
      fechaDesde: desde.toISOString().split('T')[0],
      fechaHasta: hasta.toISOString().split('T')[0],
    }).then(setMovimientos8Sem).catch(() => {});
  }, []);

  // v8.17.12: barras semanales (8 últimas semanas con sus totales de gastos aprobados)
  const semanas = useMemo(() => {
    const out = [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const lunes = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    for (let i = 7; i >= 0; i--) {
      const inicio = lunes(hoy);
      inicio.setDate(inicio.getDate() - i * 7);
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 6);
      const inicioStr = inicio.toISOString().split('T')[0];
      const finStr = fin.toISOString().split('T')[0];
      const total = movimientos8Sem
        .filter(m => m.tipo === 'gasto_factura' && m.status === 'aprobado')
        .filter(m => m.fecha >= inicioStr && m.fecha <= finStr)
        .reduce((s, m) => s + (m.monto || 0), 0);
      out.push({
        inicio, fin, total,
        label: `${inicio.getDate()}/${inicio.getMonth() + 1}`,
        esActual: i === 0,
      });
    }
    return out;
  }, [movimientos8Sem]);

  // v8.17.12: alertas para el banner top
  const alertas = useMemo(() => {
    const tresDias = new Date();
    tresDias.setDate(tresDias.getDate() - 3);
    tresDias.setHours(0, 0, 0, 0);
    const pendientesAntiguos = movimientos.filter(m =>
      m.status === 'pendiente_revision' &&
      m.createdAt &&
      new Date(m.createdAt) < tresDias
    ).length;
    const conDatosIncompletos = movimientos.filter(m =>
      m.status === 'pendiente_revision' && tieneDatosIncompletos(m)
    ).length;
    return { pendientesAntiguos, conDatosIncompletos };
  }, [movimientos]);

  const dash = useMemo(
    () => calcDashboard({ movimientos, data, fechaInicio: periodo.fechaInicio, fechaFin: periodo.fechaFin }),
    [movimientos, data, periodo.fechaInicio, periodo.fechaFin],
  );

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      {/* v8.17.12: banner de alertas */}
      {(alertas.pendientesAntiguos > 0 || alertas.conDatosIncompletos > 0) && (
        <div className="bg-gradient-to-r from-amber-950/40 to-orange-950/40 border border-amber-700 p-3 flex flex-wrap items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0 text-xs space-y-0.5">
            {alertas.pendientesAntiguos > 0 && (
              <div className="text-amber-200">
                <strong>{alertas.pendientesAntiguos} gasto{alertas.pendientesAntiguos !== 1 ? 's' : ''}</strong> pendiente{alertas.pendientesAntiguos !== 1 ? 's' : ''} esperando hace más de 3 días
              </div>
            )}
            {alertas.conDatosIncompletos > 0 && (
              <div className="text-amber-200">
                <strong>{alertas.conDatosIncompletos} gasto{alertas.conDatosIncompletos !== 1 ? 's' : ''}</strong> con datos incompletos a completar
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selector de período */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1 flex-wrap">
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

      {/* v8.17.12: Gastos por semana (últimas 8 semanas, independiente del filtro de período) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Gastos por semana · últimas 8 semanas</div>
          <div className="text-[10px] text-zinc-500">
            Promedio: <span className="text-white font-bold">{formatRD(semanas.reduce((s, w) => s + w.total, 0) / Math.max(1, semanas.filter(w => w.total > 0).length))}</span>
          </div>
        </div>
        <BarrasSemanales semanas={semanas} />
      </div>

      {/* Donut de categorías + leyenda */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
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
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">
            Top proveedores <span className="text-zinc-600 normal-case tracking-normal">({dash.proveedoresUnicos} únicos)</span>
          </div>
          <BarChartHorizontal data={dash.topProveedores} maxBars={8} formatValue={(v) => formatRD(v)} />
          {dash.proveedoresSinRNC > 0 && (
            <div className="text-[10px] text-yellow-400 mt-2">⚠️ {dash.proveedoresSinRNC} factura{dash.proveedoresSinRNC !== 1 ? 's' : ''} sin RNC del proveedor</div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">Gasto por persona</div>
          <BarChartHorizontal data={dash.barrasPersonas} maxBars={10} formatValue={(v) => formatRD(v)} />
        </div>
      </div>

      {/* Por proyecto + tendencia diaria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-3">
            Por proyecto <span className="text-zinc-600 normal-case tracking-normal">{dash.sinAsignarAProyecto > 0 ? `· ${dash.sinAsignarAProyecto} sin proyecto` : ''}</span>
          </div>
          {dash.barrasProyectos.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4">Sin gastos asociados a proyectos</div>
          ) : (
            <BarChartHorizontal data={dash.barrasProyectos} maxBars={8} formatValue={(v) => formatRD(v)} />
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
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

// v8.17.12: barras verticales para las últimas 8 semanas
function BarrasSemanales({ semanas }) {
  if (!semanas || semanas.length === 0) return null;
  const max = Math.max(...semanas.map(s => s.total), 1);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1.5 h-32 sm:h-40">
        {semanas.map((s, i) => {
          const pct = (s.total / max) * 100;
          const tieneData = s.total > 0;
          return (
            <div key={i} className="flex-1 h-full flex flex-col items-center gap-1 min-w-0">
              <div className="flex-1 w-full flex flex-col justify-end relative group">
                <div
                  className={`w-full transition-all ${s.esActual ? 'bg-red-500' : 'bg-red-600/70 group-hover:bg-red-500'}`}
                  style={{ height: tieneData ? `${pct}%` : '2px', minHeight: '2px' }}
                  title={`Sem del ${s.label} — ${formatRD(s.total)}`}
                />
                {tieneData && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-zinc-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    {formatRD(s.total)}
                  </div>
                )}
              </div>
              <div className={`text-[9px] uppercase tracking-wider truncate w-full text-center ${s.esActual ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-zinc-500 text-center">Hover sobre cada barra para ver el monto. Última semana en rojo intenso.</div>
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
