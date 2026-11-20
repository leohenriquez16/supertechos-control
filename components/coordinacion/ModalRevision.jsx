'use client';

// v8.95.0 — Revisar una oficina de la campaña: la ficha completa (SurveySiteDetail con el proyecto-campaña,
// que trae es_campana) en pantalla completa, con una barra arriba para Validar o Devolver cuando está «por revisar».

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Check, Undo2, Loader2, X } from 'lucide-react';
import { validarOficina, devolverOficina } from '../../lib/surveys';
import { ESTADO_OFICINA, estadoOficina } from '../../lib/helpers/coordinacion';

const SurveySiteDetail = dynamic(() => import('../surveys/SurveySiteDetail'), {
  ssr: false, loading: () => <div className="p-8 text-center text-zinc-500 text-sm">Cargando ficha…</div>,
});

export default function ModalRevision({ site, proyecto, usuario, data, onCerrar, onCambio }) {
  const [guardando, setGuardando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  const [nota, setNota] = useState('');
  const roles = usuario?.roles || [];
  const puedeRevisar = roles.includes('admin') || roles.includes('owner');
  const porRevisar = site?.survey_status === 'completed';
  const est = ESTADO_OFICINA[estadoOficina(site)];
  const por = usuario?.nombre || null;

  const validar = async () => {
    if (!confirm(`¿Validar «${site.name}»? Queda cerrada como buena.`)) return;
    setGuardando(true);
    try { await validarOficina(site.id, por); await onCambio?.(); onCerrar?.(); }
    catch (e) { alert('No se pudo validar: ' + (e?.message || e)); setGuardando(false); }
  };
  const devolver = async () => {
    if (!nota.trim()) return alert('Escribe qué hay que corregir.');
    setGuardando(true);
    try { await devolverOficina(site.id, por, nota.trim()); await onCambio?.(); onCerrar?.(); }
    catch (e) { alert('No se pudo devolver: ' + (e?.message || e)); setGuardando(false); }
  };

  if (!site) return null;
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-3 py-2 flex flex-wrap items-center gap-2">
        <button onClick={onCerrar} className="flex items-center gap-1 px-2 py-2 text-zinc-400 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Coordinación
        </button>
        <div className="min-w-0 mr-auto">
          <div className="text-sm font-black text-white truncate">{site.external_code ? `${site.external_code} · ` : ''}{site.name}</div>
          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            {est && <span className="w-2 h-2 rounded-full inline-block" style={{ background: est.color }} />}
            {est?.label}{site.asignado_a_nombre ? ` · ${site.asignado_a_nombre}` : ''}
          </div>
        </div>
        {porRevisar && puedeRevisar && (
          <>
            <button onClick={() => setDevolviendo(true)} disabled={guardando}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-pink-300 text-sm font-bold disabled:opacity-50">
              <Undo2 className="w-4 h-4" /> Devolver
            </button>
            <button onClick={validar} disabled={guardando}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold disabled:opacity-50">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Validar
            </button>
          </>
        )}
      </div>

      {site.devuelto_nota && site.survey_status === 'missing_info' && (
        <div className="mx-3 mt-3 bg-pink-950/40 border border-pink-800/60 rounded-card px-3 py-2 text-sm text-pink-200">
          <span className="text-[11px] uppercase tracking-wider font-bold text-pink-400">Devuelta{site.devuelto_por ? ` por ${site.devuelto_por}` : ''}: </span>{site.devuelto_nota}
        </div>
      )}

      <SurveySiteDetail site={site} proyecto={proyecto} usuario={usuario} data={data} onVolver={onCerrar} />

      {devolviendo && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end md:items-center justify-center p-3" onClick={() => !guardando && setDevolviendo(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-card w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">Devolver al técnico</h3>
              <button onClick={() => setDevolviendo(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">¿Qué hay que corregir?</div>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} autoFocus
              placeholder="Ej.: falta la foto de la fachada y medir el muro del parqueo."
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
            <button onClick={devolver} disabled={guardando || !nota.trim()}
              className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black disabled:opacity-50 flex items-center justify-center gap-2">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Devolver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
