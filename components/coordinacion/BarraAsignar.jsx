'use client';

// v8.95.0 — Barra de acciones en lote de la Coordinación: aparece cuando hay oficinas seleccionadas.
// «Asignar y programar» (técnico + día + franja), «Confirmado con la oficina», «Quitar asignación», «Limpiar».
// El modal de asignar también se abre desde afuera (Reprogramar, Agenda) con `preset` ({ personaId, fecha, franja, n }).

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CheckCircle2, UserMinus, X, Loader2 } from 'lucide-react';
import { asignarOficinas, confirmarCitaOficinas } from '../../lib/surveys';
import { FRANJAS, cargaDelDia, diaCorto, hoyRD, estadoOficina } from '../../lib/helpers/coordinacion';

export default function BarraAsignar({ seleccionadas = [], todas = [], tecnicos = [], usuario, preset, onHecho, onLimpiar }) {
  const [modal, setModal] = useState(false);
  const [personaId, setPersonaId] = useState('');
  const [fecha, setFecha] = useState(hoyRD());
  const [franja, setFranja] = useState('manana');
  const [guardando, setGuardando] = useState(false);

  // Abrir el modal desde afuera (Reprogramar / Agenda).
  useEffect(() => {
    if (!preset) return;
    setPersonaId(preset.personaId || '');
    setFecha(preset.fecha || hoyRD());
    setFranja(preset.franja || 'manana');
    setModal(true);
  }, [preset]);

  const ids = useMemo(() => new Set(seleccionadas.map((s) => s.id)), [seleccionadas]);
  // Si el técnico de la oficina no está en el equipo visible, igual se ofrece (para reprogramar sin cambiarlo).
  const fuera = personaId && !tecnicos.some((t) => t.id === personaId)
    ? { id: personaId, nombre: todas.find((s) => s.asignado_a_id === personaId)?.asignado_a_nombre || personaId } : null;
  const opciones = fuera ? [...tecnicos, fuera] : tecnicos;
  const persona = opciones.find((t) => t.id === personaId);
  // Carga del técnico ese día sin contar las que se están moviendo.
  const carga = personaId && fecha ? cargaDelDia(todas.filter((s) => !ids.has(s.id)), personaId, fecha) : 0;
  const yaLevantadas = seleccionadas.filter((s) => ['en_sitio', 'falta_info', 'devuelta', 'por_revisar', 'validada'].includes(estadoOficina(s))).length;
  const conTecnico = seleccionadas.filter((s) => s.asignado_a_id);

  const correr = async (fn) => {
    setGuardando(true);
    try { await fn(); setModal(false); await onHecho?.(); }
    catch (e) { alert('No se pudo guardar: ' + (e?.message || e)); }
    setGuardando(false);
  };

  const asignar = () => {
    if (!personaId) return alert('Elige el técnico.');
    if (!fecha) return alert('Elige el día.');
    correr(() => asignarOficinas(seleccionadas, { personaId, nombre: persona?.nombre || null, fecha, franja, por: usuario?.nombre || null }));
  };
  const confirmar = () => {
    if (!conTecnico.length) return alert('Ninguna de las seleccionadas tiene técnico y día. Asígnalas primero.');
    correr(() => confirmarCitaOficinas(conTecnico.map((s) => s.id), usuario?.nombre || null, true));
  };
  const quitar = () => {
    if (!confirm(`¿Quitar técnico y día a ${seleccionadas.length} oficina${seleccionadas.length !== 1 ? 's' : ''}?`)) return;
    correr(() => asignarOficinas(seleccionadas, { personaId: null, por: usuario?.nombre || null }));
  };

  if (!seleccionadas.length && !modal) return null;
  const n = seleccionadas.length;

  return (
    <>
      {n > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-3xl">
          <div className="bg-zinc-900 border border-zinc-700 shadow-2xl rounded-card px-3 py-2.5 flex flex-wrap items-center gap-2">
            <div className="text-sm font-black text-white mr-auto">{n} seleccionada{n !== 1 ? 's' : ''}</div>
            <button onClick={() => { setPersonaId(seleccionadas.length === 1 ? (seleccionadas[0].asignado_a_id || '') : ''); setModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold">
              <CalendarPlus className="w-4 h-4" /> Asignar y programar
            </button>
            <button onClick={confirmar} disabled={guardando}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-cyan-300 text-sm font-bold disabled:opacity-50">
              <CheckCircle2 className="w-4 h-4" /> Confirmado con la oficina
            </button>
            <button onClick={quitar} disabled={guardando}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold disabled:opacity-50">
              <UserMinus className="w-4 h-4" /> Quitar asignación
            </button>
            <button onClick={onLimpiar} className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-white text-sm">
              <X className="w-4 h-4" /> Limpiar
            </button>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-3" onClick={() => !guardando && setModal(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-card w-full max-w-md p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">Asignar y programar</h3>
              <button onClick={() => setModal(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs text-zinc-400">{n} oficina{n !== 1 ? 's' : ''}{n > 0 && n <= 4 ? ': ' + seleccionadas.map((s) => s.external_code || s.name).join(', ') : ''}</div>
            {n === 0 && <div className="text-xs text-amber-400">No hay oficinas seleccionadas.</div>}

            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Técnico</div>
              <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-3 text-sm">
                <option value="">Elige…</option>
                {opciones.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Día</div>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Franja</div>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(FRANJAS).map(([k, lbl]) => (
                    <button key={k} onClick={() => setFranja(k)}
                      className={`py-2.5 rounded-lg text-sm font-bold border ${franja === k ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-300'}`}>{lbl}</button>
                  ))}
                </div>
              </div>
            </div>

            {persona && fecha && (
              <div className={`text-xs rounded-lg px-3 py-2 border ${carga >= 4 ? 'bg-amber-950/40 border-amber-700/60 text-amber-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                {carga
                  ? `${persona.nombre} ya tiene ${carga} oficina${carga !== 1 ? 's' : ''} el ${diaCorto(fecha)}. Con estas quedan ${carga + n}.`
                  : `${persona.nombre} no tiene oficinas el ${diaCorto(fecha)}.`}
              </div>
            )}
            {yaLevantadas > 0 && (
              <div className="text-xs text-zinc-500">{yaLevantadas} ya está{yaLevantadas !== 1 ? 'n' : ''} en proceso o levantada{yaLevantadas !== 1 ? 's' : ''}: cambian técnico y día, pero no su estado.</div>
            )}

            <button onClick={asignar} disabled={guardando || !n}
              className="w-full py-3.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-base disabled:opacity-50 flex items-center justify-center gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Programar {n} oficina{n !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
