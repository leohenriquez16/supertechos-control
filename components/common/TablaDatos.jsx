'use client';

// v8.74.23: tabla densa tipo base de datos (Clientes, Ubicaciones).
// - Encabezado fijo al hacer scroll y orden por columna (clic: asc → desc).
// - columnas: [{ key, label, render(row), sortValue(row), align: 'left'|'right'|'center',
//               className, ancho }]
// - El contenedor hace scroll horizontal propio: la página nunca se ensancha.
import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

const cmp = (a, b) => {
  const va = a ?? '', vb = b ?? '';
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
};

export default function TablaDatos({ columnas, filas, rowKey, onFilaClick, ordenInicial = null, vacio = 'Sin resultados.', alturaMax = 'calc(100vh - 260px)' }) {
  const [orden, setOrden] = useState(ordenInicial); // { key, dir: 'asc' | 'desc' }

  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const col = columnas.find(c => c.key === orden.key);
    if (!col) return filas;
    const val = col.sortValue || ((r) => r[col.key]);
    const s = [...filas].sort((a, b) => cmp(val(a), val(b)));
    return orden.dir === 'desc' ? s.reverse() : s;
  }, [filas, columnas, orden]);

  const clicOrden = (key) => setOrden(o => (o?.key === key ? { key, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-auto" style={{ maxHeight: alturaMax }}>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-zinc-950">
          <tr>
            {columnas.map(c => (
              <th key={c.key} onClick={() => c.ordenable !== false && clicOrden(c.key)}
                style={c.ancho ? { width: c.ancho } : undefined}
                className={`px-2.5 py-2 text-[10px] uppercase tracking-wider font-bold text-zinc-400 border-b border-zinc-800 whitespace-nowrap select-none ${c.ordenable !== false ? 'cursor-pointer hover:text-white' : ''} ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>
                <span className="inline-flex items-center gap-0.5">
                  {c.label}
                  {orden?.key === c.key && (orden.dir === 'asc' ? <ChevronUp className="w-3 h-3 text-red-500" /> : <ChevronDown className="w-3 h-3 text-red-500" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.length === 0 && (
            <tr><td colSpan={columnas.length} className="px-3 py-8 text-center text-zinc-500">{vacio}</td></tr>
          )}
          {ordenadas.map((r, i) => (
            <tr key={rowKey ? rowKey(r) : i} onClick={onFilaClick ? () => onFilaClick(r) : undefined}
              className={`border-b border-zinc-800/70 ${i % 2 ? 'bg-zinc-950/40' : ''} ${onFilaClick ? 'cursor-pointer hover:bg-red-600/10' : ''}`}>
              {columnas.map(c => (
                <td key={c.key} className={`px-2.5 py-1.5 align-top ${c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center tabular-nums' : ''} ${c.className || ''}`}>
                  {c.render ? c.render(r) : (r[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
