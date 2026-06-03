'use client';

// v8.24.18: Visor de fotos a pantalla completa (carrete). Recibe fotos [{url, caption}]
// e índice inicial. Flechas, teclado (←/→/Esc) y miniaturas.

import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Lightbox({ fotos = [], inicial = 0, onCerrar }) {
  const [i, setI] = useState(inicial);
  const n = fotos.length;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar?.();
      else if (e.key === 'ArrowLeft') setI(x => (x - 1 + n) % n);
      else if (e.key === 'ArrowRight') setI(x => (x + 1) % n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, onCerrar]);
  if (!n) return null;
  const f = fotos[Math.min(i, n - 1)];
  const prev = (e) => { e?.stopPropagation(); setI(x => (x - 1 + n) % n); };
  const next = (e) => { e?.stopPropagation(); setI(x => (x + 1) % n); };
  return (
    <div className="fixed inset-0 bg-black/95 z-[90] flex flex-col" onClick={onCerrar}>
      <div className="flex items-center justify-between p-3 text-white" onClick={e => e.stopPropagation()}>
        <span className="text-sm font-bold">{i + 1} / {n}</span>
        <button onClick={onCerrar} className="text-zinc-300 hover:text-white"><X className="w-6 h-6" /></button>
      </div>
      <div className="flex-1 flex items-center justify-center relative px-2" onClick={e => e.stopPropagation()}>
        {n > 1 && <button onClick={prev} className="absolute left-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"><ChevronLeft className="w-6 h-6" /></button>}
        <img src={f.url} alt="" className="max-h-[78vh] max-w-[92vw] object-contain rounded" />
        {n > 1 && <button onClick={next} className="absolute right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"><ChevronRight className="w-6 h-6" /></button>}
      </div>
      {f.caption && <div className="text-center text-zinc-300 text-xs px-3 py-1">{f.caption}</div>}
      {n > 1 && (
        <div className="flex gap-1 p-2 overflow-x-auto justify-center" onClick={e => e.stopPropagation()}>
          {fotos.map((x, j) => (
            <button key={j} onClick={() => setI(j)} className={`shrink-0 rounded overflow-hidden border-2 ${j === i ? 'border-red-600' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <img src={x.url} alt="" className="w-12 h-12 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
