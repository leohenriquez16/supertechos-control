'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { sucursales } from '../../../lib/data/banreservas-mock';

const COLOR_CAT = { A: '#16a34a', B: '#84cc16', C: '#f59e0b', D: '#dc2626' };

function TipoBadge({ tipo }) {
  const cls = tipo === 'Emergencia' ? 'bg-red-100 text-red-700 border-red-200'
            : tipo === 'Correctiva' ? 'bg-amber-100 text-amber-700 border-amber-200'
            : 'bg-blue-100 text-blue-700 border-blue-200';
  return <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border uppercase tracking-wider ${cls}`}>{tipo}</span>;
}

export default function VisitasPage() {
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [periodoFiltro, setPeriodoFiltro] = useState('todos');

  // Flatten todas las visitas de todas las oficinas
  const todasLasVisitas = useMemo(() => {
    const lista = [];
    sucursales.forEach(s => {
      (s.visitas_completas || []).forEach(v => {
        lista.push({
          ...v,
          oficina: s.zona,
          codigo_br: s.codigo_br,
          regional: s.regional,
          provincia: s.provincia,
          categoria_oficina: s.categoria,
        });
      });
    });
    return lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, []);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hoy = new Date('2026-05-21');
    return todasLasVisitas.filter(v => {
      if (tipoFiltro && v.tipo !== tipoFiltro) return false;
      if (estadoFiltro && v.estado !== estadoFiltro) return false;
      if (periodoFiltro !== 'todos') {
        const dias = Math.floor((hoy - new Date(v.fecha)) / (1000 * 60 * 60 * 24));
        if (periodoFiltro === '7' && dias > 7) return false;
        if (periodoFiltro === '30' && dias > 30) return false;
        if (periodoFiltro === '90' && dias > 90) return false;
      }
      if (q) {
        const h = [v.oficina, v.codigo_br, v.supervisor, v.brigada, v.regional, v.folio].filter(Boolean).join(' ').toLowerCase();
        if (!h.includes(q)) return false;
      }
      return true;
    });
  }, [search, tipoFiltro, estadoFiltro, periodoFiltro, todasLasVisitas]);

  const hayFiltros = search || tipoFiltro || estadoFiltro || periodoFiltro !== 'todos';

  // KPIs
  const kpis = useMemo(() => {
    const total = filtradas.length;
    const preventivas = filtradas.filter(v => v.tipo === 'Preventiva').length;
    const correctivas = filtradas.filter(v => v.tipo === 'Correctiva').length;
    const emergencias = filtradas.filter(v => v.tipo === 'Emergencia').length;
    const pendientes = filtradas.filter(v => v.estado === 'pendiente_revision').length;
    return { total, preventivas, correctivas, emergencias, pendientes };
  }, [filtradas]);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-block w-10 h-0.5 bg-red-600 mb-2" />
          <h1 className="text-2xl font-bold text-zinc-900">
            Visitas Técnicas · <span className="text-red-600">{filtradas.length}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Historial completo de visitas preventivas, correctivas y emergencias en toda la red
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">
            Exportar Excel
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Total visitas" value={kpis.total} stripe="#3b82f6" />
        <KpiCard label="Preventivas" value={kpis.preventivas} stripe="#3b82f6" />
        <KpiCard label="Correctivas" value={kpis.correctivas} stripe="#f59e0b" />
        <KpiCard label="Emergencias" value={kpis.emergencias} stripe="#dc2626" />
        <KpiCard label="Pendientes revisión" value={kpis.pendientes} stripe="#a855f7" />
      </div>

      {/* Filtros */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 mb-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por oficina, código BR, supervisor, folio…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-200 rounded focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
          />
        </div>

        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer ${tipoFiltro ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todos los tipos</option>
          <option value="Preventiva">Preventiva</option>
          <option value="Correctiva">Correctiva</option>
          <option value="Emergencia">Emergencia</option>
        </select>

        <select value={periodoFiltro} onChange={e => setPeriodoFiltro(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer ${periodoFiltro !== 'todos' ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="todos">Todo el tiempo</option>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
        </select>

        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer ${estadoFiltro ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todos los estados</option>
          <option value="pendiente_revision">Pendiente revisión</option>
          <option value="notificada_banco">Notificada banco</option>
        </select>

        {hayFiltros && (
          <button onClick={() => { setSearch(''); setTipoFiltro(''); setEstadoFiltro(''); setPeriodoFiltro('todos'); }} className="text-xs px-3 py-2 text-red-600 hover:bg-red-50 rounded font-semibold">
            × Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <tr>
              <th className="text-left px-3 py-2.5">Folio</th>
              <th className="text-left px-3 py-2.5">Fecha</th>
              <th className="text-left px-3 py-2.5">Oficina</th>
              <th className="text-left px-3 py-2.5">Tipo</th>
              <th className="text-left px-3 py-2.5">Supervisor</th>
              <th className="text-left px-3 py-2.5">Brigada</th>
              <th className="text-center px-3 py-2.5">Cat. asignada</th>
              <th className="text-right px-3 py-2.5">Hallazgos</th>
              <th className="text-right px-3 py-2.5">Fotos</th>
              <th className="text-left px-3 py-2.5">Estado</th>
              <th className="text-left px-3 py-2.5">Reporte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtradas.slice(0, 100).map(v => (
              <tr key={v.id} className="hover:bg-zinc-50">
                <td className="px-3 py-2.5 text-zinc-500 font-mono text-xs">{v.folio}</td>
                <td className="px-3 py-2.5 text-zinc-700 text-xs">
                  {new Date(v.fecha).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/banreservas/sucursal/${v.codigo_br}`} className="text-zinc-900 font-medium hover:text-red-600 text-sm">
                    {v.oficina}
                  </Link>
                  <div className="text-[10px] text-zinc-400">{v.codigo_br}</div>
                </td>
                <td className="px-3 py-2.5">
                  <TipoBadge tipo={v.tipo} />
                </td>
                <td className="px-3 py-2.5 text-zinc-700 text-xs">{v.supervisor}</td>
                <td className="px-3 py-2.5 text-zinc-500 text-xs">{v.brigada}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white font-bold text-xs"
                    style={{ background: COLOR_CAT[v.categoria_asignada] }}>
                    {v.categoria_asignada}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-700 tabular-nums">{v.n_hallazgos}</td>
                <td className="px-3 py-2.5 text-right text-zinc-500 tabular-nums">{v.n_fotos}</td>
                <td className="px-3 py-2.5 text-xs">
                  {v.estado === 'pendiente_revision'
                    ? <span className="text-amber-600 font-medium">Pendiente</span>
                    : <span className="text-green-700">Notificada</span>
                  }
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {v.reporte_pdf
                    ? <button className="text-red-600 hover:underline">↓ PDF</button>
                    : <span className="text-zinc-400">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtradas.length > 100 && (
          <div className="px-4 py-3 text-xs text-zinc-500 border-t border-zinc-200 bg-zinc-50">
            Mostrando 100 de {filtradas.length}. Aplica filtros para acotar.
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, stripe }) {
  return (
    <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 relative overflow-hidden">
      <div className="absolute left-0 right-0 top-0 h-0.5" style={{ background: stripe }} />
      <div className="text-[10px] text-zinc-500 uppercase tracking-[1.5px] font-semibold">{label}</div>
      <div className="text-xl font-bold text-zinc-900 mt-1 tabular-nums">{value}</div>
    </div>
  );
}
