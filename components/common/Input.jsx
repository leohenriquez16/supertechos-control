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
      className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white placeholder-zinc-600"
    />
  );
}
