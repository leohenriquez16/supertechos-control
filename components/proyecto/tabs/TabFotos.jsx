'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, ChevronLeft, ChevronRight, Loader2, Trash2, X, Printer } from 'lucide-react';
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
  const [generandoReporte, setGenerandoReporte] = useState(null); // v8.27.78: {hechas, total} | null
  const [reporteListo, setReporteListo] = useState(null); // v8.27.78: {base64, filename, sizeMB, nFotos}
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  // contacto de reportes del cliente (editable aquí mismo si falta)
  const [contactoReportes, setContactoReportes] = useState({ email: proyecto.contactoClienteEmail || '', telefono: proyecto.contactoClienteTelefono || '' });
  const esAdmin = tieneRol(usuario, 'admin');

  // v8.27.78: si la obra no tiene el dato, se pide AQUÍ y se guarda en el proyecto.
  const pedirContacto = async (tipo) => {
    const label = tipo === 'email'
      ? '¿A qué CORREO del cliente se envían los reportes de esta obra?'
      : '¿Cuál es el WHATSAPP del cliente para los reportes? (ej. 809-555-1234)';
    const v = prompt(label, contactoReportes[tipo] || '');
    if (v === null) return null;
    const limpio = v.trim();
    if (!limpio) return null;
    try {
      await db.guardarContactoReportesProyecto(proyecto.id, tipo === 'email' ? { email: limpio } : { telefono: limpio });
      setContactoReportes(prev => ({ ...prev, [tipo]: limpio }));
    } catch (e) { alert('No se pudo guardar el contacto: ' + (e.message || e)); }
    return limpio;
  };

  // Envío por correo — VALIDADO: solo admin ve el botón y confirma antes de enviar.
  const enviarReportePorCorreo = async () => {
    if (!reporteListo) return;
    let email = contactoReportes.email || await pedirContacto('email');
    if (!email) return;
    const ref = proyecto.referenciaOdoo || proyecto.cliente;
    if (!confirm(`Enviar el reporte fotográfico (${reporteListo.nFotos} fotos, ${reporteListo.sizeMB}MB) a:\n\n${email}\n\nAsunto: Reporte fotográfico — ${ref}`)) return;
    setEnviandoCorreo(true);
    try {
      const res = await fetch('/api/email/reporte-cliente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para: email,
          asunto: `Reporte fotográfico de su obra — ${ref}`,
          mensaje: `Saludos,\n\nLe compartimos el reporte fotográfico del avance de su obra ${ref}${proyecto.referenciaProyecto ? ` (${proyecto.referenciaProyecto})` : ''}.\n\nQuedamos atentos a cualquier consulta.\n\nSuper Techos, SRL`,
          pdfBase64: reporteListo.base64,
          filename: reporteListo.filename,
        }),
      });
      const j = await res.json();
      if (j.ok) alert('✅ Reporte enviado por correo a ' + email);
      else alert('No se pudo enviar: ' + (j.error || 'error'));
    } catch (e) { alert('Error enviando: ' + (e.message || e)); }
    setEnviandoCorreo(false);
  };

  // WhatsApp del cliente: abre el chat con el mensaje listo (el PDF ya quedó descargado
  // — se adjunta con el clip; WhatsApp no permite adjuntar automático desde la web).
  const abrirWhatsAppCliente = async () => {
    let tel = contactoReportes.telefono || await pedirContacto('telefono');
    if (!tel) return;
    let dig = String(tel).replace(/\D/g, '');
    if (dig.length === 10) dig = '1' + dig; // RD sin el 1
    const ref = proyecto.referenciaOdoo || proyecto.cliente;
    const texto = encodeURIComponent(`Saludos 👋 Le compartimos el reporte fotográfico del avance de su obra ${ref}. Se lo adjuntamos a continuación.`);
    window.open(`https://wa.me/${dig}?text=${texto}`, '_blank');
  };

  // v8.27.78: re-comprime una foto para el reporte (canvas → JPEG). Mantiene proporción.
  const recomprimirFoto = (dataUrl, maxDim, calidad) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const esc = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * esc)), h = Math.max(1, Math.round(img.height * esc));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', calidad));
      } catch { res(dataUrl); }
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });

  // v8.27.78: REPORTE FOTOGRÁFICO imprimible — fotos del proyecto (máx 60, las más
  // recientes) agrupadas por fecha, en grande, con encabezado del proyecto.
  // Las imágenes se RE-COMPRIMEN con presupuesto total ≤ ~2.6MB para que el PDF final
  // quede bajo 3MB y se pueda enviar por WhatsApp.
  const generarReporteFotografico = async () => {
    const MAX = 60;
    const lista = fotos.slice(0, MAX); // ya vienen ordenadas desc por fecha
    if (lista.length === 0) { alert('Este proyecto no tiene fotos.'); return; }
    setGenerandoReporte({ hechas: 0, total: lista.length });
    try {
      // Cargar los datos (base64) en lotes de 6
      const conData = [];
      for (let i = 0; i < lista.length; i += 6) {
        const lote = await Promise.all(lista.slice(i, i + 6).map(async f => {
          try { return { ...f, dataUrl: await db.obtenerFoto(f.id) }; }
          catch { return null; }
        }));
        conData.push(...lote.filter(Boolean));
        setGenerandoReporte({ hechas: Math.min(i + 6, lista.length), total: lista.length });
      }

      // Re-comprimir con presupuesto: hasta 3 pasadas bajando tamaño/calidad hasta caber en ~2.6MB
      const BUDGET = 2.6 * 1024 * 1024;
      const pasadas = conData.length > 36
        ? [[720, 0.55], [560, 0.45], [460, 0.38]]
        : [[900, 0.62], [700, 0.5], [540, 0.42]];
      for (const [maxDim, calidad] of pasadas) {
        for (let i = 0; i < conData.length; i++) {
          conData[i].dataUrl = await recomprimirFoto(conData[i].dataUrl, maxDim, calidad);
        }
        const totalBytes = conData.reduce((s, f) => s + f.dataUrl.length * 0.75, 0);
        if (totalBytes <= BUDGET) break;
      }
      // Agrupar por fecha ascendente (cronológico para el cliente)
      const porDia = {};
      conData.forEach(f => { const d = f.fecha || (f.createdAt || '').slice(0, 10); (porDia[d] = porDia[d] || []).push(f); });
      const dias = Object.keys(porDia).sort();

      // ==== Generar PDF real (jsPDF) — alineado y bajo 3MB para WhatsApp/correo ====
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const PW = 210, PH = 297, M = 12, GAP = 6;
      const COLW = (PW - M * 2 - GAP) / 2;          // 2 columnas
      const IMGH = COLW * 3 / 4;                     // 4:3
      let y = 0;
      const encabezado = () => {
        doc.setFillColor(204, 0, 0); doc.rect(0, 0, PW, 4, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(24, 24, 27);
        doc.text('REPORTE FOTOGRÁFICO DE OBRA', M, 16);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(113, 113, 122);
        const sub = [proyecto.referenciaOdoo, proyecto.cliente, proyecto.referenciaProyecto].filter(Boolean).join(' · ');
        doc.text(doc.splitTextToSize(sub, PW - M * 2), M, 22);
        doc.setFontSize(9);
        doc.text(`SUPER TECHOS · ${conData.length} fotos · ${new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}`, M, 29);
        doc.setDrawColor(228, 228, 231); doc.line(M, 32, PW - M, 32);
        y = 38;
      };
      const pieYNueva = () => {
        doc.setFontSize(8); doc.setTextColor(161, 161, 170);
        doc.text(`Super Techos · Control de Obras — pág. ${doc.getNumberOfPages()}`, M, PH - 6);
        doc.addPage(); y = M + 4;
      };
      encabezado();
      for (const d of dias) {
        // título del día (nunca huérfano: si no cabe el título + una fila, salta de página)
        if (y + 8 + IMGH > PH - 12) pieYNueva();
        doc.setFillColor(204, 0, 0); doc.rect(M, y - 3.2, 1.4, 4.6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(63, 63, 70);
        doc.text(`${formatFechaLarga(d).toUpperCase()}  ·  ${porDia[d].length} foto${porDia[d].length !== 1 ? 's' : ''}`, M + 3.5, y);
        y += 5;
        const fs = porDia[d];
        for (let i = 0; i < fs.length; i += 2) {
          if (y + IMGH > PH - 12) pieYNueva();
          for (let c = 0; c < 2 && i + c < fs.length; c++) {
            const x = M + c * (COLW + GAP);
            try { doc.addImage(fs[i + c].dataUrl, 'JPEG', x, y, COLW, IMGH, undefined, 'FAST'); } catch { /* foto corrupta: salta */ }
            doc.setDrawColor(228, 228, 231); doc.rect(x, y, COLW, IMGH);
          }
          y += IMGH + GAP;
        }
        y += 4;
      }
      doc.setFontSize(8); doc.setTextColor(161, 161, 170);
      doc.text(`Super Techos · Control de Obras — pág. ${doc.getNumberOfPages()}`, M, PH - 6);

      const ref = (proyecto.referenciaOdoo || proyecto.cliente || 'obra').replace(/[^\w-]/g, '_');
      const filename = `Reporte-Fotografico-${ref}-${new Date().toISOString().split('T')[0]}.pdf`;
      const blob = doc.output('blob');
      const base64 = doc.output('datauristring').split(',')[1];
      // Descargar de una vez (para adjuntar por WhatsApp)
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
      setReporteListo({ base64, filename, sizeMB: (blob.size / 1024 / 1024).toFixed(1), nFotos: conData.length });
    } finally { setGenerandoReporte(null); }
  };

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
      {/* v8.27.78: reporte fotográfico PDF del proyecto (≤3MB, listo para WhatsApp/correo) */}
      {fotos.length > 0 && (
        <div className="space-y-2">
          <button onClick={generarReporteFotografico} disabled={!!generandoReporte}
            className="w-full bg-zinc-900 border border-zinc-700 hover:border-red-600 py-2.5 flex items-center justify-center gap-2 text-xs font-bold uppercase text-zinc-300 disabled:opacity-60">
            {generandoReporte ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {generandoReporte ? `Preparando fotos… ${generandoReporte.hechas}/${generandoReporte.total}` : `Reporte fotográfico PDF (${Math.min(fotos.length, 60)} fotos)`}
          </button>
          {reporteListo && (
            <div className="bg-zinc-900 border border-green-800 rounded-card p-2.5 space-y-2">
              <div className="text-[11px] text-green-300 font-bold">✅ PDF descargado — {reporteListo.filename} ({reporteListo.sizeMB}MB)</div>
              <div className="flex flex-wrap gap-2">
                {esAdmin && (
                  <button onClick={enviarReportePorCorreo} disabled={enviandoCorreo}
                    className="flex-1 min-w-[140px] bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-[11px] font-bold uppercase py-2 flex items-center justify-center gap-1">
                    {enviandoCorreo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '📧'} Enviar al cliente{contactoReportes.email ? ` (${contactoReportes.email})` : ''}
                  </button>
                )}
                <button onClick={abrirWhatsAppCliente}
                  className="flex-1 min-w-[140px] bg-green-700 hover:bg-green-600 text-white text-[11px] font-bold uppercase py-2 flex items-center justify-center gap-1">
                  🟢 WhatsApp del cliente
                </button>
              </div>
              <div className="text-[10px] text-zinc-500">
                {esAdmin ? 'El correo lo envía el ERP tras tu confirmación. ' : 'El envío por correo lo hace un admin. '}
                En WhatsApp: se abre el chat con el mensaje listo — adjunta el PDF descargado con el clip 📎.
              </div>
            </div>
          )}
        </div>
      )}
      {!showUpload ? (
        <button onClick={() => setShowUpload(true)} className="w-full bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-red-600 py-4 flex flex-col items-center gap-1 text-sm font-bold uppercase text-zinc-400"><Camera className="w-6 h-6" /> Subir Fotos</button>
      ) : (
        <div className="bg-zinc-900 border-2 border-red-600 p-4 space-y-3">
          <div className="flex justify-between items-center"><div className="text-xs tracking-widest uppercase font-bold text-red-500">Subir fotos</div><button onClick={() => setShowUpload(false)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
          <Campo label="Fecha"><Input type="date" value={fechaSubida} onChange={v => setFechaSubida(v)} /></Campo>
          {/* v8.27.67 (ticket Yamel "fotos directo"): cámara directa + galería como opciones */}
          {subiendo ? (
            <div className="border-2 border-dashed border-red-600 bg-red-600/10 p-5 text-center">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto" /><div className="text-xs mt-2">Comprimiendo y subiendo...</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="border-2 border-dashed border-zinc-700 hover:border-red-600 p-4 text-center cursor-pointer">
                <input type="file" accept="image/*" capture="environment" onChange={e => subir(Array.from(e.target.files))} className="hidden" />
                <Camera className="w-7 h-7 text-red-500 mx-auto mb-1" />
                <div className="text-xs font-bold">Tomar foto</div>
                <div className="text-[10px] text-zinc-500">cámara directo</div>
              </label>
              <label className="border-2 border-dashed border-zinc-700 hover:border-red-600 p-4 text-center cursor-pointer">
                <input type="file" accept="image/*" multiple onChange={e => subir(Array.from(e.target.files))} className="hidden" />
                <Camera className="w-7 h-7 text-zinc-500 mx-auto mb-1" />
                <div className="text-xs font-bold">Galería</div>
                <div className="text-[10px] text-zinc-500">varias a la vez</div>
              </label>
            </div>
          )}
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
  // v8.25.37: carga perezosa — solo descarga la imagen (base64 pesado) cuando la
  // tarjeta entra en pantalla. Evita disparar N descargas full-res de golpe.
  const [src, setSrc] = useState(null);
  const [estado, setEstado] = useState('idle'); // idle | cargando | error
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || src) return;
    let cancelado = false;
    setEstado('cargando');
    db.obtenerFoto(foto.id)
      .then(d => { if (!cancelado) { setSrc(d); setEstado('ok'); } })
      .catch(() => { if (!cancelado) setEstado('error'); });
    return () => { cancelado = true; };
  }, [visible, foto.id]);
  return (
    <button ref={ref} onClick={onVer} className="aspect-square bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600 overflow-hidden relative">
      {src
        ? <img src={src} loading="lazy" decoding="async" className="w-full h-full object-cover" alt="" />
        : <div className="w-full h-full flex items-center justify-center">{estado === 'cargando' ? <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" /> : <Camera className="w-5 h-5 text-zinc-700" />}</div>}
    </button>
  );
}
