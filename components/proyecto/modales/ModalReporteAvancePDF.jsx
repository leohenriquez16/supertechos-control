'use client';

import React, { useState, useEffect } from 'react';
import { Download, Eye, Loader2 } from 'lucide-react';
import * as db from '../../../lib/db';
import { formatRD, formatFechaCorta } from '../../../lib/helpers/formato';
import { getM2Reporte, calcAvanceProyecto } from '../../../lib/helpers/calculos';
import Campo from '../../common/Campo';
import Input from '../../common/Input';

export default function ModalReporteAvancePDF({ proyecto, sistema, data, usuario, onCerrar }) {
  const hoy = new Date().toISOString().split('T')[0];
  const haceSieteDias = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const [tipo, setTipo] = useState('semanal');
  const [fechaInicio, setFechaInicio] = useState(haceSieteDias);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [proximosPasos, setProximosPasos] = useState('');
  const [incluirFotos, setIncluirFotos] = useState(true);
  const [incluirBitacora, setIncluirBitacora] = useState(true);
  const [incluirFinanciero, setIncluirFinanciero] = useState(true);
  const [preview, setPreview] = useState(false);
  // v8.9.28: fotos reales cargadas para el PDF
  const [fotosCargadas, setFotosCargadas] = useState([]);
  const [cargandoFotos, setCargandoFotos] = useState(false);

  // Calcular automáticamente según tipo
  useEffect(() => {
    const h = new Date();
    let inicio;
    if (tipo === 'diario') {
      inicio = new Date(h); inicio.setHours(0,0,0,0);
    } else if (tipo === 'semanal') {
      inicio = new Date(h); inicio.setDate(h.getDate() - 7);
    } else if (tipo === 'quincenal') {
      inicio = new Date(h); inicio.setDate(h.getDate() - 15);
    }
    if (inicio && tipo !== 'custom') {
      setFechaInicio(inicio.toISOString().split('T')[0]);
      setFechaFin(h.toISOString().split('T')[0]);
    }
  }, [tipo]);

  // v8.9.28: cargar fotos del periodo para el PDF
  useEffect(() => {
    if (!incluirFotos) { setFotosCargadas([]); return; }
    let cancelado = false;
    (async () => {
      setCargandoFotos(true);
      try {
        // Cantidades segun tipo: diario 4, semanal 10, quincenal 12, custom hasta 12
        const maxFotos = tipo === 'diario' ? 4 : tipo === 'semanal' ? 10 : 12;
        const todasFotos = await db.listarFotosProyecto(proyecto.id);
        // Filtrar por rango de fechas (usa created_at o fecha si existe)
        const enRango = (todasFotos || []).filter(f => {
          const fecha = (f.fecha || f.created_at || '').slice(0, 10);
          return fecha >= fechaInicio && fecha <= fechaFin;
        });
        // Orden cronologico antiguas primero
        enRango.sort((a, b) => {
          const fa = (a.fecha || a.created_at || '');
          const fb = (b.fecha || b.created_at || '');
          return fa.localeCompare(fb);
        });
        // Limitar cantidad
        const seleccionadas = enRango.slice(0, maxFotos);
        // Cargar base64 en paralelo
        const conDatos = await Promise.all(seleccionadas.map(async f => {
          try {
            const dataUrl = await db.obtenerFoto(f.id);
            return { ...f, dataUrl };
          } catch { return null; }
        }));
        if (!cancelado) setFotosCargadas(conDatos.filter(Boolean));
      } catch (e) {
        console.error('Error cargando fotos para PDF:', e);
        if (!cancelado) setFotosCargadas([]);
      }
      if (!cancelado) setCargandoFotos(false);
    })();
    return () => { cancelado = true; };
  }, [proyecto.id, fechaInicio, fechaFin, incluirFotos, tipo]);

  const reportesPeriodo = (data.reportes || [])
    .filter(r => r.proyectoId === proyecto.id && r.fecha >= fechaInicio && r.fecha <= fechaFin)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const { porcentaje, produccionRD, valorContrato } = calcAvanceProyecto(proyecto, data.reportes, sistema, data.sistemas);

  // m² ejecutados en el periodo (por tarea) — v8.9.28: busca en todos los sistemas y guarda objeto completo
  const porTarea = {};
  reportesPeriodo.forEach(r => {
    // Resolver sistema del área del reporte (puede ser distinto al del proyecto)
    const areaRep = (proyecto.areas || []).find(a => a.id === r.areaId);
    const sistemaIdR = areaRep?.sistemaId || proyecto.sistema;
    const sistemaR = (data.sistemas && data.sistemas[sistemaIdR]) || sistema;
    const m2 = getM2Reporte(r, sistemaR);
    const tarea = sistemaR?.tareas?.find(t => t.id === r.tareaId);
    const nombre = tarea?.nombre || 'Tarea sin nombre';
    const key = tarea?.id || r.tareaId;
    if (!porTarea[key]) {
      porTarea[key] = {
        nombre,
        peso: tarea?.peso || 0,
        m2Ejecutado: 0,
        // m² totales posibles para esa tarea: suma de áreas que usen ese sistema/tarea
        m2Total: 0,
      };
    }
    porTarea[key].m2Ejecutado += m2;
  });
  // Calcular m² totales posibles para cada tarea (acumulado de áreas donde aplica)
  Object.keys(porTarea).forEach(taskId => {
    (proyecto.areas || []).forEach(a => {
      const sisIdA = a.sistemaId || proyecto.sistema;
      const sisA = (data.sistemas && data.sistemas[sisIdA]) || sistema;
      const tieneTarea = sisA?.tareas?.some(t => t.id === taskId);
      if (tieneTarea) porTarea[taskId].m2Total += (a.m2 || 0);
    });
  });
  const totalM2Periodo = Object.values(porTarea).reduce((s, v) => s + v.m2Ejecutado, 0);

  // Bitácora por día con detalle de actividad por tarea — v8.9.28
  const bitacoraPorDia = {};
  reportesPeriodo.forEach(r => {
    if (!bitacoraPorDia[r.fecha]) bitacoraPorDia[r.fecha] = { m2: 0, notas: [], actividades: {} };
    // v8.9.28: usar sistema del área del reporte
    const areaR = (proyecto.areas || []).find(a => a.id === r.areaId);
    const sisIdR = areaR?.sistemaId || proyecto.sistema;
    const sisR = (data.sistemas && data.sistemas[sisIdR]) || sistema;
    const m2 = getM2Reporte(r, sisR);
    bitacoraPorDia[r.fecha].m2 += m2;
    if (r.nota) bitacoraPorDia[r.fecha].notas.push(r.nota);
    // v8.9.28: acumular m² por tarea por día para "Actividad por día"
    const tareaR = sisR?.tareas?.find(t => t.id === r.tareaId);
    const nombreTarea = tareaR?.nombre || 'Tarea sin nombre';
    const keyAct = `${nombreTarea}__${areaR?.nombre || ''}`;
    if (!bitacoraPorDia[r.fecha].actividades[keyAct]) {
      bitacoraPorDia[r.fecha].actividades[keyAct] = {
        tarea: nombreTarea,
        area: areaR?.nombre || '',
        m2: 0,
      };
    }
    bitacoraPorDia[r.fecha].actividades[keyAct].m2 += m2;
  });
  const bitacora = Object.entries(bitacoraPorDia).sort((a,b) => a[0].localeCompare(b[0]));

  const diasTrabajados = bitacora.length;

  // Avance por área — v8.9.29: desglose por tarea, sin sumar m² entre tareas distintas
  const areasConAvance = (proyecto.areas || []).map(area => {
    const sisIdA = area.sistemaId || proyecto.sistema;
    const sisA = (data.sistemas && data.sistemas[sisIdA]) || sistema;
    const tareasDef = sisA?.tareas || [];

    // Calcular m² ejecutado POR TAREA (histórico y del período)
    const tareasConAvance = tareasDef.map(t => {
      const m2HistTarea = (data.reportes || [])
        .filter(r => r.proyectoId === proyecto.id && r.areaId === area.id && r.tareaId === t.id)
        .reduce((s, r) => s + getM2Reporte(r, sisA), 0);
      const m2PeriodoTarea = reportesPeriodo
        .filter(r => r.areaId === area.id && r.tareaId === t.id)
        .reduce((s, r) => s + getM2Reporte(r, sisA), 0);
      const m2Cap = Math.min(m2HistTarea, area.m2 || 0);
      const pctTarea = area.m2 > 0 ? (m2Cap / area.m2) * 100 : 0;
      return {
        id: t.id,
        nombre: t.nombre,
        peso: t.peso || 0,
        m2Historico: m2HistTarea,
        m2Periodo: m2PeriodoTarea,
        pct: Math.min(100, pctTarea),
      };
    });

    // Avance ponderado del área (correcto: cada tarea aporta su peso proporcional)
    const pctArea = tareasConAvance.reduce((acc, t) => acc + (t.pct / 100) * t.peso, 0);

    return {
      ...area,
      tareas: tareasConAvance,
      pct: Math.min(100, pctArea),
      sistemaNombre: sisA?.nombre || '',
    };
  });

  // v8.9.28: Descargar PDF real usando jsPDF + html2canvas cargados desde CDN
  const [descargandoPDF, setDescargandoPDF] = useState(false);
  const cargarScriptCDN = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });

  const descargarPDF = async () => {
    try {
      setDescargandoPDF(true);
      // Cargar librerías desde CDN (primera vez ~200KB, luego cache)
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = window.html2canvas;
      const { jsPDF } = window.jspdf;
      if (!html2canvas || !jsPDF) throw new Error('Librerías PDF no disponibles');

      const el = document.getElementById('reporte-pdf');
      if (!el) throw new Error('No se encontró el reporte');

      // Renderizar el HTML a canvas con alta calidad
      const canvas = await html2canvas(el, {
        scale: 2, // mejor calidad
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });

      // Dimensiones A4 en mm (210 x 297)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Si cabe en una sola página
      if (imgHeight <= pageHeight) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgWidth, imgHeight);
      } else {
        // Multi-página: dividir el canvas en páginas A4
        let remainingHeight = canvas.height;
        let srcY = 0;
        const pageHeightPx = (pageHeight * canvas.width) / pageWidth;
        while (remainingHeight > 0) {
          const sliceHeight = Math.min(pageHeightPx, remainingHeight);
          // Crear un canvas temporal para el slice
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;
          const ctx = sliceCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
          const sliceImgHeight = (sliceHeight * imgWidth) / canvas.width;
          if (srcY > 0) pdf.addPage();
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgWidth, sliceImgHeight);
          srcY += sliceHeight;
          remainingHeight -= sliceHeight;
        }
      }

      // Nombre del archivo: Reporte_[Cliente]_[Fecha].pdf
      const clienteSafe = (proyecto.cliente || proyecto.nombre || 'proyecto')
        .replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      const fecha = new Date().toISOString().split('T')[0];
      const nombreArchivo = `Reporte_${clienteSafe}_${fecha}.pdf`;
      pdf.save(nombreArchivo);
    } catch (e) {
      console.error('Error generando PDF:', e);
      alert('Error al generar PDF: ' + (e?.message || 'revisa tu conexión'));
    } finally {
      setDescargandoPDF(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-0 md:p-4 print:bg-white print:static print:p-0">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-5xl w-full h-full md:h-auto md:max-h-[95vh] overflow-auto print:bg-white print:border-0 print:max-h-none print:overflow-visible">
        {/* Header del modal (oculto en impresión) */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between print:hidden">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Reporte de avance</div>
            <div className="text-sm text-zinc-400 mt-0.5">{proyecto.nombre}</div>
          </div>
          <div className="flex gap-2">
            {preview ? (
              <>
                <button onClick={() => setPreview(false)} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2" disabled={descargandoPDF}>Editar</button>
                <button onClick={descargarPDF} disabled={descargandoPDF} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1">
                  {descargandoPDF ? <><Loader2 className="w-3 h-3 animate-spin" /> Generando PDF...</> : <><Download className="w-3 h-3" /> Descargar PDF</>}
                </button>
              </>
            ) : (
              <>
                <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2">Cancelar</button>
                <button onClick={() => setPreview(true)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1"><Eye className="w-3 h-3" /> Ver preview</button>
              </>
            )}
            <button onClick={onCerrar} className="text-zinc-500 ml-2"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Formulario de configuración (oculto en preview e impresión) */}
        {!preview && (
          <div className="p-5 space-y-4 print:hidden">
            <div>
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Tipo de reporte</div>
              <div className="grid grid-cols-4 gap-1">
                {['diario', 'semanal', 'quincenal', 'custom'].map(t => (
                  <button key={t} onClick={() => setTipo(t)} className={`p-2 text-xs font-bold uppercase border-2 ${tipo === t ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Desde"><Input type="date" value={fechaInicio} onChange={setFechaInicio} /></Campo>
              <Campo label="Hasta"><Input type="date" value={fechaFin} onChange={setFechaFin} /></Campo>
            </div>

            <div>
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Próximos pasos (texto libre)</div>
              <textarea
                value={proximosPasos}
                onChange={e => setProximosPasos(e.target.value)}
                placeholder="Qué se hará la próxima semana, qué necesita del cliente, etc."
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
              />
            </div>

            <div>
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Secciones a incluir</div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incluirBitacora} onChange={e => setIncluirBitacora(e.target.checked)} className="w-4 h-4 accent-red-600" />
                  <span className="text-xs">Actividad día por día</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incluirFotos} onChange={e => setIncluirFotos(e.target.checked)} className="w-4 h-4 accent-red-600" />
                  <span className="text-xs">Fotos del periodo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incluirFinanciero} onChange={e => setIncluirFinanciero(e.target.checked)} className="w-4 h-4 accent-red-600" />
                  <span className="text-xs">Información financiera (monto aprobado y resumen)</span>
                </label>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 p-3 text-[11px] text-zinc-500">
              <div className="font-bold text-zinc-400 mb-1">📋 Vista previa del reporte:</div>
              <div>• {diasTrabajados} {diasTrabajados === 1 ? 'día' : 'días'} trabajados · {totalM2Periodo.toFixed(2)} m² ejecutados</div>
              <div>• {areasConAvance.length} áreas del proyecto</div>
              <div>• {reportesPeriodo.length} reportes en el periodo</div>
              <div>• {cargandoFotos ? 'Cargando fotos...' : `${fotosCargadas.length} foto${fotosCargadas.length !== 1 ? 's' : ''} incluida${fotosCargadas.length !== 1 ? 's' : ''} en el PDF`}</div>
            </div>
          </div>
        )}

        {/* Preview del reporte (también la versión imprimible) */}
        {preview && (
          <ReportePDFContenido
            proyecto={proyecto}
            sistema={sistema}
            data={data}
            tipo={tipo}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            proximosPasos={proximosPasos}
            incluirFotos={incluirFotos}
            incluirBitacora={incluirBitacora}
            incluirFinanciero={incluirFinanciero}
            porcentaje={porcentaje}
            produccionRD={produccionRD}
            valorContrato={valorContrato}
            porTarea={porTarea}
            totalM2Periodo={totalM2Periodo}
            bitacora={bitacora}
            areasConAvance={areasConAvance}
            diasTrabajados={diasTrabajados}
            reportesPeriodo={reportesPeriodo}
            fotosCargadas={fotosCargadas}
            cargandoFotos={cargandoFotos}
          />
        )}
      </div>
    </div>
  );
}

function ReportePDFContenido({ proyecto, sistema, data, tipo, fechaInicio, fechaFin, proximosPasos, incluirFotos, incluirBitacora, incluirFinanciero, porcentaje, produccionRD, valorContrato, porTarea, totalM2Periodo, bitacora, areasConAvance, diasTrabajados, reportesPeriodo, fotosCargadas, cargandoFotos }) {
  const supervisor = getPersona(data.personal, proyecto.supervisorId);
  const maestro = getPersona(data.personal, proyecto.maestroId);
  const tipoLabel = { diario: 'Diario', semanal: 'Semanal', quincenal: 'Quincenal', custom: 'Personalizado' }[tipo] || 'Avance';

  return (
    <div id="reporte-pdf" className="bg-white text-zinc-800 print:p-0" style={{ padding: '0' }}>
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #reporte-pdf { box-shadow: none !important; }
          .print-page-break { page-break-after: always; }
        }
      `}</style>
      <div style={{ maxWidth: '720px', margin: '0 auto', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '12px', color: '#27272a' }}>

        {/* Header */}
        <div style={{ padding: '28px 36px 24px', borderBottom: '3px solid #CC0000', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '52px', height: '52px', background: '#CC0000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '20px', transform: 'skewX(-12deg)' }}>
              <span style={{ transform: 'skewX(12deg)', display: 'block' }}>ST</span>
            </div>
            <div>
              <div style={{ color: '#18181b', fontWeight: 700, fontSize: '18px', lineHeight: 1 }}>SUPER TECHOS</div>
              <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginTop: '3px' }}>IMPERMEABILIZACIÓN PROFESIONAL</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>REPORTE {tipoLabel.toUpperCase()}</div>
            <div style={{ color: '#27272a', fontSize: '13px', fontWeight: 500, marginTop: '3px' }}>
              {formatFechaCorta(fechaInicio)} — {formatFechaCorta(fechaFin)}
            </div>
          </div>
        </div>

        {/* Datos del proyecto */}
        <div style={{ padding: '22px 36px', background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
            <div>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '4px' }}>PROYECTO</div>
              <div style={{ color: '#18181b', fontSize: '22px', fontWeight: 600, lineHeight: 1.2 }}>{proyecto.nombre}</div>
              <div style={{ color: '#71717a', fontSize: '11px', marginTop: '4px' }}>
                {proyecto.referenciaOdoo && `ORDEN ${proyecto.referenciaOdoo}`}
                {proyecto.fecha_inicio && ` · Inicio ${formatFechaCorta(proyecto.fecha_inicio)}`}
              </div>
            </div>
            {incluirFinanciero && valorContrato > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>MONTO APROBADO</div>
                <div style={{ color: '#27272a', fontSize: '18px', fontWeight: 600, marginTop: '3px' }}>{formatRD(valorContrato)}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '16px', fontSize: '11px', paddingTop: '14px', borderTop: '1px solid #e4e4e7' }}>
            <div>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '2px' }}>CLIENTE</div>
              <div style={{ color: '#27272a' }}>{proyecto.cliente || '—'}</div>
              {proyecto.contactoClienteNombre && <div style={{ color: '#71717a', fontSize: '10px', marginTop: '2px' }}>Contacto: {proyecto.contactoClienteNombre}</div>}
            </div>
            <div>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '2px' }}>SISTEMA</div>
              <div style={{ color: '#27272a' }}>{sistema.nombre}</div>
            </div>
            <div>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '2px' }}>EQUIPO</div>
              <div style={{ color: '#27272a' }}>{maestro ? `🔨 ${maestro.nombre}` : '—'}</div>
              {supervisor && <div style={{ color: '#71717a', fontSize: '10px' }}>👔 {supervisor.nombre}</div>}
            </div>
          </div>
        </div>

        {/* Resumen de la semana */}
        <div style={{ padding: '22px 36px' }}>
          <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>RESUMEN DEL PERIODO</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div style={{ border: '1px solid #e4e4e7', padding: '14px' }}>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>AVANCE TOTAL</div>
              <div style={{ color: '#18181b', fontSize: '24px', fontWeight: 600, marginTop: '4px', lineHeight: 1 }}>{porcentaje.toFixed(1)}%</div>
            </div>
            <div style={{ border: '1px solid #e4e4e7', padding: '14px' }}>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>DÍAS TRABAJADOS</div>
              <div style={{ color: '#18181b', fontSize: '24px', fontWeight: 600, marginTop: '4px', lineHeight: 1 }}>{diasTrabajados}</div>
            </div>
            <div style={{ border: '1px solid #e4e4e7', padding: '14px' }}>
              <div style={{ color: '#71717a', fontSize: '9px', letterSpacing: '1.5px' }}>REPORTES</div>
              <div style={{ color: '#18181b', fontSize: '24px', fontWeight: 600, marginTop: '4px', lineHeight: 1 }}>{reportesPeriodo.length}</div>
            </div>
          </div>
        </div>

        {/* v8.9.29: Avance por área con desglose de tareas — reemplaza las 2 secciones anteriores */}
        {areasConAvance.length > 0 && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '4px' }}>AVANCE POR ÁREA Y TAREA</div>
            <div style={{ color: '#a1a1aa', fontSize: '9px', marginBottom: '12px', fontStyle: 'italic' }}>
              Cada tarea es una capa sobre la misma superficie. El avance del área combina todas sus tareas ponderadas por peso.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {areasConAvance.map(area => (
                <div key={area.id} style={{ border: '1px solid #e4e4e7', background: '#ffffff' }}>
                  {/* Header del área */}
                  <div style={{ background: '#fafafa', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #e4e4e7' }}>
                    <div>
                      <div style={{ fontSize: '13px', color: '#18181b', fontWeight: 600 }}>{area.nombre}</div>
                      <div style={{ fontSize: '10px', color: '#71717a', marginTop: '2px' }}>
                        {area.m2} m²{area.sistemaNombre && ` · ${area.sistemaNombre}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: area.pct >= 100 ? '#16a34a' : area.pct > 0 ? '#d97706' : '#71717a', lineHeight: 1 }}>
                        {area.pct.toFixed(0)}%
                      </div>
                      <div style={{ fontSize: '9px', color: '#a1a1aa', marginTop: '2px' }}>avance</div>
                    </div>
                  </div>
                  {/* Tareas del área con sus barras */}
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {area.tareas.length === 0 ? (
                      <div style={{ fontSize: '10px', color: '#a1a1aa', fontStyle: 'italic' }}>Sin tareas definidas en el sistema</div>
                    ) : area.tareas.map(t => (
                      <div key={t.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                          <div style={{ fontSize: '11px', color: '#27272a' }}>
                            <span style={{ fontWeight: 500 }}>{t.nombre}</span>
                            {t.peso > 0 && <span style={{ color: '#a1a1aa', marginLeft: '6px', fontSize: '9px' }}>peso {t.peso}%</span>}
                          </div>
                          <div style={{ fontSize: '10px', color: t.pct >= 100 ? '#16a34a' : t.pct > 0 ? '#d97706' : '#71717a', fontWeight: 600 }}>
                            {t.m2Historico.toFixed(0)} / {area.m2} m² <span style={{ color: '#a1a1aa', fontWeight: 500 }}>({t.pct.toFixed(0)}%)</span>
                          </div>
                        </div>
                        <div style={{ height: '6px', background: '#f4f4f5', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${t.pct}%`, background: t.pct >= 100 ? '#16a34a' : '#16a34a', borderRadius: '2px' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* v8.9.28: Actividad por día (reemplazo de Bitácora) */}
        {incluirBitacora && bitacora.length > 0 && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>ACTIVIDAD POR DÍA</div>
            <div style={{ fontSize: '11px', color: '#27272a', lineHeight: 1.6 }}>
              {bitacora.map(([fecha, info]) => {
                const actividades = Object.values(info.actividades || {});
                return (
                  <div key={fecha} style={{ padding: '10px 0', borderBottom: '1px solid #f4f4f5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ color: '#71717a', fontWeight: 600, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>{formatFechaCorta(fecha)}</div>
                      {info.notas.length > 0 && (
                        <div style={{ color: '#a1a1aa', fontSize: '10px', fontStyle: 'italic', maxWidth: '60%', textAlign: 'right' }}>
                          {info.notas.join(' · ')}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '2px' }}>
                      {actividades.map((act, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <div style={{ color: '#27272a' }}>
                            <span style={{ fontWeight: 500 }}>{act.tarea}</span>
                            {act.area && <span style={{ color: '#a1a1aa' }}> · {act.area}</span>}
                          </div>
                          <div style={{ color: '#16a34a', fontWeight: 600 }}>{act.m2.toFixed(0)} m²</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* v8.9.28: Fotos reales del proyecto en el periodo */}
        {incluirFotos && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>
              FOTOS DE LA OBRA {fotosCargadas && fotosCargadas.length > 0 && <span style={{ color: '#a1a1aa' }}>· {fotosCargadas.length}</span>}
            </div>
            {cargandoFotos ? (
              <div style={{ padding: '24px', textAlign: 'center', background: '#fafafa', border: '1px solid #e4e4e7', color: '#a1a1aa', fontSize: '11px' }}>
                Cargando fotos del periodo...
              </div>
            ) : fotosCargadas && fotosCargadas.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {fotosCargadas.map((f, i) => {
                  const fechaStr = (f.fecha || f.created_at || '').slice(0, 10);
                  const fechaMostrar = fechaStr ? formatFechaCorta(fechaStr) : '';
                  return (
                    <div key={f.id || i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ aspectRatio: '1', background: '#f4f4f5', border: '1px solid #e4e4e7', overflow: 'hidden' }}>
                        <img src={f.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                      {fechaMostrar && (
                        <div style={{ fontSize: '9px', color: '#71717a', textAlign: 'center' }}>{fechaMostrar}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', background: '#fafafa', border: '1px solid #e4e4e7', color: '#a1a1aa', fontSize: '11px', fontStyle: 'italic' }}>
                Sin fotos registradas en el periodo seleccionado
              </div>
            )}
          </div>
        )}

        {/* Próximos pasos */}
        {proximosPasos && (
          <div style={{ padding: '0 36px 22px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '12px' }}>PRÓXIMOS PASOS</div>
            <div style={{ borderLeft: '3px solid #CC0000', padding: '12px 18px', background: '#fef2f2', fontSize: '12px', color: '#27272a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {proximosPasos}
            </div>
          </div>
        )}

        {/* Resumen financiero */}
        {incluirFinanciero && valorContrato > 0 && (
          <div style={{ padding: '0 36px 24px' }}>
            <div style={{ color: '#71717a', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '10px' }}>RESUMEN FINANCIERO</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#fafafa', padding: '14px', border: '1px solid #e4e4e7' }}>
                <div style={{ color: '#71717a', fontSize: '10px' }}>Avance monetario ejecutado</div>
                <div style={{ color: '#16a34a', fontSize: '18px', fontWeight: 600, marginTop: '4px' }}>{formatRD(produccionRD)}</div>
              </div>
              <div style={{ background: '#fafafa', padding: '14px', border: '1px solid #e4e4e7' }}>
                <div style={{ color: '#71717a', fontSize: '10px' }}>Pendiente por ejecutar</div>
                <div style={{ color: '#27272a', fontSize: '18px', fontWeight: 600, marginTop: '4px' }}>{formatRD(valorContrato - produccionRD)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 36px', background: '#18181b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#a1a1aa', fontSize: '9px', letterSpacing: '1px' }}>
          <div>SUPER TECHOS SRL · RNC 130-77433-1 · C/ ARENA #1 MAR AZUL · SANTO DOMINGO · 809-535-9293</div>
          <div>{formatFechaCorta(new Date().toISOString().split('T')[0])}</div>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// MODAL PROGRAMAR JORNADA (v8.5) - Admin puede agregar jornadas pasadas o futuras
// ============================================================
