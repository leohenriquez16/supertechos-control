'use client';

// v8.17.52 — Modal para reportar el avance del día en proyectos con
// tipoAvance='unidades'. Permite seleccionar fecha + cuántas unidades
// de cada tipo (baño, balcón, etc) se completaron ese día.
//
// Se usa desde:
//   - TabUnidades (botón "Reportar avance del día")
//   - Modal cerrar jornada (auto pre-pone la fecha de la jornada)

import React, { useState, useEffect } from 'react';
import { X, Loader2, Save, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';

const fechaIsoHoy = () => new Date().toISOString().split('T')[0];

export default function ModalReportarAvanceUnidades({ proyecto, usuario, fechaInicial, onCerrar, onReportado }) {
  const estructura = proyecto.estructuraUnidades || [];
  const [fecha, setFecha] = useState(fechaInicial || fechaIsoHoy());
  const [nota, setNota] = useState('');
  // cantidadPorEspacio = { [espacioId]: number }
  const [cantidades, setCantidades] = useState({});
  const [guardando, setGuardando] = useState(false);
  // Expandir/colapsar torres
  const [expandidos, setExpandidos] = useState(() => {
    const map = {};
    estructura.forEach(t => { map[t.id] = true; });
    return map;
  });

  const setCantidad = (espacioId, valor) => {
    const n = parseInt(valor) || 0;
    setCantidades(prev => {
      if (n <= 0) {
        const next = { ...prev };
        delete next[espacioId];
        return next;
      }
      return { ...prev, [espacioId]: n };
    });
  };

  // Total estimado
  const totalAReportar = Object.values(cantidades).reduce((s, n) => s + n, 0);

  const guardar = async () => {
    if (totalAReportar === 0) {
      toast.warning('No hay unidades para reportar. Pon una cantidad en al menos un espacio.');
      return;
    }
    setGuardando(true);
    try {
      // Construir array de avances
      const avances = [];
      estructura.forEach(torre => {
        (torre.niveles || []).forEach(nivel => {
          (nivel.espacios || []).forEach(esp => {
            const c = cantidades[esp.id];
            if (c && c > 0) {
              avances.push({
                torreId: torre.id,
                nivelId: nivel.id,
                espacioId: esp.id,
                tipo: esp.tipo,
                cantidad: c,
              });
            }
          });
        });
      });
      const resultados = await db.reportarAvanceDelDia({
        proyectoId: proyecto.id,
        fecha,
        avances,
        nota: nota || null,
        creadoPorId: usuario?.id || null,
      });
      toast.success(`${resultados.length} reporte${resultados.length !== 1 ? 's' : ''} guardado${resultados.length !== 1 ? 's' : ''} del ${fecha}`);
      if (onReportado) await onReportado(resultados);
      onCerrar();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-2xl w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Reportar avance del día
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{proyecto.cliente || proyecto.nombre}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Fecha + nota */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mb-1">Fecha</div>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mb-1">Nota (opcional)</div>
            <input
              type="text"
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Ej: solo cuarto piso, lluvia interrumpió"
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {/* Estructura: torres → niveles → espacios con inputs */}
        {estructura.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            Este proyecto no tiene estructura de unidades configurada todavía.
          </div>
        ) : (
          <div className="space-y-2">
            {estructura.map(torre => {
              const exp = expandidos[torre.id];
              const totalTorre = (torre.niveles || []).reduce((s, n) =>
                s + (n.espacios || []).reduce((se, e) => se + (cantidades[e.id] || 0), 0)
              , 0);
              return (
                <div key={torre.id} className="bg-zinc-950 border border-zinc-800 rounded-card">
                  <button
                    onClick={() => setExpandidos({ ...expandidos, [torre.id]: !exp })}
                    className="w-full p-2 flex items-center gap-2 text-left hover:bg-zinc-900"
                  >
                    {exp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <div className="flex-1">
                      <div className="font-bold text-sm">{torre.nombre}</div>
                      <div className="text-[10px] text-zinc-500">{(torre.niveles || []).length} niveles</div>
                    </div>
                    {totalTorre > 0 && (
                      <div className="text-xs font-black text-red-400">+{totalTorre}</div>
                    )}
                  </button>
                  {exp && (
                    <div className="p-2 border-t border-zinc-800 space-y-2">
                      {(torre.niveles || []).map(nivel => (
                        <div key={nivel.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-2">
                          <div className="text-xs font-bold mb-1.5">{nivel.nombre}</div>
                          {(nivel.espacios || []).length === 0 && (
                            <div className="text-[10px] text-zinc-600 text-center py-2 italic">Sin espacios en este nivel</div>
                          )}
                          {(nivel.espacios || []).map(esp => {
                            const restantes = Math.max(0, (esp.cantidad || 0) - (esp.completadas || 0));
                            const inputCant = cantidades[esp.id] || 0;
                            const maxPermitido = restantes;
                            const overflow = inputCant > maxPermitido && maxPermitido > 0;
                            return (
                              <div key={esp.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
                                <div className="flex-1 text-[11px]">
                                  <span className="font-bold capitalize">{esp.tipo}</span>
                                  <span className="text-zinc-500 ml-1">
                                    ({esp.completadas || 0}/{esp.cantidad || 0} completadas
                                    {restantes > 0 ? ` · faltan ${restantes}` : ' · ✅ completo'})
                                  </span>
                                </div>
                                <input
                                  type="number"
                                  min="0"
                                  max={maxPermitido}
                                  value={inputCant || ''}
                                  onChange={e => setCantidad(esp.id, e.target.value)}
                                  placeholder="0"
                                  disabled={maxPermitido === 0}
                                  className={`w-16 bg-zinc-950 border ${overflow ? 'border-orange-500' : 'border-zinc-700'} px-2 py-1 text-xs text-right disabled:opacity-50`}
                                />
                                <span className="text-[10px] text-zinc-500 w-12">hechas</span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {totalAReportar > 0 && (
          <div className="bg-green-900/20 border border-green-700 p-2 text-xs text-green-300 flex justify-between">
            <span>Total a reportar:</span>
            <span className="font-bold">{totalAReportar} unidad{totalAReportar !== 1 ? 'es' : ''}</span>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando || totalAReportar === 0}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1"
          >
            {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Guardar avance
          </button>
        </div>
      </div>
    </div>
  );
}
