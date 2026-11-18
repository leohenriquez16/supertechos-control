'use client';

// v8.75: paradas de la ruta en orden. Se ordenan ARRASTRANDO (drag & drop nativo)
// o con las flechas. Cada parada muestra quién la marcó (chofer / oficina / GPS),
// si el GPS la vio, y la distancia en línea recta desde la anterior.

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, X, GripVertical } from 'lucide-react';
import { moverEnLista, distanciasRuta, formatKm, estadoVisualParada, insigniasParada, etiquetaTipo } from '../../../lib/helpers/rutasOficina';

const FONDO_NUMERO = { pendiente: 'bg-blue-600 text-white', hecha: 'bg-green-600 text-white', gps: 'bg-green-600 text-white ring-2 ring-purple-400', visitada: 'bg-purple-600 text-white', cancelada: 'bg-zinc-700 text-zinc-300' };
const TONO_INSIGNIA = { verde: 'bg-green-900/40 text-green-300 border-green-800/60', morado: 'bg-purple-900/40 text-purple-300 border-purple-800/60', gris: 'bg-zinc-800 text-zinc-400 border-zinc-700' };

export default function ListaParadas({ viaje, proyectos, nombreObra, editable, puedeMarcar, gpsRevisado, onReordenar, onMarcarHecha, onQuitar }) {
  const [ids, setIds] = useState(() => viaje.paradas.map(p => p.id));
  const [arrastrando, setArrastrando] = useState(null); // índice
  const [sobre, setSobre] = useState(null);             // índice destino
  const [marcandoId, setMarcandoId] = useState(null);
  useEffect(() => { setIds(viaje.paradas.map(p => p.id)); }, [viaje.paradas]);

  const porId = useMemo(() => new Map(viaje.paradas.map(p => [p.id, p])), [viaje.paradas]);
  const paradas = useMemo(() => ids.map(id => porId.get(id)).filter(Boolean), [ids, porId]);
  const dist = useMemo(() => distanciasRuta(paradas, proyectos), [paradas, proyectos]);
  const movible = (p) => editable && p.estado !== 'completada' && p.estado !== 'cancelada';

  const aplicar = (nuevo) => {
    if (nuevo.join() === ids.join()) return;
    setIds(nuevo);
    onReordenar(nuevo);
  };
  const soltar = (destino) => {
    if (arrastrando != null && destino != null && arrastrando !== destino) aplicar(moverEnLista(ids, arrastrando, destino));
    setArrastrando(null); setSobre(null);
  };

  if (paradas.length === 0) {
    return (
      <div className="border border-dashed border-zinc-700 rounded-card p-5 text-center">
        <div className="text-sm font-bold text-zinc-300">Esta ruta no tiene paradas todavía</div>
        <div className="text-xs text-zinc-500 mt-1">Búscalas arriba, haz clic en el mapa o agrégalas desde «Por montar».</div>
      </div>
    );
  }

  let n = 0;
  return (
    <div className="space-y-1.5">
      {paradas.map((p, i) => {
        const ev = estadoVisualParada(p);
        const cancelada = p.estado === 'cancelada';
        if (!cancelada) n += 1;
        const d = dist[p.id];
        const insignias = insigniasParada(p, { gpsRevisado });
        const puedeMover = movible(p);
        return (
          <div key={p.id}
            draggable={puedeMover}
            onDragStart={e => { setArrastrando(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', p.id); } catch { /* algunos navegadores */ } }}
            onDragOver={e => { if (arrastrando == null || !editable) return; e.preventDefault(); if (sobre !== i) setSobre(i); }}
            onDrop={e => { e.preventDefault(); soltar(i); }}
            onDragEnd={() => { setArrastrando(null); setSobre(null); }}
            className={`group bg-zinc-950 border rounded-card px-2 py-2 flex items-start gap-2 transition-colors
              ${cancelada ? 'border-zinc-800 opacity-50' : p.estado === 'completada' ? 'border-green-900/60' : 'border-zinc-800'}
              ${arrastrando === i ? 'opacity-40' : ''}
              ${sobre === i && arrastrando !== i ? (arrastrando > i ? 'border-t-cyan-400 border-t-2' : 'border-b-cyan-400 border-b-2') : ''}
              ${puedeMover ? 'cursor-grab active:cursor-grabbing' : ''}`}>
            {editable && <GripVertical className={`w-4 h-4 mt-1 shrink-0 ${puedeMover ? 'text-zinc-600 group-hover:text-zinc-400' : 'text-transparent'}`} />}
            <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 ${FONDO_NUMERO[ev.clave]}`} title={ev.texto}>{cancelada ? '–' : n}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-tight">
                <span className="text-zinc-500 font-semibold">{etiquetaTipo(p.tipo)} · </span>
                <span className={p.estado === 'completada' ? 'text-green-400' : ''}>{p.proyectoId ? nombreObra(p.proyectoId) : (p.lugar || 'Sin nombre')}</span>
                {cancelada && <span className="text-zinc-500 font-normal"> · cancelada</span>}
              </div>
              {p.descripcion && <div className="text-xs text-zinc-400 mt-0.5">{p.descripcion}</div>}
              {p.notas && <div className="text-[11px] text-zinc-500 whitespace-pre-line mt-0.5">{p.notas}</div>}
              {(insignias.length > 0 || (d && d.tramoM != null)) && (
                <div className="flex gap-1 flex-wrap items-center mt-1">
                  {insignias.map((b, k) => <span key={k} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TONO_INSIGNIA[b.tono]}`}>{b.texto}</span>)}
                  {d && d.tramoM != null && !cancelada && <span className="text-[10px] text-zinc-500" title="Distancia en línea recta, solo orientativa">↳ {formatKm(d.tramoM)} · total {formatKm(d.acumM)}</span>}
                </div>
              )}
              {(p.docUrl || p.entregaFotoUrl || p.entregaFirmaUrl || p.recibidoPorNombre) && (
                <div className="flex gap-2 flex-wrap text-[11px] mt-1">
                  {p.docUrl && <a href={p.docUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">📄 {p.docNombre || 'Documento'}</a>}
                  {p.entregaFotoUrl && <a href={p.entregaFotoUrl} target="_blank" rel="noreferrer" className="text-green-400 hover:underline">📷 Foto de entrega</a>}
                  {p.entregaFirmaUrl && <a href={p.entregaFirmaUrl} target="_blank" rel="noreferrer" className="text-green-400 hover:underline">✍️ Firma</a>}
                  {p.recibidoPorNombre && <span className="text-zinc-500">recibió {p.recibidoPorNombre}</span>}
                </div>
              )}
              {/* confirmar "hecha desde oficina" en la misma fila */}
              {marcandoId === p.id && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[11px] text-zinc-400">¿Marcarla hecha desde la oficina?</span>
                  <button onClick={async () => { await onMarcarHecha(p); setMarcandoId(null); }} className="text-[11px] font-black bg-green-700 hover:bg-green-600 text-white px-2.5 py-1 rounded-card">Sí, hecha</button>
                  <button onClick={() => setMarcandoId(null)} className="text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {puedeMarcar && !cancelada && p.estado !== 'completada' && marcandoId !== p.id && (
                <button onClick={() => setMarcandoId(p.id)} title="Marcar hecha desde la oficina"
                  className="text-[11px] font-bold border border-zinc-700 hover:border-green-600 text-zinc-400 hover:text-green-300 px-1.5 py-1 rounded-card mr-1">✓ Hecha</button>
              )}
              {puedeMover && (
                <>
                  <button onClick={() => aplicar(moverEnLista(ids, i, i - 1))} disabled={i === 0} className="text-zinc-600 hover:text-white disabled:opacity-30 p-0.5" title="Subir"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => aplicar(moverEnLista(ids, i, i + 1))} disabled={i === ids.length - 1} className="text-zinc-600 hover:text-white disabled:opacity-30 p-0.5" title="Bajar"><ChevronDown className="w-4 h-4" /></button>
                  <button onClick={() => onQuitar(p)} className="text-zinc-600 hover:text-red-400 p-0.5" title="Quitar parada"><Trash2 className="w-4 h-4" /></button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
