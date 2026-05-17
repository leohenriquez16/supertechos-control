'use client';

// v8.17.62 (orig) — Lista de herramientas del proyecto.
// v8.17.65: ahora también incluye MATERIALES calculados con las fórmulas
// de rendimiento del sistema (sistema.materiales[].rinde_m2). Tabs:
//   - Herramientas: lo cargado por Miguel en cada sistema, merge por nombre.
//   - Materiales: cantidad calculada por área (m² del área / rinde_m2).
// Ambos tabs comparten el botón "Enviar por WhatsApp" — el mensaje incluye
// SOLO el tab activo (para no mandar un texto gigante con todo).

import React, { useMemo, useState } from 'react';
import { X, MessageCircle, Wrench, Package } from 'lucide-react';

export default function ModalListaHerramientas({ proyecto, sistemas, onCerrar }) {
  const [tab, setTab] = useState('herramientas');

  // Sistemas usados por el proyecto: areas con su sistemaId distinto, fallback a proyecto.sistema
  const sistemasUsados = useMemo(() => {
    const ids = new Set();
    (proyecto.areas || []).forEach(a => { if (a.sistemaId) ids.add(a.sistemaId); });
    if (proyecto.sistema) ids.add(proyecto.sistema);
    return Array.from(ids).map(id => sistemas[id]).filter(Boolean);
  }, [proyecto, sistemas]);

  // === HERRAMIENTAS ===
  const herramientasIniciales = useMemo(() => {
    const acumulado = new Map();
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

  // === MATERIALES (calculados con fórmulas de rendimiento) ===
  // Para cada área del proyecto: usar su sistemaId, iterar sus materiales,
  // sumar `area.m2 / rinde_m2` (rinde_m2 = m² que rinde una unidad).
  // Materiales con modo_consumo='reportado' los marcamos como tal (se sabrá al final).
  const materialesIniciales = useMemo(() => {
    const acumulado = new Map();
    (proyecto.areas || []).forEach(area => {
      const sistemaIdArea = area.sistemaId || proyecto.sistema;
      const sistema = sistemas[sistemaIdArea];
      if (!sistema) return;
      const m2 = Number(area.m2) || 0;
      if (m2 <= 0) return;
      (sistema.materiales || []).forEach(mat => {
        const nombre = (mat.nombre || '').trim();
        if (!nombre) return;
        const rinde = Number(mat.rinde_m2) || 0;
        // Si rinde_m2 = 0 evitamos /0 — dejamos cantidad en 0 y lo marcamos como "revisar".
        const cantidad = rinde > 0 ? m2 / rinde : 0;
        const key = nombre.toLowerCase();
        if (acumulado.has(key)) {
          const prev = acumulado.get(key);
          acumulado.set(key, {
            ...prev,
            cantidad: prev.cantidad + cantidad,
            sistemas: prev.sistemas.includes(sistema.nombre) ? prev.sistemas : [...prev.sistemas, sistema.nombre],
            areas: [...prev.areas, area.nombre],
            necesitaRevisar: prev.necesitaRevisar || rinde <= 0,
          });
        } else {
          acumulado.set(key, {
            id: 'm_' + key.replace(/\W+/g, '_'),
            nombre,
            cantidad,
            unidad: cantidad === 1 ? (mat.unidad || '') : (mat.unidad_plural || mat.unidad || ''),
            unidadSingular: mat.unidad || '',
            unidadPlural: mat.unidad_plural || mat.unidad || '',
            modoConsumo: mat.modo_consumo || 'calculado',
            sistemas: [sistema.nombre],
            areas: [area.nombre],
            necesitaRevisar: rinde <= 0,
          });
        }
      });
    });
    // Redondear hacia arriba (no podés comprar 2.3 cubetas)
    return Array.from(acumulado.values())
      .map(it => ({ ...it, cantidad: Math.ceil(it.cantidad * 100) / 100 }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [proyecto, sistemas, sistemasUsados]);

  const [herramientas, setHerramientas] = useState(herramientasIniciales);
  const [materiales, setMateriales] = useState(materialesIniciales);

  // Helpers genéricos
  const editar = (lista, setLista, i, campo, valor) => setLista(prev => prev.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it));
  const eliminar = (setLista, i) => setLista(prev => prev.filter((_, idx) => idx !== i));
  const agregarHerramienta = () => setHerramientas(prev => [...prev, { id: 'h_manual_' + Date.now(), nombre: '', cantidad: '', unidad: '', notas: '', sistemas: [] }]);
  const agregarMaterial = () => setMateriales(prev => [...prev, { id: 'm_manual_' + Date.now(), nombre: '', cantidad: '', unidad: '', sistemas: [], areas: [] }]);

  // Texto WhatsApp depende del tab
  const textoWhatsApp = useMemo(() => {
    const titulo = tab === 'herramientas' ? '🔧 *Lista de herramientas' : '📦 *Materiales';
    const lineas = [
      `${titulo} — ${proyecto.referenciaOdoo || proyecto.cliente || ''}*`,
      proyecto.referenciaProyecto || proyecto.nombre || '',
      '',
    ];
    const items = tab === 'herramientas' ? herramientas : materiales;
    items.forEach(it => {
      if (!it.nombre) return;
      const qty = it.cantidad ? `${it.cantidad}${it.unidad ? ' ' + it.unidad : ''} · ` : '';
      const extras = tab === 'herramientas'
        ? (it.notas ? ` _(${it.notas})_` : '')
        : '';
      lineas.push(`• ${qty}${it.nombre}${extras}`);
    });
    return lineas.join('\n');
  }, [tab, herramientas, materiales, proyecto]);

  const enviarWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(textoWhatsApp)}`;
    window.open(url, '_blank');
  };

  const items = tab === 'herramientas' ? herramientas : materiales;
  const setItems = tab === 'herramientas' ? setHerramientas : setMateriales;
  const agregar = tab === 'herramientas' ? agregarHerramienta : agregarMaterial;
  const totalConNombre = items.filter(it => it.nombre).length;

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
            <Wrench className="w-4 h-4 text-red-500" /> Lista de obra
          </div>
          <button onClick={onCerrar} className="bg-zinc-800 hover:bg-red-600 text-white px-3 py-2 text-xs font-black uppercase flex items-center gap-1">
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        {/* TABS */}
        <div className="flex border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
          <button
            onClick={() => setTab('herramientas')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${tab === 'herramientas' ? 'bg-zinc-900 text-red-400 border-b-2 border-red-600' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Wrench className="w-3 h-3" /> Herramientas <span className="text-zinc-600">({herramientas.length})</span>
          </button>
          <button
            onClick={() => setTab('materiales')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${tab === 'materiales' ? 'bg-zinc-900 text-red-400 border-b-2 border-red-600' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Package className="w-3 h-3" /> Materiales <span className="text-zinc-600">({materiales.length})</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-[11px] text-zinc-500">
            {tab === 'herramientas' ? (
              <>Combinado de los sistemas usados en este proyecto: <span className="text-zinc-300">{sistemasUsados.map(s => s.nombre).join(', ') || 'ninguno'}</span>. Editá las cantidades si necesitás y enviá la lista al grupo del proyecto por WhatsApp.</>
            ) : (
              <>Calculado automáticamente: <span className="text-zinc-300">m² del área ÷ rinde_m2 de cada material</span>. Las cantidades se redondean. Materiales marcados como "reportado" se confirman al cierre del proyecto.</>
            )}
          </div>

          {items.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-xs">
              {tab === 'herramientas'
                ? 'Los sistemas de este proyecto no tienen herramientas cargadas. Pedile a Miguel que las cargue en el módulo Sistemas.'
                : 'Los sistemas de este proyecto no tienen materiales cargados, o las áreas no tienen m². Verificá en el módulo Sistemas.'
              }
            </div>
          )}

          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800">
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="py-1 text-left">{tab === 'herramientas' ? 'Herramienta' : 'Material'}</th>
                  <th className="py-1 text-right w-20">Cant.</th>
                  <th className="py-1 text-left w-20">Unidad</th>
                  {tab === 'herramientas' ? <th className="py-1 text-left">Notas</th> : <th className="py-1 text-left">Modo</th>}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className="border-b border-zinc-900">
                    <td className="py-1.5 pr-2">
                      <input value={it.nombre} onChange={e => editar(items, setItems, i, 'nombre', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-white text-xs" />
                      {(it.sistemas?.length > 1 || it.areas?.length > 1) && (
                        <div className="text-[9px] text-zinc-600 mt-0.5">
                          {it.sistemas?.length > 1 && `sist: ${it.sistemas.join(' + ')}`}
                          {it.areas?.length > 1 && (it.sistemas?.length > 1 ? ' · ' : '') + `áreas: ${it.areas.join(' + ')}`}
                        </div>
                      )}
                      {it.necesitaRevisar && (
                        <div className="text-[9px] text-amber-400 mt-0.5">⚠ rinde_m2 = 0 — cargar en el sistema</div>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" value={it.cantidad} onChange={e => editar(items, setItems, i, 'cantidad', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-white text-xs text-right tabular-nums" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input value={it.unidad} onChange={e => editar(items, setItems, i, 'unidad', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-white text-xs" />
                    </td>
                    <td className="py-1.5 pr-2">
                      {tab === 'herramientas' ? (
                        <input value={it.notas || ''} onChange={e => editar(items, setItems, i, 'notas', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-white text-xs" />
                      ) : (
                        <span className={`text-[10px] uppercase font-bold ${it.modoConsumo === 'reportado' ? 'text-yellow-400' : 'text-zinc-500'}`}>{it.modoConsumo || '—'}</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      <button onClick={() => eliminar(setItems, i)} className="text-zinc-500 hover:text-red-400 text-xs">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button onClick={agregar} className="text-xs text-red-500 flex items-center gap-1">+ Agregar {tab === 'herramientas' ? 'herramienta' : 'material'}</button>

          {items.length > 0 && (
            <div className="border border-zinc-800 bg-zinc-950 p-3 mt-3">
              <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Vista previa del mensaje ({tab})</div>
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-sans">{textoWhatsApp}</pre>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-zinc-800 px-3 py-2.5 flex items-center justify-between gap-2 flex-shrink-0 bg-zinc-950">
          <div className="text-[10px] text-zinc-500">
            {totalConNombre} {tab === 'herramientas' ? 'herramienta' : 'material'}{totalConNombre !== 1 ? 's' : ''}
          </div>
          <button
            onClick={enviarWhatsApp}
            disabled={totalConNombre === 0}
            className="bg-green-600 hover:bg-green-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center gap-1"
          >
            <MessageCircle className="w-3 h-3" /> Enviar {tab} por WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
