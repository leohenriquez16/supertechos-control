'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, Plus, X, TrendingUp, Wallet, Coins, AlertCircle, Trash2, Hammer, Target } from 'lucide-react';
import * as db from '../../../lib/db';
import { formatRD, formatNum } from '../../../lib/helpers/formato';
import { calcEstadoPagoProyecto } from '../../../lib/helpers/calculos';

const tieneRol = (p, r) => p?.roles?.includes(r);

// v8.19.29: costos por día del personal asignado al proyecto (solo modo=dia).
function CostosDiaPorPersona({ proyecto, data, esAdmin, onCambio }) {
  const [costos, setCostos] = React.useState({}); // { personaId: costoDia }
  const [loading, setLoading] = React.useState(true);
  const [guardandoId, setGuardandoId] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [valor, setValor] = React.useState('');

  const cargar = React.useCallback(async () => {
    setLoading(true);
    try {
      const lista = await db.listarCostosDia(proyecto.id);
      const map = {};
      (lista || []).forEach(c => { map[c.personaId] = Number(c.costoDia) || 0; });
      setCostos(map);
    } catch (e) { console.warn('listarCostosDia:', e?.message); }
    setLoading(false);
  }, [proyecto.id]);

  React.useEffect(() => { cargar(); }, [cargar]);

  const personas = React.useMemo(() => {
    const ids = new Set();
    if (proyecto.supervisorId) ids.add(proyecto.supervisorId);
    if (proyecto.maestroId) ids.add(proyecto.maestroId);
    (proyecto.ayudantesIds || []).forEach(id => ids.add(id));
    // v8.19.29: también incluye maestros de área (maestroAreaId) si los hay
    (proyecto.areas || []).forEach(a => { if (a.maestroAreaId) ids.add(a.maestroAreaId); });
    return [...ids].map(id => (data.personal || []).find(p => p.id === id)).filter(Boolean);
  }, [proyecto, data.personal]);

  const rolDe = (persona) => {
    if (proyecto.supervisorId === persona.id) return { label: 'Supervisor', color: 'bg-blue-900/40 border-blue-700 text-blue-300' };
    if (proyecto.maestroId === persona.id) return { label: 'Maestro', color: 'bg-red-900/40 border-red-700 text-red-300' };
    if ((proyecto.areas || []).some(a => a.maestroAreaId === persona.id)) return { label: 'Maestro área', color: 'bg-red-900/30 border-red-700/60 text-red-300' };
    return { label: 'Ayudante', color: 'bg-zinc-800 border-zinc-700 text-zinc-300' };
  };

  const guardar = async (personaId, nuevo) => {
    const n = Number(nuevo);
    if (!Number.isFinite(n) || n < 0) { alert('Costo inválido'); return; }
    setGuardandoId(personaId);
    try {
      await db.guardarCostoDia(proyecto.id, personaId, n);
      setCostos(prev => ({ ...prev, [personaId]: n }));
      setEditId(null);
      if (onCambio) await onCambio();
    } catch (e) { alert('Error guardando: ' + (e.message || e)); }
    setGuardandoId(null);
  };

  if (loading) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center justify-center">
      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1">
          <Hammer className="w-3 h-3 text-red-500" /> Costo por día del personal asignado
        </div>
        <div className="text-[10px] text-zinc-500">{personas.filter(p => costos[p.id]).length} de {personas.length} configurados</div>
      </div>
      {personas.length === 0 ? (
        <div className="text-[11px] text-zinc-500 italic py-2">Aún no hay personal asignado a este proyecto.</div>
      ) : (
        <div className="space-y-1">
          {personas.map(p => {
            const costo = costos[p.id] || 0;
            const editing = editId === p.id;
            const rol = rolDe(p);
            const sinConfigurar = !costo;
            return (
              <div key={p.id} className={`bg-zinc-950 border ${sinConfigurar ? 'border-yellow-700/50' : 'border-zinc-800'} px-2 py-1.5 flex items-center gap-2`}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs truncate">{p.nombre}</div>
                  <div className="text-[9px] flex items-center gap-1 mt-0.5">
                    <span className={`px-1 py-0.5 border ${rol.color} uppercase tracking-wider text-[8px]`}>{rol.label}</span>
                    {sinConfigurar && <span className="text-yellow-400">⚠ sin costo</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {editing ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="number" step="0.01" value={valor}
                        onChange={e => setValor(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') guardar(p.id, valor);
                          else if (e.key === 'Escape') setEditId(null);
                        }}
                        autoFocus
                        className="bg-zinc-950 border-2 border-red-600 text-right w-20 text-xs tabular-nums px-1.5 py-0.5 text-white outline-none"
                        disabled={guardandoId === p.id}
                      />
                      <span className="text-[9px] text-zinc-500">/día</span>
                      {guardandoId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                        <>
                          <button onClick={() => guardar(p.id, valor)} className="text-green-400 hover:text-green-300 text-[10px]" title="Guardar">✓</button>
                          <button onClick={() => setEditId(null)} className="text-zinc-500 hover:text-red-400 text-[10px]" title="Cancelar">✗</button>
                        </>
                      )}
                    </span>
                  ) : (
                    esAdmin ? (
                      <button
                        onClick={() => { setValor(String(costo)); setEditId(p.id); }}
                        className="text-right hover:bg-zinc-800 px-1.5 py-0.5 group inline-flex items-center gap-1"
                        title="Editar costo (solo admin)"
                      >
                        <span className={`font-bold tabular-nums ${sinConfigurar ? 'text-yellow-400' : 'text-green-400'}`}>
                          {formatRD(costo)}
                        </span>
                        <span className="text-[8px] text-zinc-500">/día</span>
                        <span className="text-[9px] text-red-400 opacity-30 group-hover:opacity-100">✎</span>
                      </button>
                    ) : (
                      <span className={`text-xs font-bold tabular-nums ${sinConfigurar ? 'text-yellow-400' : 'text-green-400'}`}>
                        {formatRD(costo)} <span className="text-[8px] text-zinc-500">/día</span>
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// v8.19.28: edición inline del modo de pago de mano de obra del proyecto.
const MODOS_PAGO = [
  { id: 'dia',     label: 'Por día' },
  { id: 'm2_fijo', label: 'm² fijo del sistema' },
  { id: 'm2',      label: 'm² por tarea' },
  { id: 'tarea',   label: 'Tarea (venta + maestro)' },
];
function ModoPagoEditor({ proyecto, onSaved }) {
  const [editing, setEditing] = React.useState(false);
  const [valor, setValor] = React.useState(proyecto.modoPagoManoObra || 'dia');
  const [guardando, setGuardando] = React.useState(false);
  const actual = proyecto.modoPagoManoObra || 'dia';
  const actualLabel = MODOS_PAGO.find(m => m.id === actual)?.label || actual;

  const guardar = async (nuevo) => {
    if (nuevo === actual) { setEditing(false); return; }
    if (!confirm(`Cambiar el modo de pago a "${MODOS_PAGO.find(m => m.id === nuevo)?.label || nuevo}"?\n\nEsto afecta cómo se calcula la nómina y RD$ devengado de este proyecto.`)) {
      setValor(actual);
      setEditing(false);
      return;
    }
    setGuardando(true);
    try {
      const proyActualizado = { ...proyecto, modoPagoManoObra: nuevo };
      if (onSaved) await onSaved(proyActualizado);
      setEditing(false);
    } catch (e) {
      alert('Error guardando modo de pago: ' + (e.message || e));
      setValor(actual);
    }
    setGuardando(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setValor(actual); setEditing(true); }}
        className="text-white font-bold inline-flex items-center gap-1 hover:bg-zinc-800 px-1 py-0.5 group"
        title="Editar modo de pago"
      >
        <span className="bg-blue-600/20 border border-blue-500/40 px-1.5 py-0.5 text-blue-200 text-[10px] uppercase tracking-wider">
          {actualLabel.split(' ')[0]}
        </span>
        <span className="hidden sm:inline">{actualLabel.split(' ').slice(1).join(' ')}</span>
        <span className="text-[9px] text-red-400 opacity-30 group-hover:opacity-100">✎</span>
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={valor}
        onChange={e => setValor(e.target.value)}
        disabled={guardando}
        autoFocus
        className="bg-zinc-950 border-2 border-red-600 text-white text-[11px] px-2 py-0.5 outline-none"
      >
        {MODOS_PAGO.map(m => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      {guardando ? (
        <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
      ) : (
        <>
          <button onClick={() => guardar(valor)} className="text-green-400 hover:text-green-300 text-[10px]" title="Guardar">✓</button>
          <button onClick={() => setEditing(false)} className="text-zinc-500 hover:text-red-400 text-[10px]" title="Cancelar">✗</button>
        </>
      )}
    </span>
  );
}

export default function TabManoDeObra({ proyecto, data, usuario, onActualizarProyecto, onRecargar }) {
  const sistema = data.sistemas[proyecto.sistema];
  const [loading, setLoading] = useState(true);
  const [detalles, setDetalles] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [costosDia, setCostosDia] = useState([]);
  const [modalAjuste, setModalAjuste] = useState(null); // { tipo: 'adelanto' | 'bono' | 'descuento' | 'dieta_extra' }

  const cargar = async () => {
    setLoading(true);
    try {
      const [det, aj, ct, jrn, cd] = await Promise.all([
        db.listarTodosDetalles({ proyectoId: proyecto.id }),
        db.listarAjustes({ proyectoId: proyecto.id }),
        db.listarCortes(),
        db.listarJornadasProyecto(proyecto.id).catch(() => []),
        db.listarCostosDia(proyecto.id).catch(() => []),
      ]);
      setDetalles(det);
      setAjustes(aj);
      setCortes(ct);
      setJornadas(jrn);
      setCostosDia(cd);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [proyecto.id]);

  const estado = useMemo(
    () => calcEstadoPagoProyecto({
      proyecto, sistema, sistemas: data.sistemas,
      reportes: data.reportes, detallesNomina: detalles, ajustes, cortes,
      jornadas, costosDia,
    }),
    [proyecto, sistema, data.sistemas, data.reportes, detalles, ajustes, cortes, jornadas, costosDia],
  );

  const cortesPorId = useMemo(() => {
    const m = {};
    cortes.forEach(c => { m[c.id] = c; });
    return m;
  }, [cortes]);

  // Agrupar pagos por persona
  const pagosPorPersona = useMemo(() => {
    const g = {};
    detalles.forEach(d => {
      if (!g[d.personaId]) g[d.personaId] = { personaId: d.personaId, personaNombre: d.personaNombre, montoTotal: 0, m2Total: 0, recibos: [] };
      g[d.personaId].montoTotal += d.montoTotal;
      g[d.personaId].m2Total += d.m2Producidos;
      g[d.personaId].recibos.push(d);
    });
    return Object.values(g).sort((a, b) => b.montoTotal - a.montoTotal);
  }, [detalles]);

  const eliminarAvance = async (ajusteId) => {
    if (!confirm('¿Eliminar este avance? Si ya fue aplicado a un corte cerrado/pagado, debes reabrirlo primero.')) return;
    try {
      await db.eliminarAjuste(ajusteId);
      cargar();
    } catch (e) {
      alert('Error: ' + (e.message || e));
    }
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  const esAdmin = tieneRol(usuario, 'admin');
  const tieneTotal = estado.montoTotalAlCompletar != null;
  const modoLabel = {
    dia: 'Por día',
    m2_fijo: 'm² fijo del sistema',
    m2: 'm² por tarea',
    tarea: 'Tarea (venta + maestro)',
  }[proyecto.modoPagoManoObra] || proyecto.modoPagoManoObra;

  return (
    <div className="space-y-4">
      {/* Banner del modo de pago — v8.19.28: editable inline por admin */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[11px]">
          <Hammer className="w-3 h-3 text-red-500" />
          <span className="text-zinc-500 uppercase tracking-wider">Modo de pago:</span>
          {esAdmin ? (
            <ModoPagoEditor
              proyecto={proyecto}
              onSaved={async (nuevoProy) => {
                if (onActualizarProyecto) await onActualizarProyecto(nuevoProy);
                if (onRecargar) await onRecargar();
                await cargar();
              }}
            />
          ) : (
            <span className="text-white font-bold">{modoLabel}</span>
          )}
        </div>
        <div className="text-[10px] text-zinc-500">{formatNum(estado.m2TotalProyecto)} m² contratados</div>
      </div>

      {/* v8.19.29: si el modo es "Por día", listar el personal y su costo/día */}
      {proyecto.modoPagoManoObra === 'dia' && (
        <CostosDiaPorPersona proyecto={proyecto} data={data} esAdmin={esAdmin} onCambio={cargar} />
      )}

      {/* KPIs principales — lo importante: devengado, pagado, por pagar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(() => {
          // v8.19.24: el m² "ejecutado" útil para CUALQUIER modo de pago es el
          // EFECTIVO ponderado por peso de tarea (capeado por m² del área):
          // refleja el progreso físico real, no la suma cruda que multiplica
          // por cantidad de pasos reportados.
          // Fallback: si el proyecto no tiene áreas con m² definidos
          // (m2EfectivoPonderado = 0 estructuralmente), caemos al m2Producidos.
          const tieneAreas = estado.m2TotalProyecto > 0;
          const valor = tieneAreas ? estado.m2EfectivoPonderado : estado.m2Producidos;
          const pct = estado.pctAvanceSistema;
          const showRaw = Math.abs((estado.m2Producidos || 0) - (valor || 0)) > 1;
          return (
            <KPICard
              icono={<TrendingUp className="w-3 h-3" />}
              label={tieneAreas ? 'm² Ejecutados (efectivos)' : 'm² Ejecutados'}
              valor={formatNum(valor)}
              sub={
                tieneAreas
                  ? `${pct.toFixed(1)}% del proyecto${showRaw ? ` · Σ ${formatNum(estado.m2Producidos)} reportados` : ''}`
                  : (showRaw ? `Σ ${formatNum(estado.m2Producidos)} reportados` : null)
              }
              color="blue"
            />
          );
        })()}
        <KPICard
          icono={<Target className="w-3 h-3" />}
          label="RD$ Devengado"
          valor={formatRD(estado.montoDevengado)}
          sub="acumulado por lo reportado"
          color="white"
          highlight
        />
        <KPICard
          icono={<Wallet className="w-3 h-3" />}
          label="RD$ Pagado"
          valor={formatRD(estado.montoPagado)}
          sub={`${detalles.length} recibo${detalles.length !== 1 ? 's' : ''} en cortes cerrados`}
          color="green"
        />
        <KPICard
          icono={<Coins className="w-3 h-3" />}
          label="RD$ Por pagar"
          valor={formatRD(estado.montoPorPagar)}
          sub="devengado − pagado"
          color={estado.montoPorPagar > 0 ? 'yellow' : 'zinc'}
          highlight={estado.montoPorPagar > 0}
        />
      </div>

      {/* Avance del proyecto y proyección al completar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Avance: m² pagados vs producidos */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Pagado vs ejecutado</div>
          {estado.m2Producidos === 0 ? (
            <div className="text-xs text-zinc-500 py-2">Sin reportes aún en este proyecto.</div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>{formatNum(estado.m2Pagados)} m² cobrados</span>
                <span>
                  {(() => {
                    const tieneAreas = estado.m2TotalProyecto > 0;
                    const valor = tieneAreas ? estado.m2EfectivoPonderado : estado.m2Producidos;
                    const showRaw = Math.abs((estado.m2Producidos || 0) - (valor || 0)) > 1;
                    return (
                      <>
                        {formatNum(valor)} m² ejecutados
                        {showRaw && <span className="text-zinc-600"> · Σ {formatNum(estado.m2Producidos)} reportados</span>}
                      </>
                    );
                  })()}
                </span>
              </div>
              <div className="h-3 bg-zinc-950 border border-zinc-800 rounded-card relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-green-600/70"
                  style={{ width: `${Math.min(100, estado.pctPagado)}%` }}
                />
              </div>
              {estado.m2Pendientes > 0 && (
                <div className="text-[10px] text-yellow-400">
                  ⚠️ {formatNum(estado.m2Pendientes)} m² ejecutados sin cuadrar en corte cerrado
                </div>
              )}
            </>
          )}
        </div>

        {/* Proyección al completar el proyecto */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Proyección al 100%</div>
          {tieneTotal ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Total al maestro al completar:</span>
                <span className="text-white font-bold">{formatRD(estado.montoTotalAlCompletar)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Pendiente al 100% (− pagado):</span>
                <span className="text-yellow-400 font-bold">{formatRD(estado.montoPendienteAlCompletar)}</span>
              </div>
              {estado.avancesPendientes > 0 && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800">
                  <span className="text-zinc-500">Avances activos:</span>
                  <span className="text-orange-400 font-bold">− {formatRD(estado.avancesPendientes)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-zinc-500 py-2">
              Modo "Por día": no se puede proyectar el total sin saber cuántos días faltan.
            </div>
          )}
        </div>
      </div>

      {/* Pagos a maestros/equipo por persona */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Pagos por persona</div>
        {pagosPorPersona.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center py-4">Aún no hay recibos cerrados para este proyecto.</div>
        ) : (
          <div className="space-y-1.5">
            {pagosPorPersona.map(p => (
              <div key={p.personaId} className="bg-zinc-950 border border-zinc-800 rounded-card p-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{p.personaNombre}</div>
                  <div className="text-[10px] text-zinc-500">{formatNum(p.m2Total)} m² · {p.recibos.length} recibo{p.recibos.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="text-sm font-bold text-green-400 shrink-0">{formatRD(p.montoTotal)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Movimientos del proyecto: avances + bonos + dietas + descuentos */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Movimientos del proyecto</div>
          {esAdmin && (
            <div className="flex gap-1">
              <button
                onClick={() => setModalAjuste({ tipo: 'bono' })}
                className="text-[10px] bg-green-700 hover:bg-green-800 text-white font-black uppercase px-2 py-1.5 flex items-center gap-1"
                title="Bono al maestro (suma al devengado)"
              >
                <Plus className="w-3 h-3" /> Bono
              </button>
              <button
                onClick={() => setModalAjuste({ tipo: 'adelanto' })}
                className="text-[10px] bg-orange-700 hover:bg-orange-800 text-white font-black uppercase px-2 py-1.5 flex items-center gap-1"
                title="Adelanto/avance — se descuenta en la próxima quincena"
              >
                <Plus className="w-3 h-3" /> Avance
              </button>
              <button
                onClick={() => setModalAjuste({ tipo: 'descuento' })}
                className="text-[10px] bg-red-800 hover:bg-red-900 text-white font-black uppercase px-2 py-1.5 flex items-center gap-1"
                title="Descuento — resta del devengado"
              >
                <Plus className="w-3 h-3" /> Descuento
              </button>
            </div>
          )}
        </div>
        <div className="text-[10px] text-zinc-500">
          <span className="text-green-400">Bonos / dietas extra</span> suman al devengado · <span className="text-orange-400">avances</span> se descuentan en la próxima 15na · <span className="text-red-400">descuentos</span> restan del devengado.
        </div>
        {ajustes.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center py-4">Sin movimientos en este proyecto.</div>
        ) : (
          <div className="space-y-1.5">
            {ajustes.sort((a, b) => b.fecha.localeCompare(a.fecha)).map(a => {
              const persona = data.personal.find(p => p.id === a.personaId);
              const corteAplicado = a.aplicadoACorteId ? cortesPorId[a.aplicadoACorteId] : null;
              const tipoMeta = TIPOS_AJUSTE[a.tipo] || TIPOS_AJUSTE.bono;
              return (
                <div key={a.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2 flex items-start gap-2">
                  <div className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 shrink-0 ${tipoMeta.badgeCls}`}>
                    {tipoMeta.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{persona?.nombre || a.personaId}</div>
                    <div className="text-[10px] text-zinc-500">{a.fecha}{a.concepto ? ` · ${a.concepto}` : ''}</div>
                    {corteAplicado ? (
                      <div className="text-[10px] text-zinc-500 mt-0.5">✓ aplicado en corte {corteAplicado.fechaInicio} → {corteAplicado.fechaFin}</div>
                    ) : (
                      <div className="text-[10px] text-orange-400 mt-0.5">⏳ pendiente para próxima 15na</div>
                    )}
                  </div>
                  <div className={`text-sm font-bold shrink-0 ${tipoMeta.montoCls}`}>{tipoMeta.signo}{formatRD(a.monto)}</div>
                  {esAdmin && !corteAplicado && (
                    <button
                      onClick={() => eliminarAvance(a.id)}
                      className="text-zinc-500 hover:text-red-400 shrink-0"
                      title="Eliminar movimiento"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalAjuste && (
        <ModalAjusteProyecto
          tipoInicial={modalAjuste.tipo}
          proyecto={proyecto}
          data={data}
          usuario={usuario}
          onCerrar={() => setModalAjuste(null)}
          onGuardado={() => { setModalAjuste(null); cargar(); }}
        />
      )}
    </div>
  );
}

const TIPOS_AJUSTE = {
  adelanto: { label: 'Avance', signo: '−', montoCls: 'text-orange-400', badgeCls: 'bg-orange-900/40 text-orange-300 border border-orange-800' },
  bono: { label: 'Bono', signo: '+', montoCls: 'text-green-400', badgeCls: 'bg-green-900/40 text-green-300 border border-green-800' },
  dieta_extra: { label: 'Dieta', signo: '+', montoCls: 'text-green-400', badgeCls: 'bg-green-900/40 text-green-300 border border-green-800' },
  descuento: { label: 'Descuento', signo: '−', montoCls: 'text-red-400', badgeCls: 'bg-red-900/40 text-red-300 border border-red-800 rounded-full' },
};

function KPICard({ icono, label, valor, sub, color, highlight }) {
  const colors = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    orange: 'text-orange-400',
    white: 'text-white',
    zinc: 'text-zinc-300',
  };
  const cls = colors[color] || colors.zinc;
  return (
    <div className={`p-3 border rounded-card transition-colors ${highlight ? 'bg-zinc-950 border-red-600/40 shadow-card' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-zinc-500 font-bold">
        {icono}{label}
      </div>
      <div className={`text-xl font-black mt-1 ${cls}`}>{valor}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ModalAjusteProyecto({ tipoInicial = 'bono', proyecto, data, usuario, onCerrar, onGuardado }) {
  const maestrosDelProyecto = (data.personal || []).filter(p => {
    if (p.id === proyecto.maestroId) return true;
    if (p.id === proyecto.supervisorId) return true;
    if ((proyecto.ayudantesIds || []).includes(p.id)) return true;
    return false;
  });
  const maestroDefault = proyecto.maestroId || maestrosDelProyecto[0]?.id || '';
  const [tipo, setTipo] = useState(tipoInicial);
  const [personaId, setPersonaId] = useState(maestroDefault);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [guardando, setGuardando] = useState(false);

  const tipoConfigs = {
    bono: { titulo: 'Agregar bono', accion: 'Otorgar bono', explicacion: 'Suma al devengado del maestro. Útil para limpieza difícil, sobrecostos, etc.', borde: 'border-green-700', focus: 'focus:border-green-500', monto: 'border-green-800 text-green-400' },
    adelanto: { titulo: 'Otorgar avance', accion: 'Otorgar avance', explicacion: 'Se descontará al maestro en la próxima quincena cuando se cierre el corte que cubra esta fecha.', borde: 'border-orange-700', focus: 'focus:border-orange-500', monto: 'border-orange-800 text-orange-400' },
    dieta_extra: { titulo: 'Dieta extra', accion: 'Agregar dieta', explicacion: 'Suma al devengado. Para dietas no presupuestadas o gastos extra del proyecto.', borde: 'border-green-700', focus: 'focus:border-green-500', monto: 'border-green-800 text-green-400' },
    descuento: { titulo: 'Aplicar descuento', accion: 'Aplicar descuento', explicacion: 'Resta del devengado del maestro. Para penalizaciones, repagos, ajustes negativos.', borde: 'border-red-800', focus: 'focus:border-red-500', monto: 'border-red-800 text-red-400' },
  };
  const cfg = tipoConfigs[tipo] || tipoConfigs.bono;

  const guardar = async () => {
    if (!personaId) { alert('Selecciona la persona'); return; }
    const m = parseFloat(monto);
    if (!m || m <= 0) { alert('Ingresa un monto válido'); return; }
    setGuardando(true);
    try {
      await db.crearAjuste({
        id: 'a_' + Date.now(),
        personaId, fecha, tipo, monto: m,
        concepto: concepto || cfg.titulo + ` · ${proyecto.referenciaOdoo || proyecto.cliente || ''}`.trim(),
        proyectoId: proyecto.id,
        creadoPorId: usuario?.id || null,
      });
      onGuardado();
    } catch (e) {
      alert('Error: ' + (e.message || e));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className={`bg-zinc-900 border-2 ${cfg.borde} max-w-md w-full p-5 space-y-4`}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-zinc-400 font-bold">{cfg.titulo}</div>
            <div className="text-sm font-bold mt-1">{proyecto.cliente || proyecto.nombre}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {/* Selector de tipo (chips) */}
        <div className="grid grid-cols-4 gap-1">
          {Object.entries(tipoConfigs).map(([k, c]) => (
            <button
              key={k}
              onClick={() => setTipo(k)}
              className={`text-[9px] uppercase tracking-wider font-bold py-2 border-2 ${tipo === k ? `${c.borde} bg-zinc-950 text-white` : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700'}`}
            >
              {c.titulo.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Persona</div>
          <select
            value={personaId}
            onChange={e => setPersonaId(e.target.value)}
            className={`w-full bg-zinc-950 border-2 border-zinc-800 ${cfg.focus} outline-none px-3 py-2 text-white text-sm`}
          >
            <option value="">— Seleccionar —</option>
            <optgroup label="Asignados al proyecto">
              {maestrosDelProyecto.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </optgroup>
            <optgroup label="Otros maestros/supervisores">
              {(data.personal || []).filter(p => !maestrosDelProyecto.find(m => m.id === p.id) && (tieneRol(p, 'maestro') || tieneRol(p, 'supervisor'))).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </optgroup>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Fecha</div>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className={`w-full bg-zinc-950 border-2 border-zinc-800 ${cfg.focus} outline-none px-3 py-2 text-white text-sm`}
            />
          </div>
          <div className="space-y-2">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Monto RD$</div>
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0"
              className={`w-full bg-zinc-950 border-2 ${cfg.monto} outline-none px-3 py-2 text-sm font-bold text-right`}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Concepto (opcional)</div>
          <input
            type="text"
            value={concepto}
            onChange={e => setConcepto(e.target.value)}
            placeholder={tipo === 'bono' ? 'Ej: Limpieza extra difícil en techo nivel 3' : 'Motivo'}
            className={`w-full bg-zinc-950 border-2 border-zinc-800 ${cfg.focus} outline-none px-3 py-2 text-white text-sm`}
          />
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] text-zinc-500">
          💡 {cfg.explicacion}
        </div>

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1"
          >
            {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : cfg.accion}
          </button>
        </div>
      </div>
    </div>
  );
}
