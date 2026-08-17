'use client';

// v8.27.0: Módulo "Gotera" — feedback y reporte de errores del ERP en modo ticket.
//  - Cualquier usuario abre un ticket (error o idea), indica módulo + pantalla,
//    impacto, screenshots y nota de voz.
//  - El OWNER los gestiona en un kanban (Abierto / En proceso / Resuelto / Cerrado),
//    prioriza por impacto, abre la ficha (todo ordenado), copia el ticket o lo
//    resuelve. Al resolver se notifica al solicitante y pasa a Cerrado.

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, Loader2, Plus, X, CloudRain, Bug, Lightbulb, Mic, Square, Camera, Copy, Check, Trash2, Image as ImageIcon, AlertOctagon, ChevronRight } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagenABlob } from '../../lib/imports';

const tieneRol = (p, r) => (p?.roles || []).includes(r);

// Columnas del kanban (estado del ticket)
const COLS = [
  { e: 'abierto',    label: 'Abierto',    color: 'bg-amber-600',  text: 'text-amber-400' },
  { e: 'en_proceso', label: 'En proceso', color: 'bg-blue-600',   text: 'text-blue-400' },
  { e: 'resuelto',   label: 'Resuelto',   color: 'bg-green-600',  text: 'text-green-400' },
  { e: 'cerrado',    label: 'Cerrado',    color: 'bg-zinc-600',   text: 'text-zinc-400' },
];

// Impacto — para que el owner priorice lo que afecta el día a día
const IMPACTOS = [
  { v: 'bloqueante', label: 'Bloqueante', desc: 'No puedo trabajar', cls: 'bg-red-900/40 border-red-600 text-red-300', dot: 'bg-red-500' },
  { v: 'alta',       label: 'Alta',       desc: 'Estorba mucho',      cls: 'bg-orange-900/30 border-orange-700 text-orange-300', dot: 'bg-orange-500' },
  { v: 'media',      label: 'Media',      desc: 'Molesta pero sigo',  cls: 'bg-yellow-900/20 border-yellow-700 text-yellow-300', dot: 'bg-yellow-500' },
  { v: 'baja',       label: 'Baja',       desc: 'Detalle menor',      cls: 'bg-zinc-800 border-zinc-700 text-zinc-300', dot: 'bg-zinc-500' },
];
const impactoMeta = (v) => IMPACTOS.find(i => i.v === v) || IMPACTOS[2];
const ORDEN_IMPACTO = { bloqueante: 0, alta: 1, media: 2, baja: 3 };

// Módulos del ERP (para que digan dónde está el error)
const MODULOS = [
  'Dashboard', 'Proyectos', 'Levantamientos', 'Citas', 'Reclamaciones', 'Planificación',
  'Tareas', 'Galería', 'Equipo en obra', 'Nómina', 'Caja Chica', 'Contabilidad',
  'Garantías', 'Clientes', 'Ubicaciones', 'Personal', 'Mis Proyectos', 'Mi Producción',
  'Mi Caja Chica', 'Clima', 'Login / Acceso', 'Otro',
];

const fmtFecha = (s) => { if (!s) return '—'; try { return new Date(s).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
const rolPrincipal = (u) => (u?.roles || [])[0] || '—';

export default function ModuloGotera({ usuario, data, onVolver }) {
  const esOwner = tieneRol(usuario, 'owner') || tieneRol(usuario, 'admin');
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [reload, setReload] = useState(0);
  const [sel, setSel] = useState(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [fTipo, setFTipo] = useState('');     // filtro tipo
  const [fImpacto, setFImpacto] = useState(''); // filtro impacto
  const [dragId, setDragId] = useState(null);
  const [dropCol, setDropCol] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const lista = await db.listarTicketsSoporte(esOwner ? {} : { soloMios: true, usuarioId: usuario.id });
        if (!cancel) setTickets(lista);
      } catch (e) { console.warn('Gotera:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [reload, esOwner, usuario.id]);

  const filtradas = useMemo(() => tickets.filter(t => {
    if (fTipo && t.tipo !== fTipo) return false;
    if (fImpacto && t.impacto !== fImpacto) return false;
    return true;
  }), [tickets, fTipo, fImpacto]);

  // Para el solicitante: tickets resueltos sin confirmar (notificación)
  const misResueltos = useMemo(() =>
    tickets.filter(t => t.reportadoPorId === usuario.id && t.estado === 'resuelto' && t.notificarSolicitante),
    [tickets, usuario.id]);

  useEffect(() => {
    if (!esOwner && misResueltos.length > 0) {
      toast.success(`Tienes ${misResueltos.length} reporte${misResueltos.length > 1 ? 's' : ''} resuelto${misResueltos.length > 1 ? 's' : ''} ✅`);
    }
  }, [misResueltos.length, esOwner]);

  const moverEstado = async (id, estado) => {
    const prev = tickets.find(t => t.id === id)?.estado;
    setTickets(ts => ts.map(t => t.id === id ? { ...t, estado } : t)); // optimista
    try {
      const campos = { estado };
      if (estado === 'resuelto') { campos.notificarSolicitante = true; campos.resueltoPorId = usuario.id; }
      await db.actualizarTicketSoporte(id, campos);
    } catch (e) { alert('Error: ' + (e.message || e)); setTickets(ts => ts.map(t => t.id === id ? { ...t, estado: prev } : t)); }
  };

  const Card = (t) => {
    const im = impactoMeta(t.impacto);
    return (
      <div
        key={t.id}
        draggable={esOwner}
        onDragStart={() => setDragId(t.id)}
        onDragEnd={() => { setDragId(null); setDropCol(null); }}
        onClick={() => setSel(t)}
        className={`bg-zinc-900 border border-zinc-800 rounded-card p-2.5 cursor-pointer hover:border-red-600 ${dragId === t.id ? 'opacity-40' : ''}`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {t.tipo === 'idea' ? <Lightbulb className="w-3 h-3 text-yellow-400" /> : <Bug className="w-3 h-3 text-red-400" />}
          {t.tipo === 'error' && <span className={`w-2 h-2 rounded-full ${im.dot}`} title={`Impacto ${im.label}`} />}
          <span className="text-[9px] uppercase tracking-wider text-zinc-500 truncate">{t.modulo || 'Sin módulo'}</span>
        </div>
        <div className="font-bold text-sm leading-tight line-clamp-2">{t.titulo}</div>
        <div className="flex items-center justify-between mt-1.5 text-[9px] text-zinc-500">
          <span className="truncate">{t.reportadoPorNombre}</span>
          <span className="flex items-center gap-1">
            {t.screenshots?.length > 0 && <ImageIcon className="w-3 h-3" />}
            {t.audioUrl && <Mic className="w-3 h-3" />}
            {fmtFecha(t.createdAt).split(',')[0]}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2"><CloudRain className="w-7 h-7 text-red-500" /> Gotera</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Reporta un error o danos una idea para mejorar el sistema.</p>
        </div>
        <button onClick={() => setModalNuevo(true)} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center gap-1 rounded-card"><Plus className="w-3 h-3" /> Nuevo reporte</button>
      </div>

      {/* Notificación al solicitante (no-owner) */}
      {!esOwner && misResueltos.length > 0 && (
        <div className="bg-green-900/20 border border-green-700 rounded-card p-3 space-y-2">
          <div className="text-sm font-bold text-green-300 flex items-center gap-1.5"><Check className="w-4 h-4" /> {misResueltos.length} de tus reportes fueron resueltos</div>
          {misResueltos.map(t => (
            <div key={t.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-xs">
              <div className="font-bold">{t.titulo}</div>
              {t.respuesta && <div className="text-zinc-400 mt-0.5">Respuesta: {t.respuesta}</div>}
              <button onClick={async () => { await db.actualizarTicketSoporte(t.id, { estado: 'cerrado', notificarSolicitante: false }); setReload(x => x + 1); }} className="mt-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold uppercase px-2 py-1 rounded-card">Confirmar y cerrar</button>
            </div>
          ))}
        </div>
      )}

      {/* Filtros (owner) */}
      {esOwner && tickets.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1 text-white outline-none focus:border-red-600">
            <option value="">Todo tipo</option>
            <option value="error">Errores</option>
            <option value="idea">Ideas</option>
          </select>
          <select value={fImpacto} onChange={e => setFImpacto(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1 text-white outline-none focus:border-red-600">
            <option value="">Todo impacto</option>
            {IMPACTOS.map(i => <option key={i.v} value={i.v}>{i.label}</option>)}
          </select>
          {(fTipo || fImpacto) && <button onClick={() => { setFTipo(''); setFImpacto(''); }} className="text-[10px] text-zinc-400 hover:text-red-500 underline px-1">Limpiar</button>}
          <span className="text-[10px] text-zinc-600 ml-auto">{filtradas.length} de {tickets.length}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : tickets.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500">
          <CloudRain className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="font-bold mb-1">Sin reportes todavía</div>
          <div className="text-xs">¿Viste un error o tienes una idea? Toca "Nuevo reporte".</div>
        </div>
      ) : esOwner ? (
        // KANBAN (owner)
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLS.map(col => {
            const items = filtradas
              .filter(t => t.estado === col.e)
              .sort((a, b) => (ORDEN_IMPACTO[a.impacto] ?? 9) - (ORDEN_IMPACTO[b.impacto] ?? 9));
            return (
              <div
                key={col.e}
                onDragOver={e => { if (dragId) { e.preventDefault(); setDropCol(col.e); } }}
                onDrop={() => { if (dragId) { moverEstado(dragId, col.e); setDragId(null); setDropCol(null); } }}
                className={`w-64 flex-shrink-0 bg-zinc-950 border rounded-card ${dropCol === col.e ? 'border-red-600' : 'border-zinc-800'}`}
              >
                <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-300 flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${col.color}`} />{col.label}</span>
                  <span className="text-[9px] text-zinc-600">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[60px]">{items.map(Card)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        // LISTA (no-owner): mis reportes
        <div className="space-y-2">
          {filtradas.map(t => {
            const im = impactoMeta(t.impacto);
            const col = COLS.find(c => c.e === t.estado);
            return (
              <button key={t.id} onClick={() => setSel(t)} className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-red-600 rounded-card p-3 flex items-center gap-3">
                {t.tipo === 'idea' ? <Lightbulb className="w-4 h-4 text-yellow-400 shrink-0" /> : <Bug className="w-4 h-4 text-red-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{t.titulo}</div>
                  <div className="text-[10px] text-zinc-500">{t.modulo} · {fmtFecha(t.createdAt)}</div>
                </div>
                <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-card border ${col?.color?.replace('bg-', 'border-')} ${col?.text}`}>{col?.label}</span>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {modalNuevo && <ModalNuevoTicket usuario={usuario} onCerrar={() => setModalNuevo(false)} onCreado={() => { setModalNuevo(false); setReload(x => x + 1); toast.success('Reporte enviado. ¡Gracias!'); }} />}
      {sel && <FichaTicket ticket={sel} usuario={usuario} esOwner={esOwner} onCerrar={() => setSel(null)} onCambio={() => { setReload(x => x + 1); setSel(null); }} />}
    </div>
  );
}

// ============ MODAL NUEVO TICKET ============
function ModalNuevoTicket({ usuario, onCerrar, onCreado }) {
  const [tipo, setTipo] = useState('error');
  const [titulo, setTitulo] = useState('');
  const [modulo, setModulo] = useState('');
  const [pantalla, setPantalla] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [impacto, setImpacto] = useState('media');
  const [shots, setShots] = useState([]);       // [{ blob, url(preview) }]
  const [audioBlob, setAudioBlob] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const onFiles = async (files) => {
    const arr = Array.from(files || []);
    for (const f of arr) {
      try { const blob = await comprimirImagenABlob(f); setShots(s => [...s, { blob, url: URL.createObjectURL(blob) }]); }
      catch (e) { console.warn('img', e); }
    }
  };

  const guardar = async () => {
    if (!titulo.trim()) { toast.warning('Ponle un título corto a tu reporte.'); return; }
    setGuardando(true);
    try {
      // 1) crear el ticket (sin adjuntos) para tener id
      const creado = await db.crearTicketSoporte({
        tipo, titulo: titulo.trim(), descripcion: descripcion.trim() || null,
        modulo: modulo || null, pantalla: pantalla.trim() || null,
        impacto: tipo === 'error' ? impacto : 'baja',
        reportadoPorId: usuario.id, reportadoPorNombre: usuario.nombre, reportadoPorRol: rolPrincipal(usuario),
      });
      // 2) subir adjuntos y actualizar
      const screenshots = [];
      for (let i = 0; i < shots.length; i++) {
        try { screenshots.push(await db.subirScreenshotSoporte(shots[i].blob, creado.id, i)); } catch (e) { console.warn('shot', e); }
      }
      let audioUrl = null;
      if (audioBlob) { try { audioUrl = await db.subirAudioSoporte(audioBlob, creado.id); } catch (e) { console.warn('audio', e); } }
      if (screenshots.length || audioUrl) {
        // persistir adjuntos vía update directo (campos no cubiertos por actualizar genérico → usamos un update puntual)
        await db.guardarAdjuntosTicketSoporte(creado.id, { screenshots, audioUrl });
      }
      onCreado();
    } catch (e) { alert('Error: ' + (e.message || e)); setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-lg w-full p-5 space-y-3 my-8">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold flex items-center gap-1"><CloudRain className="w-4 h-4" /> Nuevo reporte</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>

        {/* Tipo */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setTipo('error')} className={`p-2.5 rounded-card border text-xs font-bold flex items-center justify-center gap-1.5 ${tipo === 'error' ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}><Bug className="w-4 h-4" /> Error / Falla</button>
          <button onClick={() => setTipo('idea')} className={`p-2.5 rounded-card border text-xs font-bold flex items-center justify-center gap-1.5 ${tipo === 'idea' ? 'border-yellow-600 bg-yellow-900/20 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}><Lightbulb className="w-4 h-4" /> Idea / Mejora</button>
        </div>

        <Field label="Título (corto)"><input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={tipo === 'error' ? 'Ej. No me deja guardar el reporte' : 'Ej. Agregar buscador en clientes'} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2.5 text-white text-sm rounded-card" /></Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Módulo"><select value={modulo} onChange={e => setModulo(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-2 py-2.5 text-white text-sm rounded-card"><option value="">¿Dónde?</option>{MODULOS.map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
          <Field label="Pantalla / modal"><input value={pantalla} onChange={e => setPantalla(e.target.value)} placeholder="Ej. modal Nuevo ajuste" className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2.5 text-white text-sm rounded-card" /></Field>
        </div>

        <Field label={tipo === 'error' ? '¿Qué pasó? Detalla los pasos' : 'Describe tu idea'}><textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder={tipo === 'error' ? 'Qué hacías, qué esperabas y qué pasó.' : 'Qué te gustaría y por qué ayudaría.'} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2.5 text-white text-sm rounded-card resize-none" /></Field>

        {/* Impacto (solo errores) */}
        {tipo === 'error' && (
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1.5">¿Te afecta el día a día?</div>
            <div className="grid grid-cols-2 gap-1.5">
              {IMPACTOS.map(i => (
                <button key={i.v} onClick={() => setImpacto(i.v)} className={`p-2 rounded-card border text-left ${impacto === i.v ? i.cls : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>
                  <div className="text-[11px] font-bold flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${i.dot}`} />{i.label}</div>
                  <div className="text-[9px] opacity-70">{i.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Screenshots */}
        <div>
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1.5">Capturas (opcional)</div>
          <div className="flex items-center gap-2 flex-wrap">
            {shots.map((s, i) => (
              <div key={i} className="relative">
                <img src={s.url} alt="" className="w-16 h-16 object-cover rounded-card border border-zinc-700" />
                <button onClick={() => setShots(arr => arr.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-red-600 rounded-full w-4 h-4 flex items-center justify-center"><X className="w-2.5 h-2.5 text-white" /></button>
              </div>
            ))}
            {/* v8.27.67: cámara directa + galería */}
            <label title="Tomar foto (cámara)" className="w-16 h-16 rounded-card border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center text-red-500 cursor-pointer hover:border-red-600">
              <Camera className="w-5 h-5" />
              <span className="text-[8px] mt-0.5">Cámara</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onFiles(e.target.files)} />
            </label>
            <label title="Elegir de la galería" className="w-16 h-16 rounded-card border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center text-zinc-500 cursor-pointer hover:border-red-600">
              <ImageIcon className="w-5 h-5" />
              <span className="text-[8px] mt-0.5">Galería</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => onFiles(e.target.files)} />
            </label>
          </div>
        </div>

        {/* Nota de voz */}
        <GrabadorVoz audioBlob={audioBlob} onAudio={setAudioBlob} />

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3 rounded-card">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !titulo.trim()} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-3 rounded-card flex items-center justify-center gap-1">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar reporte'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ GRABADOR DE VOZ ============
function GrabadorVoz({ audioBlob, onAudio }) {
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);

  const iniciar = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onAudio(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setGrabando(true);
    } catch (e) { setError('No se pudo acceder al micrófono.'); }
  };
  const detener = () => { try { recRef.current?.stop(); } catch {} setGrabando(false); };

  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1.5">Nota de voz (opcional)</div>
      {audioBlob ? (
        <div className="flex items-center gap-2">
          <audio controls src={URL.createObjectURL(audioBlob)} className="h-8 flex-1" />
          <button onClick={() => onAudio(null)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
        </div>
      ) : grabando ? (
        <button onClick={detener} className="w-full bg-red-600 text-white text-xs font-bold uppercase py-2.5 rounded-card flex items-center justify-center gap-2 animate-pulse"><Square className="w-4 h-4" /> Detener grabación</button>
      ) : (
        <button onClick={iniciar} className="w-full bg-zinc-950 border border-zinc-700 hover:border-red-600 text-zinc-300 text-xs font-bold uppercase py-2.5 rounded-card flex items-center justify-center gap-2"><Mic className="w-4 h-4" /> Grabar nota de voz</button>
      )}
      {error && <div className="text-[10px] text-red-400 mt-1">{error}</div>}
    </div>
  );
}

// ============ FICHA DEL TICKET ============
function FichaTicket({ ticket, usuario, esOwner, onCerrar, onCambio }) {
  const [t, setT] = useState(ticket);
  const [respuesta, setRespuesta] = useState(ticket.respuesta || '');
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const im = impactoMeta(t.impacto);

  // Texto plano del ticket para copiar y pegar (a Claude / soporte)
  const textoTicket = () => {
    const L = [];
    L.push(`TICKET ${t.tipo === 'idea' ? 'IDEA/MEJORA' : 'ERROR'} — ${t.titulo}`);
    L.push(`Reporta: ${t.reportadoPorNombre} (${t.reportadoPorRol})`);
    L.push(`Módulo: ${t.modulo || '—'}${t.pantalla ? ` · Pantalla: ${t.pantalla}` : ''}`);
    if (t.tipo === 'error') L.push(`Impacto: ${im.label} (${im.desc})`);
    L.push(`Estado: ${t.estado} · Creado: ${fmtFecha(t.createdAt)}`);
    L.push('');
    L.push('DESCRIPCIÓN:');
    L.push(t.descripcion || '(sin descripción)');
    if (t.screenshots?.length) { L.push(''); L.push(`Capturas (${t.screenshots.length}):`); t.screenshots.forEach(u => L.push(u)); }
    if (t.audioUrl) { L.push(''); L.push(`Nota de voz: ${t.audioUrl}`); }
    return L.join('\n');
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoTicket()); setCopiado(true); setTimeout(() => setCopiado(false), 1800); }
    catch { toast.warning('No se pudo copiar.'); }
  };

  const cambiarEstado = async (estado) => {
    setGuardando(true);
    try {
      const campos = { estado };
      if (estado === 'resuelto') { campos.notificarSolicitante = true; campos.resueltoPorId = usuario.id; campos.respuesta = respuesta || null; }
      const upd = await db.actualizarTicketSoporte(t.id, campos);
      setT(upd);
      if (estado === 'cerrado' || estado === 'resuelto') { onCambio(); }
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  const resolver = async () => {
    if (!respuesta.trim()) { toast.warning('Escribe qué se hizo para resolverlo (se le mostrará al solicitante).'); return; }
    await cambiarEstado('resuelto');
  };

  const col = COLS.find(c => c.e === t.estado);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border-2 border-zinc-700 rounded-card max-w-lg w-full p-5 space-y-3 my-8">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {t.tipo === 'idea' ? <Lightbulb className="w-5 h-5 text-yellow-400 shrink-0" /> : <Bug className="w-5 h-5 text-red-400 shrink-0" />}
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">{t.tipo === 'idea' ? 'Idea / Mejora' : 'Error / Falla'}</div>
              <h3 className="font-black text-lg leading-tight">{t.titulo}</h3>
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {/* Meta ordenada */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-1.5 text-sm">
          <Row k="Reporta" v={`${t.reportadoPorNombre}`} />
          <Row k="Rol" v={<span className="uppercase text-[11px] tracking-wider">{t.reportadoPorRol}</span>} />
          <Row k="Módulo" v={t.modulo || '—'} />
          {t.pantalla && <Row k="Pantalla" v={t.pantalla} />}
          {t.tipo === 'error' && <Row k="Impacto" v={<span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-card border ${im.cls}`}><span className={`w-2 h-2 rounded-full ${im.dot}`} />{im.label}</span>} />}
          <Row k="Estado" v={<span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-card border ${col?.color?.replace('bg-', 'border-')} ${col?.text}`}>{col?.label}</span>} />
          <Row k="Creado" v={fmtFecha(t.createdAt)} />
        </div>

        {/* Descripción */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Descripción</div>
          <div className="text-sm whitespace-pre-wrap text-zinc-300">{t.descripcion || <span className="text-zinc-600">Sin descripción.</span>}</div>
        </div>

        {/* Capturas */}
        {t.screenshots?.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {t.screenshots.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-20 h-20 object-cover rounded-card border border-zinc-700 hover:border-red-600" /></a>
            ))}
          </div>
        )}

        {/* Nota de voz */}
        {t.audioUrl && <audio controls src={t.audioUrl} className="w-full h-9" />}

        {/* Copiar ticket */}
        <button onClick={copiar} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase py-2.5 rounded-card flex items-center justify-center gap-2">
          {copiado ? <><Check className="w-4 h-4 text-green-400" /> Copiado</> : <><Copy className="w-4 h-4" /> Copiar ticket</>}
        </button>

        {/* Acciones del owner */}
        {esOwner && (
          <div className="border-t border-zinc-800 pt-3 space-y-2">
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Gestión</div>
            <div className="flex gap-1.5 flex-wrap">
              {COLS.map(c => (
                <button key={c.e} onClick={() => cambiarEstado(c.e)} disabled={guardando || t.estado === c.e}
                  className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-card border ${t.estado === c.e ? `${c.color} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}>{c.label}</button>
              ))}
            </div>
            <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={2} placeholder="Qué se hizo para resolverlo (lo verá el solicitante)…" className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm rounded-card resize-none" />
            <button onClick={resolver} disabled={guardando} className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-1">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Resolver y notificar al solicitante</>}
            </button>
            <button onClick={async () => { if (confirm('¿Eliminar este ticket?')) { await db.eliminarTicketSoporte(t.id); onCambio(); } }} className="w-full text-zinc-600 hover:text-red-400 text-[10px] uppercase tracking-wider py-1 flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar</button>
          </div>
        )}

        {/* Estado para el solicitante */}
        {!esOwner && t.estado === 'resuelto' && (
          <div className="bg-green-900/20 border border-green-700 rounded-card p-3">
            <div className="text-sm font-bold text-green-300 flex items-center gap-1.5"><Check className="w-4 h-4" /> Resuelto</div>
            {t.respuesta && <div className="text-xs text-zinc-300 mt-1">{t.respuesta}</div>}
            {t.notificarSolicitante && <button onClick={() => cambiarEstado('cerrado')} className="mt-2 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded-card">Confirmar y cerrar</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">{label}</div>
      {children}
    </label>
  );
}
function Row({ k, v }) {
  return (
    <div className="grid grid-cols-[90px,1fr] gap-2 items-baseline">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wider">{k}</div>
      <div className="text-zinc-200">{v}</div>
    </div>
  );
}
