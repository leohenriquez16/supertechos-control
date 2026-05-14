'use client';

// v8.17.41 — Carta de acceso del personal al cliente.
// El admin abre este modal desde el proyecto, elige el personal a incluir y
// los datos del email, y la app:
//   - Genera un PDF Letter (8.5x11) con la carta formal.
//   - Permite descargar el PDF o enviarlo por correo al contacto del cliente.
//
// Requiere que el proyecto tenga:
//   - empresaEjecutora (Super Techos / Prouco) → para el remitente.
//   - cliente / clienteNombre → para el destinatario.
//   - personal asignado (supervisor, maestro, ayudantes).

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, FileText, Mail, Loader2, Download, AlertTriangle, Check, Pencil } from 'lucide-react';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';
import Campo from '../common/Campo';
import Input from '../common/Input';

// Carga las librerías PDF on-demand (igual que ModalReporteAvancePDF)
const cargarScriptCDN = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
  document.head.appendChild(s);
});

// Datos extra de las empresas (dirección, teléfono) — fácil de editar acá.
// Si necesitan ir a un panel admin, los movemos a la tabla config.
const EMPRESA_DATOS = {
  super_techos: {
    razonSocial: 'LH SUPER TECHOS, SRL',
    rnc: '130774331',
    direccion: 'Santo Domingo, República Dominicana',
    telefono: '',
    email: '',
  },
  prouco: {
    razonSocial: 'PROUCO GROUP DOMINICANA, SRL',
    rnc: '131515541',
    direccion: 'Santo Domingo, República Dominicana',
    telefono: '',
    email: '',
  },
};

const formatearFechaLarga = (iso) => {
  const d = iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')) : new Date();
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function ModalCartaAcceso({ proyecto, data, usuario, onCerrar }) {
  // ---- Recipientes y candidatos ----
  const contactosCliente = useMemo(
    () => (data.contactos || []).filter(c => c.clienteId === proyecto.clienteId),
    [data.contactos, proyecto.clienteId]
  );
  const cliente = useMemo(
    () => (data.clientes || []).find(c => c.id === proyecto.clienteId),
    [data.clientes, proyecto.clienteId]
  );
  const contactoPrincipal = useMemo(() => {
    if (proyecto.contactoPrincipalId) {
      const c = contactosCliente.find(c => c.id === proyecto.contactoPrincipalId);
      if (c) return c;
    }
    return contactosCliente.find(c => c.esPrincipal) || contactosCliente[0] || null;
  }, [contactosCliente, proyecto.contactoPrincipalId]);

  // Lista de personas asignadas al proyecto (sup + maestro + ayudantes)
  const personasAsignadas = useMemo(() => {
    const ids = [];
    if (proyecto.supervisorId) ids.push({ id: proyecto.supervisorId, rolEnProyecto: 'Supervisor' });
    if (proyecto.maestroId) ids.push({ id: proyecto.maestroId, rolEnProyecto: 'Maestro' });
    (proyecto.ayudantesIds || []).forEach(id => ids.push({ id, rolEnProyecto: 'Ayudante' }));
    return ids
      .map(({ id, rolEnProyecto }) => {
        const p = (data.personal || []).find(per => per.id === id);
        if (!p) return null;
        return { id, persona: p, rolEnProyecto };
      })
      .filter(Boolean);
  }, [proyecto, data.personal]);

  // ---- Estado del formulario ----
  const empresaKey = proyecto.empresaEjecutora || 'super_techos';
  const empresaMeta = EMPRESAS_RECEPTORAS[empresaKey];
  const empresaDatos = EMPRESA_DATOS[empresaKey];

  // Firmante: default = usuario logueado. Persiste el último en localStorage.
  const [firmanteNombre, setFirmanteNombre] = useState('');
  const [firmanteCargo, setFirmanteCargo] = useState('');
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('carta_firmante') || 'null');
      setFirmanteNombre(saved?.nombre || usuario?.nombre || '');
      setFirmanteCargo(saved?.cargo || '');
    } catch {
      setFirmanteNombre(usuario?.nombre || '');
    }
  }, [usuario]);

  // Personas marcadas — default: todas
  const [seleccionadas, setSeleccionadas] = useState(
    () => new Set(personasAsignadas.map(p => p.id))
  );
  const toggle = (id) => {
    setSeleccionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const personasIncluidas = personasAsignadas.filter(p => seleccionadas.has(p.id));

  // Email: destinatarios + asunto + cuerpo
  const [emails, setEmails] = useState('');
  useEffect(() => {
    setEmails(contactoPrincipal?.email || proyecto.contactoClienteEmail || '');
  }, [contactoPrincipal?.email, proyecto.contactoClienteEmail]);
  const [emailsExtra, setEmailsExtra] = useState('');
  const [asuntoEmail, setAsuntoEmail] = useState('');
  useEffect(() => {
    const ref = proyecto.referenciaProyecto || proyecto.nombre || '';
    setAsuntoEmail(`Carta de acceso de personal — ${ref}`.trim());
  }, [proyecto.referenciaProyecto, proyecto.nombre]);
  const [mensajeEmail, setMensajeEmail] = useState('');
  useEffect(() => {
    setMensajeEmail(
      `Buenos días${contactoPrincipal?.nombre ? ', ' + contactoPrincipal.nombre.split(' ')[0] : ''},\n\n` +
      `Adjunto encuentra la carta con el personal autorizado para acceder a la obra ` +
      `${proyecto.referenciaProyecto ? '"' + proyecto.referenciaProyecto + '"' : ''} ` +
      `por parte de ${empresaDatos?.razonSocial || ''}. ` +
      `Le agradeceríamos confirmar recibo y nos informe si necesitan documentación adicional.\n\n` +
      `Saludos,\n${firmanteNombre || ''}`
    );
  }, [contactoPrincipal?.nombre, proyecto.referenciaProyecto, empresaDatos?.razonSocial, firmanteNombre]);

  // Fecha de la carta
  const [fechaCarta, setFechaCarta] = useState(() => new Date().toISOString().split('T')[0]);

  // Vigencia opcional (algunos clientes piden fecha hasta cuando es válida la autorización)
  const [vigenciaHasta, setVigenciaHasta] = useState('');

  // ---- Estados de procesamiento ----
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [mensajeOk, setMensajeOk] = useState('');
  const [mensajeError, setMensajeError] = useState('');

  // Ref al elemento que se va a capturar como PDF
  const cartaRef = useRef(null);

  // ---- Helpers persistencia ----
  const guardarFirmanteLocal = () => {
    try {
      window.localStorage.setItem('carta_firmante', JSON.stringify({ nombre: firmanteNombre, cargo: firmanteCargo }));
    } catch {}
  };

  // ---- Generación de PDF ----
  // Captura cartaRef con html2canvas y compone un PDF Letter con jsPDF.
  // Devuelve el blob + base64.
  const generarPDF = async () => {
    setMensajeError('');
    setMensajeOk('');
    if (!proyecto.empresaEjecutora) {
      setMensajeError('El proyecto no tiene empresa ejecutora asignada. Edita el proyecto y eligela primero.');
      return null;
    }
    if (personasIncluidas.length === 0) {
      setMensajeError('Selecciona al menos una persona para incluir en la carta.');
      return null;
    }

    setGenerandoPDF(true);
    try {
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = window.html2canvas;
      const { jsPDF } = window.jspdf;
      if (!html2canvas || !jsPDF) throw new Error('Librerías PDF no disponibles');

      const el = cartaRef.current;
      if (!el) throw new Error('Vista previa no encontrada');

      // Forzar ancho Letter en pixels para captura uniforme
      const ANCHO_LETTER_PX = 816; // 8.5" * 96dpi
      const widthOrig = el.style.width;
      const maxWidthOrig = el.style.maxWidth;
      el.style.width = ANCHO_LETTER_PX + 'px';
      el.style.maxWidth = ANCHO_LETTER_PX + 'px';

      await new Promise(r => setTimeout(r, 50));

      let canvas;
      try {
        canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: ANCHO_LETTER_PX,
          windowWidth: ANCHO_LETTER_PX,
          windowHeight: el.scrollHeight,
        });
      } finally {
        el.style.width = widthOrig;
        el.style.maxWidth = maxWidthOrig;
      }

      // Letter
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW = 215.9, pageH = 279.4;
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (imgH <= pageH) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH);
      } else {
        // Multi-página
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

      // Retornar tanto el blob como el base64 (para descargar o enviar)
      const dataUri = pdf.output('datauristring');
      const base64 = dataUri.split(',')[1];
      const blob = pdf.output('blob');
      return { blob, base64, pdf };
    } catch (e) {
      setMensajeError('Error generando PDF: ' + (e.message || e));
      return null;
    } finally {
      setGenerandoPDF(false);
    }
  };

  // Descargar PDF
  const descargar = async () => {
    const result = await generarPDF();
    if (!result) return;
    const nombre = `carta-acceso-${(proyecto.referenciaProyecto || proyecto.nombre || 'proyecto').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    result.pdf.save(nombre);
    guardarFirmanteLocal();
    setMensajeOk('PDF descargado.');
  };

  // Enviar por email
  const enviarEmail = async () => {
    setMensajeError('');
    setMensajeOk('');
    const destinatariosRaw = [emails, emailsExtra].join(',').split(/[,;\s]+/).filter(Boolean);
    if (destinatariosRaw.length === 0) {
      setMensajeError('Sin destinatarios para el email.');
      return;
    }

    const result = await generarPDF();
    if (!result) return;

    setEnviandoEmail(true);
    try {
      const mensaje_html = mensajeEmail
        .split('\n')
        .map(linea => `<p style="margin:0 0 8px;">${linea.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '&nbsp;'}</p>`)
        .join('');

      const filename = `carta-acceso-${(proyecto.referenciaProyecto || proyecto.nombre || 'proyecto').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;

      const resp = await fetch('/api/email/carta-acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinatarios: destinatariosRaw,
          cc: usuario?.email ? [usuario.email] : [],
          asunto: asuntoEmail || `Carta de acceso — ${proyecto.referenciaProyecto || ''}`,
          mensaje_html,
          pdf_base64: result.base64,
          pdf_filename: filename,
          proyecto_ref: proyecto.referenciaOdoo || proyecto.referenciaProyecto || null,
        }),
      });
      const respData = await resp.json();
      if (!resp.ok || !respData.ok) {
        setMensajeError('Error enviando email: ' + (respData?.error || `HTTP ${resp.status}`));
      } else {
        guardarFirmanteLocal();
        setMensajeOk(`Email enviado a ${destinatariosRaw.join(', ')}.`);
      }
    } catch (e) {
      setMensajeError('Error enviando email: ' + (e.message || e));
    } finally {
      setEnviandoEmail(false);
    }
  };

  // Bloqueo si el proyecto no tiene los datos mínimos
  const faltaEmpresa = !proyecto.empresaEjecutora;
  const faltaCliente = !(proyecto.cliente || cliente?.nombre);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-7xl w-full my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-400" />
            <div>
              <div className="text-xs tracking-widest uppercase text-red-400 font-bold">Carta de acceso de personal</div>
              <div className="text-[10px] text-zinc-500">{proyecto.cliente || cliente?.nombre || 'Sin cliente'} · {proyecto.referenciaProyecto || proyecto.nombre || proyecto.referenciaOdoo}</div>
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Body en dos columnas: configuración a la izquierda, preview a la derecha */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 p-4 overflow-y-auto flex-1">
          {/* ============ FORM ============ */}
          <div className="space-y-4 lg:max-h-[70vh] lg:overflow-y-auto pr-2">
            {/* Avisos de configuración faltante */}
            {(faltaEmpresa || faltaCliente) && (
              <div className="bg-amber-900/20 border border-amber-700 p-3 text-xs text-amber-200 space-y-1">
                <div className="flex items-center gap-1 font-bold"><AlertTriangle className="w-3 h-3" /> Falta configuración del proyecto</div>
                {faltaEmpresa && <div>• Asigna la <b>empresa ejecutora</b> (Super Techos o Prouco) en editar proyecto.</div>}
                {faltaCliente && <div>• Asigna el <b>cliente</b> en editar proyecto.</div>}
              </div>
            )}

            {/* Empresa ejecutora — solo lectura aquí */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Empresa que firma</div>
              {empresaMeta ? (
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 text-white ${empresaMeta.color} border ${empresaMeta.borderColor}`}>
                  <span className="text-xs font-bold">{empresaDatos?.razonSocial}</span>
                  <span className="text-[10px] opacity-80">RNC {empresaDatos?.rnc}</span>
                </div>
              ) : (
                <div className="text-xs text-zinc-500 italic">— Sin asignar —</div>
              )}
            </div>

            {/* Fecha + vigencia */}
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Fecha de la carta">
                <Input type="date" value={fechaCarta} onChange={v => setFechaCarta(v)} />
              </Campo>
              <Campo label="Vigencia hasta (opcional)">
                <Input type="date" value={vigenciaHasta} onChange={v => setVigenciaHasta(v)} />
              </Campo>
            </div>

            {/* Personal a incluir */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Personal a incluir ({personasIncluidas.length}/{personasAsignadas.length})</div>
              {personasAsignadas.length === 0 ? (
                <div className="text-xs text-zinc-500 italic">No hay personal asignado al proyecto.</div>
              ) : (
                <div className="space-y-1">
                  {personasAsignadas.map(({ id, persona, rolEnProyecto }) => {
                    const tieneCedula = !!persona.cedulaNumero;
                    return (
                      <label key={id} className={`flex items-center gap-2 p-2 cursor-pointer border ${seleccionadas.has(id) ? 'bg-red-900/20 border-red-700/50' : 'bg-zinc-950 border-zinc-800'}`}>
                        <input
                          type="checkbox"
                          checked={seleccionadas.has(id)}
                          onChange={() => toggle(id)}
                          className="w-4 h-4 accent-red-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{persona.nombre}</div>
                          <div className="text-[10px] text-zinc-500">
                            {rolEnProyecto} · {tieneCedula ? `Céd ${persona.cedulaNumero}` : <span className="text-amber-400">⚠ sin cédula</span>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {personasIncluidas.some(p => !p.persona.cedulaNumero) && (
                <div className="text-[10px] text-amber-400 mt-1 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5" /> Algunas personas seleccionadas no tienen cédula registrada — saldrán con "—" en la carta. Considera completarla en su perfil.
                </div>
              )}
            </div>

            {/* Firmante */}
            <div className="space-y-2 border-t border-zinc-800 pt-3">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1">
                <Pencil className="w-3 h-3" /> Firmante
              </div>
              <Campo label="Nombre">
                <Input value={firmanteNombre} onChange={v => setFirmanteNombre(v)} placeholder="Nombre del firmante" />
              </Campo>
              <Campo label="Cargo">
                <Input value={firmanteCargo} onChange={v => setFirmanteCargo(v)} placeholder="Ej: Gerente de Operaciones" />
              </Campo>
            </div>

            {/* Email */}
            <div className="space-y-2 border-t border-zinc-800 pt-3">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1">
                <Mail className="w-3 h-3" /> Enviar por email
              </div>
              <Campo label="Para (contacto principal del cliente)">
                <Input value={emails} onChange={v => setEmails(v)} placeholder="email@cliente.com" />
              </Campo>
              <Campo label="CC adicional (opcional, separar por coma)">
                <Input value={emailsExtra} onChange={v => setEmailsExtra(v)} placeholder="otro@cliente.com" />
              </Campo>
              <Campo label="Asunto">
                <Input value={asuntoEmail} onChange={v => setAsuntoEmail(v)} />
              </Campo>
              <Campo label="Mensaje (cuerpo del email)">
                <textarea
                  value={mensajeEmail}
                  onChange={e => setMensajeEmail(e.target.value)}
                  rows={5}
                  className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
                />
              </Campo>
            </div>

            {/* Botones de acción */}
            <div className="space-y-2 border-t border-zinc-800 pt-3 sticky bottom-0 bg-zinc-900 pb-2 -mb-2">
              <button
                onClick={descargar}
                disabled={generandoPDF || faltaEmpresa || personasIncluidas.length === 0}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:opacity-50 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-2"
              >
                {generandoPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Descargar PDF
              </button>
              <button
                onClick={enviarEmail}
                disabled={generandoPDF || enviandoEmail || faltaEmpresa || personasIncluidas.length === 0 || (!emails && !emailsExtra)}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-900 disabled:opacity-50 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-2"
              >
                {enviandoEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                Enviar por email
              </button>
              {mensajeOk && (
                <div className="text-[11px] text-green-400 bg-green-900/20 border border-green-700 p-2 flex items-start gap-1">
                  <Check className="w-3 h-3 mt-0.5" /> {mensajeOk}
                </div>
              )}
              {mensajeError && (
                <div className="text-[11px] text-red-300 bg-red-900/20 border border-red-700 p-2">
                  {mensajeError}
                </div>
              )}
            </div>
          </div>

          {/* ============ PREVIEW ============ */}
          <div className="lg:max-h-[70vh] lg:overflow-y-auto bg-zinc-950 p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Vista previa</div>
            <div className="bg-white text-black p-10 mx-auto" style={{ maxWidth: 816 }} ref={cartaRef}>
              <CartaTemplate
                empresa={empresaDatos}
                clienteNombre={proyecto.cliente || cliente?.nombre}
                clienteRNC={cliente?.rnc}
                contacto={contactoPrincipal}
                contactoCustomNombre={proyecto.contactoClienteNombre}
                proyectoRef={proyecto.referenciaProyecto || proyecto.nombre || proyecto.referenciaOdoo}
                proyectoDireccion={proyecto.ubicacionDireccionTexto || proyecto.ubicacionDireccion}
                fecha={fechaCarta}
                vigenciaHasta={vigenciaHasta}
                personas={personasIncluidas}
                firmanteNombre={firmanteNombre}
                firmanteCargo={firmanteCargo}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Plantilla de la carta (HTML que se captura como PDF)
// ============================================================
function CartaTemplate({
  empresa, clienteNombre, clienteRNC, contacto, contactoCustomNombre,
  proyectoRef, proyectoDireccion, fecha, vigenciaHasta,
  personas, firmanteNombre, firmanteCargo,
}) {
  // Nombre del contacto: prioriza el contacto principal, luego el "contactoClienteNombre" del proyecto
  const nombreContacto = contacto?.nombre || contactoCustomNombre || '';
  const cargoContacto = contacto?.cargo || '';

  return (
    <div style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: 12, lineHeight: 1.5, color: '#111' }}>
      {/* Encabezado de la empresa */}
      <div style={{ borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 }}>{empresa?.razonSocial || ''}</div>
        <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>RNC {empresa?.rnc || ''}{empresa?.direccion ? ' · ' + empresa.direccion : ''}</div>
        {empresa?.telefono || empresa?.email ? (
          <div style={{ fontSize: 11, color: '#444' }}>
            {empresa?.telefono ? `Tel. ${empresa.telefono}` : ''}{empresa?.telefono && empresa?.email ? ' · ' : ''}{empresa?.email || ''}
          </div>
        ) : null}
      </div>

      {/* Fecha + destinatario */}
      <div style={{ marginBottom: 24, textAlign: 'right' }}>
        Santo Domingo, {formatearFechaLarga(fecha)}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div><strong>Señores</strong></div>
        <div style={{ fontWeight: 'bold' }}>{(clienteNombre || '').toUpperCase()}</div>
        {clienteRNC && <div style={{ fontSize: 11, color: '#444' }}>RNC {clienteRNC}</div>}
        {nombreContacto && (
          <div style={{ marginTop: 4 }}>
            <strong>Atención:</strong> {nombreContacto}{cargoContacto ? ` — ${cargoContacto}` : ''}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: '#444' }}>
          <strong>Ref.</strong> Proyecto {proyectoRef}{proyectoDireccion ? ` · ${proyectoDireccion}` : ''}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>Estimados señores,</div>

      <div style={{ marginBottom: 16, textAlign: 'justify' }}>
        Por medio de la presente, le solicitamos autorización para que el siguiente personal de
        nuestra empresa, <strong>{empresa?.razonSocial}</strong>, pueda acceder a las
        instalaciones del proyecto <strong>{proyectoRef || ''}</strong> a fin de realizar los
        trabajos contratados.
      </div>

      {/* Tabla del personal */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'left', width: 32 }}>#</th>
            <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'left' }}>Nombre completo</th>
            <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'left', width: 140 }}>Cédula</th>
            <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'left', width: 120 }}>Rol</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p, i) => (
            <tr key={p.id}>
              <td style={{ border: '1px solid #999', padding: '6px 8px' }}>{i + 1}</td>
              <td style={{ border: '1px solid #999', padding: '6px 8px' }}>{p.persona.nombre}</td>
              <td style={{ border: '1px solid #999', padding: '6px 8px' }}>{p.persona.cedulaNumero || '—'}</td>
              <td style={{ border: '1px solid #999', padding: '6px 8px' }}>{p.rolEnProyecto}</td>
            </tr>
          ))}
          {personas.length === 0 && (
            <tr><td colSpan={4} style={{ border: '1px solid #999', padding: 8, textAlign: 'center', color: '#888', fontStyle: 'italic' }}>Sin personal seleccionado</td></tr>
          )}
        </tbody>
      </table>

      {vigenciaHasta && (
        <div style={{ marginBottom: 16, fontSize: 11, color: '#444' }}>
          <strong>Vigencia de esta autorización:</strong> hasta el {formatearFechaLarga(vigenciaHasta)}.
        </div>
      )}

      <div style={{ marginBottom: 16, textAlign: 'justify' }}>
        Agradecemos su colaboración y quedamos atentos a cualquier información adicional que requieran.
        Sin otro particular,
      </div>

      <div style={{ marginTop: 32, marginBottom: 4 }}>Atentamente,</div>

      {/* Espacio para firma */}
      <div style={{ marginTop: 48, marginBottom: 4, borderBottom: '1px solid #111', width: 240 }} />
      <div style={{ fontWeight: 'bold' }}>{firmanteNombre || ' '}</div>
      {firmanteCargo && <div style={{ fontSize: 11, color: '#444' }}>{firmanteCargo}</div>}
      <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
        {empresa?.razonSocial} · RNC {empresa?.rnc}
      </div>
    </div>
  );
}
