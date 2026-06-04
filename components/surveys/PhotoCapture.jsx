'use client';

// v8.19.5: PhotoCapture — captura y gestión de fotos para un campo del template.
//
// Asociación foto ↔ campo:
//   - photo_type = field.id (ej. 'exterior_pano', 'damage_detail')
//   - visit_id + area_id (null si es sección general) ubican la foto en el árbol.
//
// Subida: <input type="file" capture="environment"> → cámara nativa en móvil.
// Lista existentes con signed URLs (bucket privado).

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { subirFotoSurvey, getSignedUrlFotoSurvey } from '../../lib/surveys';

export default function PhotoCapture({ visitId, areaId = null, field, value, onChange }) {
  // value = array de objetos { id, storage_path, signedUrl?, caption?, is_critical? }
  const [items, setItems] = useState(Array.isArray(value) ? value : []);
  const [subiendo, setSubiendo] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [arrastrando, setArrastrando] = useState(false); // v8.25.25: drag&drop desde la computadora
  const inputRef = useRef(null);

  // Cargar fotos existentes asociadas a este field.id si aún no las tenemos
  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!visitId) return;
      try {
        const q = supabase
          .schema('surveys')
          .from('photos')
          .select('*')
          .eq('visit_id', visitId)
          .eq('photo_type', field.id);
        if (areaId) q.eq('area_id', areaId);
        else q.is('area_id', null);
        const { data, error } = await q.order('taken_at', { ascending: true });
        if (error) {
          if (!cancelado) setErrorMsg(error.message);
          return;
        }
        if (cancelado) return;
        // Resolver signed URLs en paralelo
        const conUrl = await Promise.all((data || []).map(async (p) => ({
          ...p,
          signedUrl: await getSignedUrlFotoSurvey(p.storage_path, 3600),
        })));
        if (!cancelado) {
          setItems(conUrl);
          onChange?.(conUrl);
        }
      } catch (e) {
        if (!cancelado) setErrorMsg(e?.message || String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [visitId, areaId, field.id]);

  const handleArchivos = async (files) => {
    if (!files || files.length === 0) return;
    if (!visitId) {
      setErrorMsg('Falta visit_id. Inicia el levantamiento primero.');
      return;
    }
    setSubiendo(true);
    setErrorMsg(null);
    try {
      const nuevos = [];
      for (const file of Array.from(files)) {
        if (!file.type?.startsWith('image/')) continue;
        const row = await subirFotoSurvey({
          visitId,
          areaId,
          file,
          photoType: field.id,
        });
        const signedUrl = await getSignedUrlFotoSurvey(row.storage_path, 3600);
        nuevos.push({ ...row, signedUrl });
      }
      const merged = [...items, ...nuevos];
      setItems(merged);
      onChange?.(merged);
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const eliminar = async (photo) => {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      const { error: delErr } = await supabase
        .schema('surveys')
        .from('photos')
        .delete()
        .eq('id', photo.id);
      if (delErr) throw delErr;
      // No borramos del bucket — política UPDATE/DELETE solo admin en storage.
      // La fila de surveys.photos borrada hace que no se muestre.
      const filtrados = items.filter(p => p.id !== photo.id);
      setItems(filtrados);
      onChange?.(filtrados);
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    }
  };

  const minOk = !field.min || items.length >= field.min;
  const maxAlcanzado = field.max != null && items.length >= field.max;

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
          {field.label}
        </span>
        {field.required && <span className="text-red-500 text-[11px]">*</span>}
        <span className="text-[10px] text-zinc-500 ml-1">
          {items.length}{field.max ? ` / ${field.max}` : ''}
        </span>
        {!minOk && (
          <span className="text-[10px] text-amber-400 ml-1 flex items-center gap-0.5">
            <AlertCircle className="w-3 h-3" /> mínimo {field.min}
          </span>
        )}
      </div>

      {/* Grid de previews */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
          {items.map(p => (
            <div key={p.id} className="relative group bg-zinc-900 border border-zinc-800 rounded-card aspect-square overflow-hidden">
              {p.signedUrl ? (
                <img src={p.signedUrl} alt={p.caption || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <button
                onClick={() => eliminar(p)}
                className="absolute top-1 right-1 bg-black/70 hover:bg-red-700 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Eliminar"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Captura: cámara, galería/archivo y arrastrar (drag&drop) */}
      {!maxAlcanzado && (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!subiendo) setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); handleArchivos(e.dataTransfer.files); }}
          className={`w-full bg-zinc-900 border-2 border-dashed px-4 py-3 text-center transition-colors ${arrastrando ? 'border-red-500 bg-red-600/10' : 'border-zinc-700'} ${subiendo ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center justify-center gap-4 text-sm">
            <label className={`flex items-center gap-1.5 font-bold text-zinc-300 hover:text-white ${subiendo ? 'cursor-wait' : 'cursor-pointer'}`}>
              <input type="file" accept="image/*" capture="environment" multiple disabled={subiendo} onChange={(e) => handleArchivos(e.target.files)} className="hidden" />
              <Camera className="w-4 h-4 text-red-500" /> Cámara
            </label>
            <span className="text-zinc-600">·</span>
            <label className={`flex items-center gap-1.5 font-bold text-zinc-300 hover:text-white ${subiendo ? 'cursor-wait' : 'cursor-pointer'}`}>
              <input ref={inputRef} type="file" accept="image/*" multiple disabled={subiendo} onChange={(e) => handleArchivos(e.target.files)} className="hidden" />
              <ImageIcon className="w-4 h-4 text-blue-400" /> Galería / archivo
            </label>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1.5 flex items-center justify-center gap-1">
            {subiendo ? <><Loader2 className="w-3 h-3 animate-spin text-red-500" /> Subiendo…</> : 'o arrastra imágenes aquí (desde la computadora)'}
          </div>
          {field.required_labels && (
            <div className="text-[10px] text-zinc-500 mt-1">Sugeridas: {field.required_labels.join(', ')}</div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="mt-2 text-[11px] text-red-400">{errorMsg}</div>
      )}
    </div>
  );
}
