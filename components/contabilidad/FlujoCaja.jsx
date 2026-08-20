'use client';

// v8.28.0 — Tab Flujo de Caja (Contabilidad). Réplica viva del Excel
// "Flujo_de_caja para pagos": proyección semanal de efectivo por empresa.
//
//   Saldo inicial (banco REAL, editable — los libros de Odoo siguen sin conciliar)
//   + Entradas   (CxC que vence en la semana [Odoo] + cobros proyectados [manual])
//   − Salidas    (CxP que vence en la semana [Odoo] + compromisos fijos [tabla]
//                 + abonos a lo ya vencido [manual])
//   = Saldo final de la semana → arrastra a la siguiente.
//
// La CxP/CxC ya vencida NO se auto-programa: se muestra como arrastre y se paga
// vía "Abono a vencido" (igual que el Excel). Los USD se convierten con la tasa
// del día leída de Odoo.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, RefreshCw, Pencil, Plus, Trash2, ChevronDown, ChevronRight,
  AlertTriangle, X, Wallet, Landmark, CalendarClock, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { formatRD } from '../../lib/helpers/formato';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';
import Campo from '../common/Campo';
import Input from '../common/Input';

// ── Fechas (locales, sin sorpresas UTC) ──
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const desdeYmd = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const lunesDe = (d) => addDias(d, -((d.getDay() + 6) % 7));
const labelSemana = (ini, fin) => {
  const mi = MES_CORTO[ini.getMonth()], mf = MES_CORTO[fin.getMonth()];
  return mi === mf ? `${ini.getDate()}–${fin.getDate()} ${mf}` : `${ini.getDate()} ${mi}–${fin.getDate()} ${mf}`;
};
const fmtUS = (n) => 'US$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Celda de monto (verde entradas / rojo salidas / neutro) ──
function Monto({ v, tipo = 'neutro', bold = false }) {
  const color = v === 0 ? 'text-zinc-600'
    : tipo === 'entrada' ? 'text-green-400'
    : tipo === 'salida' ? 'text-red-400'
    : v < 0 ? 'text-red-400' : 'text-zinc-200';
  return <span className={`tabular-nums ${color} ${bold ? 'font-black' : ''}`}>{formatRD(v)}</span>;
}

export default function FlujoCaja({ empresa, setEmpresa }) {
  const [ambas, setAmbas] = useState(true);
  const [horizonte, setHorizonte] = useState(4); // semanas
  const [odoo, setOdoo] = useState({});          // { empresa: { cxc, cxp, saldosLibros, tasaUsd, advertencias } }
  const [compromisos, setCompromisos] = useState([]);
  const [manual, setManual] = useState([]);
  const [entradas, setEntradas] = useState([]);  // entradas esperadas (avances, cubicaciones…)
  const [expandido, setExpandido] = useState(() => new Set()); // 'emp:cxc' | 'emp:cxp' — facturas visibles en la tabla
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refrescar, setRefrescar] = useState(0);

  const [modal, setModal] = useState(null);          // { tipo, empresa, semana?, label? } — editar celda manual
  const [modalEntradas, setModalEntradas] = useState(null); // { empresa, semana } — entradas esperadas de esa semana
  const [detalle, setDetalle] = useState(null);      // { titulo, facturas }
  const [verCompromisos, setVerCompromisos] = useState(false);
  const [verLibros, setVerLibros] = useState(false);
  const [formComp, setFormComp] = useState(null);    // compromiso en edición/creación

  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, [refrescar]);
  const hoyStr = ymd(hoy);
  const empresasSel = ambas ? Object.keys(EMPRESAS_RECEPTORAS) : [empresa];

  // Semanas del horizonte, ancladas al lunes de la semana actual
  const semanas = useMemo(() => {
    const base = lunesDe(hoy);
    return Array.from({ length: horizonte }, (_, i) => {
      const ini = addDias(base, i * 7), fin = addDias(ini, 6);
      return { i, ini, fin, iniStr: ymd(ini), finStr: ymd(fin), label: labelSemana(ini, fin) };
    });
  }, [hoy, horizonte]);

  // ── Carga ──
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [comps, man, entr, ...lotes] = await Promise.all([
          db.listarCompromisosFijos().catch(() => []),
          db.listarFlujoManual().catch(() => []),
          db.listarFlujoEntradas().catch(() => []),
          ...Object.keys(EMPRESAS_RECEPTORAS).map(async (k) => {
            const res = await fetch(`/api/contabilidad/flujo-odoo?empresa=${k}`);
            const json = await res.json();
            if (!json.ok) throw new Error(json.error || 'Error consultando Odoo');
            return [k, json];
          }),
        ]);
        if (cancel) return;
        setCompromisos(comps);
        setManual(man);
        setEntradas(entr);
        setOdoo(Object.fromEntries(lotes));
      } catch (e) { if (!cancel) setError(e?.message || String(e)); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [refrescar]);

  const tasa = useMemo(() => {
    for (const k of Object.keys(odoo)) if (odoo[k]?.tasaUsd) return odoo[k].tasaUsd;
    return 60; // último recurso si Odoo no da tasa
  }, [odoo]);

  const manualDe = useCallback((emp, tipo, semana = null) =>
    manual.find(m => m.empresa === emp && m.tipo === tipo && (semana ? m.semana === semana : !m.semana)) || null,
  [manual]);
  const enRD = (m) => m ? m.monto + m.montoUsd * tasa : 0;

  // ── Cálculo del flujo por empresa ──
  const flujos = useMemo(() => {
    const out = {};
    for (const emp of Object.keys(EMPRESAS_RECEPTORAS)) {
      const cxc = odoo[emp]?.cxc || [], cxp = odoo[emp]?.cxp || [];
      const comps = compromisos.filter(c => c.empresa === emp && c.activo);
      const si = manualDe(emp, 'saldo_inicial');
      const saldoInicial = enRD(si);

      const vencidas = (lista) => lista.filter(f => f.vence && f.vence < hoyStr);
      const cxpVencida = vencidas(cxp).reduce((s, f) => s + f.pendiente, 0);
      const cxcVencida = vencidas(cxc).reduce((s, f) => s + f.pendiente, 0);

      let saldo = saldoInicial;
      const sems = semanas.map(s => {
        const enSemana = (f) => f.vence && f.vence >= hoyStr && f.vence >= s.iniStr && f.vence <= s.finStr;
        const cxcFacturas = cxc.filter(enSemana), cxpFacturas = cxp.filter(enSemana);
        const cxcAuto = cxcFacturas.reduce((t, f) => t + f.pendiente, 0);
        const cxpAuto = cxpFacturas.reduce((t, f) => t + f.pendiente, 0);
        // Entradas esperadas (avances, cubicaciones no facturadas…): por fecha
        // esperada; lo atrasado (fecha < hoy y aún sin cobrar) cae en la semana 1.
        const entradasSem = entradas.filter(e => e.empresa === emp && !e.cobrado && e.fechaEsperada &&
          (s.i === 0 ? e.fechaEsperada <= s.finStr : (e.fechaEsperada >= s.iniStr && e.fechaEsperada <= s.finStr)))
          .map(e => ({ ...e, montoRD: e.moneda === 'USD' ? e.monto * tasa : e.monto }));
        const totalEntradasEsp = entradasSem.reduce((t, e) => t + e.montoRD, 0);
        const abono = enRD(manualDe(emp, 'abono_vencido', s.iniStr));

        // Compromisos fijos que caen en la semana
        const compsSem = [];
        for (const c of comps) {
          const montoRD = c.moneda === 'USD' ? c.monto * tasa : c.monto;
          if (c.frecuencia === 'semanal') { compsSem.push({ ...c, montoRD }); continue; }
          if (!c.diaMes) continue;
          // meses que tocan la semana (máx. 2)
          for (const ref of [s.ini, s.fin]) {
            const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
            const fecha = new Date(ref.getFullYear(), ref.getMonth(), Math.min(c.diaMes, ultimo));
            const fStr = ymd(fecha);
            if (fStr >= s.iniStr && fStr <= s.finStr && fStr >= hoyStr && !compsSem.some(x => x.id === c.id)) {
              compsSem.push({ ...c, montoRD, fecha: fStr });
            }
          }
        }
        const totalComps = compsSem.reduce((t, c) => t + c.montoRD, 0);
        const totalEntradas = cxcAuto + totalEntradasEsp;
        const salidas = cxpAuto + abono + totalComps;
        saldo = saldo + totalEntradas - salidas;
        return { ...s, cxcAuto, cxcFacturas, entradasSem, totalEntradasEsp, totalEntradas, cxpAuto, cxpFacturas, abono, compsSem, totalComps, salidas, saldoFinal: saldo };
      });

      const idxNegativo = sems.findIndex(s => s.saldoFinal < 0);
      const totalSalidas = sems.reduce((t, s) => t + s.salidas, 0);
      const diasCaja = totalSalidas > 0 ? Math.round(saldoInicial / (totalSalidas / (7 * semanas.length))) : null;
      out[emp] = { saldoInicial, si, sems, cxpVencida, cxcVencida, idxNegativo, diasCaja, totalSalidas };
    }
    return out;
  }, [odoo, compromisos, entradas, manualDe, semanas, tasa, hoyStr]);

  // Consolidado de las empresas seleccionadas
  const cons = useMemo(() => {
    const sel = empresasSel.map(k => flujos[k]).filter(Boolean);
    const saldoInicial = sel.reduce((t, f) => t + f.saldoInicial, 0);
    const sems = semanas.map((s, i) => ({
      entradas: sel.reduce((t, f) => t + (f.sems[i]?.totalEntradas || 0), 0),
      salidas: sel.reduce((t, f) => t + (f.sems[i]?.salidas || 0), 0),
      saldoFinal: sel.reduce((t, f) => t + (f.sems[i]?.saldoFinal || 0), 0),
    }));
    const idxNegativo = sems.findIndex(s => s.saldoFinal < 0);
    const totalSalidas = sel.reduce((t, f) => t + f.totalSalidas, 0);
    return {
      saldoInicial, sems, idxNegativo,
      cxcVencida: sel.reduce((t, f) => t + f.cxcVencida, 0),
      cxpVencida: sel.reduce((t, f) => t + f.cxpVencida, 0),
      diasCaja: totalSalidas > 0 ? Math.round(saldoInicial / (totalSalidas / (7 * semanas.length))) : null,
    };
  }, [flujos, empresasSel, semanas]);

  // ── Guardar celda manual ──
  const guardarManual = async (vals) => {
    try {
      const g = await db.guardarFlujoManual({
        empresa: modal.empresa, tipo: modal.tipo, semana: modal.semana || null,
        monto: Number(vals.monto || 0), montoUsd: Number(vals.montoUsd || 0), nota: vals.nota || null,
      });
      setManual(prev => {
        const otras = prev.filter(m => !(m.empresa === g.empresa && m.tipo === g.tipo && (m.semana || null) === (g.semana || null)));
        return [...otras, g];
      });
      setModal(null);
    } catch (e) { toast('No se pudo guardar: ' + (e?.message || e), 'error'); }
  };

  const guardarEntrada = async (e) => {
    const g = await db.guardarFlujoEntrada(e);
    setEntradas(prev => {
      const otras = prev.filter(x => x.id !== g.id);
      return [...otras, g];
    });
    return g;
  };
  const borrarEntrada = async (id) => {
    await db.eliminarFlujoEntrada(id);
    setEntradas(prev => prev.filter(x => x.id !== id));
  };

  const toggleExpandido = (k) => setExpandido(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const guardarComp = async () => {
    try {
      const g = await db.guardarCompromisoFijo(formComp);
      setCompromisos(prev => {
        const otras = prev.filter(c => c.id !== g.id);
        return [...otras, g];
      });
      setFormComp(null);
    } catch (e) { toast('No se pudo guardar el compromiso: ' + (e?.message || e), 'error'); }
  };
  const borrarComp = async (id) => {
    try { await db.eliminarCompromisoFijo(id); setCompromisos(prev => prev.filter(c => c.id !== id)); }
    catch (e) { toast('No se pudo eliminar: ' + (e?.message || e), 'error'); }
  };
  const toggleComp = async (c) => {
    try { const g = await db.guardarCompromisoFijo({ ...c, activo: !c.activo }); setCompromisos(prev => prev.map(x => x.id === g.id ? g : x)); }
    catch (e) { toast('No se pudo actualizar: ' + (e?.message || e), 'error'); }
  };

  const advertencias = empresasSel.flatMap(k => odoo[k]?.advertencias || []);
  const saldoViejo = empresasSel.some(k => {
    const si = flujos[k]?.si;
    return !si || (Date.now() - new Date(si.actualizadoEn).getTime()) > 3 * 86400000;
  });

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Encabezado: empresa + horizonte + tasa */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="flex gap-2 items-center flex-wrap">
          {Object.entries(EMPRESAS_RECEPTORAS).map(([key, info]) => (
            <button key={key} onClick={() => { setEmpresa(key); setAmbas(false); }}
              className={`px-3 py-1.5 rounded-card text-xs font-bold border ${empresa === key && !ambas ? `${info.color} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
              {info.label}
            </button>
          ))}
          <button onClick={() => setAmbas(true)}
            className={`px-3 py-1.5 rounded-card text-xs font-bold border ${ambas ? 'bg-zinc-200 text-zinc-900 border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}>
            Ambas
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select value={horizonte} onChange={e => setHorizonte(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-xs text-white">
            <option value={4}>4 semanas</option>
            <option value={8}>8 semanas</option>
            <option value={13}>13 semanas</option>
          </select>
          <span className="text-[11px] text-zinc-500 whitespace-nowrap">Tasa: <b className="text-zinc-300">RD${tasa}</b>/US$</span>
          <button onClick={() => setRefrescar(r => r + 1)} title="Releer de Odoo"
            className="p-1.5 rounded-card border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !Object.keys(odoo).length && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo CxC, CxP y tasa de Odoo…</div>
      )}
      {error && <div className="bg-red-900/20 border border-red-700 rounded-card text-red-300 p-3 text-sm">No se pudo leer de Odoo: {error}</div>}
      {advertencias.map((a, i) => (
        <div key={i} className="bg-yellow-900/20 border border-yellow-700 rounded-card text-yellow-300 p-2 text-xs flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {a}</div>
      ))}
      {saldoViejo && !loading && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-card text-yellow-300 p-2 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> El saldo bancario inicial tiene más de 3 días (o no está definido). Actualízalo con el balance real del banco — los libros de Odoo no sirven mientras la conciliación esté pendiente.
        </div>
      )}

      {/* Cards resumen */}
      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[9px] uppercase tracking-widest font-bold text-zinc-500 flex items-center gap-1"><Wallet className="w-3 h-3" /> Disponibilidad hoy</div>
              <div className="text-lg font-black text-white mt-1">{formatRD(cons.saldoInicial)}</div>
              <div className="mt-1 space-y-0.5">
                {empresasSel.map(k => {
                  const f = flujos[k], info = EMPRESAS_RECEPTORAS[k];
                  return (
                    <button key={k} onClick={() => setModal({ tipo: 'saldo_inicial', empresa: k, label: `Saldo bancario real — ${info.label}` })}
                      className="w-full flex items-center justify-between text-[10px] text-zinc-400 hover:text-white group">
                      <span><span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${info.color}`} />{info.short}</span>
                      <span className="tabular-nums flex items-center gap-1">{formatRD(f?.saldoInicial || 0)} <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" /></span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[9px] uppercase tracking-widest font-bold text-green-500">CxC vencida — cobrable ya</div>
              <div className="text-lg font-black text-green-400 mt-1">{formatRD(cons.cxcVencida)}</div>
              <div className="text-[10px] text-zinc-500 mt-1">Cobros atrasados por gestionar. Lo que esperes recuperar, regístralo como entrada esperada en su semana.</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[9px] uppercase tracking-widest font-bold text-red-500">CxP vencida — arrastre</div>
              <div className="text-lg font-black text-red-400 mt-1">{formatRD(cons.cxpVencida)}</div>
              <div className="text-[10px] text-zinc-500 mt-1">No se auto-programa: decide cuánto abonar cada semana en “Abono a vencido”.</div>
            </div>
            <div className={`rounded-card p-3 border ${cons.idxNegativo === -1 ? 'bg-green-900/15 border-green-800' : 'bg-red-900/15 border-red-800'}`}>
              <div className="text-[9px] uppercase tracking-widest font-bold text-zinc-400 flex items-center gap-1">
                {cons.idxNegativo === -1 ? <ShieldCheck className="w-3 h-3 text-green-500" /> : <ShieldAlert className="w-3 h-3 text-red-500" />} Cobertura de efectivo
              </div>
              {cons.idxNegativo === -1 ? (
                <div className="text-sm font-black text-green-400 mt-1">Cubre las {horizonte} semanas</div>
              ) : (
                <div className="text-sm font-black text-red-400 mt-1">Se agota en la sem. {cons.idxNegativo + 1} ({semanas[cons.idxNegativo].label})</div>
              )}
              {cons.diasCaja != null && <div className="text-[10px] text-zinc-400 mt-1">≈ {cons.diasCaja} días de caja al ritmo de salida actual{ambas ? ' (consolidado)' : ''}.</div>}
            </div>
          </div>

          {/* Tabla semanal por empresa */}
          {empresasSel.map(emp => {
            const f = flujos[emp]; if (!f) return null;
            const info = EMPRESAS_RECEPTORAS[emp];
            return (
              <div key={emp} className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
                <div className="flex items-center justify-between px-3 pt-3">
                  <div className="text-xs font-black text-white flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] text-white ${info.color}`}>{info.short}</span> {info.label}
                  </div>
                  <div className="text-[10px] text-zinc-500">Saldo inicial: <b className="text-zinc-300">{formatRD(f.saldoInicial)}</b>
                    {f.si?.montoUsd > 0 && <span className="text-yellow-500 ml-1">(incl. {fmtUS(f.si.montoUsd)})</span>}
                    <button onClick={() => setModal({ tipo: 'saldo_inicial', empresa: emp, label: `Saldo bancario real — ${info.label}` })} className="ml-1.5 text-zinc-500 hover:text-white align-middle"><Pencil className="w-3 h-3 inline" /></button>
                  </div>
                </div>
                <table className="w-full text-xs mt-2">
                  <thead className="bg-zinc-950 border-y border-zinc-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500 min-w-[180px]">Concepto</th>
                      {f.sems.map(s => <th key={s.iniStr} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-500 whitespace-nowrap">{s.label}</th>)}
                      <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-400 whitespace-nowrap">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-800/50 text-[10px] uppercase tracking-widest text-green-600 font-bold"><td className="px-3 pt-2 pb-1" colSpan={f.sems.length + 2}>Entradas</td></tr>
                    <tr className="border-b border-zinc-800/30">
                      <td className="px-3 py-1.5 text-zinc-300">
                        <button onClick={() => toggleExpandido(`${emp}:cxc`)} className="inline-flex items-center gap-1 hover:text-white">
                          {expandido.has(`${emp}:cxc`) ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
                          Facturas por cobrar que vencen <span className="text-zinc-600">(Odoo)</span>
                        </button>
                      </td>
                      {f.sems.map(s => (
                        <td key={s.iniStr} className="px-3 py-1.5 text-right">
                          {s.cxcAuto > 0
                            ? <button onClick={() => setDetalle({ titulo: `CxC que vence — ${s.label} — ${info.label}`, facturas: s.cxcFacturas, tipo: 'entrada' })} className="underline decoration-dotted underline-offset-2 hover:text-white"><Monto v={s.cxcAuto} tipo="entrada" /></button>
                            : <Monto v={0} />}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right"><Monto v={f.sems.reduce((t, s) => t + s.cxcAuto, 0)} tipo="entrada" /></td>
                    </tr>
                    {expandido.has(`${emp}:cxc`) && f.sems.flatMap(s => s.cxcFacturas.map(fac => ({ fac, wi: s.i }))).map(({ fac, wi }) => (
                      <tr key={`cxc-${fac.id}`} className="border-b border-zinc-800/20 bg-zinc-950/40">
                        <td className="pl-8 pr-3 py-1 text-[11px] text-zinc-500 max-w-[220px] truncate" title={fac.tercero}>
                          {fac.tercero || fac.documento} <span className="text-[9px] text-zinc-600">· vence {fac.vence}</span>
                        </td>
                        {f.sems.map(s => (
                          <td key={s.iniStr} className="px-3 py-1 text-right text-[11px]">
                            {s.i === wi && <><Monto v={fac.pendiente} tipo="entrada" />{fac.moneda === 'USD' && <span className="block text-[9px] text-yellow-600">{fmtUS(fac.pendienteOriginal)}</span>}</>}
                          </td>
                        ))}
                        <td />
                      </tr>
                    ))}
                    <tr className="border-b border-zinc-800/30">
                      <td className="px-3 py-1.5 text-zinc-300">Entradas esperadas <span className="text-zinc-600">(avances, cubicaciones…)</span></td>
                      {f.sems.map(s => (
                        <td key={s.iniStr} className="px-3 py-1.5 text-right">
                          <button onClick={() => setModalEntradas({ empresa: emp, semana: s })}
                            className="group inline-flex items-center gap-1 hover:text-white">
                            <Monto v={s.totalEntradasEsp} tipo="entrada" />
                            {s.entradasSem.length > 0 && <span className="text-[9px] text-zinc-500">×{s.entradasSem.length}</span>}
                            <Pencil className="w-2.5 h-2.5 text-zinc-600 opacity-40 group-hover:opacity-100" />
                          </button>
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right"><Monto v={f.sems.reduce((t, s) => t + s.totalEntradasEsp, 0)} tipo="entrada" /></td>
                    </tr>
                    <tr className="border-b border-zinc-800/50 text-[10px] uppercase tracking-widest text-red-600 font-bold"><td className="px-3 pt-2 pb-1" colSpan={f.sems.length + 2}>Salidas</td></tr>
                    <tr className="border-b border-zinc-800/30">
                      <td className="px-3 py-1.5 text-zinc-300">
                        <button onClick={() => toggleExpandido(`${emp}:cxp`)} className="inline-flex items-center gap-1 hover:text-white">
                          {expandido.has(`${emp}:cxp`) ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
                          Facturas por pagar que vencen <span className="text-zinc-600">(Odoo)</span>
                        </button>
                      </td>
                      {f.sems.map(s => (
                        <td key={s.iniStr} className="px-3 py-1.5 text-right">
                          {s.cxpAuto > 0
                            ? <button onClick={() => setDetalle({ titulo: `CxP que vence — ${s.label} — ${info.label}`, facturas: s.cxpFacturas, tipo: 'salida' })} className="underline decoration-dotted underline-offset-2 hover:text-white"><Monto v={s.cxpAuto} tipo="salida" /></button>
                            : <Monto v={0} />}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right"><Monto v={f.sems.reduce((t, s) => t + s.cxpAuto, 0)} tipo="salida" /></td>
                    </tr>
                    {expandido.has(`${emp}:cxp`) && f.sems.flatMap(s => s.cxpFacturas.map(fac => ({ fac, wi: s.i }))).map(({ fac, wi }) => (
                      <tr key={`cxp-${fac.id}`} className="border-b border-zinc-800/20 bg-zinc-950/40">
                        <td className="pl-8 pr-3 py-1 text-[11px] text-zinc-500 max-w-[220px] truncate" title={fac.tercero}>
                          {fac.tercero || fac.documento} <span className="text-[9px] text-zinc-600">· vence {fac.vence}</span>
                        </td>
                        {f.sems.map(s => (
                          <td key={s.iniStr} className="px-3 py-1 text-right text-[11px]">
                            {s.i === wi && <><Monto v={fac.pendiente} tipo="salida" />{fac.moneda === 'USD' && <span className="block text-[9px] text-yellow-600">{fmtUS(fac.pendienteOriginal)}</span>}</>}
                          </td>
                        ))}
                        <td />
                      </tr>
                    ))}
                    <tr className="border-b border-zinc-800/30">
                      <td className="px-3 py-1.5 text-zinc-300">
                        Compromisos fijos <button onClick={() => setVerCompromisos(v => !v)} className="text-zinc-500 hover:text-white underline decoration-dotted underline-offset-2">(administrar)</button>
                      </td>
                      {f.sems.map(s => (
                        <td key={s.iniStr} className="px-3 py-1.5 text-right">
                          {s.totalComps > 0
                            ? <button onClick={() => setDetalle({ titulo: `Compromisos fijos — ${s.label} — ${info.label}`, compromisos: s.compsSem, tipo: 'salida' })} className="underline decoration-dotted underline-offset-2 hover:text-white"><Monto v={s.totalComps} tipo="salida" /></button>
                            : <Monto v={0} />}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right"><Monto v={f.sems.reduce((t, s) => t + s.totalComps, 0)} tipo="salida" /></td>
                    </tr>
                    <tr className="border-b border-zinc-800/30">
                      <td className="px-3 py-1.5 text-zinc-300">Abono a lo ya vencido <span className="text-zinc-600">(tú lo llenas)</span></td>
                      {f.sems.map(s => (
                        <td key={s.iniStr} className="px-3 py-1.5 text-right">
                          <button onClick={() => setModal({ tipo: 'abono_vencido', empresa: emp, semana: s.iniStr, label: `Abono a CxP vencida — ${s.label} — ${info.label}` })}
                            className="group inline-flex items-center gap-1 hover:text-white">
                            <Monto v={s.abono} tipo="salida" /><Pencil className="w-2.5 h-2.5 text-zinc-600 opacity-40 group-hover:opacity-100" />
                          </button>
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right"><Monto v={f.sems.reduce((t, s) => t + s.abono, 0)} tipo="salida" /></td>
                    </tr>
                    <tr className="bg-zinc-950/60 border-t border-zinc-700">
                      <td className="px-3 py-2 font-black text-white uppercase text-[10px] tracking-widest">Saldo final</td>
                      {f.sems.map(s => (
                        <td key={s.iniStr} className={`px-3 py-2 text-right font-black tabular-nums ${s.saldoFinal < 0 ? 'text-red-400 bg-red-950/40' : 'text-green-400'}`}>{formatRD(s.saldoFinal)}</td>
                      ))}
                      <td className="px-3 py-2" />
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Consolidado (solo con Ambas) */}
          {ambas && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-card overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  <tr className="bg-zinc-950/60">
                    <td className="px-3 py-2 font-black text-white uppercase text-[10px] tracking-widest min-w-[180px]">Saldo final consolidado</td>
                    {cons.sems.map((s, i) => (
                      <td key={i} className={`px-3 py-2 text-right font-black tabular-nums whitespace-nowrap ${s.saldoFinal < 0 ? 'text-red-400 bg-red-950/40' : 'text-green-400'}`}>
                        <span className="block text-[9px] font-bold text-zinc-500 uppercase">{semanas[i].label}</span>
                        {formatRD(s.saldoFinal)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <div className="text-[10px] text-zinc-600 px-3 pb-2 pt-1">El faltante de una empresa se puede cubrir con el sobrante de la otra (préstamo intercompañía): el consolidado no cambia.</div>
            </div>
          )}

          {/* Compromisos fijos (CRUD) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-card">
            <button onClick={() => setVerCompromisos(v => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-zinc-300 hover:text-white">
              <span className="flex items-center gap-2"><CalendarClock className="w-3.5 h-3.5 text-red-500" /> Compromisos fijos ({compromisos.filter(c => c.activo).length} activos)</span>
              {verCompromisos ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {verCompromisos && (
              <div className="px-3 pb-3 space-y-2">
                <div className="text-[10px] text-zinc-500">Salidas recurrentes que no viven como facturas en Odoo (nómina, tarjetas, servicios, brigadas). Montos = promedio mar–ago 2026; ajústalos cuando sepas el exacto. Agrega aquí también la caja chica de obra cuando tengas la proyección.</div>
                <table className="w-full text-xs">
                  <thead><tr className="text-zinc-500 border-b border-zinc-800">
                    <th className="text-left px-2 py-1.5 font-bold uppercase text-[10px]">Empresa</th>
                    <th className="text-left px-2 py-1.5 font-bold uppercase text-[10px]">Concepto</th>
                    <th className="text-right px-2 py-1.5 font-bold uppercase text-[10px]">Monto</th>
                    <th className="text-left px-2 py-1.5 font-bold uppercase text-[10px]">Frecuencia</th>
                    <th className="text-left px-2 py-1.5 font-bold uppercase text-[10px]">Activo</th>
                    <th />
                  </tr></thead>
                  <tbody>
                    {[...compromisos].sort((a, b) => a.empresa.localeCompare(b.empresa) || (a.diaMes || 0) - (b.diaMes || 0)).map(c => {
                      const info = EMPRESAS_RECEPTORAS[c.empresa];
                      return (
                        <tr key={c.id} className={`border-b border-zinc-800/40 ${c.activo ? '' : 'opacity-40'}`}>
                          <td className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[9px] font-black text-white ${info?.color}`}>{info?.short}</span></td>
                          <td className="px-2 py-1.5 text-zinc-200">{c.concepto}{c.notas && <span className="block text-[9px] text-zinc-600">{c.notas}</span>}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-red-400 font-bold">{c.moneda === 'USD' ? fmtUS(c.monto) : formatRD(c.monto)}</td>
                          <td className="px-2 py-1.5 text-zinc-400">{c.frecuencia === 'semanal' ? 'Semanal' : `Mensual (día ${c.diaMes ?? '—'})`}</td>
                          <td className="px-2 py-1.5"><input type="checkbox" checked={c.activo} onChange={() => toggleComp(c)} className="accent-red-600" /></td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            <button onClick={() => setFormComp({ ...c })} className="text-zinc-500 hover:text-white mr-2"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => borrarComp(c.id)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button onClick={() => setFormComp({ empresa: ambas ? 'super_techos' : empresa, concepto: '', monto: '', moneda: 'DOP', frecuencia: 'mensual', diaMes: 1, activo: true })}
                  className="bg-red-600 hover:bg-red-500 text-white rounded-card px-3 py-1.5 text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Agregar compromiso</button>
              </div>
            )}
          </div>

          {/* Saldos en libros Odoo (referencia) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-card">
            <button onClick={() => setVerLibros(v => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-zinc-300 hover:text-white">
              <span className="flex items-center gap-2"><Landmark className="w-3.5 h-3.5 text-yellow-500" /> Saldos en libros (Odoo) — solo referencia</span>
              {verLibros ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {verLibros && (
              <div className="px-3 pb-3 space-y-2">
                <div className="bg-yellow-900/20 border border-yellow-800 rounded-card text-yellow-300 p-2 text-[10px] flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Los bancos siguen sin conciliar en Odoo, así que estos saldos NO son la disponibilidad real. Úsalos solo para comparar; el flujo usa el saldo que tú captures.
                </div>
                {empresasSel.map(k => (
                  <div key={k}>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1 mb-0.5">{EMPRESAS_RECEPTORAS[k].label}</div>
                    <table className="w-full text-xs">
                      <tbody>
                        {(odoo[k]?.saldosLibros || []).map(c => (
                          <tr key={c.odooId} className="border-b border-zinc-800/30">
                            <td className="px-2 py-1 text-zinc-500 font-mono text-[10px]">{c.codigo}</td>
                            <td className="px-2 py-1 text-zinc-300">{c.nombre}</td>
                            <td className="px-2 py-1 text-zinc-500 text-[10px]">{c.moneda}</td>
                            <td className={`px-2 py-1 text-right tabular-nums ${c.saldoLibrosRD < 0 ? 'text-red-400' : 'text-zinc-300'}`}>{formatRD(c.saldoLibrosRD)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal: editar celda manual (RD$ + US$) */}
      {modal && (
        <ModalMonto
          label={modal.label}
          inicial={manualDe(modal.empresa, modal.tipo, modal.semana || null)}
          tasa={tasa}
          onCerrar={() => setModal(null)}
          onGuardar={guardarManual}
        />
      )}

      {/* Modal: entradas esperadas de una semana (avances, cubicaciones…) */}
      {modalEntradas && (
        <ModalEntradas
          empresa={modalEntradas.empresa}
          semana={modalEntradas.semana}
          items={entradas.filter(e => e.empresa === modalEntradas.empresa && e.fechaEsperada &&
            (modalEntradas.semana.i === 0 ? e.fechaEsperada <= modalEntradas.semana.finStr
              : (e.fechaEsperada >= modalEntradas.semana.iniStr && e.fechaEsperada <= modalEntradas.semana.finStr)))}
          tasa={tasa}
          hoyStr={hoyStr}
          onGuardar={guardarEntrada}
          onBorrar={borrarEntrada}
          onCerrar={() => setModalEntradas(null)}
        />
      )}

      {/* Modal: detalle de facturas / compromisos de una semana */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDetalle(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-lg max-h-[80vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-black text-white">{detalle.titulo}</div>
              <button onClick={() => setDetalle(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <table className="w-full text-xs">
              <tbody>
                {(detalle.facturas || []).map(f => (
                  <tr key={f.id} className="border-b border-zinc-800/40">
                    <td className="px-2 py-1.5 text-zinc-200 max-w-[220px] truncate">{f.tercero || f.documento}</td>
                    <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">{f.vence}</td>
                    <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${detalle.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                      {formatRD(f.pendiente)}
                      {f.moneda === 'USD' && <span className="block text-[9px] text-yellow-500 font-normal">{fmtUS(f.pendienteOriginal)}</span>}
                    </td>
                  </tr>
                ))}
                {(detalle.compromisos || []).map(c => (
                  <tr key={c.id} className="border-b border-zinc-800/40">
                    <td className="px-2 py-1.5 text-zinc-200">{c.concepto}</td>
                    <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">{c.frecuencia === 'semanal' ? 'semanal' : (c.fecha || `día ${c.diaMes}`)}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-red-400">{formatRD(c.montoRD)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: compromiso fijo */}
      {formComp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setFormComp(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-md p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-white">{formComp.id ? 'Editar' : 'Nuevo'} compromiso fijo</div>
              <button onClick={() => setFormComp(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <Campo label="Empresa">
              <select value={formComp.empresa} onChange={e => setFormComp({ ...formComp, empresa: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white">
                {Object.entries(EMPRESAS_RECEPTORAS).map(([k, i]) => <option key={k} value={k}>{i.label}</option>)}
              </select>
            </Campo>
            <Campo label="Concepto"><Input value={formComp.concepto} onChange={v => setFormComp({ ...formComp, concepto: v })} placeholder="Ej. Nómina segunda quincena" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Monto"><Input type="number" value={formComp.monto} onChange={v => setFormComp({ ...formComp, monto: v })} placeholder="0.00" /></Campo>
              <Campo label="Moneda">
                <select value={formComp.moneda} onChange={e => setFormComp({ ...formComp, moneda: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white">
                  <option value="DOP">RD$</option><option value="USD">US$</option>
                </select>
              </Campo>
              <Campo label="Frecuencia">
                <select value={formComp.frecuencia} onChange={e => setFormComp({ ...formComp, frecuencia: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white">
                  <option value="mensual">Mensual</option><option value="semanal">Semanal</option>
                </select>
              </Campo>
              {formComp.frecuencia === 'mensual' && (
                <Campo label="Día del mes"><Input type="number" value={formComp.diaMes ?? ''} onChange={v => setFormComp({ ...formComp, diaMes: v })} placeholder="1–31" /></Campo>
              )}
            </div>
            <Campo label="Notas (opcional)"><Input value={formComp.notas || ''} onChange={v => setFormComp({ ...formComp, notas: v })} placeholder="Ej. promedio; confirmar monto" /></Campo>
            <button onClick={guardarComp} disabled={!formComp.concepto || !formComp.monto}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-card px-4 py-2 text-xs font-bold">Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: entradas esperadas de una semana (avances, cubicaciones no facturadas…) ──
const CATEGORIAS_ENTRADA = {
  avance: { label: 'Avance de contrato', color: 'bg-green-900/40 text-green-300 border-green-800' },
  cubicacion: { label: 'Cubicación por facturar', color: 'bg-blue-900/40 text-blue-300 border-blue-800' },
  cobro: { label: 'Cobro comprometido', color: 'bg-yellow-900/40 text-yellow-300 border-yellow-800' },
  otro: { label: 'Otro', color: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
};

function ModalEntradas({ empresa, semana, items, tasa, hoyStr, onGuardar, onBorrar, onCerrar }) {
  const info = EMPRESAS_RECEPTORAS[empresa];
  const [form, setForm] = useState(null); // null = solo lista; {} = creando/editando
  const [guardando, setGuardando] = useState(false);
  const nuevo = () => setForm({
    empresa, concepto: '', categoria: 'avance', monto: '', moneda: 'DOP',
    fechaEsperada: semana.iniStr > hoyStr ? semana.iniStr : hoyStr, notas: '',
  });

  const guardar = async () => {
    setGuardando(true);
    try { await onGuardar(form); setForm(null); }
    catch (e) { toast('No se pudo guardar: ' + (e?.message || e), 'error'); }
    setGuardando(false);
  };
  const marcarCobrado = async (it) => {
    try { await onGuardar({ ...it, cobrado: !it.cobrado }); }
    catch (e) { toast('No se pudo actualizar: ' + (e?.message || e), 'error'); }
  };
  const borrar = async (id) => {
    try { await onBorrar(id); }
    catch (e) { toast('No se pudo eliminar: ' + (e?.message || e), 'error'); }
  };

  const totalRD = items.filter(i => !i.cobrado).reduce((t, i) => t + (i.moneda === 'USD' ? i.monto * tasa : i.monto), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-white pr-4">Entradas esperadas — {semana.label} — {info?.label}</div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="text-[10px] text-zinc-500">Dinero que piensas que va a entrar pero aún no es factura en Odoo: avances de contrato, cubicaciones por facturar, cobros comprometidos. Al recibirlo márcalo cobrado (sale de la proyección — ya vive en tu saldo bancario).</div>

        {items.length > 0 && (
          <table className="w-full text-xs">
            <tbody>
              {items.map(it => {
                const cat = CATEGORIAS_ENTRADA[it.categoria] || CATEGORIAS_ENTRADA.otro;
                return (
                  <tr key={it.id} className={`border-b border-zinc-800/40 ${it.cobrado ? 'opacity-40' : ''}`}>
                    <td className="px-2 py-1.5">
                      <div className={`text-zinc-200 ${it.cobrado ? 'line-through' : ''}`}>{it.concepto}</div>
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold ${cat.color}`}>{cat.label}</span>
                      <span className="text-[9px] text-zinc-600 ml-1.5">esperado {it.fechaEsperada}{it.fechaEsperada < hoyStr && !it.cobrado ? ' · atrasado' : ''}</span>
                      {it.notas && <div className="text-[9px] text-zinc-600">{it.notas}</div>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-green-400 whitespace-nowrap">
                      {it.moneda === 'USD' ? <>{formatRD(it.monto * tasa)}<span className="block text-[9px] text-yellow-500 font-normal">{fmtUS(it.monto)}</span></> : formatRD(it.monto)}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <label className="inline-flex items-center gap-1 text-[9px] text-zinc-500 mr-2 cursor-pointer" title="Marcar como cobrado">
                        <input type="checkbox" checked={it.cobrado} onChange={() => marcarCobrado(it)} className="accent-green-600" /> cobrado
                      </label>
                      <button onClick={() => setForm({ ...it })} className="text-zinc-500 hover:text-white mr-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => borrar(it.id)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Total por entrar</td>
                <td className="px-2 py-1.5 text-right font-black tabular-nums text-green-400">{formatRD(totalRD)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
        {items.length === 0 && !form && <div className="text-center text-zinc-600 text-xs py-3">Sin entradas esperadas esta semana</div>}

        {form ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-3">
            <Campo label="Concepto"><Input value={form.concepto} onChange={v => setForm({ ...form, concepto: v })} placeholder="Ej. Avance 50% C5810 Banreservas" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tipo">
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white">
                  {Object.entries(CATEGORIAS_ENTRADA).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                </select>
              </Campo>
              <Campo label="Fecha esperada"><Input type="date" value={form.fechaEsperada} onChange={v => setForm({ ...form, fechaEsperada: v })} /></Campo>
              <Campo label="Monto"><Input type="number" value={form.monto} onChange={v => setForm({ ...form, monto: v })} placeholder="0.00" /></Campo>
              <Campo label="Moneda">
                <select value={form.moneda} onChange={e => setForm({ ...form, moneda: e.target.value })} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white">
                  <option value="DOP">RD$</option><option value="USD">US$</option>
                </select>
              </Campo>
            </div>
            <Campo label="Notas (opcional)"><Input value={form.notas || ''} onChange={v => setForm({ ...form, notas: v })} placeholder="Ej. depende de aprobación del banco" /></Campo>
            <div className="flex gap-2">
              <button onClick={guardar} disabled={guardando || !form.concepto || !form.monto || !form.fechaEsperada}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-card px-4 py-2 text-xs font-bold flex items-center justify-center gap-2">
                {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
              </button>
              <button onClick={() => setForm(null)} className="px-4 py-2 text-xs text-zinc-400 hover:text-white">Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={nuevo} className="bg-red-600 hover:bg-red-500 text-white rounded-card px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Agregar entrada esperada
          </button>
        )}
      </div>
    </div>
  );
}

// ── Modal genérico RD$ + US$ para celdas manuales ──
function ModalMonto({ label, inicial, tasa, onCerrar, onGuardar }) {
  const [monto, setMonto] = useState(inicial?.monto || '');
  const [montoUsd, setMontoUsd] = useState(inicial?.montoUsd || '');
  const [nota, setNota] = useState(inicial?.nota || '');
  const [guardando, setGuardando] = useState(false);
  const totalRD = Number(monto || 0) + Number(montoUsd || 0) * tasa;

  const guardar = async () => {
    setGuardando(true);
    await onGuardar({ monto, montoUsd, nota });
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-white pr-4">{label}</div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="RD$"><Input type="number" value={monto} onChange={setMonto} placeholder="0.00" /></Campo>
          <Campo label="US$ (se convierte)"><Input type="number" value={montoUsd} onChange={setMontoUsd} placeholder="0.00" /></Campo>
        </div>
        <div className="text-[11px] text-zinc-500">Total: <b className="text-zinc-200">{formatRD(totalRD)}</b> <span className="text-zinc-600">(tasa RD${tasa}/US$)</span></div>
        <Campo label="Nota (opcional)"><Input value={nota} onChange={setNota} placeholder="Ej. cobro Banreservas C5810" /></Campo>
        <button onClick={guardar} disabled={guardando}
          className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-card px-4 py-2 text-xs font-bold flex items-center justify-center gap-2">
          {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );
}
