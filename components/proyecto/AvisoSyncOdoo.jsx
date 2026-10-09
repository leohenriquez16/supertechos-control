'use client';

// v8.62.0 — Franja en la ficha de la obra con lo que la sincronización diaria con Odoo no aplicó
// sola (cambios grandes, m² de una obra ya arrancada, partidas sin área). Lo seguro ya se aplicó
// y está en el historial; aquí solo queda lo que necesita una persona.

import React, { useState } from 'react';
import { RefreshCw, ChevronDown, Check, Loader2 } from 'lucide-react';
import * as db from '../../lib/db';
import { textoCambio, claveRevisar } from '../../lib/helpers/syncOdoo';

export default function AvisoSyncOdoo({ proyecto, usuario, puedeResolver, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const s = proyecto?.syncOdoo;
  const revisar = s?.revisar || [];
  const aplicados = s?.aplicados || [];
  if (!revisar.length && !aplicados.length) return null;
  const fecha = s?.fecha ? new Date(s.fecha).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }) : '';

  const resolver = async (claves) => {
    setGuardando(true);
    try { await db.marcarSyncOdooRevisado(proyecto.id, claves, usuario); onCambio?.(); }
    catch (e) { alert('No se pudo guardar: ' + (e?.message || e)); }
    setGuardando(false);
  };

  return (
    <div className={`rounded-card border px-3 py-2 ${revisar.length ? 'bg-sky-950/40 border-sky-800' : 'bg-zinc-900 border-zinc-800'}`}>
      <button onClick={() => setAbierto(!abierto)} className="w-full flex items-center gap-2 text-left">
        <RefreshCw className="w-4 h-4 text-sky-400 shrink-0" />
        <div className="flex-1 min-w-0 text-xs">
          {revisar.length
            ? <><b className="text-sky-200">La cotización cambió en Odoo · {revisar.length} punto{revisar.length === 1 ? '' : 's'} por revisar</b>
                {aplicados.length > 0 && <span className="text-zinc-400"> · {aplicados.length} ya actualizado{aplicados.length === 1 ? '' : 's'}</span>}</>
            : <span className="text-zinc-400">Actualizado desde Odoo el {fecha} · {aplicados.length} cambio{aplicados.length === 1 ? '' : 's'}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="mt-2 space-y-2 text-[11px]">
          {aplicados.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Aplicado solo ({fecha})</div>
              {aplicados.map((c, i) => <div key={i} className="text-zinc-300">✔ {textoCambio(c)}</div>)}
            </div>
          )}
          {revisar.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-sky-400 font-bold mb-1">Por revisar</div>
              {revisar.map((c, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  <div className="flex-1 text-zinc-200">• {textoCambio(c)}</div>
                  {puedeResolver && (
                    <button disabled={guardando} onClick={() => resolver([claveRevisar(c)])} className="shrink-0 text-[10px] text-zinc-400 hover:text-white underline">Revisado</button>
                  )}
                </div>
              ))}
              <div className="text-[10px] text-zinc-500 mt-1">Corrige en la ficha de la obra (áreas, m², valor) o en Odoo si el error está allá. "Revisado" lo quita de la lista.</div>
              {puedeResolver && revisar.length > 1 && (
                <button disabled={guardando} onClick={() => resolver(revisar.map(claveRevisar))} className="mt-1 text-[10px] font-bold uppercase px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-card flex items-center gap-1">
                  {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Marcar todo como revisado
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
