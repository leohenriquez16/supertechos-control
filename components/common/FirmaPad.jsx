'use client';

// v8.42.0: Pad de FIRMA táctil — el maestro firma recibido en el celular del
// chofer. Canvas con pointer events (dedo o mouse), botón limpiar, exporta PNG.

import React, { useRef, useState, useEffect } from 'react';

export default function FirmaPad({ alto = 160, onCambio }) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const [tieneTrazos, setTieneTrazos] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.offsetWidth;
    c.width = w * dpr; c.height = alto * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, alto);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [alto]);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const empezar = (e) => {
    e.preventDefault();
    dibujando.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    canvasRef.current.setPointerCapture?.(e.pointerId);
  };
  const mover = (e) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!tieneTrazos) { setTieneTrazos(true); onCambio?.(true); }
  };
  const terminar = () => { dibujando.current = false; };
  const limpiar = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.offsetWidth, c.offsetHeight);
    setTieneTrazos(false); onCambio?.(false);
  };

  return (
    <div className="space-y-1">
      <canvas ref={canvasRef}
        onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerLeave={terminar}
        className="w-full rounded-card border-2 border-zinc-600 bg-white cursor-crosshair"
        style={{ height: alto, touchAction: 'none' }} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500">✍️ Firma aquí con el dedo</span>
        {tieneTrazos && <button onClick={limpiar} className="text-[10px] font-bold uppercase text-zinc-400 hover:text-red-400">Limpiar</button>}
      </div>
    </div>
  );
}

// Exporta el canvas del pad como Blob PNG (helper para el caller).
export function firmaABlob(padContainerEl) {
  const canvas = padContainerEl?.querySelector('canvas');
  return new Promise((resolve, reject) => {
    if (!canvas) return reject(new Error('Sin firma'));
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo exportar la firma')), 'image/png');
  });
}
