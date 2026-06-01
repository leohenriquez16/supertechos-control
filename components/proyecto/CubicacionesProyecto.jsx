'use client';

// v8.19.98: Cubicaciones mensuales por áreas trabajadas + amortización de avances.
// - Configura: facturación por cubicaciones, retención %, anticipo, amortización %.
// - Nueva cubicación: por área mide m² ejecutado del período (vs m² ya cubicado),
//   calcula subtotal, retención, amortización del anticipo y neto a pagar.
// - Histórico de cubicaciones. Aditivo.

import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Plus, Trash2, Save, Calculator, FileText } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatNum } from '../../lib/helpers/formato';

export default function CubicacionesProyecto({ proyecto, usuario, esAdmin, onCerrar, onRecargar }) {
  const [loading, setLoading] = useState(true);
  const [cubs, setCubs] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState(false);

  // Config
  const [cfg, setCfg] = useState({
    facturacionPorCubicaciones: !!proyecto.facturacionPorCubicaciones,
    retencionPct: proyecto.retencionPct ?? 5,
    anticipoMonto: proyecto.anticipoMonto ?? '',
    amortizacionPct: proyecto.amortizacionPct ?? '',
    proximaCubicacionFecha: proyecto.proximaCubicacionFecha || '',
  });

  const areas = proyecto.areas || [];
  const totalM2 = areas.reduce((a, ar) => a + (Number(ar.m2) || 0), 0);
  const valorContrato = proyecto.valorCotizacion ?? proyecto.montoFinalCubicado ?? 0;
  const precioBase = totalM2 > 0 && valorContrato ? Math.round((valorContrato / totalM2) * 100) / 100 : 0;

  const recargar = async () => {
    setLoading(true);
    try { setCubs(await db.listarCubicaciones(proyecto.id)); } catch (e) { console.warn(e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [proyecto.id]);

  // Acumulados de cubicaciones previas.
  const m2AcumPorArea = useMemo(() => {
    const m = {};
    for (const c of cubs) for (const a of (c.areasCubicadas || [])) m[a.areaId] = (m[a.areaId] || 0) + (Number(a.m2EstePeriodo) || 0);
    return m;
  }, [cubs]);
  const amortizadoAcum = useMemo(() => cubs.reduce((a, c) => a + (Number(c.amortizacionMonto) || 0), 0), [cubs]);
  const retencionAcum = useMemo(() => cubs.reduce((a, c) => a + (Number(c.retencionMonto) || 0), 0), [cubs]);
  const facturadoAcum = useMemo(() => cubs.reduce((a, c) => a + (Number(c.subtotalGeneral) || 0), 0), [cubs]);

  // Form de nueva cubicación: filas por área.
  const [filas, setFilas] = useState([]);
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const iniciarNueva = () => {
    setFilas(areas.map(ar => ({ areaId: ar.id, areaNombre: ar.nombre || 'Área', m2TotalArea: Number(ar.m2) || 0, m2AcumuladoAnterior: m2AcumPorArea[ar.id] || 0, m2EstePeriodo: '', precioM2: precioBase })));
    setNueva(true);
  };
  const setFila = (i, campo, val) => setFilas(prev => prev.map((f, idx) => idx === i ? { ...f, [campo]: val } : f));

  // Cálculo en vivo. Modelo Super Techos: subtotal → +ITBIS 18% → total con ITBIS;
  // retención y amortización del anticipo se calculan SOBRE EL TOTAL CON ITBIS.
  const ITBIS_PCT = 18;
  const calc = useMemo(() => {
    const rows = filas.map(f => {
      const m2 = Number(f.m2EstePeriodo) || 0;
      const precio = Number(f.precioM2) || 0;
      const totalArea = Number(f.m2TotalArea) || 0;
      const ant = Number(f.m2AcumuladoAnterior) || 0;
      const acum = ant + m2;
      const subtotal = Math.round(m2 * precio * 100) / 100;
      return {
        ...f, m2EstePeriodo: m2, precioM2: precio, m2Acumulado: acum, subtotal,
        pctActual: totalArea > 0 ? (m2 / totalArea) * 100 : 0,
        pctAcum: totalArea > 0 ? (acum / totalArea) * 100 : 0,
      };
    });
    const subtotalGeneral = rows.reduce((a, r) => a + r.subtotal, 0);
    const itbisMonto = Math.round(subtotalGeneral * ITBIS_PCT) / 100;
    const totalConItbis = Math.round((subtotalGeneral + itbisMonto) * 100) / 100;
    const retencionMonto = Math.round(totalConItbis * (Number(cfg.retencionPct) || 0)) / 100;
    const anticipo = Number(cfg.anticipoMonto) || 0;
    const amortDisponible = Math.max(0, anticipo - amortizadoAcum);
    const amortizacionMonto = Math.min(Math.round(totalConItbis * (Number(cfg.amortizacionPct) || 0)) / 100, amortDisponible);
    const total = Math.round((totalConItbis - retencionMonto - amortizacionMonto) * 100) / 100;
    return { rows, subtotalGeneral, itbisMonto, totalConItbis, retencionMonto, amortizacionMonto, amortDisponible, total };
  }, [filas, cfg, amortizadoAcum]);

  const guardarConfig = async () => {
    setGuardando(true);
    try { await db.setConfigCubicaciones(proyecto.id, cfg); await onRecargar?.(); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };
  const guardarCubicacion = async () => {
    if (calc.subtotalGeneral <= 0) { alert('Ingresa el m² ejecutado de al menos un área.'); return; }
    setGuardando(true);
    try {
      await db.crearCubicacion({
        proyectoId: proyecto.id, fechaCubicacion: fecha,
        areasCubicadas: calc.rows.map(r => ({ areaId: r.areaId, areaNombre: r.areaNombre, m2TotalArea: r.m2TotalArea, m2AcumuladoAnterior: r.m2AcumuladoAnterior, m2EstePeriodo: r.m2EstePeriodo, m2Acumulado: r.m2Acumulado, precioM2: r.precioM2, subtotal: r.subtotal })),
        subtotalGeneral: calc.subtotalGeneral, retencionPct: Number(cfg.retencionPct) || 0, retencionMonto: calc.retencionMonto,
        amortizacionMonto: calc.amortizacionMonto, itbisPct: ITBIS_PCT, itbisMonto: calc.itbisMonto, total: calc.total,
        creadoPorId: usuario?.id, creadoPorNombre: usuario?.nombre,
      });
      setNueva(false); await recargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };
  const borrar = async (id) => { if (!confirm('¿Eliminar esta cubicación?')) return; try { await db.eliminarCubicacion(id); await recargar(); } catch (e) { alert('Error: ' + (e.message || e)); } };

  const activo = cfg.facturacionPorCubicaciones;
  const anticipo = Number(cfg.anticipoMonto) || 0;

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] overflow-y-auto" onClick={onCerrar}>
      <div className="min-h-full p-2 sm:p-4">
        <div className="bg-zinc-950 border-2 border-red-600 rounded-card max-w-3xl mx-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 bg-zinc-950 border-b-2 border-red-600 px-4 py-3 flex items-center justify-between z-10">
            <div className="min-w-0">
              <div className="font-black text-sm flex items-center gap-2"><Calculator className="w-4 h-4 text-red-500" /> Cubicaciones mensuales</div>
              <div className="text-[11px] text-zinc-500 truncate">{proyecto.cliente} · {formatNum(totalM2)} m² · contrato {formatRD(valorContrato)}</div>
            </div>
            <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          <div className="p-4 space-y-4">
            {/* Configuración */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" disabled={!esAdmin} checked={activo} onChange={e => setCfg(c => ({ ...c, facturacionPorCubicaciones: e.target.checked }))} className="w-4 h-4 accent-red-600" />
                <span className="text-sm font-bold">Facturación por cubicaciones mensuales</span>
              </label>
              {activo && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Campo label="Retención %"><input type="number" disabled={!esAdmin} value={cfg.retencionPct ?? ''} onChange={e => setCfg(c => ({ ...c, retencionPct: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-xs outline-none focus:border-red-600 disabled:opacity-50" /></Campo>
                  <Campo label="Anticipo RD$"><input type="number" disabled={!esAdmin} value={cfg.anticipoMonto ?? ''} onChange={e => setCfg(c => ({ ...c, anticipoMonto: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-xs outline-none focus:border-red-600 disabled:opacity-50" /></Campo>
                  <Campo label="Amortización %"><input type="number" disabled={!esAdmin} value={cfg.amortizacionPct ?? ''} onChange={e => setCfg(c => ({ ...c, amortizacionPct: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-xs outline-none focus:border-red-600 disabled:opacity-50" /></Campo>
                  <Campo label="Próxima fecha"><input type="date" disabled={!esAdmin} value={cfg.proximaCubicacionFecha || ''} onChange={e => setCfg(c => ({ ...c, proximaCubicacionFecha: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-xs outline-none focus:border-red-600 disabled:opacity-50" /></Campo>
                </div>
              )}
              {esAdmin && <button onClick={guardarConfig} disabled={guardando} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold uppercase px-3 py-1.5 rounded-card flex items-center gap-1"><Save className="w-3 h-3" /> Guardar configuración</button>}
              {activo && anticipo > 0 && (
                <div className="text-[10px] text-zinc-500">Anticipo {formatRD(anticipo)} · amortizado {formatRD(amortizadoAcum)} · por amortizar <b className="text-amber-300">{formatRD(Math.max(0, anticipo - amortizadoAcum))}</b></div>
              )}
            </div>

            {activo && (
              <>
                {/* Resumen */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Kpi label="Cubicaciones" value={cubs.length} />
                  <Kpi label="Facturado (subtotal)" value={formatRD(facturadoAcum)} />
                  <Kpi label="Retención acumulada" value={formatRD(retencionAcum)} />
                </div>

                {/* Nueva cubicación */}
                {!nueva ? (
                  esAdmin && <button onClick={iniciarNueva} className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Nueva cubicación (#{cubs.length + 1})</button>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-widest text-red-400 font-bold">Cubicación #{cubs.length + 1}</div>
                      <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-xs text-white" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead><tr className="text-zinc-500 uppercase text-[9px] tracking-wider text-left">
                          <th className="py-1 pr-2">Área</th><th className="py-1 px-1 text-right">m² total</th><th className="py-1 px-1 text-right">ya cubic.</th><th className="py-1 px-1 text-right">m² período</th><th className="py-1 px-1 text-right">RD$/m²</th><th className="py-1 px-1 text-right">% avance</th><th className="py-1 pl-1 text-right">Subtotal</th>
                        </tr></thead>
                        <tbody>
                          {calc.rows.map((r, i) => {
                            const rest = r.m2TotalArea - r.m2AcumuladoAnterior;
                            return (
                              <tr key={r.areaId} className="border-t border-zinc-800/60">
                                <td className="py-1 pr-2 font-bold truncate max-w-[120px]">{r.areaNombre}</td>
                                <td className="py-1 px-1 text-right tabular-nums text-zinc-400">{formatNum(r.m2TotalArea)}</td>
                                <td className="py-1 px-1 text-right tabular-nums text-zinc-500">{formatNum(r.m2AcumuladoAnterior)}</td>
                                <td className="py-1 px-1 text-right"><input type="number" value={filas[i]?.m2EstePeriodo} onChange={e => setFila(i, 'm2EstePeriodo', e.target.value)} placeholder={`máx ${formatNum(rest)}`} className="w-20 bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-right text-white" /></td>
                                <td className="py-1 px-1 text-right"><input type="number" value={filas[i]?.precioM2} onChange={e => setFila(i, 'precioM2', e.target.value)} className="w-20 bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-right text-white" /></td>
                                <td className="py-1 px-1 text-right tabular-nums text-blue-300">{r.pctAcum.toFixed(1)}%</td>
                                <td className="py-1 pl-1 text-right tabular-nums font-bold">{formatRD(r.subtotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Totales */}
                    <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-xs space-y-0.5">
                      <Row k="Subtotal del período" v={formatRD(calc.subtotalGeneral)} />
                      <Row k="ITBIS (18%)" v={'+ ' + formatRD(calc.itbisMonto)} />
                      <div className="border-t border-zinc-800/60 my-0.5" /><Row k="Total con ITBIS" v={formatRD(calc.totalConItbis)} cls="font-bold" />
                      <Row k={`Retención (${cfg.retencionPct || 0}%)`} v={'– ' + formatRD(calc.retencionMonto)} cls="text-amber-300" />
                      <Row k={`Amortización anticipo (${cfg.amortizacionPct || 0}%)`} v={'– ' + formatRD(calc.amortizacionMonto)} cls="text-blue-300" />
                      <div className="border-t border-zinc-800 mt-1 pt-1"><Row k="NETO A PAGAR" v={formatRD(calc.total)} cls="text-green-300 font-black" /></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setNueva(false)} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-2 rounded-card">Cancelar</button>
                      <button onClick={guardarCubicacion} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase py-2 rounded-card flex items-center justify-center gap-1">{guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Guardar cubicación</button>
                    </div>
                  </div>
                )}

                {/* Histórico */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Histórico ({cubs.length})</div>
                  {loading ? <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin text-zinc-500 mx-auto" /></div>
                    : cubs.length === 0 ? <div className="text-xs text-zinc-600">Aún no hay cubicaciones.</div>
                      : <div className="space-y-1.5">{cubs.map(c => (
                        <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="font-bold">#{c.numero} · {c.fechaCubicacion}{c.facturaOdooNumero ? <span className="text-[10px] text-zinc-500 ml-2">Fact. {c.facturaOdooNumero}</span> : ''}</div>
                            <div className="flex items-center gap-2"><span className="font-black text-green-300">{formatRD(c.total)}</span>{esAdmin && <button onClick={() => borrar(c.id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}</div>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">Subtotal {formatRD(c.subtotalGeneral)} · ITBIS {formatRD(c.itbisMonto)} · retención {formatRD(c.retencionMonto)} · amortización {formatRD(c.amortizacionMonto)} · {(c.areasCubicadas || []).reduce((a, x) => a + (Number(x.m2EstePeriodo) || 0), 0).toFixed(2)} m²</div>
                        </div>
                      ))}</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>    </div>
  );
}

function Campo({ label, children }) { return <div><div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-1">{label}</div>{children}</div>; }
function Kpi({ label, value }) { return <div className="bg-zinc-900 border border-zinc-800 rounded-card p-2"><div className="text-sm font-black">{value}</div><div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div></div>; }
function Row({ k, v, cls = '' }) { return <div className="flex items-center justify-between"><span className="text-zinc-400">{k}</span><span className={`tabular-nums ${cls}`}>{v}</span></div>; }
