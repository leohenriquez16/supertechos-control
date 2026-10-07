'use client';

// v8.59.7 — Aviso en la Jornada de la obra: personas que trabajaron y les toca cobrar por día
// sin monto (cobrarían RD$0). La oficina (admin) lo resuelve aquí mismo en un paso; el
// supervisor en campo solo ve el aviso: el salario lo fija la oficina, no el campo.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import * as db from '../../lib/db';
import { personasSinFormaDePago } from '../../lib/helpers/formaPago';

export default function AvisoFormaPago({ proyecto, personal = [], personasIds = [], puedeConfigurar = false }) {
  const [costos, setCostos] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    try { setCostos(await db.listarCostosDia(proyecto.id)); } catch { setCostos([]); }
  };
  useEffect(() => { if (proyecto?.id) cargar(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const faltan = useMemo(
    () => (costos ? personasSinFormaDePago(proyecto, personasIds, costos) : []),
    [costos, proyecto, personasIds]
  );
  if (!faltan.length) return null;
  const nombre = (id) => personal.find(p => p.id === id)?.nombre || 'Persona';

  const abrir = () => {
    setForm(Object.fromEntries(faltan.map(f => [f.personaId, { modo: 'dia', monto: '' }])));
    setError(''); setAbierto(true);
  };

  const guardar = async () => {
    const filas = Object.entries(form);
    const sinMonto = filas.find(([, v]) => (v.modo === 'dia' || v.modo === 'ajustado') && !(Number(v.monto) > 0));
    if (sinMonto) { setError(`Pon el monto de ${nombre(sinMonto[0])}.`); return; }
    setGuardando(true); setError('');
    try {
      for (const [pid, v] of filas) {
        if (v.modo === 'dia') await db.guardarPagoPersonaProyecto(proyecto.id, pid, { costoDia: Number(v.monto) });
        else if (v.modo === 'ajustado') await db.guardarPagoPersonaProyecto(proyecto.id, pid, { modoPago: 'ajustado', montoAjustado: Number(v.monto) });
        else await db.guardarPagoPersonaProyecto(proyecto.id, pid, { modoPago: 'maestro', costoDia: null });
      }
      await cargar();
      setAbierto(false);
    } catch (e) { setError('No se pudo guardar: ' + (e?.message || e)); }
    setGuardando(false);
  };

  return (
    <>
      <div className="bg-amber-950/40 border border-amber-700 rounded-card px-3 py-2 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0 text-xs text-amber-100">
          <b>{faltan.length} {faltan.length === 1 ? 'persona cobra' : 'personas cobran'} por día sin monto</b> en esta obra
          <span className="text-amber-300/80"> · {faltan.map(f => nombre(f.personaId)).join(', ')}</span>
          {!puedeConfigurar && <div className="text-[10px] text-amber-300/70">La oficina debe ponerle el monto antes del corte.</div>}
        </div>
        {puedeConfigurar && (
          <button onClick={abrir} className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-black uppercase px-3 py-1.5 rounded-card">Configurar</button>
        )}
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={() => !guardando && setAbierto(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-md p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-black uppercase tracking-wider">¿Cómo se les paga en esta obra?</div>
              <button onClick={() => setAbierto(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-[11px] text-zinc-500">{[proyecto.referenciaOdoo, proyecto.cliente || proyecto.nombre].filter(Boolean).join(' · ')}</div>
            {faltan.map(f => {
              const v = form[f.personaId] || { modo: 'dia', monto: '' };
              const set = (patch) => setForm({ ...form, [f.personaId]: { ...v, ...patch } });
              return (
                <div key={f.personaId} className="border border-zinc-800 rounded-card p-2 space-y-2">
                  <div className="text-xs font-bold">{nombre(f.personaId)} {f.esMaestro && <span className="text-[9px] text-sky-400 ml-1">MAESTRO</span>}</div>
                  <div className="flex gap-1">
                    <button onClick={() => set({ modo: 'dia' })} className={`flex-1 text-[11px] font-bold py-1.5 rounded-card border ${v.modo === 'dia' ? 'bg-red-600 border-red-600 text-white' : 'border-zinc-700 text-zinc-400'}`}>Por día</button>
                    <button onClick={() => set({ modo: 'ajustado' })} className={`flex-1 text-[11px] font-bold py-1.5 rounded-card border ${v.modo === 'ajustado' ? 'bg-red-600 border-red-600 text-white' : 'border-zinc-700 text-zinc-400'}`}>Precio ajustado</button>
                    {!f.esMaestro && (
                      <button onClick={() => set({ modo: 'maestro' })} className={`flex-1 text-[11px] font-bold py-1.5 rounded-card border ${v.modo === 'maestro' ? 'bg-red-600 border-red-600 text-white' : 'border-zinc-700 text-zinc-400'}`}>Lo paga su maestro</button>
                    )}
                  </div>
                  {(v.modo === 'dia' || v.modo === 'ajustado') && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">RD$</span>
                      <input type="number" inputMode="decimal" min="0" value={v.monto} onChange={e => set({ monto: e.target.value })}
                        placeholder={v.modo === 'ajustado' ? 'Monto total acordado' : 'Monto por día'} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-sm text-white" />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="text-[10px] text-zinc-500">Si la obra se paga por m², cambia el modo de pago en la ficha de la obra; este aviso desaparece solo.</div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button onClick={guardar} disabled={guardando} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black uppercase py-2.5 text-xs rounded-card flex items-center justify-center gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
