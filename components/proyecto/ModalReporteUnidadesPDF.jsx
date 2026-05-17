'use client';

// v8.17.52 — PDF report de avance por unidades (nivel × tipo). Incluye:
//   - Membrete con logo de la empresa ejecutora + datos del proyecto + cliente.
//   - Resumen total: % global, total completadas / total.
//   - Tabla por Torre → Nivel con cada tipo (baño, balcón, etc) y barra de progreso.
//   - Gráfico de barras por nivel (% completado).
//   - Avance acumulado últimos 30 días (mini chart de líneas).
// Usa el mismo patrón que el reporte de avance existente (jsPDF + html2canvas).

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Download, Loader2, FileText, Mail } from 'lucide-react';
import * as db from '../../lib/db';

// Empresa ejecutora datos (mismo helper que la carta de acceso, en pequeña duplicación)
const EMPRESA_DATOS = {
  super_techos: { razonSocial: 'LH SUPER TECHOS, SRL', rnc: '130774331', logo: '/logo-super-techos.png', logoMaxHeight: 56, accentColor: '#CC0000' },
  prouco:       { razonSocial: 'PROUCO GROUP DOMINICANA, SRL', rnc: '131515541', logo: '/logo-prouco.png', logoMaxHeight: 48, accentColor: '#65A30D' },
};

const cargarScriptCDN = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
  document.head.appendChild(s);
});

const formatearFechaLarga = (iso) => {
  const d = iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')) : new Date();
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
};
const formatearFechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
};

export default function ModalReporteUnidadesPDF({ proyecto, usuario, data, onCerrar }) {
  const empresaKey = proyecto.empresaEjecutora === 'prouco' ? 'prouco' : 'super_techos';
  const empresa = EMPRESA_DATOS[empresaKey];
  const [avances, setAvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const cartaRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const desde = new Date();
        desde.setDate(desde.getDate() - 30);
        const list = await db.listarAvancesUnidades({
          proyectoId: proyecto.id,
          fechaDesde: desde.toISOString().split('T')[0],
        });
        setAvances(list);
      } catch (e) { console.warn(e); }
      setLoading(false);
    })();
  }, [proyecto.id]);

  // Mapa por día → cantidad total reportada
  const porDia = useMemo(() => {
    const map = {};
    avances.forEach(a => {
      map[a.fecha] = (map[a.fecha] || 0) + Number(a.cantidad || 0);
    });
    return map;
  }, [avances]);

  // Últimos 30 días con valor (para chart)
  const dias30 = useMemo(() => {
    const out = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      out.push({ fecha: iso, cantidad: porDia[iso] || 0 });
    }
    return out;
  }, [porDia]);
  const maxCantDia = Math.max(1, ...dias30.map(d => d.cantidad));

  // Estructura del proyecto con totales calculados
  const estructura = proyecto.estructuraUnidades || [];
  const totalUnidades = useMemo(() => estructura.reduce((s, t) =>
    s + (t.niveles || []).reduce((sn, n) =>
      sn + (n.espacios || []).reduce((se, e) => se + (e.cantidad || 0), 0)
    , 0)
  , 0), [estructura]);
  const totalCompletadas = useMemo(() => estructura.reduce((s, t) =>
    s + (t.niveles || []).reduce((sn, n) =>
      sn + (n.espacios || []).reduce((se, e) => se + (e.completadas || 0), 0)
    , 0)
  , 0), [estructura]);
  const pctGlobal = totalUnidades > 0 ? (totalCompletadas / totalUnidades) * 100 : 0;

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = window.html2canvas;
      const { jsPDF } = window.jspdf;
      const el = cartaRef.current;
      if (!el) throw new Error('Preview no encontrado');

      const ANCHO_LETTER_PX = 816;
      const widthOrig = el.style.width;
      el.style.width = ANCHO_LETTER_PX + 'px';
      await new Promise(r => setTimeout(r, 80));

      let canvas;
      try {
        canvas = await html2canvas(el, {
          scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
          width: ANCHO_LETTER_PX, windowWidth: ANCHO_LETTER_PX, windowHeight: el.scrollHeight,
        });
      } finally { el.style.width = widthOrig; }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW = 215.9, pageH = 279.4;
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (imgH <= pageH) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH);
      } else {
        let remaining = canvas.height;
        const pageHpx = (pageH * canvas.width) / pageW;
        let srcY = 0;
        let isFirst = true;
        while (remaining > 0) {
          const sliceH = Math.min(pageHpx, remaining);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const sliceImgH = (sliceH * imgW) / canvas.width;
          if (!isFirst) pdf.addPage();
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, sliceImgH);
          remaining -= sliceH;
          srcY += sliceH;
          isFirst = false;
        }
      }
      const nombre = `avance-unidades-${(proyecto.referenciaOdoo || proyecto.nombre || 'proyecto').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
      pdf.save(nombre);
    } catch (e) { alert('Error generando PDF: ' + (e.message || e)); }
    setGenerandoPDF(false);
  };

  if (loading) return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-5xl w-full my-8 max-h-[90vh] flex flex-col">
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-400" />
            <div>
              <div className="text-xs tracking-widest uppercase text-red-400 font-bold">Reporte de avance · Unidades</div>
              <div className="text-[10px] text-zinc-500">{proyecto.cliente || proyecto.nombre} · {proyecto.referenciaOdoo}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={descargarPDF}
              disabled={generandoPDF}
              className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase px-3 py-2 flex items-center gap-1"
            >
              {generandoPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Descargar PDF
            </button>
            <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 flex-1 bg-zinc-950">
          <div className="bg-white text-black mx-auto" style={{ maxWidth: 816 }} ref={cartaRef}>
            <ReportePDFContenido
              proyecto={proyecto}
              empresa={empresa}
              estructura={estructura}
              totalUnidades={totalUnidades}
              totalCompletadas={totalCompletadas}
              pctGlobal={pctGlobal}
              dias30={dias30}
              maxCantDia={maxCantDia}
              avances={avances}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Contenido del PDF (HTML que se captura)
// ============================================================
function ReportePDFContenido({ proyecto, empresa, estructura, totalUnidades, totalCompletadas, pctGlobal, dias30, maxCantDia, avances }) {
  const accent = empresa?.accentColor || '#CC0000';
  return (
    <div style={{ background: '#fff', color: '#27272a', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '12px' }}>
      {/* Letterhead */}
      <div style={{ padding: '28px 36px 24px', borderBottom: `3px solid ${accent}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {empresa?.logo && (
            <img src={empresa.logo} alt={empresa.razonSocial}
              style={{ maxHeight: empresa.logoMaxHeight || 56, width: 'auto', objectFit: 'contain' }}
              crossOrigin="anonymous"
            />
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>REPORTE DE AVANCE · UNIDADES</div>
          <div style={{ color: '#27272a', fontSize: '13px', fontWeight: 500, marginTop: '3px' }}>{formatearFechaLarga(new Date().toISOString().split('T')[0])}</div>
        </div>
      </div>

      {/* Datos del proyecto */}
      <div style={{ padding: '22px 36px', background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
        <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '4px' }}>PROYECTO</div>
        <div style={{ color: '#18181b', fontSize: '22px', fontWeight: 600, lineHeight: 1.2 }}>{proyecto.cliente || proyecto.nombre}</div>
        <div style={{ color: '#71717a', fontSize: '11px', marginTop: '4px' }}>
          {proyecto.referenciaOdoo && `Ref. ${proyecto.referenciaOdoo}`}
          {proyecto.referenciaProyecto && ` · ${proyecto.referenciaProyecto}`}
          {proyecto.fecha_inicio && ` · Inicio ${formatearFechaCorta(proyecto.fecha_inicio)}`}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16, paddingTop: 12, borderTop: '1px solid #e4e4e7' }}>
          <div style={{ border: '1px solid #e4e4e7', padding: 12 }}>
            <div style={{ color: '#71717a', fontSize: 9, letterSpacing: 1.5 }}>AVANCE GLOBAL</div>
            <div style={{ color: '#18181b', fontSize: 24, fontWeight: 600, marginTop: 4 }}>{pctGlobal.toFixed(1)}%</div>
          </div>
          <div style={{ border: '1px solid #e4e4e7', padding: 12 }}>
            <div style={{ color: '#71717a', fontSize: 9, letterSpacing: 1.5 }}>COMPLETADAS</div>
            <div style={{ color: '#16a34a', fontSize: 24, fontWeight: 600, marginTop: 4 }}>{totalCompletadas.toLocaleString()}</div>
          </div>
          <div style={{ border: '1px solid #e4e4e7', padding: 12 }}>
            <div style={{ color: '#71717a', fontSize: 9, letterSpacing: 1.5 }}>TOTAL UNIDADES</div>
            <div style={{ color: '#18181b', fontSize: 24, fontWeight: 600, marginTop: 4 }}>{totalUnidades.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Tabla por torre y nivel */}
      <div style={{ padding: '22px 36px' }}>
        <div style={{ color: '#71717a', fontSize: 10, letterSpacing: 1.5, marginBottom: 12 }}>DETALLE POR NIVEL Y TIPO</div>
        {estructura.length === 0 ? (
          <div style={{ color: '#a1a1aa', fontStyle: 'italic', fontSize: 11 }}>Este proyecto no tiene estructura de unidades configurada.</div>
        ) : (
          estructura.map(torre => {
            const niveles = torre.niveles || [];
            const totalT = niveles.reduce((s, n) => s + (n.espacios || []).reduce((se, e) => se + (e.cantidad || 0), 0), 0);
            const compT = niveles.reduce((s, n) => s + (n.espacios || []).reduce((se, e) => se + (e.completadas || 0), 0), 0);
            const pctT = totalT > 0 ? (compT / totalT) * 100 : 0;
            return (
              <div key={torre.id} style={{ marginBottom: 20, border: '1px solid #e4e4e7' }}>
                <div style={{ background: accent, color: 'white', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{torre.nombre}</div>
                  <div style={{ fontSize: 12 }}>{compT}/{totalT} · {pctT.toFixed(0)}%</div>
                </div>
                {niveles.length === 0 ? (
                  <div style={{ padding: 12, color: '#a1a1aa', fontStyle: 'italic', fontSize: 11 }}>Sin niveles configurados</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e4e4e7', color: '#71717a', fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>NIVEL</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e4e4e7', color: '#71717a', fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>TIPO</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #e4e4e7', color: '#71717a', fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>COMPLETADAS</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #e4e4e7', color: '#71717a', fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>TOTAL</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #e4e4e7', color: '#71717a', fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>%</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e4e4e7', color: '#71717a', fontSize: 9, letterSpacing: 1, fontWeight: 700, width: 120 }}>PROGRESO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {niveles.map(nivel => {
                        const espacios = nivel.espacios || [];
                        if (espacios.length === 0) {
                          return (
                            <tr key={nivel.id}>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid #e4e4e7', fontWeight: 600 }}>{nivel.nombre}</td>
                              <td colSpan={5} style={{ padding: '6px 10px', borderBottom: '1px solid #e4e4e7', color: '#a1a1aa', fontStyle: 'italic' }}>Sin espacios</td>
                            </tr>
                          );
                        }
                        return espacios.map((esp, i) => {
                          const pct = esp.cantidad > 0 ? (esp.completadas / esp.cantidad) * 100 : 0;
                          const color = pct >= 100 ? '#16a34a' : pct >= 50 ? '#65a30d' : pct > 0 ? '#eab308' : '#e4e4e7';
                          return (
                            <tr key={esp.id}>
                              {i === 0 ? (
                                <td rowSpan={espacios.length} style={{ padding: '6px 10px', borderBottom: '1px solid #e4e4e7', fontWeight: 600, verticalAlign: 'top', background: '#fafafa' }}>{nivel.nombre}</td>
                              ) : null}
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid #e4e4e7', textTransform: 'capitalize' }}>{esp.tipo}{esp.m2PorUnidad > 0 && <span style={{ color: '#a1a1aa', fontSize: 9 }}> · {esp.m2PorUnidad} m²/u</span>}</td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid #e4e4e7', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{esp.completadas || 0}</td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid #e4e4e7', textAlign: 'right' }}>{esp.cantidad || 0}</td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid #e4e4e7', textAlign: 'right', fontWeight: 600 }}>{pct.toFixed(0)}%</td>
                              <td style={{ padding: '6px 10px', borderBottom: '1px solid #e4e4e7' }}>
                                <div style={{ height: 8, background: '#e4e4e7', position: 'relative' }}>
                                  <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color }} />
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Chart: avance acumulado últimos 30 días */}
      <div style={{ padding: '22px 36px', borderTop: '1px solid #e4e4e7' }}>
        <div style={{ color: '#71717a', fontSize: 10, letterSpacing: 1.5, marginBottom: 12 }}>AVANCE DIARIO · ÚLTIMOS 30 DÍAS</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90, paddingTop: 8, paddingBottom: 4, borderBottom: '1px solid #e4e4e7' }}>
          {dias30.map((d, i) => {
            const h = d.cantidad > 0 ? (d.cantidad / maxCantDia) * 80 : 1;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }} title={`${d.fecha}: ${d.cantidad}`}>
                <div style={{ width: '80%', height: `${h}px`, background: d.cantidad > 0 ? accent : '#e4e4e7', minHeight: 1 }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 8, color: '#a1a1aa' }}>
          <span>{formatearFechaCorta(dias30[0]?.fecha)}</span>
          <span>{formatearFechaCorta(dias30[15]?.fecha)}</span>
          <span>{formatearFechaCorta(dias30[29]?.fecha)}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: '#71717a' }}>
          Pico: <strong style={{ color: '#27272a' }}>{maxCantDia}</strong> unidades en un día ·{' '}
          Total reportado en 30 días: <strong style={{ color: '#27272a' }}>{dias30.reduce((s, d) => s + d.cantidad, 0)}</strong> unidades ·{' '}
          Días activos: <strong style={{ color: '#27272a' }}>{dias30.filter(d => d.cantidad > 0).length}/30</strong>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 36px', background: '#fafafa', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: 10 }}>
        <div>{empresa?.razonSocial} · RNC {empresa?.rnc}</div>
        <div>Generado: {new Date().toLocaleString('es-DO')}</div>
      </div>
    </div>
  );
}
