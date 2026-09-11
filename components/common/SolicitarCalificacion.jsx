'use client';

// v8.54.1 (C3): pedir/mostrar la calificación del cliente (CSAT) de un ticket.
// Genera un link público /calificar/<token> para compartir por WhatsApp/correo, y una vez
// respondido muestra las estrellas + comentario. Se usa en reclamaciones y levantamientos.

import React, { useEffect, useState } from 'react';
import { Star, Copy, Check, MessageCircle, Loader2 } from 'lucide-react';
import * as db from '../../lib/db';

const fmt = (iso) => { try { return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };

function Estrellas({ n }) {
  return <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-4 h-4 ${i <= n ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}`} />)}</span>;
}

export default function SolicitarCalificacion({ entityType, entityId, clienteNombre = '', contexto = '', usuario }) {
  const [items, setItems] = useState(null);
  const [creando, setCreando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargar = async () => {
    try { setItems(await db.listarCalificacionesEntidad(entityType, entityId)); }
    catch { setItems([]); }
  };
  useEffect(() => { if (entityId) cargar(); }, [entityType, entityId]);

  const respondida = (items || []).find((x) => x.calificacion != null);
  const pendiente = (items || []).find((x) => x.calificacion == null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const linkDe = (tok) => `${origin}/calificar/${tok}`;

  const pedir = async () => {
    setCreando(true);
    try {
      await db.crearSolicitudCalificacion({ entityType, entityId, clienteNombre, contexto, creadoPor: usuario });
      await cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setCreando(false);
  };

  const copiar = async (tok) => {
    try { await navigator.clipboard.writeText(linkDe(tok)); setCopiado(true); setTimeout(() => setCopiado(false), 1800); }
    catch { /* noop */ }
  };
  const mensajeWa = (tok) => `Hola${clienteNombre ? ` ${clienteNombre}` : ''}, gracias por confiar en Super Techos. ¿Nos ayudas con una breve calificación? ${linkDe(tok)}`;

  if (items === null) return null;

  return (
    <div className="mt-3 bg-zinc-950 border border-zinc-800 rounded-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 flex items-center gap-1"><Star className="w-3 h-3" /> Calificación del cliente</div>

      {respondida ? (
        <div className="text-sm text-zinc-200">
          <div className="flex items-center gap-2"><Estrellas n={respondida.calificacion} /><span className="text-zinc-400 text-xs">{respondida.calificacion}/5 · {fmt(respondida.respondidoAt)}</span></div>
          {respondida.comentario && <div className="text-zinc-300 text-sm mt-1 italic">“{respondida.comentario}”</div>}
        </div>
      ) : pendiente ? (
        <div className="space-y-2">
          <div className="text-[11px] text-zinc-500">Enlace de calificación listo — compártelo con el cliente:</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <input readOnly value={linkDe(pendiente.token)} className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-[11px] text-zinc-300" />
            <button onClick={() => copiar(pendiente.token)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-card border border-zinc-700 text-[11px] text-zinc-300 hover:border-zinc-500">{copiado ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />} {copiado ? 'Copiado' : 'Copiar'}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(mensajeWa(pendiente.token))}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1.5 rounded-card border border-green-800 text-[11px] text-green-300 hover:border-green-600"><MessageCircle className="w-3 h-3" /> WhatsApp</a>
          </div>
          <div className="text-[10px] text-zinc-600">Esperando respuesta del cliente. Cuando califique, aparecerá aquí y en la bitácora.</div>
        </div>
      ) : (
        <button onClick={pedir} disabled={creando} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-card inline-flex items-center gap-1">
          {creando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />} Pedir calificación al cliente
        </button>
      )}
    </div>
  );
}
