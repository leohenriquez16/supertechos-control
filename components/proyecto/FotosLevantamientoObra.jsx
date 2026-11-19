'use client';

// v8.86.0: fotos tomadas en el levantamiento, visibles desde la pestaña Fotos de la obra.
import React, { useEffect, useState } from 'react';
import { Loader2, ClipboardList, X } from 'lucide-react';
import { fotosLevantamientoDeObra } from '../../lib/surveys';
import { refsDeObra } from '../../lib/helpers/refsObra';

export default function FotosLevantamientoObra({ proyecto }) {
  const [fotos, setFotos] = useState(null);
  const [abierta, setAbierta] = useState(null);
  useEffect(() => {
    let cancel = false;
    fotosLevantamientoDeObra({ refs: refsDeObra(proyecto), ubicacionId: proyecto.ubicacionId })
      .then(f => { if (!cancel) setFotos(f); }).catch(() => { if (!cancel) setFotos([]); });
    return () => { cancel = true; };
  }, [proyecto.id, proyecto.ubicacionId, proyecto.referenciaOdoo]);

  if (fotos === null) return <div className="flex items-center gap-2 text-xs text-zinc-500 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando fotos del levantamiento…</div>;
  if (!fotos.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-zinc-400">
        <ClipboardList className="w-3.5 h-3.5" /> Fotos del levantamiento ({fotos.length})
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
        {fotos.map(f => (
          <button key={f.id} onClick={() => setAbierta(f)} className="relative aspect-square overflow-hidden rounded bg-zinc-800" title={f.caption || f.site}>
            <div className="w-full h-full" style={{ backgroundImage: `url(${f.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            {f.is_critical && <span className="absolute top-1 left-1 text-[9px] bg-red-600 text-white px-1 rounded">crítica</span>}
          </button>
        ))}
      </div>
      {abierta && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => setAbierta(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setAbierta(null)} aria-label="Cerrar"><X className="w-6 h-6" /></button>
          <img src={abierta.url} alt={abierta.caption || 'Foto del levantamiento'} className="max-h-[85vh] max-w-full object-contain" />
          <div className="text-xs text-zinc-300 mt-2">{[abierta.caption, abierta.site, abierta.taken_at ? new Date(abierta.taken_at).toLocaleDateString('es-DO') : ''].filter(Boolean).join(' · ')}</div>
        </div>
      )}
    </div>
  );
}
