'use client';

// v8.28.2: "Mi bono" — tarjeta del supervisor con su bono trimestral por KPIs,
// calculado EN VIVO desde el ERP (jornadas propias, reportes al día, producción
// vs meta, reclamaciones). El incentivo y la adopción del ERP son la misma cosa:
// lo que no se registra en el sistema, no puntúa.
// Se renderiza solo si la persona tiene una fila activa en bonos_config.

import React, { useEffect, useState } from 'react';
import { Loader2, Award, ChevronDown, ChevronUp } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD } from '../../lib/helpers/formato';
import { trimestreActual, calcularBonoSupervisor, calcularBonoGerente, calcularBonoComercial, bonoEstimado, BONO_GATE, BONO_TOPE } from '../../lib/helpers/bonos';
import { faltantesProyecto } from '../../lib/helpers/proyectoCompleto';

export function BarraKpi({ k }) {
  const score = k.score == null ? null : Math.max(0, Math.min(BONO_TOPE, k.score));
  const color = score == null ? 'bg-zinc-700' : score >= 100 ? 'bg-green-500' : score >= BONO_GATE ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5">
      <div className="flex items-center justify-between text-[11px] gap-2">
        <span className="font-bold truncate">{k.label} <span className="text-zinc-600 font-normal">· {k.peso}%</span>{k.manual && <span className="ml-1 text-[9px] font-bold uppercase px-1 py-0.5 rounded-card bg-blue-600/20 text-blue-400 align-middle">manual</span>}</span>
        <span className={`font-black shrink-0 ${score == null ? 'text-zinc-500' : score >= BONO_GATE ? 'text-green-400' : 'text-red-400'}`}>
          {score == null ? '—' : Math.round(score) + ' pts'}
        </span>
      </div>
      <div className="w-full h-1.5 bg-zinc-800 mt-1 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score == null ? 0 : Math.min(100, score)}%` }} />
      </div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{k.detalle}</div>
    </div>
  );
}

export default function MiBono({ usuario, data }) {
  const [loading, setLoading] = useState(true);
  const [resultado, setResultado] = useState(null); // { config, calc, trimestre }
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const configs = await db.listarBonosConfig().catch(() => []);
        const config = configs.find(c => c.personaId === usuario.id && c.activo);
        if (!config) { if (!cancel) { setResultado(null); setLoading(false); } return; }
        const trimestre = trimestreActual();
        const esGerente = config.rolBono === 'gerente';
        const esComercial = config.rolBono === 'comercial';
        const [jornadas, reclamaciones, surveys, cubicaciones, solicitudes, tareasConf, cajaMovs] = await Promise.all([
          db.listarJornadasEnRango(trimestre.inicio, trimestre.fin).catch(() => []),
          db.listarReclamaciones().catch(() => []),
          import('../../lib/surveys').then(m => m.listarProyectosSurveys()).catch(() => []), // v8.31: todos los roles usan el KPI compartido de 48h
          esGerente ? db.listarCubicaciones().catch(() => []) : Promise.resolve([]),
          esComercial ? db.listarSolicitudesLevantamiento({ desde: trimestre.inicio }).catch(() => []) : Promise.resolve([]),
          esComercial ? db.listarTareasPorTipo('confirmar_recepcion_cotizacion', { desde: trimestre.inicio }).catch(() => []) : Promise.resolve([]),
          db.listarCajaMovimientosRango(trimestre.inicio).catch(() => []), // v8.31.1: caja al día
        ]);
        // v8.29.2: fechas del último cambio de estado de las obras terminadas (KPI facturación)
        let historialEstados = {};
        if (esGerente) {
          const idsTerm = (data.proyectos || []).filter(p => !p.archivado &&
            (p.estado === 'finalizado_no_entregado' || p.estado === 'finalizado_recibido_conforme')).map(p => p.id);
          if (idsTerm.length) historialEstados = await db.listarHistorialEstadosBatch(idsTerm).catch(() => ({}));
        }
        const ctx = { data, jornadas, reclamaciones, surveys, cubicaciones, solicitudes, tareas: tareasConf, cajaMovs, historialEstados, trimestre, config, faltantesFn: faltantesProyecto };
        const calc = esGerente ? calcularBonoGerente(usuario, ctx)
          : esComercial ? calcularBonoComercial(usuario, ctx)
          : calcularBonoSupervisor(usuario, ctx);
        if (!cancel) { setResultado({ config, calc, trimestre }); setLoading(false); }
      } catch (e) { console.warn('MiBono:', e?.message); if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [usuario.id, data.proyectos, data.reportes]);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando tu bono…
      </div>
    );
  }
  if (!resultado) return null; // sin bono configurado → no se muestra nada

  const { config, calc, trimestre } = resultado;
  const puntaje = calc.puntaje;
  const bono = bonoEstimado(puntaje, config.montoObjetivoRd);
  const enZona = puntaje != null && puntaje >= BONO_GATE;

  return (
    <div className={`bg-zinc-900 border-l-4 rounded-card p-3 space-y-2 ${enZona ? 'border-green-500' : 'border-amber-500'}`}>
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center justify-between gap-2 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <Award className={`w-4 h-4 shrink-0 ${enZona ? 'text-green-400' : 'text-amber-400'}`} />
          <div className="min-w-0">
            <div className="text-[11px] tracking-widest uppercase font-bold text-zinc-400">Mi bono · {trimestre.label}</div>
            <div className="text-[10px] text-zinc-500">se actualiza con cada jornada, reporte y avance</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className={`text-xl font-black leading-tight ${puntaje == null ? 'text-zinc-500' : enZona ? 'text-green-400' : 'text-amber-400'}`}>
              {puntaje == null ? '—' : Math.round(puntaje) + ' pts'}
            </div>
            {bono != null && <div className="text-[10px] text-zinc-400 font-bold">{bono === 0 ? `mínimo ${BONO_GATE} pts` : `≈ ${formatRD(bono)}`}</div>}
          </div>
          {abierto ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>
      {abierto && (
        <div className="space-y-1.5 pt-1 border-t border-zinc-800">
          {calc.kpis.map(k => <BarraKpi key={k.key} k={k} />)}
          <div className="text-[10px] text-zinc-600">
            Bono al 100% = {formatRD(config.montoObjetivoRd)} · se paga desde {BONO_GATE} pts · tope {BONO_TOPE} pts.
          </div>
        </div>
      )}
    </div>
  );
}
