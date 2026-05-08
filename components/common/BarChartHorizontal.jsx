'use client';

import React from 'react';

// Barras horizontales, simples, sin dependencias.
// Props:
//   data: [{ label, value, color, sub }]  — sub es texto pequeño bajo el label
//   maxBars: límite de filas (default 10)
//   formatValue: función para formatear el número
export default function BarChartHorizontal({
  data = [],
  maxBars = 10,
  formatValue = (v) => String(v),
  defaultColor = '#dc2626',
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, maxBars);
  const max = sorted.reduce((m, d) => Math.max(m, d.value), 0);

  if (sorted.length === 0 || max === 0) {
    return <div className="text-xs text-zinc-500 text-center py-4">Sin datos en el período</div>;
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((d, i) => {
        const pct = (d.value / max) * 100;
        const color = d.color || defaultColor;
        return (
          <div key={i} className="space-y-0.5">
            <div className="flex justify-between items-baseline text-[11px]">
              <div className="min-w-0 flex-1">
                <span className="text-zinc-200 truncate block">{d.label}</span>
                {d.sub && <span className="text-[9px] text-zinc-500">{d.sub}</span>}
              </div>
              <span className="font-bold text-white tabular-nums shrink-0 ml-2">{formatValue(d.value)}</span>
            </div>
            <div className="h-2 bg-zinc-900 overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
