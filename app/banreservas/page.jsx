'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { sucursales, obtenerKpis } from '../../lib/data/banreservas-mock';

const MapaLeaflet = dynamic(() => import('../../components/common/MapaLeaflet'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] bg-zinc-100 flex items-center justify-center text-zinc-400 text-sm">
      Cargando mapa…
    </div>
  ),
});

const COLOR_CAT = {
  A: '#16a34a',
  B: '#84cc16',
  C: '#f59e0b',
  D: '#dc2626',
};

const HOY = new Date('2026-05-21');

function fmtFechaCorta(d) {
  return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtFechaLarga(d) {
  return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });
}

function popupHTML(s) {
  return `
    <div style="min-width:240px;font-family:system-ui,sans-serif">
      <div style="font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1px">${s.regional} · ${s.codigo_br}</div>
      <div style="font-size:13px;font-weight:700;color:#18181b;margin-top:2px">${s.zona || s.codigo}</div>
      <div style="display:inline-block;margin-top:6px;padding:2px 8px;font-size:10px;font-weight:700;color:white;background:${COLOR_CAT[s.categoria]};border-radius:3px;letter-spacing:1px">
        ESTADO ${s.categoria}
      </div>
      <div style="font-size:11px;color:#52525b;margin-top:6px;line-height:1.4">${s.direccion || ''}</div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e4e4e7">
        <div style="font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1px">Gerente</div>
        <div style="font-size:12px;color:#18181b;font-weight:600">${s.gerente || '—'}</div>
        <div style="font-size:11px;color:#52525b;margin-top:2px">${s.telefono_oficina || s.telefono_celular || ''}</div>
      </div>
      <div style="margin-top:6px;font-size:11px;color:#52525b">
        Próx. visita: <strong>${fmtFechaCorta(s.proxima_visita)}</strong>
      </div>
      <a href="/banreservas/sucursal/${s.codigo_br}" style="display:block;margin-top:8px;text-align:center;background:#dc2626;color:white;padding:6px;border-radius:3px;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:0.5px">
        Ver ficha completa →
      </a>
    </div>
  `;
}

function computeKpisFromList(list) {
  const total = list.length;
  if (total === 0) return { total: 0, porCategoria: { A:0,B:0,C:0,D:0 }, pctVisitasAtiempo: 0, sucursalesCriticas: 0, garantiasPorVencer: 0, alertasCriticas: [] };
  const porCat = { A: 0, B: 0, C: 0, D: 0 };
  let garantiasPorVencer = 0;
  const alertasCriticas = [];
  list.forEach(s => {
    porCat[s.categoria] = (porCat[s.categoria] || 0) + 1;
    if (s.garantia_estado === 'por_vencer') garantiasPorVencer++;
    if (s.categoria === 'D') {
      alertasCriticas.push({
        sucursal: s,
        motivo: s.hallazgos_criticos[0]?.tipo || 'Estado crítico',
      });
    }
  });
  return {
    total,
    porCategoria: porCat,
    pctVisitasAtiempo: 96.8,
    sucursalesCriticas: porCat.D,
    garantiasPorVencer,
    alertasCriticas: alertasCriticas.slice(0, 5),
  };
}

export default function BanreservasDashboard() {
  const kpisGlobal = useMemo(() => obtenerKpis(), []);

  // Filtros
  const [search, setSearch] = useState('');
  const [regionalFiltro, setRegionalFiltro] = useState('');
  const [provinciaFiltro, setProvinciaFiltro] = useState('');
  const [catFiltro, setCatFiltro] = useState(null);

  const regionales = useMemo(
    () => Array.from(new Set(sucursales.map(s => s.regional))).sort(),
    []
  );

  const provincias = useMemo(() => {
    const base = sucursales
      .map(s => s.provincia)
      .filter(Boolean);
    return Array.from(new Set(base)).sort();
  }, []);

  // Si hay regional seleccionada, filtrar provincias compatibles
  const provinciasVisibles = useMemo(() => {
    if (!regionalFiltro) return provincias;
    const compatibles = new Set(
      sucursales
        .filter(s => s.regional === regionalFiltro)
        .map(s => s.provincia)
        .filter(Boolean)
    );
    return provincias.filter(p => compatibles.has(p));
  }, [regionalFiltro, provincias]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sucursales.filter(s => {
      if (catFiltro && s.categoria !== catFiltro) return false;
      if (regionalFiltro && s.regional !== regionalFiltro) return false;
      if (provinciaFiltro && s.provincia !== provinciaFiltro) return false;
      if (q) {
        const haystack = [
          s.zona, s.codigo, s.codigo_br, s.direccion, s.gerente, s.provincia, s.regional,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [search, regionalFiltro, provinciaFiltro, catFiltro]);

  const hayFiltros = search || regionalFiltro || provinciaFiltro || catFiltro;

  const limpiarFiltros = () => {
    setSearch('');
    setRegionalFiltro('');
    setProvinciaFiltro('');
    setCatFiltro(null);
  };

  const kpisView = useMemo(() => computeKpisFromList(filtradas), [filtradas]);

  const markers = useMemo(() => filtradas.map(s => ({
    lat: s.latitud,
    lng: s.longitud,
    color: COLOR_CAT[s.categoria],
    label: `${s.codigo_br} · ${s.zona} (${s.categoria})`,
    popup: popupHTML(s),
  })), [filtradas]);

  const visitasPorMes = useMemo(() => {
    const meses = ['Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May'];
    return meses.map((m, i) => ({
      mes: m,
      visitas: Math.floor(30 + Math.sin(i / 1.5) * 8 + (i % 4) * 2 + i * 0.5),
    }));
  }, []);

  const maxVisitas = Math.max(...visitasPorMes.map(v => v.visitas));

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-block w-10 h-0.5 bg-red-600 mb-2" />
          <h1 className="text-2xl font-bold text-zinc-900">
            Vista Nacional · <span className="text-red-600">{kpisView.total}</span>
            {hayFiltros && <span className="text-zinc-400 font-normal text-base"> / {kpisGlobal.total}</span>}
            <span> Oficinas</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Estado consolidado del programa de mantenimiento al {fmtFechaLarga(HOY)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">
            Exportar PDF
          </button>
          <button className="text-xs px-3 py-2 text-red-600 hover:bg-red-50 rounded font-medium">
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 mb-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por sucursal, código, gerente, dirección…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-200 rounded focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-600 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>

        <select
          value={regionalFiltro}
          onChange={e => { setRegionalFiltro(e.target.value); setProvinciaFiltro(''); }}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition ${regionalFiltro ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}
        >
          <option value="">Todas las regionales</option>
          {regionales.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          value={provinciaFiltro}
          onChange={e => setProvinciaFiltro(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition ${provinciaFiltro ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}
        >
          <option value="">Todas las provincias</option>
          {provinciasVisibles.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {hayFiltros && (
          <button
            onClick={limpiarFiltros}
            className="text-xs px-3 py-2 text-red-600 hover:bg-red-50 rounded font-semibold"
          >
            × Limpiar filtros
          </button>
        )}

        <div className="ml-auto text-xs text-zinc-500">
          {kpisView.total === kpisGlobal.total
            ? <>Mostrando todas las <strong className="text-zinc-700">{kpisGlobal.total}</strong> sucursales</>
            : <>Mostrando <strong className="text-red-600">{kpisView.total}</strong> de {kpisGlobal.total}</>
          }
        </div>
      </div>

      {/* KPIs — reactivos a filtros */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Oficinas" value={kpisView.total} sub={hayFiltros ? 'En filtro actual' : 'En el programa'} stripe={COLOR_CAT.A} />
        <KpiCard label="Visitas a Tiempo" value={`${kpisView.pctVisitasAtiempo.toFixed(1)}%`} sub="Últimos 6 meses" stripe={COLOR_CAT.A} />
        <KpiCard label="Oficinas Críticas" value={kpisView.sucursalesCriticas} sub="Estado D · Requieren acción" stripe={COLOR_CAT.D} />
        <KpiCard label="Garantías por Vencer" value={kpisView.garantiasPorVencer} sub="En próximos 6 meses" stripe={COLOR_CAT.C} />
      </div>

      {/* Mapa + Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-white border border-zinc-200 rounded shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Distribución Nacional</div>
              <div className="text-xs text-zinc-500">
                Estado actual por sucursal
                {regionalFiltro && ` · ${regionalFiltro}`}
                {provinciaFiltro && ` · ${provinciaFiltro}`}
                {catFiltro && ` · Estado ${catFiltro}`}
              </div>
            </div>
            <div className="text-xs text-zinc-400">
              {filtradas.length} sucursales {hayFiltros ? 'visibles' : 'totales'}
            </div>
          </div>
          <MapaLeaflet
            center={[18.7357, -70.1627]}
            zoom={8}
            height={400}
            markers={markers}
            scrollWheelZoom
            maxBounds={[[17.20, -72.30], [20.20, -68.10]]}
            minZoom={7}
          />
          <div className="px-4 py-3 border-t border-zinc-200 flex items-center gap-4 text-xs">
            <Legend k="A/B" count={kpisView.porCategoria.A + kpisView.porCategoria.B} color={COLOR_CAT.A} active={catFiltro === 'A'} onClick={() => setCatFiltro(catFiltro === 'A' ? null : 'A')} />
            <Legend k="C" count={kpisView.porCategoria.C} color={COLOR_CAT.C} active={catFiltro === 'C'} onClick={() => setCatFiltro(catFiltro === 'C' ? null : 'C')} />
            <Legend k="D" count={kpisView.porCategoria.D} color={COLOR_CAT.D} active={catFiltro === 'D'} onClick={() => setCatFiltro(catFiltro === 'D' ? null : 'D')} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white border border-zinc-200 rounded shadow-sm p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-zinc-900 mb-2">Estado de Cubiertas</div>
                <DonutCategorias kpis={kpisView} />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-900 mb-2">Visitas Ejecutadas/Mes</div>
                <BarChart data={visitasPorMes} max={maxVisitas} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded shadow-sm">
            <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-900">Alertas Activas</div>
              {kpisView.alertasCriticas.length > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-red-600 px-2 py-0.5 rounded">
                  {kpisView.alertasCriticas.length} {kpisView.alertasCriticas.length === 1 ? 'nueva' : 'nuevas'}
                </span>
              )}
            </div>
            <div className="divide-y divide-zinc-100">
              {kpisView.alertasCriticas.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-zinc-400">
                  Sin alertas críticas en el filtro actual.
                </div>
              ) : (
                kpisView.alertasCriticas.map((a, i) => (
                  <Link
                    key={i}
                    href={`/banreservas/sucursal/${a.sucursal.codigo_br}`}
                    className="flex items-start gap-2 px-4 py-2.5 hover:bg-red-50"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-zinc-900 truncate">
                        Suc. {a.sucursal.zona}
                      </div>
                      <div className="text-[11px] text-red-600 truncate">{a.motivo}</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom stats bar — global del programa */}
      <div className="bg-white border-2 border-red-600 rounded shadow-sm grid grid-cols-2 md:grid-cols-5 divide-x divide-zinc-200 overflow-hidden">
        <WhiteStat label="Visitas Ejecutadas" value={kpisGlobal.ejecutadasMes.toLocaleString('es-DO')} sub="Este mes" />
        <WhiteStat label="m² Inspeccionados" value={Math.round(kpisGlobal.m2Inspeccionados).toLocaleString('es-DO')} sub="Total YTD" />
        <WhiteStat label="Reportes Entregados" value={`${kpisGlobal.reportesEntregados}/${kpisGlobal.total}`} sub="100% SLA" />
        <WhiteStat label="Próx. Visitas" value={kpisGlobal.proximasVisitas} sub="Siguientes 7 días" />
        <WhiteStat label="CAPEX Proyectado 24m" value={`RD$ ${(kpisGlobal.capexProyectado / 1_000_000).toFixed(1)} M`} sub="Cotizaciones abiertas" />
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

function Legend({ k, count, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded transition ${active ? 'bg-red-50 ring-1 ring-red-200' : 'hover:bg-zinc-50'}`}
    >
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-zinc-700 font-medium">
        Estado {k} <span className="text-zinc-400">({count})</span>
      </span>
    </button>
  );
}

function DonutCategorias({ kpis }) {
  const total = kpis.total || 1;
  const segs = [
    { label: 'A', value: kpis.porCategoria.A, color: COLOR_CAT.A },
    { label: 'B', value: kpis.porCategoria.B, color: COLOR_CAT.B },
    { label: 'C', value: kpis.porCategoria.C, color: COLOR_CAT.C },
    { label: 'D', value: kpis.porCategoria.D, color: COLOR_CAT.D },
  ];
  const r = 36, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center justify-center">
      <svg width={120} height={120} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} fill="none" stroke="#f4f4f5" strokeWidth={12} />
        {segs.map((s, i) => {
          const frac = s.value / total;
          const len = c * frac;
          const offset = c * (acc / total);
          acc += s.value;
          return (
            <circle
              key={i}
              cx={50} cy={50} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={12}
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
        })}
        <text x={50} y={48} textAnchor="middle" fontSize={14} fontWeight={700} fill="#18181b">{kpis.total}</text>
        <text x={50} y={60} textAnchor="middle" fontSize={6} fill="#71717a">Total</text>
      </svg>
    </div>
  );
}

function BarChart({ data, max }) {
  return (
    <svg width="100%" height={120} viewBox={`0 0 ${data.length * 14} 100`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = (d.visitas / max) * 80;
        const isLast = i === data.length - 1;
        return (
          <g key={i}>
            <rect x={i * 14 + 2} y={90 - h} width={10} height={h} fill={isLast ? '#991b1b' : '#dc2626'} rx={1} />
            <text x={i * 14 + 7} y={98} textAnchor="middle" fontSize={5} fill="#71717a">{d.mes}</text>
          </g>
        );
      })}
    </svg>
  );
}

function WhiteStat({ label, value, sub }) {
  return (
    <div className="px-4 py-4 bg-white">
      <div className="text-[10px] text-zinc-500 uppercase tracking-[1.5px] font-semibold">{label}</div>
      <div className="text-2xl font-bold text-red-600 mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}
