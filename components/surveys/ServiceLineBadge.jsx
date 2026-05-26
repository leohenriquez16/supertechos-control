'use client';

// v8.19.1: badge color-coded por servicio. Pasa size='sm' para chip compacto.

import React from 'react';
import { SERVICE_LINES } from '../../lib/surveys';

export default function ServiceLineBadge({ serviceLine, size = 'sm' }) {
  const cfg = SERVICE_LINES[serviceLine] || SERVICE_LINES.other;
  const sizing = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-xs px-2 py-1';
  return (
    <span
      className={`inline-block font-bold uppercase tracking-wider ${sizing}`}
      style={{
        backgroundColor: cfg.color + '22',
        color: cfg.color,
        border: `1px solid ${cfg.color}66`,
      }}
    >
      {cfg.label}
    </span>
  );
}
