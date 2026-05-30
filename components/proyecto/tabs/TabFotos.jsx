'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, ChevronLeft, ChevronRight, Loader2, Trash2, X } from 'lucide-react';
import * as db from '../../../lib/db';
import { comprimirImagen } from '../../../lib/imports';
import { formatFechaLarga } from '../../../lib/helpers/formato';
import Campo from '../../common/Campo';
import Input from '../../common/Input';

// Helper local (también está en page.jsx)
const tieneRol = (p, r) => p?.roles?.includes(r);

export default function TabFotos({ usuario, proyecto }) {
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [viendoFoto, setViendoFoto] = useState(null);
  const [fotoData, setFotoData] = useState(null);
  const [fechaSubida, setFechaSubida] = useState(new Date().toISOString().split('T')[0]);
  const [showUpload, setShowUpload] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try { setFotos(await db.listarFotosProyecto(proyecto.id)); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [proyecto.id]);

  const subir = async (files) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const lote = [];
      for (const f of files) {
        const dataUrl = await comprimirImagen(f);
        lote.push({
          id: 'f_' + Date.now() + Math.random(),
          proyectoId: proyecto.id, fecha: fechaSubida,
          data: dataUrl, subidaPor: usuario.nombre, subidaPorId: usuario.id,
          sistemaId: proyecto.sistema,
        });
      }
      await db.subirFotosLote(lote);
      await cargar();
      setShowUpload(false);
    } catch (e) { alert('Error subiendo fotos: ' + e.message); console.error(e); }
    setSubiendo(false);
  };

  const verFoto = async (foto) => {
    setViendoFoto(foto);
    setFotoData(null);
    try { setFotoData(await db.obtenerFoto(foto.id)); }
    catch (e) { console.error(e); setFotoData(null); }
  };

  // v8.19.33: navegación tipo carrete dentro del lightbox
  const fotosOrdenadas = React.useMemo(() => {
    // mismo orden que las muestra el grid (por fecha desc, luego por id)
    return [...fotos].sort((a, b) => {
      if (a.fecha === b.fecha) return String(a.id).localeCompare(String(b.id));
      return b.fecha.localeCompare(a.fecha);
    });
  }, [fotos]);
  const indiceActual = viendoFoto ? fotosOrdenadas.findIndex(f => f.id === viendoFoto.id) : -1;
  const irA = (delta) => {
    if (!fotosOrdenadas.length || indiceActual < 0) return;
    const total = fotosOrdenadas.length;
    const nuevo = (indiceActual + delta + total) % total; // wrap-around
    verFoto(fotosOrdenadas[nuevo]);
  };

  // Listener de teclado mientras el lightbox está abierto
  useEffect(() => {
    if (!viendoFoto) return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); irA(+1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); irA(-1); }
      else if (e.key === 'Escape') setViendoFoto(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viendoFoto, indiceActual, fotosOrdenadas.length]);

  // Soporte de swipe (touch) para móvil
  const swipeStartX = useRef(null);
  const onTouchStart = (e) => { swipeStartX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e) => {
    if (swipeStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - swipeStartX.current;
    if (Math.abs(dx) > 50) irA(dx < 0 ? +1 : -1); // swipe izq → siguiente
    swipeStartX.current = null;
  };

  const eliminar = async (fotoId) => {
    if (!confirm('¿Eliminar foto?')) return;
    try { await db.eliminarFoto(fotoId); await cargar(); setViendoFoto(null); }
    catch (e) { alert('Error: ' + e.message); }
  };

  // Agrupar por fecha
  const porFecha = {};
  fotos.forEach(f => { if (!porFecha[f.fecha]) porFecha[f.fecha] = []; porFecha[f.fecha].push(f); });
  const fechas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {!showUpload ? (
        <button onClick={() => setShowUpload(true)} className="w-full bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-red-600 py-4 flex flex-col items-center gap-1 text-sm font-bold uppercase text-zinc-400"><Camera className="w-6 h-6" /> Subir Fotos</button>
      ) : (
        <div className="bg-zinc-900 border-2 border-red-600 p-4 space-y-3">
          <div className="flex justify-between items-center"><div className="text-xs tracking-widest uppercase font-bold text-red-500">Subir fotos</div><button onClick={() => setShowUpload(false)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
          <Campo label="Fecha"><Input type="date" value={fechaSubida} onChange={v => setFechaSubida(v)} /></Campo>
          <div className="relative">
            <input type="file" accept="image/*" multiple onChange={e => subir(Array.from(e.target.files))} disabled={subiendo} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
            <div className={`border-2 border-dashed p-5 text-center ${subiendo ? 'border-red-600 bg-red-600/10' : 'border-zinc-700'}`}>
              {subiendo ? <div><Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto" /><div className="text-xs mt-2">Comprimiendo y subiendo...</div></div> : <div><Camera className="w-8 h-8 text-zinc-500 mx-auto mb-2" /><div className="text-xs font-bold">Toca para elegir (puedes seleccionar varias)</div><div className="text-[10px] text-zinc-500 mt-1">Se comprimen automático para ahorrar espacio</div></div>}
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && fotos.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">No hay fotos aún.</div>}

      {fechas.map(fecha => (
        <div key={fecha}>
          <div className="flex items-center gap-2 mb-2"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">{formatFechaLarga(fecha)}</div><div className="text-[10px] text-zinc-600">{porFecha[fecha].length} foto{porFecha[fecha].length !== 1 ? 's' : ''}</div></div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {porFecha[fecha].map(f => <FotoThumb key={f.id} foto={f} onVer={() => verFoto(f)} />)}
          </div>
        </div>
      ))}

      {viendoFoto && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setViendoFoto(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {/* contador + cerrar */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
              {fotosOrdenadas.length > 1 && (
                <div className="bg-black/70 text-white text-[11px] font-bold tracking-wider px-2 py-1">
                  {indiceActual + 1} / {fotosOrdenadas.length}
                </div>
              )}
              <button onClick={() => setViendoFoto(null)} className="bg-black/60 hover:bg-black/80 text-white p-2" title="Cerrar (Esc)"><X className="w-5 h-5" /></button>
            </div>

            {/* flechas — visibles cuando hay más de 1 foto */}
            {fotosOrdenadas.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); irA(-1); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white p-3 group"
                  title="Anterior (←)"
                >
                  <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); irA(+1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white p-3 group"
                  title="Siguiente (→)"
                >
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </>
            )}

            {fotoData ? <img src={fotoData} className="w-full h-auto" alt="" /> : <div className="aspect-video bg-zinc-900 flex items-center justify-center"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>}
            <div className="bg-zinc-900 p-3 text-xs flex justify-between items-center">
              <div><div className="text-white font-bold">{formatFechaLarga(viendoFoto.fecha)}</div><div className="text-zinc-500">Subida por {viendoFoto.subidaPor}</div></div>
              {(viendoFoto.subidaPorId === usuario.id || tieneRol(usuario, 'admin')) && <button onClick={() => eliminar(viendoFoto.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-4 h-4" /></button>}
            </div>

            {/* hint de teclado/swipe — solo desktop */}
            {fotosOrdenadas.length > 1 && (
              <div className="text-center text-[9px] text-zinc-500 mt-1 hidden sm:block uppercase tracking-widest">
                ← → para navegar · Esc para cerrar
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FotoThumb({ foto, onVer }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelado = false;
    db.obtenerFoto(foto.id).then(d => { if (!cancelado) setSrc(d); }).catch(() => {});
    return () => { cancelado = true; };
  }, [foto.id]);
  return (
    <button onClick={onVer} className="aspect-square bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600 overflow-hidden relative">
      {src ? <img src={src} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-4 h-4 text-zinc-600 animate-spin" /></div>}
    </button>
  );
}
