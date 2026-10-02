'use client';

// v8.57.0 — SEMÁFORO "LISTO PARA NÓMINA" (corte abierto).
// Enseña, antes de cerrar, todo lo que impide que el ERP calcule bien el pago:
// obras sin jornadas, jornadas sin reportes, obras sin precios, gente sin costo/día,
// avances sin maestro, gente que trabajó y queda en RD$0, y quién no tiene banco.
// Nace del corte 17-30 sep 2026, donde esos huecos se descubrían DESPUÉS de pagar.

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react';

const COLOR = {
  bloqueante: { punto: 'bg-red-500', texto: 'text-red-300', borde: 'border-red-800', fondo: 'bg-red-950/20' },
  aviso: { punto: 'bg-amber-500', texto: 'text-amber-300', borde: 'border-amber-800', fondo: 'bg-amber-950/20' },
};

const TITULOS = {
  obra_sin_jornadas: 'Obras con avance y sin jornadas',
  obra_sin_reportes: 'Obras con días trabajados y sin avance reportado',
  obra_sin_precios: 'Obras sin precio de mano de obra',
  persona_sin_costo_dia: 'Gente sin costo por día en su obra',
  reporte_sin_maestro: 'Avances sin maestro a quién pagarle',
  persona_en_cero: 'Trabajaron y el corte les da RD$0',
  sin_datos_banco: 'Sin datos bancarios para el pago',
};

export default function PanelListoNomina({ resultado, cargando }) {
  const [abierto, setAbierto] = useState(true);
  const [grupoAbierto, setGrupoAbierto] = useState(null);

  if (cargando) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 text-[11px] text-zinc-500">
        Revisando el corte…
      </div>
    );
  }
  if (!resultado) return null;

  const { alertas, bloqueantes, avisos, listo } = resultado;

  if (listo) {
    return (
      <div className="bg-green-950/20 border border-green-800 rounded-card p-3 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-green-300">Listo para cerrar</div>
          <div className="text-[10px] text-zinc-400">No encontramos nada que impida calcular el pago.</div>
        </div>
      </div>
    );
  }

  const grupos = {};
  alertas.forEach(a => { (grupos[a.tipo] = grupos[a.tipo] || []).push(a); });
  const severidadGrupo = (tipo) => grupos[tipo][0].severidad;
  const orden = Object.keys(grupos).sort((a, b) =>
    (severidadGrupo(a) === severidadGrupo(b) ? grupos[b].length - grupos[a].length : severidadGrupo(a) === 'bloqueante' ? -1 : 1));

  const c = bloqueantes > 0 ? COLOR.bloqueante : COLOR.aviso;

  return (
    <div className={`${c.fondo} border ${c.borde} rounded-card`}>
      <button onClick={() => setAbierto(v => !v)} className="w-full flex items-center gap-2 p-3 text-left">
        {bloqueantes > 0 ? <XCircle className="w-4 h-4 text-red-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-black uppercase tracking-widest ${c.texto}`}>
            {bloqueantes > 0 ? `${bloqueantes} cosa${bloqueantes === 1 ? '' : 's'} que arreglar antes de cerrar` : `${avisos} aviso${avisos === 1 ? '' : 's'}`}
          </div>
          <div className="text-[10px] text-zinc-400">
            {bloqueantes > 0 && <>Si cierras así, alguien cobra de menos o de más.{avisos > 0 && ` · ${avisos} aviso${avisos === 1 ? '' : 's'} más`}</>}
            {bloqueantes === 0 && 'Nada bloquea el cierre, pero conviene revisarlo.'}
          </div>
        </div>
        {abierto ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </button>

      {abierto && (
        <div className="px-3 pb-3 space-y-1.5">
          {orden.map(tipo => {
            const lista = grupos[tipo];
            const col = COLOR[severidadGrupo(tipo)];
            const expandido = grupoAbierto === tipo;
            return (
              <div key={tipo} className="bg-zinc-950 border border-zinc-800 rounded-card">
                <button onClick={() => setGrupoAbierto(expandido ? null : tipo)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left">
                  <span className={`w-1.5 h-1.5 rounded-full ${col.punto} shrink-0`} />
                  <span className="text-[11px] font-bold text-zinc-200 flex-1 min-w-0 truncate">{TITULOS[tipo] || tipo}</span>
                  <span className="text-[10px] text-zinc-500 shrink-0">{lista.length}</span>
                  {expandido ? <ChevronDown className="w-3 h-3 text-zinc-600" /> : <ChevronRight className="w-3 h-3 text-zinc-600" />}
                </button>
                {expandido && (
                  <div className="px-2 pb-2 space-y-1.5">
                    {lista.map((a, i) => (
                      <div key={i} className="border-l-2 border-zinc-800 pl-2">
                        <div className="text-[11px] text-zinc-200">{a.titulo}</div>
                        <div className="text-[10px] text-zinc-500">{a.detalle}</div>
                        <div className={`text-[10px] ${col.texto}`}>→ {a.accion}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
