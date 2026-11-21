'use client';

// v8.97.0 — Cámara en ráfaga del formulario de levantamiento.
// La cámara nativa del teléfono (<input capture>) toma UNA foto y se cierra. Aquí la cámara queda abierta:
// el técnico toma varias seguidas (contador + miniaturas, puede borrar), toca «Listo» y se suben todas juntas
// (la compresión la hace subirFotoSurvey). Si el navegador no da acceso a la cámara, ofrece la cámara del teléfono.

import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Trash2, Camera, Loader2 } from 'lucide-react';
import { lentesDisponibles } from '../../lib/helpers/camaraLentes';

export const camaraEnVivoDisponible = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && window.isSecureContext !== false;

export default function CamaraRafaga({ titulo, maximo = null, onListo, onCerrar, onUsarNativa }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [estado, setEstado] = useState('abriendo'); // abriendo | lista | error
  const [fotos, setFotos] = useState([]); // { id, blob, url }
  const [flash, setFlash] = useState(false);
  const [pendientes, setPendientes] = useState(0); // fotos tomadas que todavía se están codificando
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;

  // v8.98.0: lo que manda es que entre la mayor parte del área: formato 4:3 (sin el recorte del 16:9) y, si el
  // equipo tiene gran angular, abre directo en 0.5x. Calidad: la máxima que dé el teléfono en ese formato.
  const [lentes, setLentes] = useState([]); // [{ key, label, zoom? | deviceId? }]
  const [lente, setLente] = useState(null);
  const VIDEO_BASE = { width: { ideal: 4032 }, height: { ideal: 3024 }, aspectRatio: { ideal: 4 / 3 } };

  const conectar = async (video) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...VIDEO_BASE, ...video } });
    streamRef.current = stream;
    const v = videoRef.current;
    if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
    return stream;
  };

  const aplicarLente = async (l, { cancelado } = {}) => {
    if (!l) return;
    if (l.zoom != null) {
      const track = streamRef.current?.getVideoTracks?.()[0];
      await track?.applyConstraints({ advanced: [{ zoom: l.zoom }] });
    } else if (l.deviceId) {
      const st = await conectar({ deviceId: { exact: l.deviceId } });
      if (cancelado?.()) { st.getTracks().forEach((t) => t.stop()); return; }
    }
    setLente(l.key);
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const stream = await conectar({ facingMode: { ideal: 'environment' } });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        setEstado('lista');
        // Lentes: después del permiso ya hay nombres de cámaras. Si falla algo, queda la cámara normal.
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track?.getCapabilities ? track.getCapabilities() : null;
          const settings = track?.getSettings ? track.getSettings() : null;
          const devices = await navigator.mediaDevices.enumerateDevices();
          const ls = lentesDisponibles({ caps, settings, devices });
          if (cancelado) return;
          setLentes(ls);
          if (ls.length) { setLente('1'); await aplicarLente(ls[0], { cancelado: () => cancelado }); }
        } catch (e) { console.warn('CamaraRafaga lentes:', e?.message); }
      } catch (e) {
        console.warn('CamaraRafaga:', e?.name, e?.message);
        if (!cancelado) setEstado('error');
      }
    })();
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      fotosRef.current.forEach((f) => URL.revokeObjectURL(f.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cambiando, setCambiando] = useState(false);
  const elegirLente = async (l) => {
    if (cambiando || l.key === lente) return;
    setCambiando(true);
    try { await aplicarLente(l); } catch (e) { console.warn('cambiar lente:', e?.message); alert('No se pudo cambiar el lente.'); }
    setCambiando(false);
  };

  const lleno = maximo != null && fotos.length + pendientes >= maximo;

  // El cuadro se copia al instante (drawImage es síncrono) y se codifica aparte: se puede tocar seguido sin perder fotos.
  const disparar = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || lleno) return;
    // Al subir toda foto se reduce a 1600 px; aquí se guarda a 2400 px como máximo (menos memoria con muchas fotos).
    const k = Math.min(1, 2400 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    setFlash(true); setTimeout(() => setFlash(false), 120);
    try { navigator.vibrate?.(30); } catch {}
    setPendientes((n) => n + 1);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    c.toBlob((blob) => {
      setPendientes((n) => Math.max(0, n - 1));
      if (blob) setFotos((fs) => [...fs, { id, blob, url: URL.createObjectURL(blob) }]);
    }, 'image/jpeg', 0.9);
  };

  const borrar = (id) => setFotos((fs) => {
    const f = fs.find((x) => x.id === id);
    if (f) URL.revokeObjectURL(f.url);
    return fs.filter((x) => x.id !== id);
  });

  const listo = () => {
    const ts = Date.now();
    const files = fotos.map((f, i) => new File([f.blob], `foto-${ts}-${i + 1}.jpg`, { type: 'image/jpeg' }));
    onListo?.(files);
  };

  const cerrar = () => {
    if (fotos.length && !confirm(`¿Descartar ${fotos.length} foto${fotos.length !== 1 ? 's' : ''} sin subir?`)) return;
    onCerrar?.();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col text-white select-none">
      {/* Arriba */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-black/80">
        <button onClick={cerrar} className="p-2.5 rounded-full bg-zinc-800" aria-label="Cerrar cámara"><X className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{titulo || 'Fotos'}</div>
          <div className="text-[11px] text-zinc-400">{fotos.length + pendientes} tomada{fotos.length + pendientes !== 1 ? 's' : ''}{maximo != null ? ` · máximo ${maximo}` : ''}</div>
        </div>
        <button onClick={listo} disabled={!fotos.length || pendientes > 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-green-600 disabled:bg-zinc-700 disabled:text-zinc-400 text-sm font-black">
          <Check className="w-4 h-4" /> Listo{fotos.length ? ` (${fotos.length})` : ''}
        </button>
      </div>

      {/* Visor */}
      <div className="relative flex-1 min-h-0 bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-contain" />
        {flash && <div className="absolute inset-0 bg-white/70" />}
        {estado === 'abriendo' && (
          <div className="absolute inset-0 grid place-items-center text-zinc-400"><Loader2 className="w-8 h-8 animate-spin" /></div>
        )}
        {estado === 'error' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="space-y-3 max-w-xs">
              <div className="text-sm">No se pudo abrir la cámara aquí (permiso denegado o navegador sin soporte).</div>
              <button onClick={onUsarNativa} className="w-full px-4 py-3 rounded-card bg-red-600 font-bold">Usar la cámara del teléfono</button>
              <button onClick={onCerrar} className="w-full px-4 py-2 text-zinc-400 text-sm">Cancelar</button>
            </div>
          </div>
        )}
        {lleno && estado === 'lista' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-600 text-xs font-bold px-3 py-1.5 rounded-full">Llegaste al máximo de fotos</div>
        )}
      </div>

      {/* Miniaturas + disparador */}
      <div className="bg-black/90 px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {fotos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {fotos.map((f) => (
              <div key={f.id} className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-zinc-700">
                <div className="w-full h-full" style={{ backgroundImage: `url(${f.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <button onClick={() => borrar(f.id)} className="absolute top-0.5 right-0.5 p-1 rounded-full bg-black/70" aria-label="Borrar foto"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
        {lentes.length > 1 && (
          <div className="flex items-center justify-center gap-2 pb-2">
            {lentes.map((l) => (
              <button key={l.key} onClick={() => elegirLente(l)} disabled={cambiando || estado !== 'lista'}
                style={lente === l.key ? { background: '#fbbf24', color: '#000' } : { background: '#27272a', color: '#fff' }}
                className="min-w-[3.25rem] px-3 py-2 rounded-full text-sm font-black disabled:opacity-60">
                {l.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-center py-1">
          <button onClick={disparar} disabled={estado !== 'lista' || lleno} aria-label="Tomar foto"
            className="w-20 h-20 rounded-full bg-white border-[6px] border-zinc-400 active:scale-95 transition-transform disabled:opacity-40 grid place-items-center">
            <Camera className="w-7 h-7 text-zinc-800" />
          </button>
        </div>
      </div>
    </div>
  );
}
