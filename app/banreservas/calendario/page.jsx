'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { planificar } from '../../../lib/banreservas/planning';

const COLOR_CAT = { A: '#16a34a', B: '#84cc16', C: '#f59e0b', D: '#dc2626' };
const COLOR_BRIGADA = { 1: '#dc2626', 2: '#2563eb' };
const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmtFecha(d) {
  return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
}
function fmtFechaCompleta(d) {
  return new Date(d).toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
function dowLabel(d) { return DOW_LABELS[new Date(d).getDay()]; }
function fmtKm(n) { return `${Math.round(n).toLocaleString('es-DO')} km`; }

export default function CalendarioPage() {
  const plan = useMemo(() => planificar('2026-05-25'), []);
  const [brigadaFiltro, setBrigadaFiltro] = useState('ambas');
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);

  // Merge brigade calendars by date
  const calendario = useMemo(() => {
    const map = new Map();
    plan.b1.calendar.forEach((c) => {
      const k = c.date.toISOString().slice(0, 10);
      map.set(k, { date: c.date, isSaturday: c.isSaturday, b1: c, b2: null });
    });
    plan.b2.calendar.forEach((c) => {
      const k = c.date.toISOString().slice(0, 10);
      const e = map.get(k);
      if (e) e.b2 = c;
      else map.set(k, { date: c.date, isSaturday: c.isSaturday, b1: null, b2: c });
    });
    return Array.from(map.values()).sort((a, b) => a.date - b.date);
  }, [plan]);

  const weeks = useMemo(() => {
    const wks = [];
    let week = [];
    for (const day of calendario) {
      const dow = day.date.getDay();
      if (dow === 1 && week.length > 0) {
        wks.push(week);
        week = [];
      }
      week.push(day);
    }
    if (week.length > 0) wks.push(week);
    return wks;
  }, [calendario]);

  const fechaInicio = plan.startDate;
  const fechaFinal = new Date(fechaInicio);
  fechaFinal.setDate(fechaFinal.getDate() + 60);

  // Stats por mes
  const mesesActivos = useMemo(() => {
    const meses = new Set([
      ...Object.keys(plan.b1.kmByMonth),
      ...Object.keys(plan.b2.kmByMonth),
    ].map(Number)).size;
    return Math.max(meses, 1);
  }, [plan]);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-block w-10 h-0.5 bg-red-600 mb-2" />
          <h1 className="text-2xl font-bold text-zinc-900">
            Calendario · <span className="text-red-600">60 días</span> de visitas
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Plan bimestral optimizado · {plan.stats.totalSucursales} oficinas · {fmtFechaCompleta(fechaInicio)} → {fmtFechaCompleta(fechaFinal)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">
            Exportar PDF
          </button>
          <button className="text-xs px-3 py-2 text-red-600 hover:bg-red-50 rounded font-medium">
            ↻ Recalcular
          </button>
        </div>
      </div>

      {/* Reglas operativas */}
      <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-5 text-xs text-amber-900">
        <div className="font-bold uppercase tracking-wider text-[10px] mb-1">Parámetros del calendario</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5">
          <div>· Visitas dentro de horario de apertura (<strong>desde 8:00 AM</strong>)</div>
          <div>· Tolerancia de <strong>±5 días</strong> en cada visita programada</div>
          <div>· Giras agrupadas por <strong>región</strong> para optimizar tiempos de traslado</div>
          <div>· Priorización por <strong>categoría técnica</strong> (oficinas en C/D primero)</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <KpiCard
          label="Cobertura"
          value={`${plan.stats.coberturaPct.toFixed(0)}%`}
          sub={`${plan.stats.totalVisitas} de ${plan.stats.totalSucursales} sucursales`}
          stripe={plan.stats.coberturaPct >= 100 ? '#16a34a' : plan.stats.coberturaPct >= 90 ? '#84cc16' : '#f59e0b'}
        />
        <KpiCard
          label="Vehículo B1"
          value={fmtKm(plan.stats.kmMesPromB1)}
          sub={`/ mes · ${plan.b1.trips.length} giras`}
          stripe={COLOR_BRIGADA[1]}
        />
        <KpiCard
          label="Vehículo B2"
          value={fmtKm(plan.stats.kmMesPromB2)}
          sub={`/ mes · ${plan.b2.trips.length} giras`}
          stripe={COLOR_BRIGADA[2]}
        />
        <KpiCard
          label="Giras programadas"
          value={`${plan.b1.trips.length + plan.b2.trips.length}`}
          sub={`B1: ${plan.b1.trips.length} · B2: ${plan.b2.trips.length}`}
          stripe="#a855f7"
        />
        <KpiCard
          label="Km total programa"
          value={fmtKm(plan.stats.totalKm)}
          sub={`${plan.stats.diasDisponibles} días disponibles`}
          stripe="#0ea5e9"
        />
      </div>

      {/* Stats por mes y brigada */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <BrigadaSummary brigada={plan.b1} label="Brigada 1 · Sur/Este" color={COLOR_BRIGADA[1]} />
        <BrigadaSummary brigada={plan.b2} label="Brigada 2 · Norte/Cibao" color={COLOR_BRIGADA[2]} />
      </div>

      {/* Filtro brigada */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Brigada:</span>
        {[
          { v: 'ambas', label: 'Ambas', color: 'bg-zinc-900' },
          { v: '1', label: 'B1 · Sur/Este', color: 'bg-red-600' },
          { v: '2', label: 'B2 · Norte/Cibao', color: 'bg-blue-600' },
        ].map((b) => (
          <button
            key={b.v}
            onClick={() => setBrigadaFiltro(b.v)}
            className={`text-xs px-3 py-1.5 rounded font-medium transition ${
              brigadaFiltro === b.v ? `${b.color} text-white` : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
        <Leg color="#dc2626" label="Brigada 1" />
        <Leg color="#2563eb" label="Brigada 2" />
        <span className="inline-flex items-center gap-1 text-zinc-600">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" /> Trip multi-día
        </span>
        <span className="inline-flex items-center gap-1 text-zinc-600">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-400 inline-block" /> Visita diaria
        </span>
      </div>

      {/* Calendario */}
      <div className="space-y-4">
        {weeks.map((week, wi) => (
          <div key={wi}>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">
              Semana {wi + 1} · {fmtFecha(week[0].date)} – {fmtFecha(week[week.length - 1].date)}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {wi === 0 &&
                week[0].date.getDay() !== 1 &&
                Array.from({ length: (week[0].date.getDay() || 7) - 1 }).map((_, i) => (
                  <div key={`pad_${i}`} className="bg-zinc-50 rounded border border-dashed border-zinc-200" />
                ))}
              {week.map((day) => (
                <DayCell
                  key={day.date.toISOString()}
                  day={day}
                  brigadaFiltro={brigadaFiltro}
                  onClick={() => setDiaSeleccionado(day)}
                />
              ))}
              {week.length < 6 &&
                wi > 0 &&
                Array.from({ length: 6 - week.length }).map((_, i) => (
                  <div key={`end_${i}`} className="bg-zinc-50 rounded border border-dashed border-zinc-200" />
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {diaSeleccionado && <DiaModal day={diaSeleccionado} onClose={() => setDiaSeleccionado(null)} />}
    </div>
  );
}

// ════════════ BRIGADA SUMMARY ════════════
function BrigadaSummary({ brigada, label, color }) {
  // Solo mostramos 2 meses operativos (días 1-30 y días 31-60)
  const meses = [1, 2];
  return (
    <div className="bg-white border border-zinc-200 rounded shadow-sm p-3" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-bold text-zinc-900">{label}</div>
        <div className="text-xs text-zinc-500">
          {brigada.totalVisitados}/{brigada.totalSucursales} oficinas · {brigada.trips.length} giras
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {meses.map((m) => {
          const km = Math.round(brigada.kmByMonth[m] || 0);
          const tripCount = brigada.tripsByMonth?.[m]?.trips || 0;
          return (
            <div key={m} className="border border-zinc-100 rounded p-2 bg-zinc-50">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                Mes operativo {m}
              </div>
              <div className="text-[10px] text-zinc-400 -mt-0.5">
                {m === 1 ? 'días 1–30' : 'días 31–60'}
              </div>
              <div className="text-base font-bold text-zinc-900 tabular-nums mt-1">{fmtKm(km)}</div>
              <div className="text-[10px] mt-0.5 text-zinc-500">
                {tripCount} giras
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════ DAY CELL ════════════
function DayCell({ day, brigadaFiltro, onClick }) {
  const showB1 = brigadaFiltro === 'ambas' || brigadaFiltro === '1';
  const showB2 = brigadaFiltro === 'ambas' || brigadaFiltro === '2';
  const cellB1 = showB1 ? day.b1 : null;
  const cellB2 = showB2 ? day.b2 : null;

  const tripB1 = cellB1?.trip;
  const tripB2 = cellB2?.trip;

  const hasOvernight =
    (tripB1?.esMultiDia && day.b1.dayInTrip < tripB1.totalDays) ||
    (tripB2?.esMultiDia && day.b2.dayInTrip < tripB2.totalDays);

  const hasContent = (cellB1 && cellB1.ocupado) || (cellB2 && cellB2.ocupado);

  return (
    <button
      onClick={onClick}
      className={`text-left bg-white border rounded shadow-sm overflow-hidden hover:shadow-md transition ${
        hasOvernight ? 'border-purple-300 ring-1 ring-purple-200' : 'border-zinc-200'
      } ${day.isSaturday ? 'bg-zinc-50' : ''}`}
    >
      <div className="px-2.5 py-1.5 border-b border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-semibold text-zinc-500">{dowLabel(day.date)}</span>
          <span className="text-sm font-bold text-zinc-900">{fmtFecha(day.date)}</span>
        </div>
        <div className="flex items-center gap-1">
          {day.isSaturday && (
            <span className="text-[8px] uppercase tracking-wider text-amber-700 bg-amber-100 px-1 rounded">½d</span>
          )}
        </div>
      </div>

      <div className="p-2 space-y-1.5 min-h-[140px]">
        {cellB1 && cellB1.ocupado && (
          <BrigadaBlock cell={cellB1} day={day} color="#dc2626" label="B1" />
        )}
        {cellB2 && cellB2.ocupado && (
          <BrigadaBlock cell={cellB2} day={day} color="#2563eb" label="B2" />
        )}
        {!hasContent && (
          <div className="text-[10px] text-zinc-400 italic text-center pt-4">
            Sin asignaciones
          </div>
        )}
      </div>
    </button>
  );
}

function BrigadaBlock({ cell, day, color, label }) {
  const trip = cell.trip;
  const dayPlan = trip.dayPlans.find((dp) => dp.date.toDateString() === cell.date.toDateString());
  if (!dayPlan) return null;

  const esPrimero = dayPlan.esPrimerDia;
  const esUltimo = dayPlan.esUltimoDia;
  const enMedio = trip.esMultiDia && !esPrimero && !esUltimo;
  const seguiraPernoctando = trip.esMultiDia && !esUltimo;

  return (
    <div className="rounded overflow-hidden" style={{ background: `${color}10`, borderLeft: `3px solid ${color}` }}>
      <div className="px-1.5 py-1 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>
          {label} · {dayPlan.visits.length}v
        </span>
        <span className="text-[9px] text-zinc-500 tabular-nums">{dayPlan.kmDia} km</span>
      </div>
      {trip.esMultiDia && (
        <div className="px-1.5 text-[9px] font-medium" style={{ color }}>
          📍 {trip.region.slice(0, 18)}{trip.region.length > 18 ? '…' : ''} · día {dayPlan.diaN}/{trip.totalDays}
        </div>
      )}
      <div className="px-1.5 pb-1 space-y-0.5 mt-0.5">
        {dayPlan.visits.slice(0, 2).map((v) => (
          <div key={v.id} className="text-[10px] text-zinc-700 truncate flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: COLOR_CAT[v.categoria] }} />
            <span className="truncate">{v.zona || v.codigo_br}</span>
          </div>
        ))}
        {dayPlan.visits.length > 2 && (
          <div className="text-[10px] text-zinc-500 italic">+{dayPlan.visits.length - 2} más</div>
        )}
        <div className="text-[9px] text-zinc-500 pt-0.5">
          1ª visita {dayPlan.primeraVisita}
        </div>
      </div>
    </div>
  );
}

// ════════════ MODAL ════════════
function DiaModal({ day, onClose }) {
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
              {fmtFechaCompleta(day.date)}
            </div>
            <div className="text-lg font-bold text-zinc-900 mt-0.5">Plan del día</div>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-zinc-400 hover:text-red-600 px-2">×</button>
        </div>
        <div className="p-6 space-y-4">
          {day.b1 && day.b1.ocupado && <BrigadaDetail cell={day.b1} color="#dc2626" label="Brigada 1 · Sur/Este" />}
          {day.b2 && day.b2.ocupado && <BrigadaDetail cell={day.b2} color="#2563eb" label="Brigada 2 · Norte/Cibao" />}
        </div>
      </div>
    </div>
  );
}

function BrigadaDetail({ cell, color, label }) {
  const trip = cell.trip;
  const dayPlan = trip.dayPlans.find((dp) => dp.date.toDateString() === cell.date.toDateString());
  if (!dayPlan) return null;

  const esPrimero = dayPlan.esPrimerDia;
  const esUltimo = dayPlan.esUltimoDia;

  return (
    <div className="border-l-4 pl-4" style={{ borderColor: color }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</div>
          <div className="text-sm font-bold text-zinc-900">
            {trip.esMultiDia ? `Trip ${trip.region} · día ${dayPlan.diaN} de ${trip.totalDays}` : `Trip diario · ${trip.region}`}
          </div>
        </div>
        <div className="text-right">
          {trip.esMultiDia && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded inline-block mb-1">
              📍 Gira {trip.totalDays} días · {trip.hotelHospedaje}
            </div>
          )}
          <div className="text-xs text-zinc-500">
            <strong>{dayPlan.kmDia} km</strong> hoy · gira total <strong>{trip.kmTotal} km</strong>
          </div>
        </div>
      </div>

      <ol className="space-y-2">
        {esPrimero && dayPlan.salidaSD && (
          <li className="text-xs text-zinc-500 flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">🚐</span>
            <div className="flex-1">
              <div className="font-medium text-zinc-700">Inicio de jornada</div>
              <div className="text-[10px] text-zinc-500">{dayPlan.salidaSD}</div>
            </div>
          </li>
        )}
        {!esPrimero && (
          <li className="text-xs text-zinc-500 flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">📍</span>
            <div className="flex-1">
              <div className="font-medium text-zinc-700">Continúa en {trip.region}</div>
              <div className="text-[10px] text-zinc-500">Primera visita del día a las 8:00 AM</div>
            </div>
          </li>
        )}
        {dayPlan.visits.map((v, i) => {
          const horaLlegada = i === 0 ? dayPlan.primeraVisita : (i === dayPlan.visits.length - 1 ? dayPlan.ultimaVisita : '—');
          return (
            <li key={v.id} className="text-xs flex items-start gap-2">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: color }}>
                {i + 1}
              </span>
              <Link href={`/banreservas/sucursal/${v.codigo_br}`} className="flex-1 group hover:bg-zinc-50 -mx-1 px-1 py-0.5 rounded">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-zinc-900 group-hover:text-red-600">{v.zona}</span>
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white" style={{ background: COLOR_CAT[v.categoria] }}>
                    {v.categoria}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">{v.codigo_br}</span>
                  {i === 0 && <span className="text-[10px] text-green-700 font-semibold">🏢 {horaLlegada}</span>}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {v.regional} · {v.provincia} · {(v.direccion || '').slice(0, 70)}{(v.direccion || '').length > 70 ? '…' : ''}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  Gerente: {v.gerente} {v.telefono_celular && `· ${v.telefono_celular}`}
                </div>
              </Link>
            </li>
          );
        })}
        {esUltimo && dayPlan.regresoSD && (
          <li className="text-xs text-zinc-500 flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">🏁</span>
            <div className="flex-1">
              <div className="font-medium text-zinc-700">Cierre de jornada</div>
              <div className="text-[10px] text-zinc-500">{dayPlan.regresoSD}</div>
            </div>
          </li>
        )}
        {!esUltimo && trip.esMultiDia && (
          <li className="text-xs text-zinc-500 flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">📍</span>
            <div className="flex-1">
              <div className="font-medium text-purple-700">Continúa la gira en {trip.region}</div>
              <div className="text-[10px] text-zinc-500">Próximo día: día {dayPlan.diaN + 1} de {trip.totalDays}</div>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}

// ════════════ HELPERS UI ════════════
function KpiCard({ label, value, sub, stripe }) {
  return (
    <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 relative overflow-hidden">
      <div className="absolute left-0 right-0 top-0 h-0.5" style={{ background: stripe }} />
      <div className="text-[10px] text-zinc-500 uppercase tracking-[1.5px] font-semibold">{label}</div>
      <div className="text-xl font-bold text-zinc-900 mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}

function Leg({ color, label }) {
  return (
    <div className="flex items-center gap-1.5 text-zinc-600">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}
