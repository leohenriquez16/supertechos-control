'use client';

// ChatterPanel.jsx — Chatter tipo Odoo: bitácora de eventos + notas manuales.
// Se monta debajo del detalle de una entidad.
//
// Props:
//  - entityType : 'levantamiento'|'reclamacion'|'contacto'|'proyecto'|'locacion'
//  - entityId   : id de la entidad
//  - usuario    : { id, nombre } (autor de las notas)
//  - titulo     : opcional (default "Seguimiento")

import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Loader2, Send, CheckCircle2, PlusCircle, RefreshCw, FileText, Clock } from 'lucide-react';
import { listarChatter, agregarNota } from '../../lib/chatter';

function iniciales(nombre) {
  const p = String(nombre || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

function tiempoRelativo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias < 30) return `hace ${dias} d`;
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fechaCompleta(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function IconoEvento({ evento }) {
  if (evento === 'creado') return <PlusCircle className="w-3.5 h-3.5 text-green-400" />;
  if (evento === 'estado') return <RefreshCw className="w-3.5 h-3.5 text-blue-400" />;
  if (evento === 'nota') return <MessageSquare className="w-3.5 h-3.5 text-amber-400" />;
  if (evento === 'cambio') return <FileText className="w-3.5 h-3.5 text-zinc-400" />;
  return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
}

export default function ChatterPanel({ entityType, entityId, usuario, titulo = 'Seguimiento' }) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    if (!entityId) { setLoading(false); return; }
    setLoading(true);
    const ms = await listarChatter(entityType, entityId);
    setMensajes(ms);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { cargar(); }, [cargar]);

  const enviar = async () => {
    if (!nota.trim() || enviando) return;
    setEnviando(true);
    try {
      const m = await agregarNota(entityType, entityId, nota, usuario);
      if (m) { setMensajes(prev => [m, ...prev]); setNota(''); }
    } finally { setEnviando(false); }
  };

  return (
    <div className="border-2 border-zinc-800 rounded-card bg-zinc-900/40 mt-4">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
          <MessageSquare className="w-4 h-4 text-red-500" /> {titulo}
          {mensajes.length > 0 && <span className="text-zinc-500">({mensajes.length})</span>}
        </div>
        <button onClick={cargar} className="text-zinc-500 hover:text-white" title="Recargar"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      {/* Caja para nueva nota */}
      <div className="p-3 border-b border-zinc-800/70">
        <div className="flex gap-2 items-start">
          <div className="w-7 h-7 rounded-full bg-red-900/40 border border-red-800 flex items-center justify-center text-[10px] font-bold text-red-300 shrink-0">
            {iniciales(usuario?.nombre)}
          </div>
          <div className="flex-1">
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar(); }}
              placeholder="Escribe una nota… (Cmd/Ctrl+Enter para enviar)"
              rows={2}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none rounded-card px-2.5 py-1.5 text-sm text-white resize-y"
            />
            <div className="flex justify-end mt-1.5">
              <button onClick={enviar} disabled={!nota.trim() || enviando} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold uppercase px-3 py-1.5 rounded-card flex items-center gap-1">
                {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-3">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 text-xs py-3"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
        ) : mensajes.length === 0 ? (
          <div className="text-xs text-zinc-500 py-2">Sin actividad todavía.</div>
        ) : (
          <ul className="space-y-3">
            {mensajes.map(m => (
              <li key={m.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  {m.tipo === 'nota'
                    ? <span className="text-[9px] font-bold text-zinc-300">{iniciales(m.autorNombre)}</span>
                    : <IconoEvento evento={m.evento} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-bold text-zinc-200">{m.autorNombre || 'Sistema'}</span>
                    <span className="text-[10px] text-zinc-500" title={fechaCompleta(m.createdAt)}>{tiempoRelativo(m.createdAt)}</span>
                    {m.tipo === 'nota' && <span className="text-[9px] uppercase tracking-wide text-amber-400/80 bg-amber-900/20 px-1 rounded">nota</span>}
                  </div>
                  <div className={`text-sm mt-0.5 ${m.tipo === 'nota' ? 'text-zinc-100' : 'text-zinc-400'} whitespace-pre-wrap break-words`}>
                    {m.cuerpo}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
