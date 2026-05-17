'use client';

// v8.17.62: Lista de herramientas del proyecto.
// Combina las listas que Miguel cargó en cada sistema usado por el proyecto.
// Suma cantidades cuando el mismo nombre aparece en varios sistemas (case-insensitive).
// Permite editar antes de enviar (admin puede ajustar quantities) y enviar por
// WhatsApp con un link wa.me/ + mensaje pre-armado.

import React, { useMemo, useState } from 'react';
import { X, MessageCircle, Wrench } from 'lucide-react';

export default function ModalListaHerramientas({ proyecto, sistemas, onCerrar }) {
  // Sistemas usados por el proyecto: areas con su sistemaId distinto, fallback a proyecto.sistema
  const sistemasUsados = useMemo(() => {
    const ids = new Set();
    (proyecto.areas || []).forEach(a => { if (a.sistemaId) ids.add(a.sistemaId); });
    if (proyecto.sistema) ids.add(proyecto.sistema);
    return Array.from(ids).map(id => sistemas[id]).filter(Boolean);
  }, [proyecto, sistemas]);

  // Lista combinada inicial: merge por nombre normalizado
  const listaInicial = useMemo(() => {
    const acumulado = new Map(); // key: nombre.toLowerCase().trim()
    sistemasUsados.forEach(s => {
      (s.herramientas || []).forEach(h => {
        const nombre = (h.nombre || '').trim();
        if (!nombre) return;
        const key = nombre.toLowerCase();
        const cantidadNum = Number(h.cantidad) || 0;
        if (acumulado.has(key)) {
          const prev = acumulado.get(key);
          acumulado.set(key, {
            ...prev,
            cantidad: prev.cantidad + cantidadNum,
            sistemas: [...prev.sistemas, s.nombre],
          });
        } else {
          acumulado.set(key, {
            id: 'h_' + key.replace(/\W+/g, '_'),
            nombre,
            cantidad: cantidadNum,
            unidad: h.unidad || '',
            notas: h.notas || '',
            sistemas: [s.nombre],
          });
        }
      });
    });
    return Array.from(acumulado.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [sistemasUsados]);

  const [items, setItems] = useState(listaInicial);

  const editar = (i, campo, valor) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it));
  };
  const eliminar = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const agregar = () => {
    setItems(prev => [...prev, { id: 'h_manual_' + Date.now(), nombre: '', cantidad: '', unidad: '', notas: '', sistemas: [] }]);
  };

  // Texto pre-armado para WhatsApp
  const textoWhatsApp = useMemo(() => {
    const lineas = [
      `🔧 *Lista de herramientas — ${proyecto.referenciaOdoo || proyecto.cliente || ''}*`,
      proyecto.referenciaProyecto || proyecto.nombre || '',
      '',
    ];
    items.forEach(it => {
      if (!it.nombre) return;
      const qty = it.cantidad ? `${it.cantidad}${it.unidad ? ' ' + it.unidad : ''} · ` : '';
      lineas.push(`• ${qty}${it.nombre}${it.notas ? ` _(${it.notas})_` : ''}`);
    });
    return lineas.filter(l => l !== null).join('\n');
  }, [items, proyecto]);

  const enviarWhatsApp = () => {
    // Link genérico wa.me sin número específico → WhatsApp abre con el mensaje
    // y el usuario elige el grupo/contacto destino manualmente.
    const url = `https://wa.me/?text=${encodeURIComponent(textoWhatsApp)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onCerrar}>
      <div
        className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-3xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 1rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5 flex-shrink-0 bg-zinc-900">
          <div className="font-black uppercase tracking-wider text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4 text-red-500" /> Lista de herramientas
          </div>
          <button onClick={onCerrar} className="bg-zinc-800 hover:bg-red-600 text-white px-3 py-2 text-xs font-black uppercase flex items-center gap-1">
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-[11px] text-zinc-500">
            Combinado de los sistemas usados en este proyecto: <span className="text-zinc-300">{sistemasUsados.map(s => s.nombre).join(', ') || 'ninguno'}</span>.
            Editá las cantidades si necesitás y enviá la lista al grupo del proyecto por WhatsApp.
          </div>

          {items.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-xs">
              Los sistemas de este proyecto no tienen herramientas cargadas. Pedile a Miguel que las cargue en el módulo Sistemas.
            </div>
          )}

          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800">
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="py-1 text-left">Herramienta</th>
                  <th className="py-1 text-right w-20">Cant.</th>
                  <th className="py-1 text-left w-20">Unidad</th>
                  <th className="py-1 text-left">Notas</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className="border-b border-zinc-900">
                    <td className="py-1.5 pr-2">
                      <input value={it.nombre} onChange={e => editar(i, 'nombre', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-white text-xs" />
                      {it.sistemas?.length > 1 && (
                        <div className="text-[9px] text-zinc-600 mt-0.5">de: {it.sistemas.join(' + ')}</div>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" value={it.cantidad} onChange={e => editar(i, 'cantidad', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-white text-xs text-right tabular-nums" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input value={it.unidad} onChange={e => editar(i, 'unidad', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-white text-xs" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input value={it.notas} onChange={e => editar(i, 'notas', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-white text-xs" />
                    </td>
                    <td className="py-1.5">
                      <button onClick={() => eliminar(i)} className="text-zinc-500 hover:text-red-400 text-xs">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button onClick={agregar} className="text-xs text-red-500 flex items-center gap-1">+ Agregar herramienta</button>

          {/* Preview del mensaje WhatsApp */}
          {items.length > 0 && (
            <div className="border border-zinc-800 bg-zinc-950 p-3 mt-3">
              <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Vista previa del mensaje</div>
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-sans">{textoWhatsApp}</pre>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-zinc-800 px-3 py-2.5 flex items-center justify-between gap-2 flex-shrink-0 bg-zinc-950">
          <div className="text-[10px] text-zinc-500">
            {items.filter(it => it.nombre).length} herramienta{items.filter(it => it.nombre).length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={enviarWhatsApp}
            disabled={items.filter(it => it.nombre).length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center gap-1"
          >
            <MessageCircle className="w-3 h-3" /> Enviar por WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
