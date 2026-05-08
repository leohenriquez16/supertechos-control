'use client';

import React from 'react';

// Donut chart en SVG puro. Sin dependencias.
// Props:
//   data: [{ label, value, color }]
//   size: tamaño px (default 220)
//   stroke: grosor del anillo (default 32)
//   centerLabel: texto grande del centro (string)
//   centerSub: texto chico bajo el centro (string)
//   onSegmentHover: opcional, callback con index del segmento
export default function DonutChart({
  data = [],
  size = 220,
  stroke = 32,
  centerLabel = '',
  centerSub = '',
  formatTooltip,
}) {
  const valid = data.filter(d => Number(d.value) > 0);
  const total = valid.reduce((s, d) => s + Number(d.value || 0), 0);

  if (total === 0 || valid.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-zinc-600 text-xs"
        style={{ width: size, height: size }}
      >
        Sin datos en el período
      </div>
    );
  }

  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let acumPct = 0;
  const segments = valid.map((d, i) => {
    const pct = Number(d.value) / total;
    const dashArr = `${pct * circumference} ${circumference - pct * circumference}`;
    const dashOff = -(acumPct * circumference);
    acumPct += pct;
    return {
      ...d,
      pct,
      dashArr,
      dashOff,
      key: `seg-${i}`,
    };
  });

  const [hoverIdx, setHoverIdx] = React.useState(null);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track de fondo */}
        <circle cx={cx} cy={cy} r={r} stroke="#27272a" strokeWidth={stroke} fill="none" />
        {/* Segmentos */}
        {segments.map((s, i) => (
          <circle
            key={s.key}
            cx={cx}
            cy={cy}
            r={r}
            stroke={s.color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={s.dashArr}
            strokeDashoffset={s.dashOff}
            strokeLinecap="butt"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s', opacity: hoverIdx == null || hoverIdx === i ? 1 : 0.4 }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {hoverIdx != null ? (
          <>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{segments[hoverIdx].label}</div>
            <div className="text-lg font-black" style={{ color: segments[hoverIdx].color }}>
              {formatTooltip ? formatTooltip(segments[hoverIdx].value) : segments[hoverIdx].value}
            </div>
            <div className="text-[10px] text-zinc-500">{(segments[hoverIdx].pct * 100).toFixed(1)}% del total</div>
          </>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{centerSub}</div>
            <div className="text-xl font-black text-white">{centerLabel}</div>
          </>
        )}
      </div>
    </div>
  );
}

// Leyenda asociada al donut
export function DonutLegend({ data = [], formatTooltip, className = '' }) {
  const valid = data.filter(d => Number(d.value) > 0);
  const total = valid.reduce((s, d) => s + Number(d.value || 0), 0);
  return (
    <div className={`space-y-1 ${className}`}>
      {valid.sort((a, b) => b.value - a.value).map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-3 h-3 shrink-0" style={{ background: d.color }} />
          <span className="flex-1 truncate text-zinc-300">{d.label}</span>
          <span className="text-zinc-500 text-[10px]">{((d.value / total) * 100).toFixed(0)}%</span>
          <span className="font-bold text-zinc-100 tabular-nums">{formatTooltip ? formatTooltip(d.value) : d.value}</span>
        </div>
      ))}
      {valid.length === 0 && <div className="text-xs text-zinc-500">Sin datos</div>}
    </div>
  );
}
