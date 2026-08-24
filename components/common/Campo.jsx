'use client';

import React from 'react';

/**
 * Campo: wrapper estándar para inputs con label en mayúsculas.
 * Uso:
 *   <Campo label="Nombre">
 *     <Input value={x} onChange={setX} />
 *   </Campo>
 */
export default function Campo({ label, children }) {
  return (
    <div>
      {/* v8.43.1: zinc-300 (antes 400) — los labels se perdían sobre fondo oscuro */}
      <div className="text-[11px] tracking-widest uppercase text-zinc-300 font-bold mb-1">{label}</div>
      {children}
    </div>
  );
}
