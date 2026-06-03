'use client';

// v8.19.94: visor de fotos de un levantamiento (sites → visits → photos).
// Se usa desde la ficha de la ubicación para acceder a las fotos. Aditivo.

import React, { useEffect, useState } from 'react';
import { X, Loader2, ImageIcon } from 'lucide-react';
import { listarSitesProyectoSurvey, listarVisitasDeSite, listarFotosVisita, getSignedUrlFotoSurvey } from '../../lib/surveys';

export default function FotosLevantamiento({ projectId, titulo, onCerrar }) {
  const [loading, setLoading] = useState(true);
  const [fotos, setFotos] = useState([]);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const sites = await listarSitesProyectoSurvey(projectId);
        let all = [];
        for (const s of sites) {
          const visits = await listarVisitasDeSite(s.id);
          for (const v of visits) { all = all.concat(await listarFotosVisita(v.id)); }
        }
        const conUrl = await Promise.all(all.map(async f => ({ ...f, url: await getSignedUrlFotoSurvey(f.storage_path) })));
        if (!cancel) setFotos(conUrl.filter(f => f.url));
      } catch (e) { console.warn('FotosLevantamiento:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [projectId]);

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] overflow-y-auto" onClick={onCerrar}>
      <div className="min-h-full p-2 sm:p-4">
        <div className="bg-zinc-950 border-2 border-red-600 rounded-card max-w-3xl mx-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-3 border-b border-zinc-800">
            <div className="font-black text-sm flex items-center gap-2"><ImageIcon className="w-4 h-4 text-red-500" /> Fotos del levantamiento {titulo ? `— ${titulo}` : ''}</div>
            <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500 py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando fotos…</div>
          ) : fotos.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">Este levantamiento aún no tiene fotos.</div>
          ) : (
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {fotos.map(f => (
                <button key={f.id} onClick={() => setZoom(f)} className="aspect-square rounded-card overflow-hidden border border-zinc-800 hover:border-red-600">
                  <img src={f.url} className="w-full h-full object-cover" alt={f.caption || ''} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {zoom && (
        <div className="fixed inset-0 bg-black/95 z-[80] flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setZoom(null)} className="absolute top-2 right-2 z-10 bg-black/60 text-white p-2 rounded-card"><X className="w-5 h-5" /></button>
            <img src={zoom.url} className="w-full h-auto rounded-card" alt="" />
            {(zoom.caption || zoom.photo_type) && <div className="bg-zinc-900 p-2 text-xs text-white rounded-b-card">{zoom.caption || zoom.photo_type}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
