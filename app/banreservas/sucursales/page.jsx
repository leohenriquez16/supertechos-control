'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { sucursales } from '../../../lib/data/banreservas-mock';

const COLOR_CAT = { A: '#16a34a', B: '#84cc16', C: '#f59e0b', D: '#dc2626' };
const COLOR_TAM = { S: '#0ea5e9', M: '#8b5cf6', L: '#f97316' };

function tamañoOf(s) {
  // Determinístico por código — ~30% S, 50% M, 20% L
  const h = (s.codigo || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = h % 100;
  if (r < 30) return 'S';
  if (r < 80) return 'M';
  return 'L';
}

export default function OficinasListPage() {
  const [search, setSearch] = useState('');
  const [regional, setRegional] = useState('');
  const [provincia, setProvincia] = useState('');
  const [estado, setEstado] = useState('');
  const [tamaño, setTamaño] = useState('');
  const [sortBy, setSortBy] = useState('zona');

  const regionales = useMemo(
    () => Array.from(new Set(sucursales.map(s => s.regional))).sort(),
    []
  );

  const provincias = useMemo(
    () => Array.from(new Set(sucursales.map(s => s.provincia).filter(Boolean))).sort(),
    []
  );

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sucursales
      .map(s => ({ ...s, tamaño: tamañoOf(s) }))
      .filter(s => {
        if (regional && s.regional !== regional) return false;
        if (provincia && s.provincia !== provincia) return false;
        if (estado && s.categoria !== estado) return false;
        if (tamaño && s.tamaño !== tamaño) return false;
        if (q) {
          const haystack = [s.zona, s.codigo, s.codigo_br, s.direccion, s.gerente, s.provincia, s.regional]
            .filter(Boolean).join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'codigo') return a.codigo_br.localeCompare(b.codigo_br);
        if (sortBy === 'regional') return a.regional.localeCompare(b.regional);
        if (sortBy === 'estado') return (a.categoria || '').localeCompare(b.categoria || '');
        if (sortBy === 'ultima_visita') return new Date(b.ultima_visita) - new Date(a.ultima_visita);
        return (a.zona || '').localeCompare(b.zona || '');
      });
  }, [search, regional, provincia, estado, tamaño, sortBy]);

  const hayFiltros = search || regional || provincia || estado || tamaño;

  const limpiar = () => {
    setSearch(''); setRegional(''); setProvincia(''); setEstado(''); setTamaño('');
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-block w-10 h-0.5 bg-red-600 mb-2" />
          <h1 className="text-2xl font-bold text-zinc-900">
            Oficinas · <span className="text-red-600">{filtradas.length}</span>
            {hayFiltros && <span className="text-zinc-400 font-normal text-base"> / {sucursales.length}</span>}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Listado completo de las oficinas bajo el Programa Nacional de Mantenimiento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">
            Exportar Excel
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
            placeholder="Buscar por oficina, código BR, gerente, dirección…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-200 rounded focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-600 text-lg leading-none">×</button>
          )}
        </div>

        <select value={regional} onChange={e => { setRegional(e.target.value); setProvincia(''); }}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer focus:outline-none focus:border-red-600 ${regional ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todas las regionales</option>
          {regionales.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={provincia} onChange={e => setProvincia(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer focus:outline-none focus:border-red-600 ${provincia ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todas las provincias</option>
          {provincias.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={estado} onChange={e => setEstado(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer focus:outline-none focus:border-red-600 ${estado ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todos los estados</option>
          <option value="A">A — Excelente</option>
          <option value="B">B — Bueno</option>
          <option value="C">C — Regular</option>
          <option value="D">D — Crítico</option>
        </select>

        <select value={tamaño} onChange={e => setTamaño(e.target.value)}
          className={`text-sm px-3 py-2 border rounded bg-white cursor-pointer focus:outline-none focus:border-red-600 ${tamaño ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-zinc-200 text-zinc-700'}`}>
          <option value="">Todos los tamaños</option>
          <option value="S">S — Pequeña (&lt;200 m²)</option>
          <option value="M">M — Mediana (200-500 m²)</option>
          <option value="L">L — Grande (&gt;500 m²)</option>
        </select>

        {hayFiltros && (
          <button onClick={limpiar} className="text-xs px-3 py-2 text-red-600 hover:bg-red-50 rounded font-semibold">
            × Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <tr>
              <th className="text-left px-3 py-2.5 cursor-pointer hover:text-zinc-900" onClick={() => setSortBy('codigo')}>Código</th>
              <th className="text-left px-3 py-2.5 cursor-pointer hover:text-zinc-900" onClick={() => setSortBy('zona')}>Oficina</th>
              <th className="text-left px-3 py-2.5 cursor-pointer hover:text-zinc-900" onClick={() => setSortBy('regional')}>Regional</th>
              <th className="text-left px-3 py-2.5">Provincia</th>
              <th className="text-center px-3 py-2.5 cursor-pointer hover:text-zinc-900" onClick={() => setSortBy('estado')}>Estado</th>
              <th className="text-center px-3 py-2.5">Tamaño</th>
              <th className="text-left px-3 py-2.5">Gerente</th>
              <th className="text-left px-3 py-2.5 cursor-pointer hover:text-zinc-900" onClick={() => setSortBy('ultima_visita')}>Última visita</th>
              <th className="text-right px-3 py-2.5">Hallazgos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtradas.slice(0, 200).map(s => {
              const diasUltimaVisita = Math.floor((new Date('2026-05-21') - s.ultima_visita) / (1000 * 60 * 60 * 24));
              return (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2.5 text-zinc-500 font-mono text-xs">{s.codigo_br}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/banreservas/sucursal/${s.codigo_br}`} className="text-zinc-900 font-medium hover:text-red-600">
                      {s.zona}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600 text-xs">{s.regional}</td>
                  <td className="px-3 py-2.5 text-zinc-500 text-xs">{s.provincia}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white font-bold text-xs"
                      style={{ background: COLOR_CAT[s.categoria] }}>
                      {s.categoria}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white font-bold text-xs"
                      style={{ background: COLOR_TAM[s.tamaño] }}>
                      {s.tamaño}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600 text-xs">{s.gerente?.slice(0, 30) || '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-500 text-xs">
                    {new Date(s.ultima_visita).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}
                    <span className="text-zinc-400 ml-1">({diasUltimaVisita}d)</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-700 tabular-nums">{s.n_hallazgos}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtradas.length > 200 && (
          <div className="px-4 py-3 text-xs text-zinc-500 border-t border-zinc-200 bg-zinc-50">
            Mostrando 200 de {filtradas.length}. Aplica filtros para ver el resto.
          </div>
        )}
      </div>
    </div>
  );
}
