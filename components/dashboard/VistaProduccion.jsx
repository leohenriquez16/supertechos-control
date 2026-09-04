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

import React, { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, Filter } from 'lucide-react';
import { formatRD, formatNum, formatFechaCorta } from '../../lib/helpers/formato';
import * as db from '../../lib/db'; // v8.42.3: medidor de consumo IA

const PERIODOS = [
  { v: 'dia', label: 'Día', n: 15 },
  { v: 'semana', label: 'Semana', n: 10 },
  { v: 'quincena', label: 'Quincena', n: 8 },
  { v: 'mes', label: 'Mes', n: 12 },
];

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

// Clave de bucket según el periodo
function claveBucket(fecha, periodo) {
  if (periodo === 'dia') return fecha;
  if (periodo === 'mes') return fecha.slice(0, 7);
  if (periodo === 'quincena') {
    const dia = Number(fecha.slice(8, 10));
    return `${fecha.slice(0, 7)}·Q${dia <= 15 ? 1 : 2}`;
  }
  // semana: lunes de esa semana
  const d = new Date(fecha + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // lunes=0
  d.setDate(d.getDate() - dow);
  return d.toISOString().split('T')[0];
}
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
  const filas = useMemo(() => {
    const hoy = hoyRD();
    const out = [];
    const pesoMapPorProyecto = {}; // proyectoId -> { tareaId: peso/100 }
    const nTareasPorSistema = {};  // sistemaId -> n
    (data.reportes || []).forEach(r => {
      if (r.reparacion) return; // v8.50.0: retoques fuera del histórico de producción
      if (!r.fecha || r.fecha > hoy || !(r.m2 > 0)) return;
      const proy = (data.proyectos || []).find(p => p.id === r.proyectoId);
      if (!proy || proy.archivado) return;
      const area = (proy.areas || []).find(a => a.id === r.areaId);
      const sid = area?.sistemaId || proy.sistema;
      const sis = data.sistemas?.[sid];
      // peso: mapa de TODOS los sistemas del proyecto
      if (!pesoMapPorProyecto[proy.id]) {
        const m = {};
        const sids = [...new Set([proy.sistema, ...(proy.areas || []).map(a => a.sistemaId).filter(Boolean)])];
        sids.forEach(s2 => {
          (data.sistemas?.[s2]?.tareas || []).forEach(t => { if (m[t.id] === undefined) m[t.id] = (Number(t.peso) || 0) / 100; });
          if (nTareasPorSistema[s2] === undefined) nTareasPorSistema[s2] = (data.sistemas?.[s2]?.tareas || []).length;
        });
        pesoMapPorProyecto[proy.id] = m;
      }
      let peso = pesoMapPorProyecto[proy.id][r.tareaId];
      if (peso === undefined) {
        const n = nTareasPorSistema[sid] || 0;
        peso = n > 0 ? 1 / n : 1; // tarea vieja/desconocida → se reparte, no infla
      }
      const precio = Number(area?.precioVentaM2) > 0 ? Number(area.precioVentaM2) : (Number(sis?.precio_m2) || 0);
      const maestroId = area?.maestroAreaId || proy.maestroId || null;
      // v8.27.75: etiqueta completa — referencia + cliente + locación (para saber cuál es)
      const etiqueta = [proy.referenciaOdoo, proy.cliente, proy.referenciaProyecto].filter(Boolean).join(' · ');
      out.push({
        fecha: r.fecha, retro: !!r.retroactivo,
        rd: r.m2 * precio * peso, m2p: r.m2 * peso,
        proyectoId: proy.id, proyectoRef: etiqueta || proy.cliente || proy.id,
        maestroId,
      });
    });
    return out;
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
      if (f.fecha === hoy) acc.dia += f.rd;
      if (claveBucket(f.fecha, 'semana') === kSem) acc.semana += f.rd;
      if (claveBucket(f.fecha, 'quincena') === kQ) acc.quincena += f.rd;
      if (f.fecha.slice(0, 7) === kMes) acc.mes += f.rd;
    });
    return acc;
  }, [visibles]);

  // Desglose del bucket seleccionado
  const desglose = useMemo(() => {
    if (!bucketSel) return null;
    const del = visibles.filter(f => claveBucket(f.fecha, periodo) === bucketSel);
    const porProy = {}, porMaestro = {};
    del.forEach(f => {
      porProy[f.proyectoRef] = (porProy[f.proyectoRef] || 0) + f.rd;
      const m = (data.personal || []).find(p => p.id === f.maestroId);
      const nom = m?.nombre || 'Sin maestro';
      porMaestro[nom] = (porMaestro[nom] || 0) + f.rd;
    });
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { proyectos: top(porProy), maestros: top(porMaestro), total: del.reduce((s, f) => s + f.rd, 0) };
  }, [bucketSel, visibles, periodo, data.personal]);

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
            <div className="text-[11px] text-zinc-500">RD$ producidos (ponderado por avance real de cada tarea)</div>
          </div>
        </div>
        <label className={`flex items-center gap-1.5 text-[11px] px-2 py-1.5 border cursor-pointer ${incluirRetro ? 'bg-amber-900/30 border-amber-700 text-amber-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
          <input type="checkbox" checked={incluirRetro} onChange={e => setIncluirRetro(e.target.checked)} className="w-3 h-3 accent-amber-500" />
          Incluir reportes atrasados ({nRetro})
        </label>
      </div>

      {/* Resumen actual */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[['Hoy', resumen.dia], ['Esta semana', resumen.semana], ['Esta quincena', resumen.quincena], ['Este mes', resumen.mes]].map(([l, v]) => (
          <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
            <div className="text-[10px] text-zinc-500 uppercase">{l}</div>
            <div className="text-lg font-black text-green-400">{formatRD(v)}</div>
          </div>
        ))}
      </div>

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
            <button key={b.k} onClick={() => setBucketSel(bucketSel === b.k ? null : b.k)}
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

      {/* Desglose del bucket seleccionado */}
      {desglose && (
        <div className="grid md:grid-cols-2 gap-3">
          {[['Por proyecto', desglose.proyectos], ['Por maestro', desglose.maestros]].map(([titulo, lista]) => (
            <div key={titulo} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-2">{titulo} · {labelBucket(bucketSel, periodo)} · {formatRD(desglose.total)}</div>
              <div className="space-y-1">
                {lista.map(([nom, rd]) => (
                  <div key={nom} className="flex justify-between text-xs">
                    <span className="truncate">{nom}</span>
                    <span className="font-bold text-green-400 shrink-0 ml-2">{formatRD(rd)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
