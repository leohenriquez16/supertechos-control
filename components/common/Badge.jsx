'use client';

import React from 'react';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';

// v8.19.36: primer primitivo del kit de UI reutilizable.
// Reemplaza decenas de "spans con clases inline" regadas por el código.
//
// <Badge>texto</Badge>                      → badge neutro
// <Badge tone="brand" size="xs">cot</Badge> → variantes de color/tamaño
export default function Badge({ children, tone = 'neutral', size = 'sm', className = '', title }) {
  const tones = {
    neutral: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    brand:   'bg-red-900/40 text-red-300 border-red-700/60',
    success: 'bg-green-900/40 text-green-300 border-green-700/60',
    info:    'bg-blue-900/40 text-blue-300 border-blue-700/60',
    warning: 'bg-amber-900/40 text-amber-300 border-amber-700/60',
  };
  const sizes = {
    xs: 'text-[8px] px-1 py-px',
    sm: 'text-[9px] px-1.5 py-0.5',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider border rounded-card leading-none ${tones[tone] || tones.neutral} ${sizes[size] || sizes.sm} ${className}`}
    >
      {children}
    </span>
  );
}

// Badge específico de empresa ejecutora (Super Techos / Prouco).
// Clases LITERALES por empresa: Tailwind solo genera clases que aparezcan
// completas en el código fuente, así que no se pueden construir con template
// literals tipo `${meta.color}/20`. El label/short sí viene de la constante.
const EMPRESA_BADGE_CLASS = {
  super_techos: 'bg-red-900/40 text-red-300 border-red-700/60',
  prouco:       'bg-lime-900/40 text-lime-300 border-lime-600/60',
};
export function BadgeEmpresa({ empresa, size = 'sm', className = '' }) {
  if (!empresa) return null;
  const meta = EMPRESAS_RECEPTORAS[empresa];
  const cls = EMPRESA_BADGE_CLASS[empresa];
  if (!meta || !cls) return null;
  const sizes = {
    xs: 'text-[8px] px-1 py-px',
    sm: 'text-[9px] px-1.5 py-0.5',
  };
  return (
    <span
      title={meta.label}
      className={`inline-flex items-center font-bold uppercase tracking-wider border rounded-card leading-none ${cls} ${sizes[size] || sizes.sm} ${className}`}
    >
      {meta.short}
    </span>
  );
}
