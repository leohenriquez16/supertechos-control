'use client';

import { useState } from 'react';
import Link from 'next/link';

// Bounds aproximadas de República Dominicana
const LNG_MIN = -72.05;
const LNG_MAX = -68.20;
const LAT_MIN = 17.50;
const LAT_MAX = 20.05;

const VB_W = 1000;
const VB_H = 500;

const xMap = (lng) => ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * VB_W;
const yMap = (lat) => ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VB_H;

// Path aproximado de RD — suficientemente reconocible para presentación
const DR_PATH = `
  M 70 230
  C 100 180, 180 140, 280 130
  C 360 120, 460 130, 580 130
  C 660 130, 720 140, 800 150
  C 870 160, 920 175, 940 200
  L 970 240
  C 940 270, 890 285, 850 290
  L 770 290
  L 720 280
  C 700 285, 670 310, 620 310
  C 540 320, 460 318, 400 330
  L 320 340
  L 270 370
  L 220 395
  L 180 410
  L 140 390
  L 120 360
  L 110 320
  L 100 280
  Z
`;

// Samana peninsula bump
const SAMANA_PATH = `
  M 720 140
  C 760 125, 800 120, 840 130
  C 870 140, 880 160, 870 175
  C 850 170, 820 165, 790 165
  C 760 165, 730 155, 720 140 Z
`;

const REGIONES_LABELS = [
  { label: 'METRO',    x: 380, y: 290 },
  { label: 'CIBAO',    x: 460, y: 200 },
  { label: 'NORTE',    x: 280, y: 175 },
  { label: 'NOROESTE', x: 140, y: 200 },
  { label: 'ESTE',     x: 820, y: 240 },
  { label: 'NORDESTE', x: 680, y: 200 },
  { label: 'SUR',      x: 320, y: 360 },
  { label: 'SUROESTE', x: 170, y: 360 },
  { label: 'SAMANÁ',   x: 790, y: 160 },
];

export default function MapaRDStylized({ sucursales, colores, onSelect = null, filtroCategoria = null }) {
  const [hover, setHover] = useState(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" style={{ maxHeight: 420 }}>
        {/* DR mainland */}
        <path d={DR_PATH} fill="#fef2f2" stroke="#dc2626" strokeWidth="2" strokeLinejoin="round" />
        {/* Samana peninsula (decorativo) */}
        <path d={SAMANA_PATH} fill="#fef2f2" stroke="#dc2626" strokeWidth="2" strokeLinejoin="round" />

        {/* Frontera (línea decorativa con Haití) */}
        <line x1="110" y1="320" x2="140" y2="390" stroke="#fca5a5" strokeWidth="1" strokeDasharray="3 3" />
        <text x="60" y="280" fontSize="14" fill="#fca5a5" fontWeight="600" letterSpacing="2">FRONTERA</text>

        {/* Labels de regiones */}
        {REGIONES_LABELS.map(r => (
          <text
            key={r.label}
            x={r.x}
            y={r.y}
            fontSize="11"
            fill="#a1a1aa"
            fontWeight="700"
            letterSpacing="2"
            textAnchor="middle"
          >
            {r.label}
          </text>
        ))}

        {/* Dots de sucursales */}
        {sucursales.map((s) => {
          if (!s.latitud || !s.longitud) return null;
          const cx = xMap(s.longitud);
          const cy = yMap(s.latitud);
          const color = colores[s.categoria] || '#dc2626';
          const r = s.categoria === 'D' ? 5 : 4;
          const dimmed = filtroCategoria && s.categoria !== filtroCategoria;

          return (
            <g key={s.id} style={{ cursor: 'pointer', opacity: dimmed ? 0.2 : 1 }}
               onMouseEnter={() => setHover(s)}
               onMouseLeave={() => setHover(null)}
               onClick={() => onSelect && onSelect(s)}>
              <circle cx={cx} cy={cy} r={r + 2} fill="white" />
              <circle cx={cx} cy={cy} r={r} fill={color}>
                {hover?.id === s.id && (
                  <animate attributeName="r" from={r} to={r + 2} dur="0.5s" repeatCount="indefinite" />
                )}
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Tooltip flotante */}
      {hover && (
        <div
          className="absolute pointer-events-none bg-zinc-900 text-white rounded shadow-lg px-3 py-2 z-10"
          style={{
            left: `${(xMap(hover.longitud) / VB_W) * 100}%`,
            top:  `${(yMap(hover.latitud) / VB_H) * 100}%`,
            transform: 'translate(-50%, -110%)',
            minWidth: 200,
          }}
        >
          <div className="text-[9px] uppercase tracking-wider text-zinc-400">
            {hover.regional} · {hover.codigo_br}
          </div>
          <div className="text-xs font-bold">{hover.zona}</div>
          <div className="text-[11px] text-zinc-300 mt-0.5">{hover.gerente}</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded text-white"
              style={{ background: colores[hover.categoria] }}
            >
              ESTADO {hover.categoria}
            </span>
            <span className="text-[10px] text-zinc-400">click para ver ficha</span>
          </div>
        </div>
      )}
    </div>
  );
}
