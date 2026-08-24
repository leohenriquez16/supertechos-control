'use client';

// v8.28.2: Vista "Bonos" (admin/owner) — tablero de bonos trimestrales por KPIs.
// - El OWNER define por persona: monto objetivo del trimestre, meta de producción y rol
//   del bono (supervisor | gerente). Los admin (gerencia) ven los puntajes de todos.
// - El puntaje se calcula EN VIVO con lib/helpers/bonos (mismos números que ve cada
//   supervisor en su tarjeta "Mi bono").

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Award, Loader2, Plus, Save } from 'lucide-react';
import * as db from '../../lib/db';
import { listarProyectosSurveys } from '../../lib/surveys';
import { formatRD } from '../../lib/helpers/formato';
import { trimestreActual, calcularBonoSupervisor, calcularBonoGerente, calcularBonoComercial, bonoEstimado, BONO_GATE, BONO_TOPE, KPIS_SUPERVISOR, KPIS_GERENTE, KPIS_COMERCIAL } from '../../lib/helpers/bonos';
import { faltantesProyecto } from '../../lib/helpers/proyectoCompleto';
import { BarraKpi } from './MiBono';

const tieneRol = (p, r) => p?.roles?.includes(r);

export default function VistaBonos({ usuario, data, onVolver }) {
  const esOwner = tieneRol(usuario, 'owner');
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState([]);
  const [ctxBase, setCtxBase] = useState(null); // { jornadas, reclamaciones, surveys, trimestre }
  const [editando, setEditando] = useState(null); // config en edición
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const trimestre = useMemo(() => trimestreActual(), []);

  const cargar = async () => {
    setLoading(true); setError('');
    try {
      const [cfgs, jornadas, reclamaciones, surveys, cubicaciones, solicitudes, tareasConf, cajaMovs] = await Promise.all([
        db.listarBonosConfig().catch(e => { setError('Falta aplicar la migración 104 (bonos_config): ' + (e?.message || '')); return []; }),
        db.listarJornadasEnRango(trimestre.inicio, trimestre.fin).catch(() => []),
        db.listarReclamaciones().catch(() => []),
        listarProyectosSurveys().catch(() => []),
        db.listarCubicaciones().catch(() => []),
        db.listarSolicitudesLevantamiento({ desde: trimestre.inicio }).catch(() => []),
        db.listarTareasPorTipo('confirmar_recepcion_cotizacion', { desde: trimestre.inicio }).catch(() => []),
        db.listarCajaMovimientosRango(trimestre.inicio).catch(() => []),
      ]);
      // v8.29.2: fechas del último cambio de estado de terminadas (KPI facturación del gerente)
      let historialEstados = {};
      const idsTerm = (data.proyectos || []).filter(p => !p.archivado &&
        (p.estado === 'finalizado_no_entregado' || p.estado === 'finalizado_recibido_conforme')).map(p => p.id);
      if (idsTerm.length) historialEstados = await db.listarHistorialEstadosBatch(idsTerm).catch(() => ({}));
      setConfigs(cfgs);
      setCtxBase({ jornadas, reclamaciones, surveys, cubicaciones, solicitudes, tareas: tareasConf, cajaMovs, historialEstados, trimestre, faltantesFn: faltantesProyecto });
    } catch (e) { setError(e?.message || 'Error cargando'); }
    setLoading(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  // Candidatos a bono: supervisores y admins activos que aún no tienen config.
  const candidatos = useMemo(() => (data.personal || [])
    .filter(p => (tieneRol(p, 'supervisor') || tieneRol(p, 'admin')) && !configs.some(c => c.personaId === p.id))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')), [data.personal, configs]);

  const filas = useMemo(() => {
    if (!ctxBase) return [];
    return configs.map(config => {
      const persona = (data.personal || []).find(p => p.id === config.personaId);
      if (!persona) return null;
      const ctx = { data, ...ctxBase, config };
      const calc = config.rolBono === 'gerente' ? calcularBonoGerente(persona, ctx) : config.rolBono === 'comercial' ? calcularBonoComercial(persona, ctx) : calcularBonoSupervisor(persona, ctx);
      return { config, persona, calc, bono: bonoEstimado(calc.puntaje, config.montoObjetivoRd) };
    }).filter(Boolean).sort((a, b) => (b.calc.puntaje || 0) - (a.calc.puntaje || 0));
  }, [configs, ctxBase, data]);

  const guardar = async () => {
    if (!editando?.personaId) return;
    setGuardando(true);
    try {
      await db.guardarBonoConfig(editando);
      setEditando(null);
      await cargar();
    } catch (e) { alert('Error guardando: ' + (e?.message || e)); }
    setGuardando(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2"><Award className="w-6 h-6 text-amber-400" /> Bonos · {trimestre.label}</h1>
          <div className="text-[11px] text-zinc-500">Puntaje en vivo desde el ERP · se paga desde {BONO_GATE} pts · tope {BONO_TOPE} pts</div>
        </div>
      </div>

      {error && <div className="bg-amber-900/30 border border-amber-700 text-amber-300 text-xs rounded-card p-3">{error}</div>}

      {loading ? (
        <div className="text-center py-10"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <>
          {filas.length === 0 && !error && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-6 text-center text-zinc-500 text-sm">
              Nadie tiene bono configurado todavía.{esOwner ? ' Agrega el primero abajo.' : ''}
            </div>
          )}

          {filas.map(({ config, persona, calc, bono }) => {
            const enZona = calc.puntaje != null && calc.puntaje >= BONO_GATE;
            return (
              <div key={config.personaId} className={`bg-zinc-900 border-l-4 rounded-card p-3 space-y-2 ${enZona ? 'border-green-500' : 'border-amber-500'}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{persona.nombre}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{config.rolBono === 'gerente' ? 'Gerente de operaciones' : config.rolBono === 'comercial' ? 'Comercial (levantamientos)' : 'Supervisor'} · objetivo {formatRD(config.montoObjetivoRd)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className={`text-xl font-black leading-tight ${calc.puntaje == null ? 'text-zinc-500' : enZona ? 'text-green-400' : 'text-amber-400'}`}>
                        {calc.puntaje == null ? '—' : Math.round(calc.puntaje) + ' pts'}
                      </div>
                      {bono != null && <div className="text-[10px] text-zinc-400 font-bold">{bono === 0 ? 'bajo el mínimo' : `≈ ${formatRD(bono)}`}</div>}
                    </div>
                    {esOwner && <button onClick={() => setEditando({ ...config })} className="text-[10px] uppercase font-bold border border-zinc-700 hover:border-amber-500 text-zinc-300 px-2 py-1.5 rounded-card">Editar</button>}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {calc.kpis.map(k => <BarraKpi key={k.key} k={k} />)}
                </div>
              </div>
            );
          })}

          {/* Configuración (solo owner) */}
          {esOwner && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Configurar bono</div>
              {!editando ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <select onChange={e => { const p = candidatos.find(x => x.id === e.target.value); if (p) setEditando({ personaId: p.id, rolBono: 'supervisor', montoObjetivoRd: 0, metaProduccionRd: 0, activo: true }); e.target.value = ''; }}
                    defaultValue="" className="bg-zinc-950 border border-zinc-700 text-sm rounded-card px-2 py-2">
                    <option value="" disabled>+ Agregar persona…</option>
                    {candidatos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-bold">{(data.personal || []).find(p => p.id === editando.personaId)?.nombre}</div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <label className="text-[11px] text-zinc-400">Rol del bono
                      <select value={editando.rolBono} onChange={e => setEditando({ ...editando, rolBono: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 text-sm rounded-card px-2 py-2 mt-1">
                        <option value="supervisor">Supervisor</option>
                        <option value="gerente">Gerente de operaciones</option>
                        <option value="comercial">Comercial (levantamientos)</option>
                      </select>
                    </label>
                    <label className="text-[11px] text-zinc-400">Bono trimestral al 100% (RD$)
                      <input type="number" value={editando.montoObjetivoRd} onChange={e => setEditando({ ...editando, montoObjetivoRd: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 text-sm rounded-card px-2 py-2 mt-1" />
                    </label>
                    <label className="text-[11px] text-zinc-400">Meta de producción del trimestre (RD$)
                      <input type="number" value={editando.metaProduccionRd} onChange={e => setEditando({ ...editando, metaProduccionRd: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 text-sm rounded-card px-2 py-2 mt-1" />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <input type="checkbox" checked={editando.activo !== false} onChange={e => setEditando({ ...editando, activo: e.target.checked })} className="w-3.5 h-3.5 accent-amber-500" /> Activo
                  </label>

                  {/* v8.28.2: ajuste manual por KPI — peso y puntaje fijado a mano (vacío = automático) */}
                  <div className="border-t border-zinc-800 pt-2">
                    <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Ajuste manual por KPI <span className="normal-case font-normal">(puntaje vacío = cálculo automático)</span></div>
                    <div className="space-y-1.5">
                      {(editando.rolBono === 'gerente' ? KPIS_GERENTE : editando.rolBono === 'comercial' ? KPIS_COMERCIAL : KPIS_SUPERVISOR).map(def => {
                        const o = (editando.kpiOverrides || {})[def.key] || {};
                        const setO = (campo, valor) => {
                          const next = { ...(editando.kpiOverrides || {}) };
                          const cur = { ...(next[def.key] || {}) };
                          if (valor === '' || valor == null) delete cur[campo]; else cur[campo] = valor;
                          if (Object.keys(cur).length === 0) delete next[def.key]; else next[def.key] = cur;
                          setEditando({ ...editando, kpiOverrides: next });
                        };
                        return (
                          <div key={def.key} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                            <div className="text-[11px] font-bold truncate sm:col-span-1 col-span-2">{def.label}</div>
                            <label className="text-[10px] text-zinc-500">Peso %
                              <input type="number" placeholder={String(def.pesoDefault)} value={o.peso ?? ''} onChange={e => setO('peso', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 text-xs rounded-card px-1.5 py-1 mt-0.5" />
                            </label>
                            <label className="text-[10px] text-zinc-500">Puntaje manual
                              <input type="number" placeholder="auto" value={o.score ?? ''} onChange={e => setO('score', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 text-xs rounded-card px-1.5 py-1 mt-0.5" />
                            </label>
                            <label className="text-[10px] text-zinc-500">Nota
                              <input type="text" placeholder="motivo del ajuste" value={o.nota ?? ''} onChange={e => setO('nota', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 text-xs rounded-card px-1.5 py-1 mt-0.5" />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={guardar} disabled={guardando} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs font-black uppercase px-4 py-2 rounded-card flex items-center gap-1.5">
                      {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
                    </button>
                    <button onClick={() => setEditando(null)} className="text-xs text-zinc-400 hover:text-white uppercase font-bold px-2">Cancelar</button>
                  </div>
                </div>
              )}
              <div className="text-[10px] text-zinc-600">La meta de producción del supervisor es la de SUS obras; la del gerente es la de toda la operación. Los KPIs de margen y entregas a tiempo entran a la fórmula del gerente cuando existan los módulos de presupuesto y cronograma.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
