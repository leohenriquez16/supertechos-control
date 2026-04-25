'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

export default function TabUnidades({ proyecto, onActualizarProyecto, esAdmin }) {
  const estructura = proyecto.estructuraUnidades || [];
  const [expandidos, setExpandidos] = useState({});
  const [editandoTorre, setEditandoTorre] = useState(null);
  const [editandoNivel, setEditandoNivel] = useState(null);
  const [editandoEspacio, setEditandoEspacio] = useState(null);

  const guardarEstructura = async (nueva) => {
    try {
      await onActualizarProyecto({ ...proyecto, estructuraUnidades: nueva });
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  const agregarTorre = () => {
    const nombre = prompt('Nombre de la torre (ej: Torre A):');
    if (!nombre) return;
    const nueva = [...estructura, { id: 't_' + Date.now(), nombre: nombre.trim(), niveles: [] }];
    guardarEstructura(nueva);
  };

  const eliminarTorre = (torreId) => {
    if (!confirm('¿Eliminar esta torre y todos sus niveles?')) return;
    guardarEstructura(estructura.filter(t => t.id !== torreId));
  };

  const agregarNivel = (torreId) => {
    const nombre = prompt('Nombre del nivel (ej: Nivel 1, PB, Azotea):');
    if (!nombre) return;
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: [...(t.niveles || []), { id: 'n_' + Date.now(), nombre: nombre.trim(), espacios: [] }] }
      : t
    );
    guardarEstructura(nueva);
  };

  const eliminarNivel = (torreId, nivelId) => {
    if (!confirm('¿Eliminar este nivel?')) return;
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: (t.niveles || []).filter(n => n.id !== nivelId) }
      : t
    );
    guardarEstructura(nueva);
  };

  const agregarEspacio = (torreId, nivelId) => {
    const tipo = prompt('Tipo de espacio (ej: baño, balcón, cocina, terraza):');
    if (!tipo) return;
    const cantidad = parseInt(prompt('Cantidad de este tipo en el nivel:') || '1');
    if (isNaN(cantidad) || cantidad < 1) return;
    const m2 = parseFloat(prompt('m² aproximado por unidad (opcional, enter para saltar):') || '0');
    const nuevo = { id: 'e_' + Date.now(), tipo: tipo.trim(), cantidad, completadas: 0, m2PorUnidad: m2 };
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: (t.niveles || []).map(n => n.id === nivelId
        ? { ...n, espacios: [...(n.espacios || []), nuevo] }
        : n
      )}
      : t
    );
    guardarEstructura(nueva);
  };

  const actualizarCompletadas = (torreId, nivelId, espacioId, completadas) => {
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: (t.niveles || []).map(n => n.id === nivelId
        ? { ...n, espacios: (n.espacios || []).map(e => e.id === espacioId
          ? { ...e, completadas: parseInt(completadas) || 0 }
          : e
        )}
        : n
      )}
      : t
    );
    guardarEstructura(nueva);
  };

  const eliminarEspacio = (torreId, nivelId, espacioId) => {
    if (!confirm('¿Eliminar este espacio?')) return;
    const nueva = estructura.map(t => t.id === torreId
      ? { ...t, niveles: (t.niveles || []).map(n => n.id === nivelId
        ? { ...n, espacios: (n.espacios || []).filter(e => e.id !== espacioId) }
        : n
      )}
      : t
    );
    guardarEstructura(nueva);
  };

  // Totales
  const totalUnidades = estructura.reduce((s, t) =>
    s + (t.niveles || []).reduce((sn, n) =>
      sn + (n.espacios || []).reduce((se, e) => se + e.cantidad, 0)
    , 0)
  , 0);
  const completadas = estructura.reduce((s, t) =>
    s + (t.niveles || []).reduce((sn, n) =>
      sn + (n.espacios || []).reduce((se, e) => se + e.completadas, 0)
    , 0)
  , 0);
  const pct = totalUnidades > 0 ? (completadas / totalUnidades) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Unidades del Proyecto</div>
          <div className="text-[11px] text-zinc-500">Edificios → Niveles → Espacios (baños, balcones, etc.)</div>
        </div>
        {esAdmin && (
          <button onClick={agregarTorre} className="bg-red-600 text-white font-bold uppercase px-3 py-1.5 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Torre</button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Avance</div>
          <div className="text-xl font-black">{pct.toFixed(1)}%</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Completadas</div>
          <div className="text-xl font-black text-green-400">{completadas}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total unidades</div>
          <div className="text-xl font-black">{totalUnidades}</div>
        </div>
      </div>

      {estructura.length === 0 && (
        <div className="text-center py-10 text-zinc-500 text-sm">
          Sin estructura aún.
          {esAdmin && <div className="text-[11px] mt-2">Click "+ Torre" arriba para agregar el primer edificio.</div>}
        </div>
      )}

      <div className="space-y-3">
        {estructura.map(torre => {
          const isExp = expandidos[torre.id] !== false;
          const nivelesTorre = torre.niveles || [];
          const unTorre = nivelesTorre.reduce((s, n) => s + (n.espacios || []).reduce((se, e) => se + e.cantidad, 0), 0);
          const comTorre = nivelesTorre.reduce((s, n) => s + (n.espacios || []).reduce((se, e) => se + e.completadas, 0), 0);
          const pctTorre = unTorre > 0 ? (comTorre / unTorre) * 100 : 0;
          return (
            <div key={torre.id} className="bg-zinc-900 border border-zinc-800">
              <div className="p-3 flex items-center gap-2 border-b border-zinc-800 bg-zinc-950">
                <button onClick={() => setExpandidos({ ...expandidos, [torre.id]: !isExp })} className="text-zinc-400">
                  {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className="flex-1">
                  <div className="font-bold text-sm">{torre.nombre}</div>
                  <div className="text-[10px] text-zinc-500">{nivelesTorre.length} niveles · {comTorre}/{unTorre} unidades · {pctTorre.toFixed(0)}%</div>
                </div>
                {esAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => agregarNivel(torre.id)} className="text-zinc-400 hover:text-red-500 p-1 text-xs"><Plus className="w-3 h-3 inline" /> nivel</button>
                    <button onClick={() => eliminarTorre(torre.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                  </div>
                )}
              </div>

              {isExp && (
                <div className="p-3 space-y-2">
                  {nivelesTorre.length === 0 && (
                    <div className="text-center py-4 text-[11px] text-zinc-600">Sin niveles. {esAdmin && 'Agrega uno.'}</div>
                  )}
                  {nivelesTorre.map(nivel => {
                    const espacios = nivel.espacios || [];
                    const unNivel = espacios.reduce((s, e) => s + e.cantidad, 0);
                    const comNivel = espacios.reduce((s, e) => s + e.completadas, 0);
                    const pctNivel = unNivel > 0 ? (comNivel / unNivel) * 100 : 0;
                    return (
                      <div key={nivel.id} className="bg-zinc-950 border border-zinc-800 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1">
                            <div className="font-bold text-xs">{nivel.nombre}</div>
                            <div className="text-[10px] text-zinc-500">{comNivel}/{unNivel} · {pctNivel.toFixed(0)}%</div>
                          </div>
                          {esAdmin && (
                            <div className="flex gap-1">
                              <button onClick={() => agregarEspacio(torre.id, nivel.id)} className="text-zinc-400 hover:text-red-500 text-[10px]"><Plus className="w-3 h-3 inline" /> espacio</button>
                              <button onClick={() => eliminarNivel(torre.id, nivel.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          )}
                        </div>
                        {espacios.length === 0 && (
                          <div className="text-[10px] text-zinc-600 text-center py-2">Sin espacios en este nivel</div>
                        )}
                        <div className="space-y-1">
                          {espacios.map(esp => (
                            <div key={esp.id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2">
                              <div className="flex-1 text-[11px]">
                                <span className="font-bold capitalize">{esp.tipo}</span>
                                {esp.m2PorUnidad > 0 && <span className="text-zinc-500 ml-2">({esp.m2PorUnidad} m²/u)</span>}
                              </div>
                              <input
                                type="number"
                                min="0"
                                max={esp.cantidad}
                                value={esp.completadas}
                                onChange={e => actualizarCompletadas(torre.id, nivel.id, esp.id, e.target.value)}
                                disabled={!esAdmin}
                                className="w-14 bg-zinc-950 border border-zinc-700 px-1 py-0.5 text-xs text-center"
                              />
                              <span className="text-[10px] text-zinc-500">/ {esp.cantidad}</span>
                              <div className="w-16 bg-zinc-800 h-1.5">
                                <div className="bg-green-500 h-full" style={{ width: `${esp.cantidad > 0 ? (esp.completadas / esp.cantidad) * 100 : 0}%` }}></div>
                              </div>
                              {esAdmin && (
                                <button onClick={() => eliminarEspacio(torre.id, nivel.id, esp.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
