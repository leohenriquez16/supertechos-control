'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { sucursales } from '../../../lib/data/banreservas-mock';

const COLOR_SEV = {
  'CRÍTICA': 'bg-red-600 text-white',
  'ALTA':    'bg-amber-500 text-white',
  'MEDIA':   'bg-yellow-400 text-zinc-900',
  'PREVIA':  'bg-zinc-400 text-white',
};

export default function HallazgosPage() {
  const [search, setSearch] = useState('');
  const [sevFiltro, setSevFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [regionalFiltro, setRegionalFiltro] = useState('');

  // Flatten todos los hallazgos
  const todosLosHallazgos = useMemo(() => {
    const lista = [];
    sucursales.forEach(s => {
      (s.hallazgos_todos || []).forEach(h => {
        lista.push({
          ...h,
          oficina: s.zona,
          codigo_br: s.codigo_br,
          regional: s.regional,
          provincia: s.provincia,
          categoria_oficina: s.categoria,
        });
      });
    });
    return lista.sort((a, b) => new Date(b.fecha_detectado) - new Date(a.fecha_detectado));
  }, []);

  const regionales = useMemo(() => Array.from(new Set(todosLosHallazgos.map(h => h.regional))).sort(), [todosLosHallazgos]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return todosLosHallazgos.filter(h => {
      if (sevFiltro && h.severidad !== sevFiltro) return false;
      if (estadoFiltro && h.estado !== estadoFiltro) return false;
      if (regionalFiltro && h.regional !== regionalFiltro) return false;
      if (q) {
        const hs = [h.oficina, h.codigo_br, h.tipo, h.ubicacion, h.accion, h.id].filter(Boolean).join(' ').toLowerCase();
        if (!hs.includes(q)) return false;
      }
      return true;
    });
  }, [search, sevFiltro, estadoFiltro, regionalFiltro, todosLosHallazgos]);

  const hayFiltros = search || sevFiltro || estadoFiltro || regionalFiltro;

  // KPIs por severidad
  const conteo = useMemo(() => {
    const c = { 'CRÍTICA': 0, 'ALTA': 0, 'MEDIA': 0, 'PREVIA': 0, total: filtrados.length };
    filtrados.forEach(h => { c[h.severidad] = (c[h.severidad] || 0) + 1; });
    return c;
  }, [filtrados]);

  const fmtRD = (n) => {
    if (n == null) return 'Por cotizar';
    return `RD$ ${Number(n).toLocaleString('es-DO')}`;
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-block w-10 h-0.5 bg-red-600 mb-2" />
          <h1 className="text-2xl font-bold text-zinc-900">
            Hallazgos · <span className="text-red-600">{filtrados.length}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Vista transversal de hallazgos en toda la red, ordenados por fecha de detección
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">
            Exportar Excel
          </button>
        </div>
      </div>

      {/* KPIs por severidad */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Total" value={conteo.total} stripe="#71717a" />
        <KpiCard label="CRÍTICA" value={conteo['CRÍTICA']} stripe="#dc2626" />
        <KpiCard label="ALTA" value={conteo['ALTA']} stripe="#f59e0b" />
        <KpiCard label="MEDIA" value={conteo['MEDIA']} stripe="#facc15" />
        <KpiCard label="PREVIA" value={conteo['PREVIA']} stripe="#a1a1aa" />
      </div>

      {/* Filtros */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 mb-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por oficina, código, hallazgo, ubicación…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-200 rounded focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
          />
        </div>

        <select value={sevFiltro} onChange={e => setSevFiltro(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer ${sevFiltro ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todas las severidades</option>
          <option value="CRÍTICA">CRÍTICA</option>
          <option value="ALTA">ALTA</option>
          <option value="MEDIA">MEDIA</option>
          <option value="PREVIA">PREVIA</option>
        </select>

        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer ${estadoFiltro ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todos los estados</option>
          <option value="Resuelto">Resuelto</option>
          <option value="En curso">En curso</option>
          <option value="Cotizado">Cotizado</option>
          <option value="Aprobado por banco">Aprobado por banco</option>
          <option value="Rechazado">Rechazado</option>
          <option value="Pendiente revisión">Pendiente revisión</option>
        </select>

        <select value={regionalFiltro} onChange={e => setRegionalFiltro(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer ${regionalFiltro ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todas las regionales</option>
          {regionales.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {hayFiltros && (
          <button onClick={() => { setSearch(''); setSevFiltro(''); setEstadoFiltro(''); setRegionalFiltro(''); }} className="text-xs px-3 py-2 text-red-600 hover:bg-red-50 rounded font-semibold">
            × Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <tr>
              <th className="text-left px-3 py-2.5">ID</th>
              <th className="text-left px-3 py-2.5">Detectado</th>
              <th className="text-left px-3 py-2.5">Oficina</th>
              <th className="text-left px-3 py-2.5">Regional</th>
              <th className="text-left px-3 py-2.5">Hallazgo</th>
              <th className="text-left px-3 py-2.5">Ubicación</th>
              <th className="text-center px-3 py-2.5">Severidad</th>
              <th className="text-right px-3 py-2.5">Costo Est.</th>
              <th className="text-left px-3 py-2.5">OS</th>
              <th className="text-left px-3 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtrados.slice(0, 100).map(h => (
              <tr key={`${h.codigo_br}_${h.id}`} className="hover:bg-zinc-50">
                <td className="px-3 py-2.5 text-zinc-500 font-mono text-xs">{h.id}</td>
                <td className="px-3 py-2.5 text-zinc-700 text-xs">
                  {new Date(h.fecha_detectado).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/banreservas/sucursal/${h.codigo_br}`} className="text-zinc-900 font-medium hover:text-red-600 text-sm">
                    {h.oficina}
                  </Link>
                  <div className="text-[10px] text-zinc-400">{h.codigo_br}</div>
                </td>
                <td className="px-3 py-2.5 text-zinc-500 text-xs">{h.regional}</td>
                <td className="px-3 py-2.5 text-zinc-900 font-medium text-xs">{h.tipo}</td>
                <td className="px-3 py-2.5 text-zinc-600 text-xs">{h.ubicacion}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${COLOR_SEV[h.severidad]}`}>
                    {h.severidad}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-900 font-semibold tabular-nums text-xs">{fmtRD(h.costo)}</td>
                <td className="px-3 py-2.5 text-xs">
                  {h.os_folio
                    ? <span className="text-blue-700 font-mono">{h.os_folio}</span>
                    : <span className="text-zinc-400">—</span>
                  }
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-700">{h.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length > 100 && (
          <div className="px-4 py-3 text-xs text-zinc-500 border-t border-zinc-200 bg-zinc-50">
            Mostrando 100 de {filtrados.length}. Aplica filtros para acotar.
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
