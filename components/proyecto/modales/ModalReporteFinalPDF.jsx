'use client';

// v8.27.79: REPORTE FINAL DE OBRA (PDF, jsPDF) — el documento de cierre/entrega al cliente.
// Completa la familia: reporte de avance + reporte fotográfico + reporte FINAL.
// Contenido: identificación, resumen ejecutivo (m², fechas, duración), trabajos por área,
// GARANTÍA y mantenimiento (con nota de que la carta de garantía formal se envía automática
// al saldar la factura), próximo mantenimiento sugerido, link de servicio, fotos finales y
// firmas de entrega/conformidad. ≤3MB para enviarlo por correo/WhatsApp desde aquí mismo.

import React, { useState } from 'react';
import { X, Loader2, FileText } from 'lucide-react';
import * as db from '../../../lib/db';
import { formatFechaLarga, formatNum } from '../../../lib/helpers/formato';

const tieneRol = (p, r) => p?.roles?.includes(r);
const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

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

export default function ModalReporteFinalPDF({ proyecto, sistema, data, usuario, onCerrar }) {
  const esAdmin = tieneRol(usuario, 'admin');
  const supervisor = (data.personal || []).find(p => p.id === proyecto.supervisorId);
  const maestro = (data.personal || []).find(p => p.id === proyecto.maestroId);
  const [fechaEntrega, setFechaEntrega] = useState(hoyISO());
  const [entregadoPor, setEntregadoPor] = useState(supervisor?.nombre || maestro?.nombre || usuario?.nombre || '');
  const [incluirFotos, setIncluirFotos] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [listo, setListo] = useState(null); // {base64, filename, sizeMB}
  const [enviando, setEnviando] = useState(false);
  const [contacto, setContacto] = useState({ email: proyecto.contactoClienteEmail || '', telefono: proyecto.contactoClienteTelefono || '' });

  // ===== cálculos de cierre =====
  const reportesProy = (data.reportes || []).filter(r => r.proyectoId === proyecto.id);
  const fechasRep = reportesProy.map(r => r.fecha).filter(Boolean).sort();
  const fechaInicio = proyecto.fecha_inicio || fechasRep[0] || null;
  const fechaFinTrabajo = fechasRep[fechasRep.length - 1] || fechaEntrega;
  const duracionDias = fechaInicio ? Math.max(1, Math.round((new Date(fechaFinTrabajo) - new Date(fechaInicio)) / 86400000) + 1) : null;

  const m2TotalProyecto = (proyecto.areas || []).reduce((s, a) => s + (Number(a.m2) || 0), 0);
  // sistemas usados (para garantía por sistema)
  const sistemaIds = [...new Set([proyecto.sistema, ...(proyecto.areas || []).map(a => a.sistemaId).filter(Boolean)])].filter(Boolean);
  const sistemasUsados = sistemaIds.map(id => ({ id, ...(data.sistemas?.[id] || {}) })).filter(s => s.nombre);
  const garantiaMax = Math.max(0, ...sistemasUsados.map(s => Number(s.garantia_meses) || 0));
  const mantCada = Math.min(...sistemasUsados.map(s => Number(s.mantenimiento_cada_meses) || Infinity));
  const mantCadaMeses = Number.isFinite(mantCada) && mantCada > 0 ? mantCada : null;
  const proxMant = mantCadaMeses ? (() => { const d = new Date(fechaEntrega + 'T12:00:00'); d.setMonth(d.getMonth() + mantCadaMeses); return d.toISOString().split('T')[0]; })() : null;

  const generar = async () => {
    setGenerando(true);
    setListo(null);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const PW = 210, PH = 297, M = 14;
      let y = 0;
      const nuevaPagSi = (necesita) => { if (y + necesita > PH - 16) { pie(); doc.addPage(); y = 18; } };
      const pie = () => { doc.setFontSize(8); doc.setTextColor(161, 161, 170); doc.text(`Super Techos, SRL · Reporte final de obra ${proyecto.referenciaOdoo || ''} — pág. ${doc.getNumberOfPages()}`, M, PH - 8); };
      const titulo = (t) => { nuevaPagSi(14); doc.setFillColor(204, 0, 0); doc.rect(M, y, 1.6, 5, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(24, 24, 27); doc.text(t, M + 4, y + 4); y += 9; };
      const texto = (t, opts = {}) => {
        doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(opts.size || 9.5);
        doc.setTextColor(...(opts.color || [39, 39, 42]));
        const lines = doc.splitTextToSize(t, PW - M * 2 - (opts.indent || 0));
        nuevaPagSi(lines.length * 4.4 + 2);
        doc.text(lines, M + (opts.indent || 0), y); y += lines.length * 4.4 + (opts.gap ?? 1.5);
      };

      // ===== Encabezado =====
      doc.setFillColor(204, 0, 0); doc.rect(0, 0, PW, 5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(24, 24, 27);
      doc.text('REPORTE FINAL DE OBRA', M, 18);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(113, 113, 122);
      doc.text('Acta de entrega y conformidad del trabajo realizado', M, 24);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(204, 0, 0);
      doc.text('SUPER TECHOS', PW - M, 16, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(113, 113, 122);
      doc.text(`Emitido: ${formatFechaLarga(hoyISO())}`, PW - M, 21, { align: 'right' });
      doc.setDrawColor(228, 228, 231); doc.line(M, 28, PW - M, 28);
      y = 35;

      // ===== 1. Identificación =====
      titulo('1. IDENTIFICACIÓN DEL PROYECTO');
      const filasId = [
        ['Cliente', proyecto.cliente || '—'],
        ['Referencia', proyecto.referenciaOdoo || '—'],
        ['Locación / referencia', proyecto.referenciaProyecto || proyecto.ubicacionDireccion || '—'],
        ['Sistema(s) aplicado(s)', sistemasUsados.map(s => s.nombre).join(' · ') || (sistema?.nombre || '—')],
      ];
      filasId.forEach(([k, v]) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(113, 113, 122); doc.text(k.toUpperCase(), M, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(24, 24, 27);
        const lines = doc.splitTextToSize(String(v), PW - M * 2 - 52);
        doc.text(lines, M + 52, y); y += Math.max(1, lines.length) * 4.6 + 1;
      });
      y += 3;

      // ===== 2. Resumen ejecutivo =====
      titulo('2. RESUMEN DEL TRABAJO');
      const cajas = [
        ['SUPERFICIE', `${formatNum(m2TotalProyecto)} m²`],
        ['INICIO', fechaInicio ? formatFechaLarga(fechaInicio) : '—'],
        ['FINALIZACIÓN', formatFechaLarga(fechaFinTrabajo)],
        ['DURACIÓN', duracionDias ? `${duracionDias} días` : '—'],
      ];
      const cw = (PW - M * 2 - 9) / 4;
      cajas.forEach(([k, v], i) => {
        const x = M + i * (cw + 3);
        doc.setFillColor(244, 244, 245); doc.roundedRect(x, y, cw, 14, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(113, 113, 122); doc.text(k, x + 3, y + 5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(24, 24, 27);
        doc.text(doc.splitTextToSize(String(v), cw - 6), x + 3, y + 10.5);
      });
      y += 20;
      texto('El trabajo contratado fue ejecutado y completado en su totalidad (avance final: 100%). Las superficies intervenidas quedaron probadas y en condiciones de uso.', { color: [63, 63, 70] });
      y += 2;

      // ===== 3. Trabajos por área =====
      titulo('3. TRABAJOS REALIZADOS POR ÁREA');
      (proyecto.areas || []).forEach(a => {
        const sis = data.sistemas?.[a.sistemaId || proyecto.sistema];
        nuevaPagSi(12);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(24, 24, 27);
        doc.text(`• ${a.nombre || 'Área'} — ${formatNum(a.m2 || 0)} m² · ${sis?.nombre || ''}`, M, y); y += 4.6;
        const tareas = (sis?.tareas || []).map(t => t.nombre).filter(Boolean);
        if (tareas.length) texto(`Trabajos: ${tareas.join(' → ')}.`, { size: 8.5, indent: 4, color: [82, 82, 91], gap: 2.5 });
      });
      y += 2;

      // ===== 4. Garantía y mantenimiento =====
      titulo('4. GARANTÍA Y MANTENIMIENTO');
      nuevaPagSi(34);
      doc.setFillColor(232, 244, 228); doc.roundedRect(M, y, PW - M * 2, 22, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(39, 80, 10);
      doc.text(garantiaMax > 0 ? `GARANTÍA: ${garantiaMax} MESES desde la fecha de entrega` : 'GARANTÍA: según contrato', M + 4, y + 6.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.text(mantCadaMeses
        ? `Mantenimiento recomendado cada ${mantCadaMeses} meses · Próximo mantenimiento sugerido: ${formatFechaLarga(proxMant)}`
        : 'Mantenimiento preventivo recomendado según el sistema instalado.', M + 4, y + 12);
      doc.text('El mantenimiento periódico realizado por Super Techos es requisito para conservar la vigencia de la garantía.', M + 4, y + 17);
      y += 26;
      texto('La garantía cubre defectos de instalación del sistema aplicado. No cubre daños causados por modificaciones, perforaciones o intervenciones de terceros posteriores a la entrega.', { size: 8.5, color: [82, 82, 91] });
      texto('LA CARTA DE GARANTÍA formal se emite y envía de manera automática al quedar saldada la factura de la obra.', { size: 8.5, bold: true, color: [204, 0, 0] });
      texto('Para solicitar servicio o mantenimiento: supertechos-control.vercel.app/solicitud · lhenriquez@supertechos.com.do', { size: 8.5, color: [82, 82, 91], gap: 3 });

      // ===== 5. Fotos finales =====
      if (incluirFotos) {
        try {
          const todas = await db.listarFotosProyecto(proyecto.id);
          const finales = (todas || []).slice(0, 8); // más recientes
          if (finales.length) {
            titulo('5. REGISTRO FOTOGRÁFICO FINAL');
            const conData = [];
            for (const f of finales) {
              try { conData.push({ ...f, dataUrl: await recomprimirFoto(await db.obtenerFoto(f.id), 760, 0.55) }); } catch { /* skip */ }
            }
            const colw = (PW - M * 2 - 6) / 2, imgh = colw * 3 / 4;
            for (let i = 0; i < conData.length; i += 2) {
              nuevaPagSi(imgh + 6);
              for (let c = 0; c < 2 && i + c < conData.length; c++) {
                const x = M + c * (colw + 6);
                try { doc.addImage(conData[i + c].dataUrl, 'JPEG', x, y, colw, imgh, undefined, 'FAST'); } catch { /* skip */ }
                doc.setDrawColor(228, 228, 231); doc.rect(x, y, colw, imgh);
              }
              y += imgh + 6;
            }
          }
        } catch { /* sin fotos no bloquea */ }
      }

      // ===== 6. Firmas =====
      nuevaPagSi(46);
      titulo(incluirFotos ? '6. ENTREGA Y CONFORMIDAD' : '5. ENTREGA Y CONFORMIDAD');
      y += 16;
      const fw = (PW - M * 2 - 16) / 2;
      doc.setDrawColor(113, 113, 122);
      doc.line(M, y, M + fw, y); doc.line(M + fw + 16, y, M + fw * 2 + 16, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(24, 24, 27);
      doc.text('ENTREGADO POR — SUPER TECHOS', M, y + 4.5);
      doc.text('RECIBIDO CONFORME — CLIENTE', M + fw + 16, y + 4.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(113, 113, 122);
      doc.text(entregadoPor || '', M, y + 9);
      doc.text(proyecto.contactoClienteNombre || proyecto.cliente || '', M + fw + 16, y + 9);
      doc.text(`Fecha de entrega: ${formatFechaLarga(fechaEntrega)}`, M, y + 14);
      pie();

      const ref = (proyecto.referenciaOdoo || proyecto.cliente || 'obra').replace(/[^\w-]/g, '_');
      const filename = `Reporte-Final-${ref}-${fechaEntrega}.pdf`;
      const blob = doc.output('blob');
      const base64 = doc.output('datauristring').split(',')[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
      setListo({ base64, filename, sizeMB: (blob.size / 1024 / 1024).toFixed(1) });
    } catch (e) { alert('Error generando el reporte: ' + (e.message || e)); }
    setGenerando(false);
  };

  const pedirContacto = async (tipo) => {
    const label = tipo === 'email' ? '¿A qué CORREO del cliente se envía el reporte final?' : '¿WhatsApp del cliente? (ej. 809-555-1234)';
    const v = prompt(label, contacto[tipo] || '');
    if (v === null || !v.trim()) return null;
    const limpio = v.trim();
    try { await db.guardarContactoReportesProyecto(proyecto.id, tipo === 'email' ? { email: limpio } : { telefono: limpio }); setContacto(p => ({ ...p, [tipo]: limpio })); } catch { /* noop */ }
    return limpio;
  };

  const enviarCorreo = async () => {
    if (!listo) return;
    const email = contacto.email || await pedirContacto('email');
    if (!email) return;
    const ref = proyecto.referenciaOdoo || proyecto.cliente;
    if (!confirm(`Enviar el REPORTE FINAL (${listo.sizeMB}MB) a:\n\n${email}`)) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/email/reporte-cliente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para: email,
          asunto: `Reporte final de obra — ${ref}`,
          mensaje: `Saludos,\n\nAdjuntamos el REPORTE FINAL de su obra ${ref}${proyecto.referenciaProyecto ? ` (${proyecto.referenciaProyecto})` : ''}, con el detalle de los trabajos realizados, la garantía y el registro fotográfico final.\n\nLa carta de garantía formal se emite automáticamente al quedar saldada la factura.\n\nGracias por confiar en nosotros.\n\nSuper Techos, SRL`,
          pdfBase64: listo.base64,
          filename: listo.filename,
        }),
      });
      const j = await res.json();
      alert(j.ok ? '✅ Reporte final enviado a ' + email : 'No se pudo enviar: ' + (j.error || 'error'));
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setEnviando(false);
  };

  const abrirWhatsApp = async () => {
    const tel = contacto.telefono || await pedirContacto('telefono');
    if (!tel) return;
    let dig = String(tel).replace(/\D/g, '');
    if (dig.length === 10) dig = '1' + dig;
    const ref = proyecto.referenciaOdoo || proyecto.cliente;
    const texto = encodeURIComponent(`Saludos 👋 Le compartimos el REPORTE FINAL de su obra ${ref}, con los trabajos realizados, la garantía y las fotos finales. Se lo adjuntamos a continuación.`);
    window.open(`https://wa.me/${dig}?text=${texto}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-3 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Reporte final de obra</div>
            <div className="text-sm font-bold mt-1">{proyecto.referenciaOdoo || ''} · {proyecto.cliente}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="text-[10px] text-zinc-500">
          Acta de entrega para el cliente: identificación, resumen del trabajo ({formatNum(m2TotalProyecto)} m²), trabajos por área,
          garantía {garantiaMax > 0 ? `(${garantiaMax} meses)` : ''}{mantCadaMeses ? ` + mantenimiento cada ${mantCadaMeses} meses` : ''}, fotos finales y firmas.
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Fecha de entrega</div>
            <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Entregado por</div>
            <input value={entregadoPor} onChange={e => setEntregadoPor(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={incluirFotos} onChange={e => setIncluirFotos(e.target.checked)} className="w-3.5 h-3.5 accent-red-600" />
          Incluir registro fotográfico final (últimas 8 fotos)
        </label>

        <button onClick={generar} disabled={generando} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-2">
          {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {generando ? 'Generando PDF…' : 'Generar reporte final (PDF)'}
        </button>

        {listo && (
          <div className="bg-zinc-950 border border-green-800 rounded-card p-2.5 space-y-2">
            <div className="text-[11px] text-green-300 font-bold">✅ {listo.filename} ({listo.sizeMB}MB) — descargado</div>
            <div className="flex flex-wrap gap-2">
              {esAdmin && (
                <button onClick={enviarCorreo} disabled={enviando} className="flex-1 min-w-[130px] bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-[11px] font-bold uppercase py-2">
                  {enviando ? '…' : '📧'} Enviar al cliente{contacto.email ? ` (${contacto.email})` : ''}
                </button>
              )}
              <button onClick={abrirWhatsApp} className="flex-1 min-w-[130px] bg-green-700 hover:bg-green-600 text-white text-[11px] font-bold uppercase py-2">
                🟢 WhatsApp
              </button>
            </div>
            <div className="text-[10px] text-zinc-500">En WhatsApp: adjunta el PDF descargado con el clip 📎.</div>
          </div>
        )}
      </div>
    </div>
  );
}
