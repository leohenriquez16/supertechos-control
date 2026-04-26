'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * AutoFitText: ajusta automáticamente el font-size para que el texto quepa
 * en una sola línea dentro del contenedor padre.
 *
 * Uso:
 *   <AutoFitText maxSize={24} minSize={10} className="font-black text-green-400">
 *     {formatRD(produccionRD)}
 *   </AutoFitText>
 *
 * Re-mide cuando:
 * - El contenido cambia
 * - La ventana se redimensiona
 */
export default function AutoFitText({ children, maxSize = 24, minSize = 10, className = '' }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useEffect(() => {
    const ajustar = () => {
      const container = containerRef.current;
      const text = textRef.current;
      if (!container || !text) return;

      // Empieza por el máximo y baja hasta que quepa
      let size = maxSize;
      text.style.fontSize = `${size}px`;

      // Mientras el texto se desborde y no hayamos llegado al mínimo, baja 1px
      while (text.scrollWidth > container.clientWidth && size > minSize) {
        size -= 1;
        text.style.fontSize = `${size}px`;
      }

      setFontSize(size);
    };

    ajustar();

    // Re-medir si la ventana cambia de tamaño
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [children, maxSize, minSize]);

  return (
    <div ref={containerRef} style={{ width: '100%', overflow: 'hidden' }}>
      <span
        ref={textRef}
        className={className}
        style={{
          fontSize: `${fontSize}px`,
          whiteSpace: 'nowrap',
          display: 'inline-block',
          lineHeight: 1.1,
        }}
      >
        {children}
      </span>
    </div>
  );
}
