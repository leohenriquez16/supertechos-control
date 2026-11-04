'use client';

// v8.59.2 — FICHA DE UNA SUCURSAL del programa (lado ERP).
// Todo de una locación en un solo lugar: en qué etapa está y desde cuándo, la línea de
// tiempo con la fecha de entrada a cada etapa, la coordinación de la visita, el supervisor
// del cliente y los documentos (OC, cotización, autorización, informe, garantía).
// Los documentos se pueden marcar visibles u ocultos para el cliente en el portal.
//
// v8.75.0 — el LEVANTAMIENTO de la sucursal, dentro de la ficha: código, etapa, cita,
// quién lo levanta y lo que dejó medido (áreas, m², fotos), con el botón para abrirlo en
// Levantamientos. Antes la ficha escondía todo el bloque justo cuando el levantamiento se
// hacía, y el portal del cliente enseñaba más que el ERP (ticket de Miguel, 3-nov-2026).

import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, Upload, Eye, EyeOff, Trash2, FileText, ExternalLink, CalendarDays, Send, PenLine, CheckCircle2, AlertTriangle, XCircle, Ruler, Camera, MapPin } from 'lucide-react';
import FirmaPad from '../common/FirmaPad';
import { EXTRAER_OC_PROMPT, parsearRespuestaIA, validarOC } from '../../lib/helpers/validarOC';
import { buscarRecuadroProveedor, estamparFirmaYSello, blancoATransparente } from '../../lib/helpers/estamparOC';
import * as db from '../../lib/db';
import { formatRD } from '../../lib/helpers/formato';
import { ETAPAS, ETAPA, COLOR_ETAPA, TIPOS_DOCUMENTO, turnoDe, textoCoordinacion } from '../../lib/helpers/programaSites';
import { citaTextoHora } from '../../lib/surveys';

const fmtF = (f) => { if (!f) return ''; try { return new Date(String(f).length === 10 ? f + 'T12:00:00' : f).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const etiquetaTipo = Object.fromEntries(TIPOS_DOCUMENTO.map(t => [t.id, t.label]));

export default function FichaLocacion({ locacion: l, usuario, onCerrar, onCambio, onAbrirProyecto, onAbrirLevantamiento, onAgendarLevantamiento }) {
  const [docs, setDocs] = useState(null);
  const [tipo, setTipo] = useState('oc');
  const [visible, setVisible] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [fecha, setFecha] = useState(l.fechaVisita ? String(l.fechaVisita).slice(0, 10) : '');
  const [hora, setHora] = useState(l.horaVisita || '');
  const [guardando, setGuardando] = useState(false);
  // v8.59.3: OC del cliente → leer, validar, firmar y sellar, enviar
  const [oc, setOc] = useState(null);           // { fase, validacion, original, firmada, url, error }
  const [registrarFirma, setRegistrarFirma] = useState(false);
  const padRef = useRef(null);
  const [enviando, setEnviando] = useState(null);
  // v8.75.0: lo que dejó el levantamiento (undefined = cargando, null = sin visita cargada)
  const [detalleLev, setDetalleLev] = useState(undefined);
  const [errorLev, setErrorLev] = useState(null);
  const [creandoLev, setCreandoLev] = useState(false);

  const cargarDocs = async () => {
    try { setDocs(await db.listarDocumentosLocacion(l.id)); } catch (e) { console.warn(e); setDocs([]); }
  };
  useEffect(() => { cargarDocs(); /* eslint-disable-next-line */ }, [l.id]);

  useEffect(() => {
    if (!l.levantamientoId) { setDetalleLev(null); return; }
    let cancelado = false;
    setDetalleLev(undefined); setErrorLev(null);
    db.detalleLevantamientoLocacion(l.levantamientoId)
      .then(d => { if (!cancelado) setDetalleLev(d); })
      .catch(e => { if (!cancelado) { console.warn('detalleLevantamientoLocacion:', e?.message); setErrorLev(e?.message || 'No se pudo leer'); setDetalleLev(null); } });
    return () => { cancelado = true; };
  }, [l.levantamientoId]);

  const lev = l.levantamiento || null;
  // Solo con la visita ya coordinada: crear el levantamiento le da luz verde a la locación
  // al releer el programa (amarrarLocaciones), y el cliente la vería "coordinada" sin fecha.
  // Así la ficha guía los dos pasos: poner la fecha arriba y crearlo con esa cita.
  const puedeCrearLev = !l.levantamientoId && l.luzVerde && l.etapa === 'por_levantar' && !!onAgendarLevantamiento;
  const horaCita = lev ? citaTextoHora({ tipo_cita: lev.tipoCita, hora_visita: lev.horaVisita, cita_restriccion: lev.citaRestriccion }) : '';
  // Levantamiento ya hecho: con fecha en el programa, o por su etapa en Levantamientos
  // (hay levantamientos en "Cotización realizada" sin fecha de realizado).
  const levHecho = !!l.levantadoAt || ['Realizado', 'Cotizacion en Revision', 'Cotizacion Realizada'].includes(lev?.etapaLevantamiento);
  // La cita del levantamiento la maneja Levantamientos (tipo, hora, confirmación). Si el
  // programa quedó coordinado para otro día, se avisa; no se pisa la cita desde aquí.
  const fechaDistinta = !levHecho && lev?.fechaVisita && l.fechaVisita && String(lev.fechaVisita).slice(0, 10) !== String(l.fechaVisita).slice(0, 10);
  const crearLevantamiento = async () => {
    setCreandoLev(true);
    try { await onAgendarLevantamiento(l); } finally { setCreandoLev(false); }
  };

  const idx = ETAPAS.findIndex(e => e.id === l.etapa);
  const color = COLOR_ETAPA[l.etapa];

  const subir = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    try { await db.subirDocumentoLocacion({ locacion: l, tipo, file, usuario, visibleCliente: visible }); await cargarDocs(); }
    catch (err) { alert('No se pudo subir: ' + (err.message || err)); }
    setSubiendo(false);
  };

  const archivoABase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });

  const procesarOC = async (file) => {
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { setOc({ fase: 'error', error: 'La OC tiene que ser un PDF.' }); return; }
    setOc({ fase: 'leyendo' });
    try {
      const resp = await fetch('/api/extract-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: await archivoABase64(file), prompt: EXTRAER_OC_PROMPT }) });
      const datos = parsearRespuestaIA(await resp.text());
      if (!datos) throw new Error('No se pudo leer la OC. Intenta de nuevo.');
      const usadas = await db.numerosOCPrograma(l.programaId, l.id);
      // v8.72.2: la OC puede traer techo + pintura: se cuadra contra todas las cotizaciones del sitio.
      let cotizacionesSitio = [];
      try { cotizacionesSitio = await db.cotizacionesDelSitio(l); } catch (e) { console.warn('cotizacionesDelSitio:', e?.message); }
      const validacion = validarOC(datos, { ...l, cotizacionesSitio }, { yaUsadas: usadas, sinFirma: true });
      if (!validacion.ok) { setOc({ fase: 'rechazada', validacion }); return; }
      const firma = await db.obtenerFirmaPersona(usuario?.id);
      if (!firma) { setOc({ fase: 'sin_firma', validacion, original: file }); setRegistrarFirma(true); return; }
      await firmarYMostrar(file, validacion, firma);
    } catch (e) { setOc({ fase: 'error', error: e.message || String(e) }); }
  };

  const firmarYMostrar = async (file, validacion, firma) => {
    setOc({ fase: 'firmando', validacion });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const recuadro = await buscarRecuadroProveedor(bytes);
    if (!recuadro) { setOc({ fase: 'error', error: 'No encontré el recuadro "RECIBO PEDIDO · PROVEEDOR" en la OC. Fírmala a mano y súbela como documento.' }); return; }
    const sello = new Uint8Array(await (await fetch('/sello-super-techos.png')).arrayBuffer());
    const firmada = await estamparFirmaYSello({ pdfBytes: bytes, firmaPng: firma, selloPng: sello, recuadro });
    setOc({ fase: 'lista', validacion, original: file, firmada, url: URL.createObjectURL(new Blob([firmada], { type: 'application/pdf' })) });
  };

  const guardarFirma = async () => {
    const canvas = padRef.current?.querySelector('canvas');
    if (!canvas) return;
    const limpio = blancoATransparente(canvas);
    const blob = await new Promise(r => limpio.toBlob(r, 'image/png'));
    try {
      await db.guardarFirmaPersona(usuario.id, blob);
      setRegistrarFirma(false);
      if (oc?.fase === 'sin_firma' && oc.original) {
        await firmarYMostrar(oc.original, oc.validacion, new Uint8Array(await blob.arrayBuffer()));
      }
    } catch (e) { alert('No se pudo guardar la firma: ' + (e.message || e)); }
  };

  const enviarOC = async (docId) => {
    setEnviando(docId);
    try {
      const r = await fetch('/api/programa/enviar-oc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docId, quien: usuario?.nombre }) });
      const j = await r.json();
      if (!j.ok) alert(j.error || 'No se pudo enviar.');
      else { alert(`OC enviada a ${j.enviadoA.join(', ')}.`); await cargarDocs(); }
    } catch { alert('Sin conexión. Intenta de nuevo.'); }
    setEnviando(null);
  };

  const guardarOC = async (enviar) => {
    setOc({ ...oc, fase: 'guardando' });
    try {
      const docId = await db.guardarOCPrograma({ locacion: l, original: oc.original, firmadaBytes: oc.firmada, numeroOc: oc.validacion.numeroOc, validacion: oc.validacion, usuario });
      await cargarDocs();
      if (enviar) await enviarOC(docId);
      setOc(null);
    } catch (e) { setOc({ ...oc, fase: 'lista', error: 'No se pudo guardar: ' + (e.message || e) }); }
  };

  const guardarCoordinacion = async () => {
    if (!fecha) { alert('Pon el día coordinado con el propietario.'); return; }
    setGuardando(true);
    try {
      await db.actualizarLocacionPrograma(l.id, {
        luzVerde: true, luzVerdeAt: l.luzVerdeAt || new Date().toISOString(),
        luzVerdePor: `${usuario?.nombre || 'ERP'} (ERP)`, fechaVisita: fecha, horaVisita: hora || null,
      });
      await onCambio?.();
    } catch (err) { alert('Error: ' + (err.message || err)); }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-3 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
        {/* Cabecera */}
        <div className="flex items-start gap-3 p-4 border-b border-zinc-800" style={{ borderTop: `4px solid ${color}` }}>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-black leading-tight">{l.nombre}</div>
            <div className="text-[11px] text-zinc-500">{l.codigoUt}{l.direccion ? ` · ${l.direccion}` : ''}</div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: `${color}26`, color }}>{ETAPA[l.etapa]?.label}</span>
              {l.etapaDesde && (
                <span className="text-[11px] text-zinc-300">
                  desde el <b>{fmtF(l.etapaDesde)}</b>{l.diasEnEtapa != null ? ` · ${l.diasEnEtapa} día${l.diasEnEtapa === 1 ? '' : 's'}` : ''}
                </span>
              )}
              <span className={`text-[10px] font-bold uppercase ${ETAPA[l.etapa]?.deQuien === 'cliente' ? 'text-amber-400' : 'text-sky-400'}`}>{turnoDe(l.etapa)}</span>
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 grid gap-4 md:grid-cols-2">
          {/* Línea de tiempo con fechas */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
            <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-2">Etapas</div>
            {ETAPAS.map((e, i) => {
              const hecho = i < idx, actual = i === idx;
              const f = l.fechasEtapas?.[e.id];
              return (
                <div key={e.id} className={`flex items-center gap-2 py-1 text-[12px] ${i > idx ? 'text-zinc-600' : 'text-zinc-200'} ${actual ? 'font-black' : ''}`}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: hecho || actual ? COLOR_ETAPA[e.id] : 'transparent', border: `2px solid ${hecho || actual ? COLOR_ETAPA[e.id] : '#3f3f46'}` }} />
                  <span className="flex-1">{e.label}</span>
                  <span className="text-[11px] text-zinc-500">{i <= idx && f ? fmtF(f) : ''}</span>
                </div>
              );
            })}
          </div>

          {/* Datos y coordinación */}
          <div className="space-y-3">
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-1.5 text-[12px]">
              <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-1">Datos</div>
              <div><span className="text-zinc-500">Cotización:</span> {l.cotizacionRef ? `${l.cotizacionRef}${l.cotizacionMonto ? ` · ${formatRD(l.cotizacionMonto)}` : ''}${l.cotizacionAprobada ? ' · aprobada' : ' · por aprobar'}` : 'pendiente'}</div>
              <div><span className="text-zinc-500">Aprobación del personal:</span> {l.personalAprobadoAt ? <span className="text-green-400">aprobado el {new Date(l.personalAprobadoAt).toLocaleDateString('es-DO')}{l.personalAprobadoPor ? ` · ${l.personalAprobadoPor}` : ''}</span> : <span className="text-red-400">pendiente del cliente</span>}</div>
              <div><span className="text-zinc-500">Supervisor del cliente:</span> {l.supervisorClienteNombre ? `${l.supervisorClienteNombre}${l.supervisorClienteTelefono ? ` · ${l.supervisorClienteTelefono}` : ''}` : 'sin asignar'}</div>
              <div><span className="text-zinc-500">Tipo de trabajo:</span> {l.tipoTrabajo === 'pintura' ? 'Pintura' : l.tipoTrabajo === 'ambos' ? 'Techo y pintura' : 'Impermeabilización'}</div>
              <div className="flex gap-3 flex-wrap pt-1">
                {l.lat && l.lng && <a href={`https://www.google.com/maps?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer" className="underline text-zinc-400 hover:text-white inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Mapa</a>}
                {l.levantamientoId && onAbrirLevantamiento && <button onClick={() => onAbrirLevantamiento(l.levantamientoId)} className="underline text-zinc-400 hover:text-white">Ver el levantamiento</button>}
                {l.proyectoId && onAbrirProyecto && <button onClick={() => onAbrirProyecto(l.proyectoId)} className="underline text-zinc-400 hover:text-white">Ver la obra</button>}
              </div>
            </div>

            {['sin_luz_verde', 'por_levantar'].includes(l.etapa) && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Visita de levantamiento</div>
                {l.fechaVisita && <div className="text-[12px] text-zinc-200">Coordinada: <b>{textoCoordinacion(l.fechaVisita, l.horaVisita)}</b>{l.luzVerdePor ? <span className="text-zinc-500"> · {l.luzVerdePor}</span> : null}</div>}
                <div className="flex gap-2">
                  <input id="ficha-fecha-visita" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs text-white" />
                  <input id="ficha-hora-visita" type="time" value={hora} onChange={e => setHora(e.target.value)} className="w-28 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs text-white" />
                </div>
                <button onClick={guardarCoordinacion} disabled={guardando}
                  className="w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-bold uppercase py-2 text-[11px] rounded-card">
                  {guardando ? 'Guardando…' : l.fechaVisita ? 'Cambiar la fecha' : 'Marcar coordinado'}
                </button>
                {/* v8.75.0: el levantamiento se crea desde la ficha, justo después de coordinar
                    la visita (antes el botón solo estaba en la tarjeta de "Coordinado para
                    levantar", donde nunca había nadie). Nace amarrado y con la cita. */}
                {!l.levantamientoId && !l.luzVerde && onAgendarLevantamiento && (
                  <div className="text-[10px] text-zinc-500">Al marcarla coordinada, aquí mismo creas el levantamiento con esa cita.</div>
                )}
                {puedeCrearLev && (
                  <button onClick={crearLevantamiento} disabled={creandoLev}
                    className="w-full bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white font-bold uppercase py-2 text-[11px] rounded-card flex items-center justify-center gap-1">
                    {creandoLev ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />} Crear el levantamiento
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* v8.75.0: el levantamiento de la sucursal y lo que dejó medido */}
        {l.levantamientoId && (
          <div className="px-4 pb-3">
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold flex items-center gap-1">
                  <Ruler className="w-3.5 h-3.5" /> Levantamiento{lev?.codigo ? <span className="normal-case tracking-normal font-mono text-zinc-300 ml-1">{lev.codigo}</span> : null}
                </div>
                {onAbrirLevantamiento && (
                  <button onClick={() => onAbrirLevantamiento(l.levantamientoId)}
                    className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-card bg-sky-700 hover:bg-sky-600 text-white flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> Abrir el levantamiento
                  </button>
                )}
              </div>
              <div className="text-[12px] text-zinc-300 flex flex-wrap gap-x-3 gap-y-0.5">
                {lev?.etapaLevantamiento && <span><span className="text-zinc-500">Etapa:</span> {lev.etapaLevantamiento}</span>}
                {l.levantadoAt
                  ? <span><span className="text-zinc-500">Levantado el</span> <b>{fmtF(l.levantadoAt)}</b></span>
                  : levHecho ? <span className="text-zinc-400">Levantado</span>
                  : <span><span className="text-zinc-500">Visita:</span> {lev?.fechaVisita
                      ? <b>{textoCoordinacion(lev.fechaVisita)}{horaCita ? ` · ${horaCita}` : ''}</b>
                      : lev?.tipoCita === 'cualquier_dia'
                        ? <b>{horaCita}</b>
                        : <span className="text-amber-400">sin fecha{horaCita ? ` (${horaCita})` : ''}</span>}</span>}
                {lev?.levantador
                  ? <span><span className="text-zinc-500">Levantador:</span> {lev.levantador}</span>
                  : !levHecho && <span><span className="text-zinc-500">Levantador:</span> <span className="text-amber-400">sin asignar</span></span>}
                {lev?.sitio && <span className="text-zinc-500 truncate max-w-full">{lev.sitio}</span>}
              </div>

              {fechaDistinta && (
                <div className="text-[11px] text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  En el programa quedó coordinada para el {textoCoordinacion(l.fechaVisita, l.horaVisita)}. El levantador ve la cita de arriba: si la fecha cambió, corrígela en el levantamiento.
                </div>
              )}
              {detalleLev === undefined && <div className="text-[11px] text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Leyendo el levantamiento…</div>}
              {errorLev && <div className="text-[11px] text-red-400">No se pudo leer lo medido: {errorLev}</div>}
              {detalleLev === null && !errorLev && (levHecho
                ? <div className="text-[11px] text-amber-300 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Está marcado como levantado, pero en el ERP no hay visita, medidas ni fotos de este sitio.</div>
                : <div className="text-[11px] text-zinc-500">Todavía no hay visita cargada.</div>)}

              {detalleLev && (
                <div className="space-y-2">
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <div><span className="text-xl font-black text-white tabular-nums">{detalleLev.totalM2.toLocaleString('es-DO', { maximumFractionDigits: 2 })}</span> <span className="text-[11px] text-zinc-400">m² medidos</span></div>
                    {!detalleLev.completada && <span className="text-[10px] font-bold uppercase text-amber-400">visita sin cerrar</span>}
                    {detalleLev.sistemaRecomendado && <div className="text-[12px]"><span className="text-zinc-500">Sistema recomendado:</span> {detalleLev.sistemaRecomendado}</div>}
                    {detalleLev.diasEstimados && <div className="text-[12px]"><span className="text-zinc-500">Días estimados:</span> {detalleLev.diasEstimados}</div>}
                  </div>
                  {detalleLev.areas.length > 0 && (
                    <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-[12px]">
                      {detalleLev.areas.map((a, i) => (
                        <div key={i} className="flex justify-between gap-2 border-b border-zinc-800/70 py-0.5">
                          <span className="text-zinc-300 truncate">{a.nombre}</span>
                          <span className="text-zinc-400 tabular-nums shrink-0">{a.m2.toLocaleString('es-DO', { maximumFractionDigits: 2 })} m²</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> {detalleLev.totalFotos} foto{detalleLev.totalFotos === 1 ? '' : 's'}</div>
                  {detalleLev.fotos.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {detalleLev.fotos.map(f => (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title={f.titulo || 'Foto del levantamiento'}
                          className={`shrink-0 rounded-card overflow-hidden border ${f.critica ? 'border-red-600' : 'border-zinc-800'} hover:border-zinc-500`}>
                          <img src={f.url} alt={f.titulo || 'Foto del levantamiento'} loading="lazy" className="w-20 h-20 object-cover block" />
                        </a>
                      ))}
                      {detalleLev.totalFotos > detalleLev.fotos.length && onAbrirLevantamiento && (
                        <button onClick={() => onAbrirLevantamiento(l.levantamientoId)}
                          className="shrink-0 w-20 h-20 rounded-card border border-zinc-800 hover:border-zinc-500 text-[11px] text-zinc-400 hover:text-white">
                          +{detalleLev.totalFotos - detalleLev.fotos.length}<br />ver todas
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* v8.59.3: Orden de compra — subir cruda, validar, firmar y sellar, enviar */}
        <div className="px-4 pb-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">Orden de compra del cliente</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setRegistrarFirma(true)} className="text-[10px] underline text-zinc-500 hover:text-white flex items-center gap-1"><PenLine className="w-3 h-3" /> Mi firma</button>
                <label className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-card cursor-pointer flex items-center gap-1 ${oc && ['leyendo', 'firmando', 'guardando'].includes(oc.fase) ? 'bg-zinc-800 text-zinc-500' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
                  <Upload className="w-3 h-3" /> Subir OC sin firmar
                  <input type="file" className="hidden" accept=".pdf,application/pdf" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; procesarOC(f); }} />
                </label>
              </div>
            </div>
            <div className="text-[10px] text-zinc-500">Sube la OC tal como la mandó el cliente. El ERP la lee, comprueba que sea de esta sucursal y a nombre de Super Techos, y la firma y sella en el recuadro del proveedor.</div>

            {oc?.fase === 'leyendo' && <div className="text-[12px] text-zinc-300 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo la OC…</div>}
            {oc?.fase === 'firmando' && <div className="text-[12px] text-zinc-300 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Firmando y sellando…</div>}
            {oc?.fase === 'guardando' && <div className="text-[12px] text-zinc-300 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</div>}
            {oc?.fase === 'error' && <div className="text-[12px] text-red-400 flex items-start gap-2"><XCircle className="w-4 h-4 shrink-0" /> {oc.error}</div>}

            {oc?.validacion && (
              <div className="space-y-1">
                {oc.validacion.ok
                  ? <div className="text-[12px] text-green-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> OC {oc.validacion.numeroOc} correcta para {l.nombre}{oc.validacion.resumen?.total ? ` · total RD$${Number(oc.validacion.resumen.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : ''}</div>
                  : <div className="text-[12px] text-red-400 font-bold flex items-center gap-2"><XCircle className="w-4 h-4" /> Esta OC no se puede usar:</div>}
                {oc.validacion.errores.map((e, i) => <div key={i} className="text-[11px] text-red-300 pl-6">• {e}</div>)}
                {oc.validacion.avisos.map((a, i) => <div key={i} className="text-[11px] text-amber-300 pl-6 flex gap-1"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {a}</div>)}
              </div>
            )}

            {oc?.fase === 'sin_firma' && <div className="text-[12px] text-amber-300">Para firmarla, primero registra tu firma (una sola vez).</div>}

            {oc?.fase === 'lista' && oc.url && (
              <div className="space-y-2">
                <iframe src={oc.url} title="OC firmada" className="w-full h-72 rounded-card bg-white" />
                {oc.error && <div className="text-[11px] text-red-400">{oc.error}</div>}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => guardarOC(true)} className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold uppercase py-2 text-[11px] rounded-card flex items-center justify-center gap-1"><Send className="w-3.5 h-3.5" /> Guardar y enviar al cliente</button>
                  <button onClick={() => guardarOC(false)} className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold uppercase py-2 text-[11px] rounded-card">Solo guardar</button>
                  <button onClick={() => setOc(null)} className="px-3 text-zinc-500 hover:text-white text-[11px] uppercase font-bold">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Documentos */}
        <div className="px-4 pb-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">Documentos</div>
              <div className="flex items-center gap-2 flex-wrap">
                <select id="ficha-tipo-doc" value={tipo} onChange={e => setTipo(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1 text-[11px] text-white">
                  {TIPOS_DOCUMENTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <label className="text-[11px] text-zinc-400 flex items-center gap-1">
                  <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} className="accent-red-600" /> Lo ve el cliente
                </label>
                <label className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-card cursor-pointer flex items-center gap-1 ${subiendo ? 'bg-zinc-800 text-zinc-500' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
                  {subiendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Subir
                  <input type="file" className="hidden" disabled={subiendo} onChange={subir} accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc" />
                </label>
              </div>
            </div>
            {docs === null && <div className="text-[11px] text-zinc-500 py-2"><Loader2 className="w-3 h-3 animate-spin inline" /> Cargando…</div>}
            {docs?.length === 0 && <div className="text-[11px] text-zinc-600 py-2">Sin documentos. Sube aquí la OC del cliente cuando llegue.</div>}
            {docs?.map(d => (
              <div key={d.id} className="flex items-center gap-2 py-1.5 border-t border-zinc-800 first:border-t-0 text-[12px]">
                <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-zinc-100 hover:underline truncate block">{d.nombre}</a> : <span className="truncate block">{d.nombre}</span>}
                  <div className="text-[10px] text-zinc-500">{etiquetaTipo[d.tipo] || d.tipo}{d.numeroOc ? ` ${d.numeroOc}` : ''} · {fmtF(d.fecha)} · {d.subidoPor}{d.origen === 'cliente' ? ' · lo subió el cliente' : ''}</div>
                  {d.tipo === 'oc_firmada' && d.enviadoClienteAt && <div className="text-[10px] text-green-400">Enviada el {fmtF(d.enviadoClienteAt)} a {d.enviadoA}</div>}
                </div>
                {d.tipo === 'oc_firmada' && (
                  <button onClick={() => enviarOC(d.id)} disabled={enviando === d.id}
                    className="text-[10px] font-bold uppercase px-2 py-1 bg-green-800 hover:bg-green-700 text-white rounded-card flex items-center gap-1">
                    {enviando === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} {d.enviadoClienteAt ? 'Reenviar' : 'Enviar al cliente'}
                  </button>
                )}
                <button title={d.visibleCliente ? 'El cliente lo ve — ocultar' : 'Oculto al cliente — mostrar'}
                  onClick={async () => { await db.cambiarVisibilidadDocumento(d.id, !d.visibleCliente); cargarDocs(); }}
                  className={`p-1 rounded ${d.visibleCliente ? 'text-green-400' : 'text-zinc-600'} hover:bg-zinc-800`}>
                  {d.visibleCliente ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button title="Borrar" onClick={async () => { if (confirm(`¿Borrar ${d.nombre}?`)) { await db.borrarDocumentoLocacion(d); cargarDocs(); } }}
                  className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {registrarFirma && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-3" onClick={e => { e.stopPropagation(); setRegistrarFirma(false); }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-md p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-black uppercase tracking-widest">Tu firma</div>
            <div className="text-[11px] text-zinc-400">Fírmala una sola vez. Queda guardada en tu perfil y el ERP la usa para firmar las OC que subas.</div>
            <div ref={padRef}><FirmaPad alto={150} /></div>
            <div className="flex gap-2">
              <button onClick={() => setRegistrarFirma(false)} className="px-3 bg-zinc-800 text-zinc-300 font-bold uppercase py-2 text-[11px] rounded-card">Cancelar</button>
              <button onClick={guardarFirma} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold uppercase py-2 text-[11px] rounded-card">Guardar mi firma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
