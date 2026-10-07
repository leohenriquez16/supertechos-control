'use client';

// v8.59.8 — Precio ajustado en la obra: monto total acordado con el maestro y avance manual (%).
// La nómina paga en cada corte: monto × (avance al cierre − avance antes del corte).
// Solo admin pone montos y avances; el % solo sube, no pasa de 100 y queda quién y cuándo.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import * as db from '../../lib/db';
import { pctAl, validarNuevoAvance } from '../../lib/helpers/precioAjustado';
import { formatRD } from '../../lib/helpers/formato';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

export default function PreciosAjustadosObra({ proyecto, personal = [], usuario, candidatosIds = [], puedeEditar = false }) {
  const [costos, setCostos] = useState(null);
  const [avances, setAvances] = useState([]);
  const [nuevo, setNuevo] = useState(null);        // { personaId, monto }
  const [avanceDe, setAvanceDe] = useState(null);  // personaId con el formulario de avance abierto
  const [pct, setPct] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      const [c, a] = await Promise.all([db.listarCostosDia(proyecto.id), db.listarAvancesAjustados(proyecto.id)]);
      setCostos(c); setAvances(a);
    } catch { setCostos([]); }
  };
  useEffect(() => { if (proyecto?.id) cargar(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const ajustados = useMemo(() => (costos || []).filter(c => c.modoPago === 'ajustado'), [costos]);
  const nombre = (id) => personal.find(p => p.id === id)?.nombre || 'Persona';
  const candidatos = useMemo(() => {
    const ya = new Set(ajustados.map(a => a.personaId));
    return [...new Set([proyecto.maestroId, ...candidatosIds].filter(Boolean))].filter(id => !ya.has(id));
  }, [ajustados, candidatosIds, proyecto.maestroId]);

  if (!costos) return null;
  if (!ajustados.length && !puedeEditar) return null;

  const guardarNuevo = async () => {
    if (!nuevo?.personaId) { setError('Elige a quién.'); return; }
    if (!(Number(nuevo.monto) > 0)) { setError('Pon el monto total acordado.'); return; }
    setGuardando(true); setError('');
    try {
      await db.guardarPagoPersonaProyecto(proyecto.id, nuevo.personaId, { modoPago: 'ajustado', montoAjustado: Number(nuevo.monto) });
      setNuevo(null); await cargar();
    } catch (e) { setError(e?.message || String(e)); }
    setGuardando(false);
  };

  const guardarAvance = async (personaId) => {
    const avs = avances.filter(a => a.personaId === personaId);
    const problema = validarNuevoAvance(avs, pct);
    if (problema) { setError(problema); return; }
    setGuardando(true); setError('');
    try {
      await db.registrarAvanceAjustado({ proyectoId: proyecto.id, personaId, pct: Number(pct), nota, usuario });
      setAvanceDe(null); setPct(''); setNota(''); await cargar();
    } catch (e) { setError(e?.message || String(e)); }
    setGuardando(false);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] tracking-widest uppercase text-amber-400 font-bold">Precio ajustado</div>
          <div className="text-[10px] text-zinc-500">Monto total acordado; cada corte paga lo que subió el avance.</div>
        </div>
        {puedeEditar && !nuevo && candidatos.length > 0 && (
          <button onClick={() => { setNuevo({ personaId: candidatos[0], monto: '' }); setError(''); }}
            className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-card bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar</button>
        )}
      </div>

      {ajustados.map(a => {
        const avs = avances.filter(x => x.personaId === a.personaId);
        const actual = pctAl(avs, hoyRD());
        const pagado = Math.round((a.montoAjustado || 0) * actual) / 100;
        const ultimo = avs[avs.length - 1];
        return (
          <div key={a.personaId} className="border border-zinc-800 rounded-card p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">{nombre(a.personaId)}</div>
                <div className="text-[10px] text-zinc-500 tabular-nums">Acordado {formatRD(a.montoAjustado || 0)} · lleva {formatRD(pagado)}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black tabular-nums text-amber-300">{actual}%</div>
                {ultimo && <div className="text-[9px] text-zinc-500">{ultimo.fecha} · {ultimo.registradoPorNombre}</div>}
              </div>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${actual}%` }} /></div>
            {!(a.montoAjustado > 0) && <div className="text-[10px] text-red-400">Falta el monto acordado: cobraría RD$0.</div>}
            {puedeEditar && avanceDe !== a.personaId && actual < 100 && (
              <button onClick={() => { setAvanceDe(a.personaId); setPct(''); setNota(''); setError(''); }} className="text-[11px] underline text-amber-300">Actualizar avance</button>
            )}
            {avanceDe === a.personaId && (
              <div className="flex flex-wrap items-center gap-2">
                <input type="number" inputMode="decimal" min={actual} max="100" value={pct} onChange={e => setPct(e.target.value)} placeholder={`más de ${actual}`}
                  className="w-24 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1 text-sm text-white" />
                <span className="text-xs text-zinc-400">%</span>
                <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional)" className="flex-1 min-w-[120px] bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1 text-xs text-white" />
                <button onClick={() => guardarAvance(a.personaId)} disabled={guardando} className="bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-black uppercase px-3 py-1.5 rounded-card flex items-center gap-1">
                  {guardando && <Loader2 className="w-3 h-3 animate-spin" />} Guardar
                </button>
                <button onClick={() => setAvanceDe(null)} className="text-zinc-500"><X className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        );
      })}

      {nuevo && (
        <div className="border border-amber-800 rounded-card p-2 space-y-2">
          <select value={nuevo.personaId} onChange={e => setNuevo({ ...nuevo, personaId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-xs text-white">
            {candidatos.map(id => <option key={id} value={id}>{nombre(id)}{id === proyecto.maestroId ? ' (maestro de la obra)' : ''}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">RD$</span>
            <input type="number" inputMode="decimal" min="0" value={nuevo.monto} onChange={e => setNuevo({ ...nuevo, monto: e.target.value })} placeholder="Monto total acordado"
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-sm text-white" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setNuevo(null)} className="px-3 py-1.5 text-[11px] font-bold uppercase bg-zinc-800 text-zinc-300 rounded-card">Cancelar</button>
            <button onClick={guardarNuevo} disabled={guardando} className="flex-1 py-1.5 text-[11px] font-black uppercase bg-amber-500 hover:bg-amber-400 text-black rounded-card flex items-center justify-center gap-1">
              {guardando && <Loader2 className="w-3 h-3 animate-spin" />} Guardar precio ajustado
            </button>
          </div>
        </div>
      )}

      {!ajustados.length && !nuevo && <div className="text-[11px] text-zinc-500">Nadie cobra por precio ajustado en esta obra.</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
