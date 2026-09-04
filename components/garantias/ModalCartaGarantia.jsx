'use client';

// v8.50.0 (ticket Miguel M.): CARTA DE GARANTÍA generada desde el ERP.
// La garantía ya se crea automática al pasar la obra a "Recibido conforme" (con la
// duración/cobertura del sistema o lo elegido en el modal de estado); esta carta se
// emite desde el módulo Garantías leyendo ESA fila (no recalcula del sistema).
// Mismo patrón de PDF que ModalCartaAcceso: html2canvas + jsPDF (CDN), formato Letter,
// membrete con logo + línea de acento y pie con RNC.

import React, { useRef, useState } from 'react';
import { X, FileDown, Loader2, ShieldCheck } from 'lucide-react';

const cargarScriptCDN = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
  document.head.appendChild(s);
});

const EMPRESA_DATOS = {
  super_techos: {
    razonSocial: 'LH SUPER TECHOS, SRL', nombreCorto: 'SUPER TECHOS',
    rnc: '130774331', direccion: 'C/ Arena #1, Mar Azul, Santo Domingo, R.D.',
    telefono: '809-535-9293', web: 'www.supertechos.com.do',
    logo: '/logo-super-techos.png', logoMaxHeight: 56, accentColor: '#CC0000',
  },
  prouco: {
    razonSocial: 'PROUCO GROUP DOMINICANA, SRL', nombreCorto: 'PROUCO',
    rnc: '131515541', direccion: 'Santo Domingo, República Dominicana',
    telefono: '', web: '',
    logo: '/logo-prouco.png', logoMaxHeight: 48, accentColor: '#65A30D',
  },
};

const fechaLarga = (d) => {
  try { return new Date(d).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return String(d || ''); }
};
const fmtF = (s) => { if (!s) return '—'; try { return new Date(s + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return s; } };

export default function ModalCartaGarantia({ garantia: g, clienteNombre, proyecto, ubicacionNombre, mantenimientos = [], onCerrar }) {
  const cartaRef = useRef(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const empresa = EMPRESA_DATOS[proyecto?.empresaEjecutora || 'super_techos'] || EMPRESA_DATOS.super_techos;
  const anos = g.duracionMeses ? Math.round((g.duracionMeses / 12) * 10) / 10 : null;
  const duracionTxt = g.duracionMeses
    ? (g.duracionMeses % 12 === 0 ? `${g.duracionMeses / 12} año${g.duracionMeses === 12 ? '' : 's'}` : `${g.duracionMeses} meses`)
    : '—';
  const mantsObligatorios = mantenimientos.filter(m => m.garantiaId === g.id && m.obligatorio !== false);
  const referencia = g.referenciaCotizacion || proyecto?.referenciaOdoo || g.codigo || '';

  const descargarPDF = async () => {
    setError(''); setGenerando(true);
    try {
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = window.html2canvas;
      const { jsPDF } = window.jspdf;
      if (!html2canvas || !jsPDF) throw new Error('Librerías PDF no disponibles');
      const el = cartaRef.current;
      const ANCHO = 816;
      const wOrig = el.style.width, mwOrig = el.style.maxWidth;
      el.style.width = ANCHO + 'px'; el.style.maxWidth = ANCHO + 'px';
      await new Promise(r => setTimeout(r, 50));
      let canvas;
      try {
        canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, width: ANCHO, windowWidth: ANCHO, windowHeight: el.scrollHeight });
      } finally { el.style.width = wOrig; el.style.maxWidth = mwOrig; }
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW = 215.9, pageH = 279.4;
      const imgH = (canvas.height * pageW) / canvas.width;
      if (imgH <= pageH) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, imgH);
      } else {
        // cortar por páginas
        const pxPorPagina = Math.floor((pageH / pageW) * canvas.width);
        let y = 0, primera = true;
        while (y < canvas.height) {
          const alto = Math.min(pxPorPagina, canvas.height - y);
          const c2 = document.createElement('canvas');
          c2.width = canvas.width; c2.height = alto;
          c2.getContext('2d').drawImage(canvas, 0, y, canvas.width, alto, 0, 0, canvas.width, alto);
          if (!primera) pdf.addPage();
          pdf.addImage(c2.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, (alto * pageW) / canvas.width);
          primera = false; y += alto;
        }
      }
      pdf.save(`Carta de Garantía ${referencia || clienteNombre || ''}.pdf`.replace(/\s+/g, ' ').trim());
    } catch (e) { setError(e?.message || 'Error generando el PDF'); }
    setGenerando(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-400" /> Carta de garantía</h2>
          <div className="flex items-center gap-2">
            <button onClick={descargarPDF} disabled={generando}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-[11px] font-black uppercase px-3 py-1.5 rounded-card flex items-center gap-1.5">
              {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Descargar PDF
            </button>
            <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        </div>
        {error && <div className="mx-3 mt-2 text-[11px] text-red-400">{error}</div>}

        {/* ===== Vista previa / contenido de la carta (fondo blanco, se captura tal cual) ===== */}
        <div className="p-3 overflow-x-auto">
          <div ref={cartaRef} style={{ background: '#ffffff', color: '#18181b', fontFamily: 'Georgia, "Times New Roman", serif', width: '100%', maxWidth: 816, margin: '0 auto' }}>
            {/* Membrete */}
            <div style={{ padding: '28px 36px 20px', borderBottom: `3px solid ${empresa.accentColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <img src={empresa.logo} alt={empresa.nombreCorto} crossOrigin="anonymous" style={{ maxHeight: empresa.logoMaxHeight, display: 'block' }} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#71717a', fontFamily: 'Arial, sans-serif', fontWeight: 700 }}>Carta de Garantía</div>
                {referencia && <div style={{ fontSize: 11, color: '#3f3f46', fontFamily: 'Arial, sans-serif', marginTop: 2 }}>Ref.: {referencia}</div>}
                <div style={{ fontSize: 11, color: '#3f3f46', fontFamily: 'Arial, sans-serif', marginTop: 2 }}>{fechaLarga(new Date())}</div>
              </div>
            </div>

            {/* Cuerpo */}
            <div style={{ padding: '28px 36px', fontSize: 13.5, lineHeight: 1.75 }}>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 700 }}>Señores</div>
                <div style={{ fontWeight: 700 }}>{clienteNombre || '—'}</div>
                {ubicacionNombre && <div style={{ color: '#3f3f46' }}>{ubicacionNombre}</div>}
                <div>Ciudad.—</div>
              </div>

              <div style={{ fontWeight: 700, textAlign: 'center', textDecoration: 'underline', margin: '18px 0', fontSize: 14 }}>
                CERTIFICACIÓN DE GARANTÍA {duracionTxt !== '—' ? `· ${duracionTxt.toUpperCase()}` : ''}
              </div>

              <p style={{ textAlign: 'justify', margin: '0 0 12px' }}>
                Distinguidos señores: por medio de la presente, <b>{empresa.razonSocial}</b> (RNC {empresa.rnc}) certifica que los
                trabajos de <b>{g.sistemaNombre || 'impermeabilización'}</b>{proyecto?.nombre ? <> ejecutados en la obra <b>{proyecto.referenciaProyecto || proyecto.nombre}</b></> : null}
                {g.m2 ? <> ({new Intl.NumberFormat('es-DO').format(g.m2)} m²)</> : null} cuentan con una <b>garantía de {duracionTxt}</b>,
                con vigencia desde el <b>{fmtF(g.fechaInicio)}</b> hasta el <b>{fmtF(g.fechaVencimiento)}</b>.
              </p>

              {g.cobertura && (
                <p style={{ textAlign: 'justify', margin: '0 0 12px' }}>
                  <b>Cobertura:</b> {g.cobertura}
                </p>
              )}
              {g.condicion && (
                <p style={{ textAlign: 'justify', margin: '0 0 12px' }}>
                  <b>Condiciones:</b> {g.condicion}
                </p>
              )}
              {mantsObligatorios.length > 0 && (
                <p style={{ textAlign: 'justify', margin: '0 0 12px' }}>
                  <b>Mantenimiento obligatorio:</b> esta garantía está condicionada a la realización de los mantenimientos
                  programados con {empresa.nombreCorto} ({mantsObligatorios.map(m => fmtF(m.fechaProgramada)).join(' · ')}).
                  La no realización de un mantenimiento obligatorio suspende la cobertura hasta regularizarlo.
                </p>
              )}
              <p style={{ textAlign: 'justify', margin: '0 0 12px' }}>
                Esta garantía cubre defectos atribuibles a la instalación del sistema y no ampara daños ocasionados por
                terceros, modificaciones o perforaciones posteriores a la entrega, tránsito no autorizado sobre las áreas
                intervenidas, ni eventos de fuerza mayor.
              </p>
              <p style={{ textAlign: 'justify', margin: '0 0 12px' }}>
                Cualquier reclamación deberá notificarse por escrito a {empresa.nombreCorto} para su evaluación y atención
                según los términos aquí descritos. Sin otro particular, se despide,
              </p>

              {/* Firma */}
              <div style={{ marginTop: 56 }}>
                <div style={{ borderBottom: '1px solid #27272a', width: 260 }} />
                <div style={{ fontWeight: 700, marginTop: 6 }}>Leonardo Henríquez</div>
                <div style={{ fontSize: 12, color: '#52525b' }}>Gerente General · {empresa.razonSocial}</div>
              </div>
            </div>

            {/* Pie */}
            <div style={{ padding: '14px 36px 22px', borderTop: '1px solid #e4e4e7', fontSize: 10, color: '#71717a', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
              {empresa.razonSocial} · RNC {empresa.rnc} · {empresa.direccion}{empresa.telefono ? ` · Tel. ${empresa.telefono}` : ''}{empresa.web ? ` · ${empresa.web}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
