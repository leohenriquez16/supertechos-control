'use client';

// v8.68.0 (ticket Edwin): INFORME DE VISITA de una reclamación, generado en PDF desde
// el ERP (antes solo se podía subir uno hecho a mano). Mismo patrón que
// ModalReporteFinalPDF: jsPDF, membrete Super Techos, rejilla de fotos y firma.
// "Guardar como informe entregado" sube el PDF al mismo lugar que la subida manual y
// marca el informe con la misma función (onGuardarInforme del padre).
// Las observaciones y la recomendación escritas aquí van SOLO en el PDF.

import React, { useEffect, useState } from 'react';
import { X, Loader2, FileText, FileDown, CheckCircle2 } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaLarga } from '../../lib/helpers/formato';
import { resolverContacto } from '../../lib/helpers/contactoCliente';
import { etiquetaCausaRaiz, filasIdentificacion, seccionesInforme, nombreArchivoInforme } from '../../lib/helpers/informeVisita';

const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

// Foto (URL pública) → dataURL JPEG comprimido. null si no se pudo leer.
const fotoComprimida = async (url, maxDim = 900, calidad = 0.6, tipo = 'image/jpeg') => {
  try {
    const blob = await (await fetch(url)).blob();
    const obj = URL.createObjectURL(blob);
    try {
      return await new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          try {
            const esc = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * esc)), h = Math.max(1, Math.round(img.height * esc));
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            res({ dataUrl: c.toDataURL(tipo, calidad), w, h });
          } catch { res(null); }
        };
        img.onerror = () => res(null);
        img.src = obj;
      });
    } finally { URL.revokeObjectURL(obj); }
  } catch { return null; }
};

export default function ModalInformeVisitaPDF({ r, cliente, clienteNombre, ubicacion, ubicacionNombre, proyecto, usuario, causasRaiz = [], onGuardarInforme, onCerrar }) {
  const fotos = r.fotos || [];
  const [fechaVisita, setFechaVisita] = useState(r.fechaVisitaProgramada || r.fechaResuelta || hoyISO());
  const [observaciones, setObservaciones] = useState('');
  const [trabajo, setTrabajo] = useState(r.trabajoRealizado || '');
  const [recomendacion, setRecomendacion] = useState('');
  const [encargado, setEncargado] = useState(usuario?.nombre || '');
  const [pies, setPies] = useState(() => fotos.map(() => ''));
  const [incluir, setIncluir] = useState(() => fotos.map(() => true));
  const [contacto, setContacto] = useState(() => resolverContacto({ cliente, contacto: null, ubicacion }));
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  // Contacto asignado a la reclamación (empresa) — igual que ContactoReclamacion.
  useEffect(() => {
    if (!r.contactoId || !r.clienteId) return;
    let cancel = false;
    db.listarContactos(r.clienteId).then(cs => {
      if (cancel) return;
      const asignado = (cs || []).find(c => c.id === r.contactoId) || null;
      setContacto(resolverContacto({ cliente, contacto: asignado, ubicacion }));
    }).catch(() => {});
    return () => { cancel = true; };
  }, [r.id]); // eslint-disable-line

  const construirPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const PW = 210, PH = 297, M = 14;
    let y = 0;
    const pie = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(161, 161, 170); doc.text(`LH Super Techos, SRL · RNC 130774331 · 809-535-9293 · www.supertechos.com.do — pág. ${doc.getNumberOfPages()}`, M, PH - 8); };
    const nuevaPagSi = (necesita) => { if (y + necesita > PH - 16) { pie(); doc.addPage(); y = 18; } };
    const titulo = (t) => { nuevaPagSi(14); doc.setFillColor(204, 0, 0); doc.rect(M, y, 1.6, 5, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(24, 24, 27); doc.text(t, M + 4, y + 4); y += 9; };
    const texto = (t, opts = {}) => {
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(opts.size || 9.5);
      doc.setTextColor(...(opts.color || [39, 39, 42]));
      const lines = doc.splitTextToSize(t, PW - M * 2 - (opts.indent || 0));
      for (const ln of lines) { nuevaPagSi(5); doc.text(ln, M + (opts.indent || 0), y); y += 4.4; }
      y += (opts.gap ?? 1.5);
    };

    // ===== Membrete =====
    doc.setFillColor(204, 0, 0); doc.rect(0, 0, PW, 5, 'F');
    let conLogo = false;
    try {
      const logo = await fotoComprimida('/logo-super-techos.png', 600, 0.9, 'image/png'); // PNG: conserva la transparencia
      if (logo) { const h = 14, w = Math.min(60, (logo.w / logo.h) * h); doc.addImage(logo.dataUrl, 'PNG', M, 9, w, h); conLogo = true; }
    } catch { /* sin logo: queda el texto */ }
    if (!conLogo) { doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(204, 0, 0); doc.text('SUPER TECHOS', M, 18); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(24, 24, 27);
    doc.text('INFORME DE VISITA', PW - M, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(113, 113, 122);
    doc.text(`Reclamación ${r.codigo || ''}`.trim(), PW - M, 20.5, { align: 'right' });
    doc.text(`Fecha: ${formatFechaLarga(hoyISO())}`, PW - M, 25, { align: 'right' });
    doc.setDrawColor(228, 228, 231); doc.line(M, 29, PW - M, 29);
    y = 36;

    // ===== Identificación =====
    titulo('DATOS DEL CLIENTE');
    const filas = [...filasIdentificacion({ clienteNombre, contacto, ubicacionNombre, proyecto, referenciaCotizacion: r.referenciaCotizacion }),
      ['Fecha de visita', fechaVisita ? formatFechaLarga(fechaVisita) : '—']];
    filas.forEach(([k, v]) => {
      const lines = doc.splitTextToSize(String(v), PW - M * 2 - 42);
      nuevaPagSi(lines.length * 4.6 + 1);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(113, 113, 122); doc.text(k.toUpperCase(), M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(24, 24, 27);
      doc.text(lines, M + 42, y); y += Math.max(1, lines.length) * 4.6 + 1;
    });
    y += 3;

    // ===== Hallazgo / causa / trabajo / recomendación =====
    const secs = seccionesInforme({
      descripcion: r.descripcion, observaciones,
      causaRaizTxt: etiquetaCausaRaiz(r.causaRaiz, causasRaiz),
      trabajoRealizado: trabajo, recomendacion,
    });
    secs.forEach(s => { titulo(s.titulo); s.texto.split('\n\n').forEach(par => texto(par, { gap: 2.5 })); y += 1; });

    // ===== Fotos (2 columnas, con pie) =====
    const elegidas = fotos.map((u, i) => ({ u, pie: pies[i], i })).filter((_, i) => incluir[i]);
    if (elegidas.length) {
      const conData = [];
      for (const f of elegidas) { const d = await fotoComprimida(f.u); if (d) conData.push({ ...f, ...d }); }
      if (conData.length) {
        titulo('REGISTRO FOTOGRÁFICO');
        const colw = (PW - M * 2 - 6) / 2, imgh = colw * 3 / 4;
        for (let i = 0; i < conData.length; i += 2) {
          nuevaPagSi(imgh + 11);
          let maxPie = 0;
          for (let c = 0; c < 2 && i + c < conData.length; c++) {
            const f = conData[i + c];
            const x = M + c * (colw + 6);
            // encajar la foto en la celda sin deformarla
            const esc = Math.min(colw / f.w, imgh / f.h);
            const w = f.w * esc, h = f.h * esc;
            try { doc.addImage(f.dataUrl, 'JPEG', x + (colw - w) / 2, y + (imgh - h) / 2, w, h, undefined, 'FAST'); } catch { /* skip */ }
            doc.setDrawColor(228, 228, 231); doc.rect(x, y, colw, imgh);
            const lp = doc.splitTextToSize(`Foto ${i + c + 1}${(f.pie || '').trim() ? ` — ${f.pie.trim()}` : ''}`, colw);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(82, 82, 91);
            doc.text(lp, x, y + imgh + 4); maxPie = Math.max(maxPie, lp.length);
          }
          y += imgh + 4 + maxPie * 3.6 + 3;
        }
      }
    }

    // ===== Firma =====
    nuevaPagSi(34);
    y += 16;
    const fw = (PW - M * 2 - 16) / 2;
    doc.setDrawColor(113, 113, 122);
    doc.line(M, y, M + fw, y); doc.line(M + fw + 16, y, M + fw * 2 + 16, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(24, 24, 27);
    doc.text('POR SUPER TECHOS', M, y + 4.5);
    doc.text('RECIBIDO POR EL CLIENTE', M + fw + 16, y + 4.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(113, 113, 122);
    doc.text(encargado || '', M, y + 9);
    doc.text(contacto?.nombre || clienteNombre || '', M + fw + 16, y + 9);
    pie();
    return doc;
  };

  const filename = nombreArchivoInforme(r, fechaVisita);

  const descargar = async () => {
    setGenerando(true);
    try {
      const doc = await construirPDF();
      doc.save(filename);
    } catch (e) { alert('Error generando el informe: ' + (e.message || e)); }
    setGenerando(false);
  };

  const guardarEntregado = async () => {
    if (!onGuardarInforme) return;
    setGuardando(true);
    try {
      const doc = await construirPDF();
      const blob = doc.output('blob');
      await onGuardarInforme(blob, filename);
      setGuardado(true);
    } catch (e) { alert('Error guardando el informe: ' + (e.message || e)); }
    setGuardando(false);
  };

  const ocupado = generando || guardando;
  const lbl = 'text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1';
  const inp = 'w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none rounded-card px-2.5 py-2 text-white text-sm';

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-lg w-full p-5 space-y-3 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Informe de visita</div>
            <div className="text-sm font-bold mt-1">{r.codigo ? `${r.codigo} · ` : ''}{clienteNombre}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="text-[10px] text-zinc-500">
          Documento para el cliente: datos de la reclamación, hallazgo, causa, trabajo realizado, fotos y firma.
          Las observaciones y la recomendación que escribas aquí van solo en el PDF.
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className={lbl}>Fecha de visita</div>
            <input type="date" value={fechaVisita} onChange={e => setFechaVisita(e.target.value)} className={`${inp} [color-scheme:dark]`} />
          </div>
          <div>
            <div className={lbl}>Encargado (firma)</div>
            <input value={encargado} onChange={e => setEncargado(e.target.value)} className={inp} />
          </div>
        </div>

        <div>
          <div className={lbl}>Reporte del cliente</div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-2 text-xs text-zinc-300 whitespace-pre-wrap">{r.descripcion || 'Sin descripción.'}</div>
        </div>
        <div>
          <div className={lbl}>Observaciones de la visita</div>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={3} placeholder="Lo que se encontró en el techo…" className={inp} />
        </div>
        <div>
          <div className={lbl}>Causa</div>
          <div className="text-xs text-zinc-300">{etiquetaCausaRaiz(r.causaRaiz, causasRaiz) || <span className="text-zinc-500">Sin causa registrada (se omite en el PDF). Regístrala en «Resolución».</span>}</div>
        </div>
        <div>
          <div className={lbl}>Trabajo realizado</div>
          <textarea value={trabajo} onChange={e => setTrabajo(e.target.value)} rows={3} placeholder="Intervención realizada…" className={inp} />
        </div>
        <div>
          <div className={lbl}>Recomendación</div>
          <textarea value={recomendacion} onChange={e => setRecomendacion(e.target.value)} rows={2} placeholder="Ej. mantenimiento sugerido, cuidados del área…" className={inp} />
        </div>

        <div>
          <div className={lbl}>Fotos ({incluir.filter(Boolean).length} de {fotos.length})</div>
          {fotos.length === 0 ? <div className="text-xs text-zinc-500">La reclamación no tiene fotos. Súbelas en «Fotos del trabajo».</div> : (
            <div className="grid grid-cols-2 gap-2">
              {fotos.map((u, i) => (
                <div key={u} className={`bg-zinc-950 border rounded-card p-1.5 space-y-1 ${incluir[i] ? 'border-zinc-700' : 'border-zinc-800 opacity-50'}`}>
                  <label className="block relative cursor-pointer">
                    <img src={u} alt="" className="w-full h-24 object-cover rounded-card" />
                    <input type="checkbox" checked={!!incluir[i]} onChange={e => setIncluir(p => p.map((x, j) => j === i ? e.target.checked : x))} className="absolute top-1 left-1 w-4 h-4 accent-red-600" />
                  </label>
                  <input value={pies[i] || ''} onChange={e => setPies(p => p.map((x, j) => j === i ? e.target.value : x))} placeholder={`Pie de foto ${i + 1}`} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-1.5 py-1 text-[11px] text-white outline-none focus:border-red-600" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap pt-1">
          <button onClick={descargar} disabled={ocupado} className="flex-1 min-w-[140px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-white text-[11px] font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-1.5">
            {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Descargar PDF
          </button>
          {onGuardarInforme && (
            <button onClick={guardarEntregado} disabled={ocupado || guardado} className="flex-1 min-w-[180px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[11px] font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-1.5">
              {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : guardado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
              {guardado ? 'Guardado como entregado' : 'Guardar como informe entregado'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
