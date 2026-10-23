'use client';

// v8.27.73: Dashboard "Producción" (admin) — cuánto dinero y m² producimos por
// día / semana / quincena / mes, con el histórico LIMPIO por defecto (excluye
// reportes retroactivos / carga inicial marcados en la columna reportes.retroactivo).
// También: proyectos nuevos por mes + ticket promedio/mediana.
//
// Fórmula de RD$ producido = m² del reporte × precio de venta del área (o del
// sistema) × peso de la tarea (ponderado, igual que el Reporte PDF / nómina).
// El peso se busca en TODOS los sistemas del proyecto; si la tarea ya no existe
// (ids viejos), se reparte 1/nº de tareas del sistema del área (no infla).

import { filasProduccion } from '../../lib/helpers/produccion';
// v8.73.0: desglose por obra/supervisor/maestro/sistema/empresa, variación, proyección y alerta
import { claveBucket, desglosarProduccion, variacionPeriodo, proyeccionMes, obrasSinProduccion } from '../../lib/helpers/produccionDesglose';
import React, { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, Filter, ChevronDown, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import { formatRD, formatNum, formatFechaCorta } from '../../lib/helpers/formato';
import * as db from '../../lib/db'; // v8.42.3: medidor de consumo IA

const PERIODOS = [
  { v: 'dia', label: 'Día', n: 15 },
  { v: 'semana', label: 'Semana', n: 10 },
  { v: 'quincena', label: 'Quincena', n: 8 },
  { v: 'mes', label: 'Mes', n: 12 },
];

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

// v8.73.0: claveBucket vive en lib/helpers/produccionDesglose.js (con tests)
function labelBucket(k, periodo) {
  if (periodo === 'dia') return formatFechaCorta(k);
  if (periodo === 'mes') return new Date(k + '-15T12:00:00').toLocaleDateString('es-DO', { month: 'short', year: '2-digit' });
  if (periodo === 'quincena') {
    const [mes, q] = k.split('·');
    return `${new Date(mes + '-15T12:00:00').toLocaleDateString('es-DO', { month: 'short' })} ${q === 'Q1' ? '1-15' : '16-fin'}`;
  }
  return `sem ${formatFechaCorta(k)}`;
}

export default function VistaProduccion({ usuario, data, onVolver }) {
  const [periodo, setPeriodo] = useState('dia');
  const [incluirRetro, setIncluirRetro] = useState(false);
  const [bucketSel, setBucketSel] = useState(null);
  // v8.73.0: pestaña del desglose, obra expandida y alerta plegable
  const [tabDesglose, setTabDesglose] = useState('obra');
  const [obraAbierta, setObraAbierta] = useState(null);
  const [verAlerta, setVerAlerta] = useState(false);
  // v8.42.3: consumo de IA (ultimos 14 dias)
  const [usoIA, setUsoIA] = useState([]);
  useEffect(() => {
    const desde = new Date(); desde.setDate(desde.getDate() - 14);
    db.listarUsoIA({ desde: desde.toISOString() }).then(setUsoIA).catch(() => {});
  }, []);
  // Precios claude-sonnet-4-5: US$3/M entrada, US$15/M salida
  const usoIAResumen = useMemo(() => {
    const porDia = {}, porFuncion = {};
    let inTot = 0, outTot = 0;
    usoIA.forEach(u => {
      const d = String(u.created_at).slice(0, 10);
      (porDia[d] = porDia[d] || { in: 0, out: 0, n: 0 });
      porDia[d].in += u.input_tokens; porDia[d].out += u.output_tokens; porDia[d].n += 1;
      (porFuncion[u.funcion] = porFuncion[u.funcion] || { in: 0, out: 0, n: 0 });
      porFuncion[u.funcion].in += u.input_tokens; porFuncion[u.funcion].out += u.output_tokens; porFuncion[u.funcion].n += 1;
      inTot += u.input_tokens; outTot += u.output_tokens;
    });
    const usd = (i, o) => (i / 1e6) * 3 + (o / 1e6) * 15;
    return {
      dias: Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).map(([d, v]) => ({ d, ...v, usd: usd(v.in, v.out) })),
      funciones: Object.entries(porFuncion).sort((a, b) => usd(b[1].in, b[1].out) - usd(a[1].in, a[1].out)).map(([f, v]) => ({ f, ...v, usd: usd(v.in, v.out) })),
      totalUsd: usd(inTot, outTot), llamadas: usoIA.length,
    };
  }, [usoIA]);

  // Enriquecer cada reporte con RD$/m² ponderado una sola vez.
  // v8.60.0: fórmula única (lib/helpers/produccion.js) — tope de m² por área, valor cotizado e
  // ITBIS real de la cotización. rd = CON ITBIS (pedido de Leo); rdSin = sin ITBIS.
  const filas = useMemo(() => {
    const porId = new Map((data.proyectos || []).map(p => [p.id, p]));
    return filasProduccion({ reportes: data.reportes, proyectos: data.proyectos, sistemas: data.sistemas, hasta: hoyRD() })
      .map(f => {
        const proy = porId.get(f.proyectoId);
        const etiqueta = [proy?.referenciaOdoo, proy?.cliente, proy?.referenciaProyecto].filter(Boolean).join(' · ');
        return { ...f, rd: f.rdConItbis, rdSin: f.rdSinItbis, proyectoRef: etiqueta || proy?.cliente || f.proyectoId };
      });
  }, [data.reportes, data.proyectos, data.sistemas]);

  const visibles = useMemo(() => filas.filter(f => incluirRetro || !f.retro), [filas, incluirRetro]);

  // Buckets del periodo elegido
  const buckets = useMemo(() => {
    const m = {};
    visibles.forEach(f => {
      const k = claveBucket(f.fecha, periodo);
      if (!m[k]) m[k] = { k, rd: 0, m2: 0, reps: 0 };
      m[k].rd += f.rd; m[k].m2 += f.m2p; m[k].reps += 1;
    });
    const n = PERIODOS.find(p => p.v === periodo)?.n || 12;
    return Object.values(m).sort((a, b) => b.k.localeCompare(a.k)).slice(0, n);
  }, [visibles, periodo]);

  const maxRd = Math.max(1, ...buckets.map(b => b.rd));

  // Resumen rápido: hoy / semana / quincena / mes actuales
  const resumen = useMemo(() => {
    const hoy = hoyRD();
    const kSem = claveBucket(hoy, 'semana'), kQ = claveBucket(hoy, 'quincena'), kMes = claveBucket(hoy, 'mes');
    const acc = { dia: 0, semana: 0, quincena: 0, mes: 0 };
    visibles.forEach(f => {
      if (f.fecha === hoy) { acc.dia += f.rd; acc.diaSin = (acc.diaSin || 0) + f.rdSin; }
      if (claveBucket(f.fecha, 'semana') === kSem) { acc.semana += f.rd; acc.semanaSin = (acc.semanaSin || 0) + f.rdSin; }
      if (claveBucket(f.fecha, 'quincena') === kQ) { acc.quincena += f.rd; acc.quincenaSin = (acc.quincenaSin || 0) + f.rdSin; }
      if (f.fecha.slice(0, 7) === kMes) { acc.mes += f.rd; acc.mesSin = (acc.mesSin || 0) + f.rdSin; }
    });
    return acc;
  }, [visibles]);

  // v8.73.0: desglose completo del bucket seleccionado (cada pestaña suma el total del bucket)
  const desglose = useMemo(() => {
    if (!bucketSel) return null;
    const del = visibles.filter(f => claveBucket(f.fecha, periodo) === bucketSel);
    return desglosarProduccion(del, { proyectos: data.proyectos, personal: data.personal, sistemas: data.sistemas });
  }, [bucketSel, visibles, periodo, data.proyectos, data.personal, data.sistemas]);

  // v8.73.0: variación vs periodo anterior equivalente + promedio/proyección del mes
  const comparativo = useMemo(() => {
    const hoy = hoyRD();
    const v = {};
    ['dia', 'semana', 'quincena', 'mes'].forEach(p => { v[p] = variacionPeriodo(visibles, hoy, p); });
    return { v, proy: proyeccionMes(visibles, hoy) };
  }, [visibles]);

  // v8.73.0: obras en ejecución sin producción hace 3+ días (cuenta cualquier reporte, atrasado o no)
  const sinProduccion = useMemo(() => obrasSinProduccion(data.proyectos, filas, hoyRD(), { minDias: 3, personal: data.personal }), [data.proyectos, filas, data.personal]);

  // v8.73.0: nombres para el detalle de reportes de una obra
  const detalleReporte = (f) => {
    const p = (data.proyectos || []).find(x => x.id === f.proyectoId);
    const area = (p?.areas || []).find(a => a.id === f.areaId);
    const tarea = (data.sistemas?.[f.sistemaId]?.tareas || []).find(t => t.id === f.tareaId);
    const quien = f.reportadoPor || (data.personal || []).find(x => x.id === f.reportadoPorId)?.nombre || '—';
    return { area: area?.nombre || area?.descripcion || '—', tarea: tarea?.nombre || tarea?.name || '—', quien };
  };

  // Proyectos nuevos por mes + ticket
  const proyectosMes = useMemo(() => {
    const m = {};
    (data.proyectos || []).filter(p => !p.archivado && p.createdAt).forEach(p => {
      const mes = String(p.createdAt).slice(0, 7);
      const valor = p.valorCotizacion > 0 ? p.valorCotizacion
        : (p.areas || []).reduce((s, a) => {
            const sis = data.sistemas?.[a.sistemaId || p.sistema];
            const precio = Number(a.precioVentaM2) > 0 ? Number(a.precioVentaM2) : (Number(sis?.precio_m2) || 0);
            return s + (Number(a.m2) || 0) * precio;
          }, 0);
      if (!m[mes]) m[mes] = { mes, n: 0, valores: [] };
      m[mes].n += 1;
      if (valor > 0) m[mes].valores.push(valor);
    });
    return Object.values(m).sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 12).map(x => {
      const v = x.valores.sort((a, b) => a - b);
      const prom = v.length ? v.reduce((s, y) => s + y, 0) / v.length : 0;
      const mediana = v.length ? v[Math.floor(v.length / 2)] : 0;
      return { ...x, prom, mediana, total: v.reduce((s, y) => s + y, 0) };
    });
  }, [data.proyectos, data.sistemas]);

  const nRetro = filas.filter(f => f.retro).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl lg:max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><TrendingUp className="w-6 h-6 text-red-500" /> Producción</h1>
            <div className="text-[11px] text-zinc-500">RD$ producidos <b className="text-zinc-300">con ITBIS</b>, al valor cotizado y por avance real de cada tarea</div>
          </div>
        </div>
        <label className={`flex items-center gap-1.5 text-[11px] px-2 py-1.5 border cursor-pointer ${incluirRetro ? 'bg-amber-900/30 border-amber-700 text-amber-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
          <input type="checkbox" checked={incluirRetro} onChange={e => setIncluirRetro(e.target.checked)} className="w-3 h-3 accent-amber-500" />
          Incluir reportes atrasados ({nRetro})
        </label>
      </div>

      {/* Resumen actual */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[['Hoy', resumen.dia, resumen.diaSin, 'dia'], ['Esta semana', resumen.semana, resumen.semanaSin, 'semana'], ['Esta quincena', resumen.quincena, resumen.quincenaSin, 'quincena'], ['Este mes', resumen.mes, resumen.mesSin, 'mes']].map(([l, v, vs, p]) => {
          const c = comparativo.v[p];
          return (
            <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] text-zinc-500 uppercase">{l}</div>
              <div className="text-lg font-black text-green-400">{formatRD(v)}</div>
              <div className="text-[10px] text-zinc-500">sin ITBIS {formatRD(vs || 0)}</div>
              {/* v8.73.0: variación vs periodo anterior equivalente */}
              <div className={`text-[10px] font-bold mt-0.5 ${c.pct == null ? 'text-zinc-600' : c.pct >= 0 ? 'text-green-500' : 'text-red-400'}`}
                title={`${c.etiqueta}: ${formatRD(c.rdAnt)} (${formatFechaCorta(c.anterior[0])} – ${formatFechaCorta(c.anterior[1])})`}>
                {c.pct == null ? `sin base vs ${c.etiqueta}` : `${c.pct >= 0 ? '+' : ''}${Math.round(c.pct * 100)}% vs ${c.etiqueta}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* v8.73.0: promedio por día hábil y proyección al cierre del mes */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3"
          title="Día hábil = lunes a sábado transcurrido del mes (hasta hoy), haya o no producción. Un día sin reportes baja el promedio, porque es lo que pasó.">
          <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">Promedio por día hábil <Info className="w-3 h-3" /></div>
          <div className="text-base font-black text-zinc-100">{formatRD(comparativo.proy.promedio)}</div>
          <div className="text-[10px] text-zinc-500">sin ITBIS {formatRD(comparativo.proy.promedioSin)} · {comparativo.proy.habilesTranscurridos} días hábiles ({comparativo.proy.diasConProd} con producción)</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3"
          title="Promedio por día hábil × días hábiles (lunes a sábado) del mes completo.">
          <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">Proyección cierre del mes <Info className="w-3 h-3" /></div>
          <div className="text-base font-black text-sky-400">{formatRD(comparativo.proy.proyeccion)}</div>
          <div className="text-[10px] text-zinc-500">sin ITBIS {formatRD(comparativo.proy.proyeccionSin)} · a la fecha de hoy, {comparativo.proy.habilesMes} días hábiles</div>
        </div>
      </div>

      {/* v8.73.0: alerta de obras en ejecución sin producción */}
      {sinProduccion.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-800 rounded-card p-3">
          <button onClick={() => setVerAlerta(!verAlerta)} className="w-full flex items-center gap-2 text-left text-xs font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{sinProduccion.length} obra{sinProduccion.length === 1 ? '' : 's'} en ejecución sin producción hace 3 días o más</span>
            {verAlerta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {verAlerta && (
            <div className="mt-2 space-y-1">
              {sinProduccion.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-2 text-xs bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{o.nombre}</div>
                    <div className="text-[10px] text-zinc-500">{o.supervisor} · último reporte {o.ultima ? formatFechaCorta(o.ultima) : 'nunca'}</div>
                  </div>
                  <div className="text-amber-400 font-black shrink-0">{o.dias == null ? 'sin reportes' : `${o.dias} días`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selector de periodo + tabla */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
        <div className="flex items-center gap-1">
          <Filter className="w-3 h-3 text-zinc-500 mr-1" />
          {PERIODOS.map(p => (
            <button key={p.v} onClick={() => { setPeriodo(p.v); setBucketSel(null); }}
              className={`text-xs px-3 py-1.5 border ${periodo === p.v ? 'bg-red-600 border-red-600 text-white font-bold' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {buckets.map(b => (
            <button key={b.k} onClick={() => { setBucketSel(bucketSel === b.k ? null : b.k); setObraAbierta(null); }}
              className={`w-full text-left bg-zinc-950 border rounded-card px-2 py-1.5 ${bucketSel === b.k ? 'border-red-600' : 'border-zinc-800 hover:border-zinc-600'}`}>
              <div className="flex items-center justify-between text-xs gap-2">
                <div className="font-bold capitalize w-24 shrink-0">{labelBucket(b.k, periodo)}</div>
                <div className="text-zinc-500 text-[10px] shrink-0">{formatNum(b.m2)} m² · {b.reps} rep</div>
                <div className="flex-1 h-2 bg-zinc-800 overflow-hidden"><div className="h-full bg-green-500/70" style={{ width: `${(b.rd / maxRd) * 100}%` }} /></div>
                <div className="font-bold text-green-400 w-28 text-right shrink-0">{formatRD(b.rd)}</div>
              </div>
            </button>
          ))}
          {buckets.length === 0 && <div className="text-xs text-zinc-500 italic py-4 text-center">Sin reportes en este periodo.</div>}
        </div>
      </div>

      {/* v8.73.0: desglose del bucket seleccionado con pestañas */}
      {desglose && (() => {
        const TABS = [['obra', 'Por obra', desglose.porObra], ['supervisor', 'Por supervisor', desglose.porSupervisor], ['maestro', 'Por maestro', desglose.porMaestro], ['sistema', 'Por sistema', desglose.porSistema], ['empresa', 'Por empresa', desglose.porEmpresa]];
        const lista = (TABS.find(t => t[0] === tabDesglose) || TABS[0])[2];
        const maxG = Math.max(1, ...lista.map(g => g.rd));
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold capitalize">Desglose · {labelBucket(bucketSel, periodo)}</div>
              <div className="text-right">
                <div className="text-sm font-black text-green-400">{formatRD(desglose.total)}</div>
                <div className="text-[10px] text-zinc-500">sin ITBIS {formatRD(desglose.totalSin)} · {formatNum(desglose.m2)} m² · {desglose.reps} rep</div>
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {TABS.map(([k, l, g]) => (
                <button key={k} onClick={() => setTabDesglose(k)}
                  className={`text-xs px-3 py-1.5 border whitespace-nowrap ${tabDesglose === k ? 'bg-red-600 border-red-600 text-white font-bold' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
                  {l} <span className="opacity-60">({g.length})</span>
                </button>
              ))}
            </div>
            <div className="space-y-1">
              {lista.map(g => {
                const abierta = tabDesglose === 'obra' && obraAbierta === g.k;
                return (
                  <div key={g.k} className="bg-zinc-950 border border-zinc-800 rounded-card">
                    <button disabled={tabDesglose !== 'obra'} onClick={() => setObraAbierta(abierta ? null : g.k)}
                      className="w-full text-left px-2 py-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        {tabDesglose === 'obra' && (abierta ? <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" /> : <ChevronRight className="w-3 h-3 shrink-0 text-zinc-500" />)}
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-bold">{g.nombre}</div>
                          <div className="text-[10px] text-zinc-500">
                            {formatNum(g.m2)} m² · {g.reps} rep
                            {tabDesglose === 'maestro' && <> · {g.nDias} día{g.nDias === 1 ? '' : 's'} · {formatRD(g.rdDia)}/día</>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-green-400">{formatRD(g.rd)}</div>
                          <div className="text-[10px] text-zinc-500">sin ITBIS {formatRD(g.rdSin)}</div>
                        </div>
                        <div className="w-10 text-right text-[10px] text-zinc-400 shrink-0">{Math.round(g.pct * 100)}%</div>
                      </div>
                      <div className="h-1.5 bg-zinc-800 overflow-hidden mt-1"><div className="h-full bg-green-500/70" style={{ width: `${(g.rd / maxG) * 100}%` }} /></div>
                    </button>
                    {abierta && (
                      <div className="border-t border-zinc-800 px-2 py-1.5 overflow-x-auto">
                        <table className="w-full text-[11px] min-w-[560px]">
                          <thead className="text-[10px] uppercase text-zinc-500">
                            <tr><th className="text-left p-1">Fecha</th><th className="text-left p-1">Área</th><th className="text-left p-1">Tarea</th><th className="text-right p-1">m²</th><th className="text-right p-1">Precio m²</th><th className="text-right p-1">RD$</th><th className="text-left p-1">Reportó</th></tr>
                          </thead>
                          <tbody>
                            {g.filas.map((f, i) => {
                              const d = detalleReporte(f);
                              return (
                                <tr key={f.reporteId || i} className="border-t border-zinc-900">
                                  <td className="p-1 whitespace-nowrap">{formatFechaCorta(f.fecha)}{f.retro ? ' ⏱' : ''}</td>
                                  <td className="p-1 truncate max-w-[140px]">{d.area}</td>
                                  <td className="p-1 truncate max-w-[140px]">{d.tarea}</td>
                                  <td className="p-1 text-right">{formatNum(f.m2Util)}</td>
                                  <td className="p-1 text-right text-zinc-400">{formatRD(f.precioM2)}</td>
                                  <td className="p-1 text-right font-bold text-green-400">{formatRD(f.rd)}</td>
                                  <td className="p-1 truncate max-w-[120px] text-zinc-400">{d.quien}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div className="text-[10px] text-zinc-600 mt-1">m² útiles (con tope del área). Precio m² = precio de venta del área sin escalar; el RD$ ya va ponderado por el peso de la tarea y al valor cotizado. ⏱ = reporte atrasado.</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Proyectos por mes + ticket */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Proyectos nuevos por mes · ticket promedio</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-zinc-500">
              <tr><th className="text-left p-1">Mes</th><th className="text-right p-1">Proyectos</th><th className="text-right p-1">Ticket prom.</th><th className="text-right p-1">Mediana</th><th className="text-right p-1">Valor total</th></tr>
            </thead>
            <tbody>
              {proyectosMes.map(x => (
                <tr key={x.mes} className="border-t border-zinc-800">
                  <td className="p-1 capitalize">{new Date(x.mes + '-15T12:00:00').toLocaleDateString('es-DO', { month: 'short', year: '2-digit' })}</td>
                  <td className="p-1 text-right font-bold">{x.n}</td>
                  <td className="p-1 text-right">{formatRD(x.prom)}</td>
                  <td className="p-1 text-right text-zinc-400">{formatRD(x.mediana)}</td>
                  <td className="p-1 text-right text-green-400 font-bold">{formatRD(x.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-zinc-600 mt-2">💡 La mediana muestra el proyecto "típico"; el promedio sube por los proyectos grandes. Los proyectos de cotización en USD ya están convertidos a RD$.</div>
      </div>

      {/* v8.42.3: medidor de consumo de IA (tokens reales por llamada) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-2">
          Consumo de IA · últimos 14 días — {usoIAResumen.llamadas} llamadas · ≈ US${usoIAResumen.totalUsd.toFixed(2)}
        </div>
        {usoIA.length === 0 ? (
          <div className="text-xs text-zinc-500 italic">Sin registros aún — el medidor empieza a contar desde hoy.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase mb-1">Por función</div>
              {usoIAResumen.funciones.map(f => (
                <div key={f.f} className="flex justify-between text-xs py-0.5">
                  <span className="truncate">{f.f} <span className="text-zinc-600">×{f.n}</span></span>
                  <span className="text-zinc-400 shrink-0 ml-2">{formatNum((f.in + f.out) / 1000)}k tok · <b className="text-green-400">US${f.usd.toFixed(2)}</b></span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase mb-1">Por día</div>
              {usoIAResumen.dias.map(d => (
                <div key={d.d} className="flex justify-between text-xs py-0.5">
                  <span>{formatFechaCorta(d.d)} <span className="text-zinc-600">×{d.n}</span></span>
                  <span className={`shrink-0 ml-2 ${d.usd > 5 ? 'text-amber-400 font-bold' : 'text-zinc-400'}`}>{formatNum((d.in + d.out) / 1000)}k tok · US${d.usd.toFixed(2)}{d.usd > 5 ? ' ⚠' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="text-[10px] text-zinc-600 mt-2">Estimado con precios de claude-sonnet-4-5 (US$3/M entrada · US$15/M salida). ⚠ = día con más de US$5.</div>
      </div>
    </div>
  );
}
