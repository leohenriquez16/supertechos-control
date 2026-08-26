'use client';

// v8.46.0: Tab Rentabilidad — reemplaza TabCosto.
// Presupuesto por PARTIDA (generado desde costos por sistema + precios cuadrados con
// el maestro, editable en borrador, congelado con versionado al aprobar) contra el
// REAL (nómina, envíos, caja chica clasificada) y la PROYECCIÓN al cierre por avance.
// La MDO real sale de calcEstadoPagoProyecto (salda el TODO del viejo TabCosto).
// Si la obra tiene cuenta analítica de Odoo, muestra las compras facturadas como referencia.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronDown, Plus, RefreshCw, CheckCircle2, Trash2, AlertTriangle, TrendingUp } from 'lucide-react';
import * as db from '../../../lib/db';
import { formatRD, formatNum } from '../../../lib/helpers/formato';
import { calcEstadoPagoProyecto } from '../../../lib/helpers/calculos';
import {
  generarPresupuestoDesdeProyecto, calcRentabilidadObra, CATEGORIAS_GASTO,
} from '../../../lib/helpers/presupuestoObra';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const ESTADO_BADGE = {
  borrador: 'bg-yellow-900/40 border-yellow-700 text-yellow-300',
  aprobado: 'bg-green-900/40 border-green-700 text-green-300',
  superseded: 'bg-zinc-800 border-zinc-700 text-zinc-400',
};

const SEMAFORO = { verde: 'text-green-400', ambar: 'text-yellow-400', rojo: 'text-red-400' };

function CeldaMonto({ valor, cls = '' }) {
  return <td className={`text-right tabular-nums py-1.5 pl-3 ${cls}`}>{valor == null ? <span className="text-zinc-600">—</span> : formatRD(valor)}</td>;
}

function InputMini({ valor, onChange, ancho = 'w-20' }) {
  return (
    <input
      type="number" step="any" value={valor ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={`${ancho} bg-zinc-950 border border-yellow-700/60 text-yellow-300 text-[11px] px-1 py-0.5 text-right tabular-nums`}
    />
  );
}

export default function TabRentabilidad({ proyecto, data, usuario, esAdmin }) {
  const sistema = data.sistemas?.[proyecto.sistema] || null;
  const [loading, setLoading] = useState(true);
  const [versiones, setVersiones] = useState([]);
  const [sel, setSel] = useState(null);          // presupuesto seleccionado (objeto editable)
  const [dirty, setDirty] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [detalles, setDetalles] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [costosDia, setCostosDia] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [odooCompras, setOdooCompras] = useState(null); // { totalCosto, lineas } | null

  const cargar = async () => {
    setLoading(true);
    try {
      const [pptos, det, aj, ct, jrn, cd, movs] = await Promise.all([
        db.listarPresupuestosObra(proyecto.id).catch(() => []),
        db.listarTodosDetalles({ proyectoId: proyecto.id }),
        db.listarAjustes({ proyectoId: proyecto.id }),
        db.listarCortes(),
        db.listarJornadasProyecto(proyecto.id).catch(() => []),
        db.listarCostosDia(proyecto.id).catch(() => []),
        db.listarMovimientosCajaChica({ proyectoId: proyecto.id }).catch(() => []),
      ]);
      setVersiones(pptos);
      const vigente = pptos.find(p => p.estado === 'aprobado') || pptos[0] || null;
      setSel(vigente ? JSON.parse(JSON.stringify(vigente)) : null);
      setDirty(false);
      setDetalles(det); setAjustes(aj); setCortes(ct); setJornadas(jrn); setCostosDia(cd);
      setMovimientos(movs || []);
    } catch (e) { console.error('rentabilidad:', e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [proyecto.id]);

  // Compras facturadas en Odoo por cuenta analítica (referencia, no suma al costo)
  useEffect(() => {
    let cancel = false;
    const ids = [proyecto.analiticaOdooId, ...((proyecto.subCotizaciones || []).map(s => s.analiticaOdooId))]
      .filter(Boolean);
    if (!ids.length) { setOdooCompras(null); return; }
    (async () => {
      try {
        const res = await fetch(`/api/odoo/costos-analitica?ids=${ids.join(',')}`);
        const json = await res.json();
        if (!cancel && res.ok) setOdooCompras(json);
      } catch { /* Odoo caído no bloquea el tab */ }
    })();
    return () => { cancel = true; };
  }, [proyecto.analiticaOdooId]);

  const estadoPago = useMemo(() => calcEstadoPagoProyecto({
    proyecto, sistema, sistemas: data.sistemas,
    reportes: data.reportes, detallesNomina: detalles, ajustes, cortes, jornadas, costosDia,
  }), [proyecto, sistema, data.sistemas, data.reportes, detalles, ajustes, cortes, jornadas, costosDia]);

  const rent = useMemo(() => {
    if (!sel) return null;
    return calcRentabilidadObra({
      presupuesto: sel, proyecto, sistemas: data.sistemas,
      reportes: data.reportes, envios: data.envios || [],
      movimientosCajaChica: movimientos, estadoPago,
      mdoPagadoRd: estadoPago?.montoPagado ?? null, config: data.config || {},
    });
  }, [sel, proyecto, data.sistemas, data.reportes, data.envios, movimientos, estadoPago, data.config]);

  const esBorrador = sel?.estado === 'borrador';
  const editable = esBorrador && esAdmin;

  // ---------- acciones ----------
  const generar = async () => {
    const maxV = versiones.reduce((m, p) => Math.max(m, p.version || 1), 0);
    const nuevo = generarPresupuestoDesdeProyecto({
      proyecto, sistemas: data.sistemas, config: data.config, usuarioId: usuario?.id, version: maxV + 1,
    });
    setWarnings(nuevo.warnings || []);
    const { warnings: _w, ...fila } = nuevo;
    try {
      await db.crearPresupuestoObra(fila);
      await cargar();
      const pptos = await db.listarPresupuestosObra(proyecto.id);
      const b = pptos.find(p => p.id === fila.id);
      if (b) { setSel(JSON.parse(JSON.stringify(b))); }
    } catch (e) { alert('Error creando presupuesto: ' + (e.message || e)); }
  };

  const guardarBorrador = async () => {
    if (!sel) return;
    setGuardando(true);
    try {
      await db.actualizarPresupuestoObra(sel.id, {
        venta: sel.venta, partidas: sel.partidas, gastos: sel.gastos, notas: sel.notas,
      });
      setDirty(false);
      setVersiones(vs => vs.map(v => v.id === sel.id ? { ...v, ...sel } : v));
    } catch (e) { alert('Error guardando: ' + (e.message || e)); }
    setGuardando(false);
  };

  const aprobar = async () => {
    if (!sel) return;
    if (!confirm(`¿Aprobar el presupuesto v${sel.version}? Se congela como versión vigente${versiones.some(v => v.estado === 'aprobado') ? ' y la anterior queda superseded' : ''}.`)) return;
    setGuardando(true);
    try {
      if (dirty) await db.actualizarPresupuestoObra(sel.id, { venta: sel.venta, partidas: sel.partidas, gastos: sel.gastos, notas: sel.notas });
      await db.aprobarPresupuestoObra(sel.id, proyecto.id, usuario?.id);
      await cargar();
    } catch (e) { alert('Error aprobando: ' + (e.message || e)); }
    setGuardando(false);
  };

  const nuevaVersion = async () => {
    const base = versiones.find(p => p.estado === 'aprobado') || sel;
    if (!base) return;
    const maxV = versiones.reduce((m, p) => Math.max(m, p.version || 1), 0);
    const clon = {
      ...JSON.parse(JSON.stringify(base)),
      id: `ppto_${Date.now()}`, version: maxV + 1, estado: 'borrador',
      creadoPorId: usuario?.id || null, aprobadoPorId: null, aprobadoAt: null,
    };
    try {
      await db.crearPresupuestoObra(clon);
      await cargar();
    } catch (e) { alert('Error creando versión: ' + (e.message || e)); }
  };

  const eliminarBorrador = async () => {
    if (!sel || sel.estado !== 'borrador') return;
    if (!confirm(`¿Eliminar el borrador v${sel.version}?`)) return;
    try { await db.eliminarPresupuestoObra(sel.id); await cargar(); }
    catch (e) { alert('Error: ' + (e.message || e)); }
  };

  // ---------- edición de líneas (solo borrador) ----------
  const patchLinea = (partidaId, lineaId, patch) => {
    setSel(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const p = next.partidas.find(x => x.id === partidaId);
      const l = p?.costos.find(x => x.id === lineaId);
      if (!l) return prev;
      Object.assign(l, patch);
      if (l.tipo === 'material') l.totalRd = (l.costoUnidad != null && l.cantidad != null) ? r2(l.cantidad * l.costoUnidad) : null;
      if (l.tipo === 'mdo_tarea') l.totalRd = r2((l.m2 || 0) * (l.precioM2 || 0));
      if (l.tipo === 'pct_venta') l.totalRd = r2((p.venta?.totalRd || 0) * ((l.pct || 0) / 100));
      if (l.tipo === 'monto_fijo') l.totalRd = l.monto != null ? r2(l.monto) : null;
      return next;
    });
    setDirty(true);
  };

  const patchVentaPartida = (partidaId, precioM2Rd) => {
    setSel(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const p = next.partidas.find(x => x.id === partidaId);
      if (!p) return prev;
      p.venta.precioM2Rd = precioM2Rd || 0;
      p.venta.totalRd = r2((p.m2 || 0) * (precioM2Rd || 0));
      p.costos.forEach(l => { if (l.tipo === 'pct_venta') l.totalRd = r2(p.venta.totalRd * ((l.pct || 0) / 100)); });
      return next;
    });
    setDirty(true);
  };

  const patchGasto = (gastoId, totalRd) => {
    setSel(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const g = next.gastos.find(x => x.id === gastoId);
      if (g) { g.modo = 'monto'; g.totalRd = totalRd || 0; }
      return next;
    });
    setDirty(true);
  };

  const toggle = (k) => setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // ---------- render ----------
  if (loading) return (
    <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-red-500" /></div>
  );

  if (!sel) return (
    <div className="bg-zinc-900 border border-zinc-800 p-6 text-center space-y-3">
      <div className="text-sm text-zinc-400">Esta obra aún no tiene presupuesto de costos.</div>
      <div className="text-[11px] text-zinc-500">Se genera desde los costos por sistema + los precios de MDO cuadrados con el maestro, y lo ajustas antes de aprobar.</div>
      {esAdmin && (
        <button onClick={generar} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-2">
          <Plus className="w-4 h-4" /> Generar presupuesto
        </button>
      )}
    </div>
  );

  const t = rent?.totales || {};
  const semColor = SEMAFORO[rent?.semaforo] || 'text-zinc-300';

  return (
    <div className="space-y-5">
      {/* Header versiones + acciones */}
      <div className="flex flex-wrap items-center gap-2">
        {versiones.map(v => (
          <button key={v.id}
            onClick={() => { setSel(JSON.parse(JSON.stringify(v))); setDirty(false); setWarnings([]); }}
            className={`text-[10px] px-2 py-1 border uppercase tracking-wider font-bold ${v.id === sel.id ? 'border-red-600 text-white bg-zinc-900' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
            v{v.version} <span className={`ml-1 px-1 border text-[8px] ${ESTADO_BADGE[v.estado]}`}>{v.estado}</span>
          </button>
        ))}
        <div className="flex-1" />
        {esAdmin && (
          <div className="flex items-center gap-2">
            {editable && dirty && (
              <button onClick={guardarBorrador} disabled={guardando}
                className="text-[11px] font-bold px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700">
                {guardando ? '…' : 'Guardar borrador'}
              </button>
            )}
            {editable && (
              <button onClick={aprobar} disabled={guardando}
                className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white">
                <CheckCircle2 className="w-3 h-3" /> Aprobar
              </button>
            )}
            {editable && <button onClick={eliminarBorrador} className="p-1.5 text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            {!esBorrador && (
              <button onClick={nuevaVersion} className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700">
                <RefreshCw className="w-3 h-3" /> Nueva versión
              </button>
            )}
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="bg-yellow-950/40 border border-yellow-800/60 p-3 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-yellow-300"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-card">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Venta s/ITBIS</div>
          <div className="text-2xl font-black mt-1">{formatRD(t.ventaSinItbisRd)}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">{sel.venta?.fuente === 'cotizacion' ? `cotización${sel.venta?.monedaOrigen === 'USD' ? ` · USD @${sel.venta?.tasaUsd}` : ''}` : 'valor derivado'}</div>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-card">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Costo proyectado</div>
          <div className="text-2xl font-black mt-1">{formatRD(t.costoProyectado)}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">ppto {formatRD(t.costoPpto)}</div>
        </div>
        <div className="p-4 bg-zinc-950 border border-red-600/40 rounded-card shadow-card">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold flex items-center gap-1"><TrendingUp className="w-3 h-3" />Margen proyectado</div>
          <div className={`text-2xl font-black mt-1 ${semColor}`}>{formatRD(t.margenProyectado)}</div>
          <div className={`text-[10px] mt-0.5 ${semColor}`}>{(t.margenPctProyectado || 0).toFixed(1)}% · objetivo {data.config?.margen_objetivo_pct || 30}%</div>
        </div>
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-card">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Avance</div>
          <div className="text-2xl font-black mt-1">{t.avanceGlobalPct != null ? `${t.avanceGlobalPct.toFixed(1)}%` : '—'}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">devengado {formatRD(t.ventaDevengada)}</div>
        </div>
      </div>

      {/* Partidas */}
      {rent?.partidas.map(p => {
        const abierto = expanded.has(p.id);
        const mPct = p.margenPctProyectado;
        return (
          <div key={p.id} className="border border-zinc-800 bg-zinc-950/50">
            <button onClick={() => toggle(p.id)} className="w-full px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-zinc-900">
              <div className="flex items-center gap-2 min-w-0">
                <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform shrink-0 ${abierto ? 'rotate-180' : ''}`} />
                <span className="font-bold text-base text-white truncate">{p.nombre}</span>
                <span className="text-[10px] text-zinc-500 shrink-0">{formatNum(p.m2)} {p.unidad} · avance {p.avance != null ? `${(p.avance * 100).toFixed(0)}%` : '—'}</span>
              </div>
              <div className="flex items-center gap-6 shrink-0 text-right">
                <div><div className="text-[10px] uppercase text-zinc-600">Venta</div><div className="text-sm font-bold tabular-nums">{formatRD(p.ventaRd)}</div></div>
                <div><div className="text-[10px] uppercase text-zinc-600">Costo proy.</div><div className="text-sm font-bold tabular-nums">{formatRD(p.costoProyectado)}</div></div>
                <div><div className="text-[10px] uppercase text-zinc-600">Margen</div>
                  <div className={`text-sm font-black tabular-nums ${mPct >= (data.config?.margen_objetivo_pct || 30) ? 'text-green-400' : mPct >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {mPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </button>
            {abierto && (
              <div className="border-t border-zinc-800 px-4 py-3 bg-black/20 space-y-3">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  Precio venta: {editable
                    ? <InputMini valor={p.venta?.precioM2Rd} onChange={v => patchVentaPartida(p.id, v)} />
                    : <b className="text-zinc-200">{formatRD(p.venta?.precioM2Rd)}</b>}
                  /{p.unidad} · total <b className="text-zinc-200">{formatRD(p.ventaRd)}</b>
                </div>
                <table className="w-full text-xs md:text-[13px]">
                  <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="text-left py-1">Concepto</th>
                    <th className="text-right py-1">Base</th>
                    <th className="text-right py-1">Presupuesto</th>
                    <th className="text-right py-1">Real</th>
                    <th className="text-right py-1">Proyección</th>
                  </tr></thead>
                  <tbody>
                    {p.lineas.map(l => (
                      <tr key={l.id} className="border-t border-zinc-900">
                        <td className="py-1.5 text-zinc-300 pr-2">
                          {l.nombre}
                          {l.tipo === 'pct_venta' && <span className="ml-1 text-[8px] bg-yellow-900/40 border border-yellow-700 text-yellow-300 px-1 uppercase">estimado</span>}
                          {l.tipo === 'material' && l.costoUnidad == null && !editable && <span className="ml-1 text-[8px] bg-red-900/40 border border-red-700 text-red-300 px-1 uppercase">sin costo</span>}
                        </td>
                        <td className="text-right tabular-nums text-zinc-500 py-1">
                          {l.tipo === 'material' && (<>
                            {formatNum(l.cantidad || 0)} {l.unidad} × {editable
                              ? <InputMini valor={l.costoUnidad} onChange={v => patchLinea(p.id, l.id, { costoUnidad: v })} ancho="w-16" />
                              : (l.costoUnidad != null ? formatRD(l.costoUnidad) : 'por definir')}
                          </>)}
                          {l.tipo === 'mdo_tarea' && (<>
                            {formatNum(l.m2 || 0)} m² × {editable
                              ? <InputMini valor={l.precioM2} onChange={v => patchLinea(p.id, l.id, { precioM2: v })} ancho="w-14" />
                              : formatRD(l.precioM2)}
                          </>)}
                          {l.tipo === 'pct_venta' && (<>
                            {editable ? <InputMini valor={l.pct} onChange={v => patchLinea(p.id, l.id, { pct: v })} ancho="w-12" /> : `${l.pct}`}% venta
                          </>)}
                          {l.tipo === 'monto_fijo' && editable && <InputMini valor={l.monto} onChange={v => patchLinea(p.id, l.id, { monto: v })} />}
                        </td>
                        <CeldaMonto valor={l.totalRd} cls="text-zinc-300" />
                        <CeldaMonto valor={l.real} cls="text-zinc-400" />
                        <CeldaMonto valor={l.proyeccion} cls="font-bold text-white" />
                      </tr>
                    ))}
                    <tr className="border-t-2 border-zinc-700 font-bold">
                      <td className="py-1 text-white uppercase text-[10px]">Subtotal costos</td>
                      <td />
                      <CeldaMonto valor={p.costoPpto} cls="text-white" />
                      <CeldaMonto valor={p.costoReal} cls="text-white" />
                      <CeldaMonto valor={p.costoProyectado} cls="text-white" />
                    </tr>
                    <tr className="font-bold">
                      <td className="py-1 text-green-400 uppercase text-[10px]">Utilidad partida</td>
                      <td />
                      <CeldaMonto valor={p.margenPpto} cls="text-green-400" />
                      <CeldaMonto valor={p.ventaDevengada != null ? r2(p.ventaDevengada - p.costoReal) : null} cls="text-green-400" />
                      <CeldaMonto valor={p.margenProyectado} cls="text-green-400" />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* MDO real de nómina (reconciliación) */}
      <div className="bg-zinc-950/50 border border-zinc-800 px-3 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-zinc-400">
        <span className="font-bold text-zinc-300 uppercase text-[10px]">MDO según nómina:</span>
        <span>devengado <b className="text-white tabular-nums">{formatRD(estadoPago?.montoDevengado)}</b></span>
        <span>pagado <b className="text-white tabular-nums">{formatRD(estadoPago?.montoPagado)}</b></span>
        <span>por pagar <b className="text-orange-300 tabular-nums">{formatRD(estadoPago?.montoPorPagar)}</b></span>
      </div>

      {/* Gastos de obra */}
      <div className="space-y-2">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Gastos de obra (caja chica)</div>
        {rent?.gastos.map(g => {
          const cfg = CATEGORIAS_GASTO[g.categoria] || CATEGORIAS_GASTO.otros;
          const abierto = expanded.has(g.id);
          return (
            <div key={g.id} className={`border ${cfg.color} bg-zinc-950/50`}>
              <button onClick={() => toggle(g.id)} className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-zinc-900">
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                  <span className="font-bold text-xs text-white">{cfg.label}</span>
                  {g.movimientos.length > 0 && <span className="text-[10px] text-zinc-500">· {g.movimientos.length}</span>}
                </div>
                <div className="flex items-center gap-4 text-right shrink-0">
                  <div><div className="text-[9px] uppercase text-zinc-600">Ppto</div>
                    <div className="text-xs tabular-nums" onClick={e => e.stopPropagation()}>
                      {editable ? <InputMini valor={g.ppto} onChange={v => patchGasto(g.id, v)} /> : <span className="text-zinc-300">{formatRD(g.ppto)}</span>}
                    </div>
                  </div>
                  <div><div className="text-[9px] uppercase text-zinc-600">Real</div><div className="text-xs font-bold tabular-nums text-white">{formatRD(g.real)}</div></div>
                  <div><div className="text-[9px] uppercase text-zinc-600">Proy.</div><div className="text-xs font-bold tabular-nums text-white">{formatRD(g.proyeccion)}</div></div>
                </div>
              </button>
              {abierto && g.movimientos.length > 0 && (
                <div className="border-t border-zinc-800 px-3 py-2 bg-black/20 space-y-1">
                  {g.movimientos.slice(0, 50).map(m => (
                    <div key={m.id} className="grid grid-cols-[auto_1fr_auto] gap-2 text-[11px] py-1 border-t border-zinc-900 first:border-t-0">
                      <div className="text-zinc-500 text-[10px]">{m.fecha}</div>
                      <div className="text-zinc-300 truncate">{(m.concepto || '').split('\n').join(' · ').slice(0, 80)}</div>
                      <div className="text-right tabular-nums font-bold text-white">{formatRD(m.monto)}</div>
                    </div>
                  ))}
                  {g.movimientos.length > 50 && <div className="text-[10px] text-zinc-500 italic pt-1">… {g.movimientos.length - 50} más</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Compras facturadas Odoo (referencia) */}
      {odooCompras && (
        <div className="bg-zinc-950/50 border border-zinc-800 px-3 py-2 text-[11px] text-zinc-400 flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="font-bold text-zinc-300 uppercase text-[10px]">Compras facturadas (Odoo · cuenta analítica):</span>
          <b className="text-white tabular-nums">{formatRD(odooCompras.totalCosto)}</b>
          <span className="text-[10px] text-zinc-500 italic">referencia contable — no suma al costo (evita doble conteo con envíos/caja)</span>
        </div>
      )}

      {/* Consolidado */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-4">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Consolidado</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500">
            <th className="text-left py-1" />
            <th className="text-right py-1">Presupuesto</th>
            <th className="text-right py-1">Real a la fecha</th>
            <th className="text-right py-1">Proyección</th>
          </tr></thead>
          <tbody>
            <tr className="border-t border-zinc-800">
              <td className="py-1 text-zinc-300 font-bold">Ingresos</td>
              <CeldaMonto valor={t.ventaSinItbisRd} cls="text-zinc-200" />
              <CeldaMonto valor={t.ventaDevengada} cls="text-zinc-200" />
              <CeldaMonto valor={t.ventaSinItbisRd} cls="text-zinc-200" />
            </tr>
            <tr className="border-t border-zinc-900">
              <td className="py-1 text-zinc-400">Costos y gastos</td>
              <CeldaMonto valor={t.costoPpto} cls="text-zinc-300" />
              <CeldaMonto valor={t.costoReal} cls="text-zinc-300" />
              <CeldaMonto valor={t.costoProyectado} cls="text-zinc-300" />
            </tr>
            <tr className="border-t-2 border-red-600 font-black">
              <td className="py-1.5 text-white uppercase text-[11px]">Utilidad</td>
              <CeldaMonto valor={t.margenPpto} cls={t.margenPpto >= 0 ? 'text-green-400' : 'text-red-400'} />
              <CeldaMonto valor={t.margenReal} cls={t.margenReal >= 0 ? 'text-green-400' : 'text-red-400'} />
              <CeldaMonto valor={t.margenProyectado} cls={t.margenProyectado >= 0 ? 'text-green-400' : 'text-red-400'} />
            </tr>
            <tr>
              <td className="py-1 text-zinc-500 text-[10px] uppercase">Margen %</td>
              <td className="text-right tabular-nums text-[11px] text-zinc-400">{(t.margenPctPpto || 0).toFixed(1)}%</td>
              <td className="text-right tabular-nums text-[11px] text-zinc-400">{t.ventaDevengada > 0 ? ((t.margenReal / t.ventaDevengada) * 100).toFixed(1) : '—'}%</td>
              <td className={`text-right tabular-nums text-[11px] font-bold ${semColor}`}>{(t.margenPctProyectado || 0).toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {rent?.sinCosto.length > 0 && (
        <div className="text-[10px] text-yellow-500/80 italic px-1">
          ⚠ {rent.sinCosto.length} material(es) sin costo (excluidos de los totales): {rent.sinCosto.join(', ')}. Colócalos en el borrador o en el sistema.
        </div>
      )}
      <div className="text-[10px] text-zinc-500 italic px-1">
        Presupuesto desde costos por sistema + precios de MDO cuadrados con el maestro. Caja chica auto-clasificada por concepto.
        Proyección = real ÷ avance (mín. 10% de avance). El % de bote es un estimado hasta registrar el gasto real.
      </div>
    </div>
  );
}
