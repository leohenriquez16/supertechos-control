'use client';

// v8.52.0: TORRE DE CONTROL de Levantamientos — control total del embudo desde que
// el cliente envía el formulario hasta que se envía la cotización. Antigüedad por
// etapa + semáforo SLA (con stop-the-clock del cliente y ruta de complejos 24h).

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, Gauge, PauseCircle, Wrench, ArrowLeft } from 'lucide-react';
import { listarTorreControl, marcarVisitaPorCliente, marcarConsultaTecnica } from '../../lib/surveys';
import { evaluarSlaLevantamiento, formatHoras } from '../../lib/helpers/slaLevantamiento';

const SEM = {
  rojo: { punto: 'bg-red-500', txt: 'text-red-400', label: 'Vencido' },
  amarillo: { punto: 'bg-amber-500', txt: 'text-amber-400', label: 'Atrasado' },
  pausa: { punto: 'bg-sky-500', txt: 'text-sky-400', label: 'Espera cliente' },
  verde: { punto: 'bg-green-500', txt: 'text-green-400', label: 'En SLA' },
  exito: { punto: 'bg-emerald-600', txt: 'text-emerald-400', label: 'Cotizada' },
  cerrado: { punto: 'bg-zinc-600', txt: 'text-zinc-400', label: 'Cerrado' },
};
const ORDEN = { rojo: 0, amarillo: 1, pausa: 2, verde: 3 };

export default function TorreControl({ onVolver }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [soloAtascados, setSoloAtascados] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try { setItems(await listarTorreControl()); }
    catch (e) { console.warn('TorreControl:', e?.message); setItems([]); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const toggleCliente = async (it) => {
    try { await marcarVisitaPorCliente(it.id, !it.visita_por_cliente); await cargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  const toggleComplejo = async (it) => {
    try {
      if (it.requiere_consulta_tecnica) { await marcarConsultaTecnica(it.id, false); }
      else { const motivo = prompt('¿Por qué requiere consulta técnica? (qué sistema / qué falta definir)'); if (motivo === null) return; await marcarConsultaTecnica(it.id, true, motivo.trim() || null); }
      await cargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const activos = useMemo(() => {
    const ahora = new Date();
    return (items || []).map((it) => ({ it, sla: evaluarSlaLevantamiento(it, ahora) })).filter((e) => !e.sla.terminal);
  }, [items]);

  const resumen = useMemo(() => {
    const r = { rojo: 0, amarillo: 0, pausa: 0, verde: 0, complejos: 0, total: activos.length };
    activos.forEach((e) => { r[e.sla.semaforo] = (r[e.sla.semaforo] || 0) + 1; if (e.sla.esComplejo) r.complejos++; });
    return r;
  }, [activos]);

  const visibles = useMemo(() => {
    const base = soloAtascados ? activos.filter((e) => e.sla.atascado) : activos;
    return [...base].sort((a, b) => (ORDEN[a.sla.semaforo] ?? 9) - (ORDEN[b.sla.semaforo] ?? 9) || b.sla.horasEnEtapa - a.sla.horasEnEtapa);
  }, [activos, soloAtascados]);

  const Kpi = ({ n, label, color, onClick, active }) => (
    <button onClick={onClick} className={`bg-zinc-950 border rounded-card px-3 py-2 text-left ${active ? 'border-red-600' : 'border-zinc-800'} ${onClick ? 'hover:border-zinc-600' : ''}`}>
      <div className={`text-2xl font-black ${color}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
    </button>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Gauge className="w-6 h-6 text-red-500" /> Torre de Control</h1>
            <div className="text-[11px] text-zinc-500">Levantamientos: del formulario a la cotización · meta 72h</div>
          </div>
        </div>
        <button onClick={cargar} className="text-zinc-500 hover:text-white"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {/* Resumen / semáforo */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <Kpi n={resumen.total} label="Activos" color="text-white" onClick={() => setSoloAtascados(false)} active={!soloAtascados} />
        <Kpi n={resumen.rojo} label="Vencidos" color="text-red-400" onClick={() => setSoloAtascados(true)} active={soloAtascados} />
        <Kpi n={resumen.amarillo} label="Atrasados" color="text-amber-400" onClick={() => setSoloAtascados(true)} active={soloAtascados} />
        <Kpi n={resumen.pausa} label="Espera cliente" color="text-sky-400" />
        <Kpi n={resumen.verde} label="En SLA" color="text-green-400" />
        <Kpi n={resumen.complejos} label="Complejos" color="text-fuchsia-400" />
      </div>

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : visibles.length === 0 ? (
        <div className="py-12 text-center text-zinc-600 text-sm">{soloAtascados ? 'Nada atascado 🎉' : 'No hay levantamientos activos.'}</div>
      ) : (
        <div className="space-y-1.5">
          {/* encabezado desktop */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            <div className="col-span-4">Cliente</div>
            <div className="col-span-2">Etapa</div>
            <div className="col-span-2">En etapa (SLA)</div>
            <div className="col-span-2">Responsable</div>
            <div className="col-span-2 text-right">Total / 72h</div>
          </div>
          {visibles.map(({ it, sla }) => {
            const s = SEM[sla.semaforo] || SEM.verde;
            return (
              <div key={it.id} className="bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2.5 grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-2 md:items-center">
                <div className="md:col-span-4 flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.punto}`} title={s.label} />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{it.client_name || 'Sin cliente'}</div>
                    <div className="text-[10px] flex items-center gap-1.5 flex-wrap mt-0.5">
                      {it.ticket && <span className="text-zinc-500">{it.ticket}</span>}
                      <button onClick={() => toggleCliente(it)} title="La fecha de visita la puso el cliente → pausa el SLA"
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-card border font-bold ${it.visita_por_cliente ? 'bg-sky-600/20 border-sky-600 text-sky-300' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}><PauseCircle className="w-3 h-3" /> Fecha del cliente</button>
                      <button onClick={() => toggleComplejo(it)} title="Sistema complejo → consulta técnica (24h)"
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-card border font-bold ${it.requiere_consulta_tecnica ? 'bg-fuchsia-600/20 border-fuchsia-600 text-fuchsia-300' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}><Wrench className="w-3 h-3" /> Consulta técnica</button>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2 text-xs"><span className="md:hidden text-zinc-500">Etapa: </span>{sla.etapa}</div>
                <div className="md:col-span-2 text-xs">
                  <span className={`font-bold ${s.txt}`}>{formatHoras(sla.horasEnEtapa)}</span>
                  {sla.slaEtapa != null && !sla.esperandoCliente && <span className="text-zinc-600"> / {formatHoras(sla.slaEtapa)}{sla.motivoSla ? ` (${sla.motivoSla})` : ''}</span>}
                </div>
                <div className="md:col-span-2 text-xs text-zinc-300 truncate">{it.asignado_a_nombre || <span className="text-amber-500">Sin asignar</span>}</div>
                <div className="md:col-span-2 md:text-right text-xs">
                  <span className={sla.dentro72 ? 'text-zinc-400' : 'text-red-400 font-bold'}>{formatHoras(sla.horasTotales)}</span>
                  {!sla.dentro72 && <span className="text-red-400 font-bold"> ⚠</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[10px] text-zinc-600 pt-1">🟢 en SLA · 🟡 pasó el SLA de la etapa · 🔴 el doble o más · 🔵 en pausa por fecha del cliente. Meta global: 72h de tiempo controlable del formulario a la cotización enviada.</div>
    </div>
  );
}
