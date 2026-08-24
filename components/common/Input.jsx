'use client';

import React from 'react';

/**
 * Input: input de texto/numero estandarizado del ERP.
 * Uso:
 *   <Input value={x} onChange={setX} placeholder="..." type="number" step="0.1" />
 *
 * Nota: onChange recibe el valor directo (no el evento).
 */
export default function Input({ value, onChange, placeholder, type = 'text', step }) {
  return (
    <input
      type={type}
      value={value}
      step={step}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      // v8.43.1: bg-zinc-950 (antes zinc-900, se fundía con el panel de los modales),
      // placeholder más legible y color-scheme dark para que los date/time no salgan tenues.
      className="w-full bg-zinc-950 border-2 border-zinc-700 rounded-card focus:border-red-600 outline-none px-4 py-3 text-white placeholder-zinc-500 transition-colors [color-scheme:dark]"
    />
  );
}
