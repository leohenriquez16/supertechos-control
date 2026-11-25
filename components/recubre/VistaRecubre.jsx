'use client';

// v8.100.0: Liquidación Recubre. Acuerdo (Leo, 22-nov-2026): Super Techos compra los materiales,
// Recubre pone la MDO. Beneficio bruto = venta s/ITBIS − materiales − MDO, 50/50 (también la pérdida).
// Recubre nos factura MDO + su 50%. Se liquida por corte mensual.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchConSesion } from '../../lib/fetchConSesion';

const rd = (n) => (n == null ? '—' : 'RD$' + Math.round(Number(n)).toLocaleString('en-US'));
const ESTADOS = { aprobado: 'Aprobada', planificado: 'Planificada', en_ejecucion: 'En ejecución', parado: 'Parada', finalizado_no_entregado: 'Terminada', finalizado_recibido_conforme: 'Entregada', facturado: 'Facturada' };
const mesLabel = (m) => m ? new Date(m + '-01T00:00:00').toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }) : 'Sin corte';

export function calcularLiquidacion(f) {
  const venta = f.venta?.ventaSinItbis ?? null;
  const materiales = (f.materialesOdooRd || 0) + Number(f.liq?.materiales_extra_rd || 0);
  const mdo = f.liq?.mdo_rd != null ? Number(f.liq.mdo_rd) : null;
  const logistica = Number(f.liq?.logistica_rd || 0); // logística / material gastable que Recubre nos cobra
  const m2 = f.liq?.m2_recubre != null ? Number(f.liq.m2_recubre) : null;
  const mdoM2 = mdo != null && m2 ? mdo / m2 : null;
  if (venta == null || mdo == null) return { venta, materiales, mdo, logistica, m2, mdoM2, beneficio: null, mitad: null, factura: null, nuestro: null, pct: null };
  const beneficio = venta - materiales - mdo - logistica;
  const mitad = beneficio / 2;
  return { venta, materiales, mdo, logistica, m2, mdoM2, beneficio, mitad, factura: mdo + logistica + mitad, nuestro: mitad, pct: venta ? beneficio / venta : null };
}

function CeldaEditable({ valor, tipo = 'number', placeholder, onGuardar, ancho = 'w-28' }) {
  const [v, setV] = useState(valor ?? '');
  useEffect(() => { setV(valor ?? ''); }, [valor]);
  const guardar = () => { if (String(v) !== String(valor ?? '')) onGuardar(v); };
  return <input type={tipo} value={v} placeholder={placeholder} onClick={e => e.stopPropagation()} onChange={e => setV(e.target.value)} onBlur={guardar} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
    className={`${ancho} bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-sm text-right tabular-nums text-white outline-none focus:border-red-500`} />;
}

export default function VistaRecubre({ onVolver }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [corte, setCorte] = useState('todos');
  const [abierta, setAbierta] = useState(null);

  const cargar = () => fetchConSesion('/api/recubre').then(r => r.json()).then(j => j.error ? setErr(j.error) : setD(j)).catch(e => setErr(e.message));
  useEffect(() => { cargar(); }, []);

  const guardar = async (f, campos) => {
    const r = await fetchConSesion('/api/recubre', { method: 'POST', body: JSON.stringify({ ref: f.ref, nombre: f.nombre, proyecto_id: f.proyecto_id || null, locacion_id: f.locacion_id || null, ...campos }) });
    const j = await r.json();
    if (j.error) { alert('No se pudo guardar: ' + j.error); return; }
    setD(x => ({ ...x, filas: x.filas.map(y => y.ref === f.ref ? { ...y, liq: j.liq } : y) }));
  };

  const filas = useMemo(() => (d?.filas || []).map(f => ({ ...f, c: calcularLiquidacion(f) }))
    .sort((a, b) => (a.liq?.corte || '9999').localeCompare(b.liq?.corte || '9999') || String(a.nombre).localeCompare(String(b.nombre))), [d]);
  const cortes = [...new Set(filas.map(f => f.liq?.corte).filter(Boolean))].sort().reverse();
  const vis = filas.filter(f => corte === 'todos' ? true : corte === 'sin' ? !f.liq?.corte : f.liq?.corte === corte);
  const tot = vis.reduce((s, f) => { const c = f.c; s.venta += c.venta || 0; s.mat += c.materiales || 0; if (c.beneficio != null) { s.mdo += c.mdo + c.logistica; s.ben += c.beneficio; s.fac += c.factura; s.n++; } else s.pend++; return s; }, { venta: 0, mat: 0, mdo: 0, ben: 0, fac: 0, n: 0, pend: 0 });
  const meses = (() => { const out = []; const h = new Date(); for (let i = -2; i <= 2; i++) { const x = new Date(h.getFullYear(), h.getMonth() + i, 1); out.push(x.toISOString().slice(0, 7)); } return out; })();

  const exportar = () => {
    const cab = ['Sitio', 'Cotización', 'Estado obra', 'Venta s/ITBIS', 'Materiales Odoo', 'Materiales extra', 'M² Recubre', 'MDO Recubre', 'MDO por m²', 'Logística Recubre', 'Beneficio bruto', '50% Recubre', 'Recubre factura (MDO + logística + 50%)', '50% Super Techos', 'Margen %', 'Corte', 'Factura Recubre', 'Días pagados', 'Visitas', 'Motivo visitas'];
    const rows = vis.map(f => [f.nombre, f.ref, ESTADOS[f.proyecto?.estado] || '', f.c.venta, f.materialesOdooRd, f.liq?.materiales_extra_rd || 0, f.c.m2, f.c.mdo, f.c.mdoM2, f.c.logistica, f.c.beneficio, f.c.mitad, f.c.factura, f.c.nuestro, f.c.pct != null ? Math.round(f.c.pct * 1000) / 10 : '', f.liq?.corte || '', f.liq?.factura_recubre || '', f.liq?.dias_pagados ?? '', f.liq?.visitas ?? '', f.liq?.visitas_motivo || ''].map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v ?? ''));
    const csv = '﻿' + [cab, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `liquidacion-recubre-${corte}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div>
        <h1 className="text-3xl font-black tracking-tight">Liquidación Recubre</h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-3xl">Nosotros compramos los materiales y Recubre pone la mano de obra. Beneficio bruto = venta sin ITBIS − materiales − MDO, a partes iguales (también si hay pérdida). Recubre nos factura su MDO, su logística / material gastable y su 50%.</p>
      </div>
      {err && <div className="text-red-400 text-sm">{err}</div>}
      {d?.errorOdoo && <div className="text-amber-300 text-sm">Odoo no respondió: {d.errorOdoo}. Venta y materiales pueden salir vacíos.</div>}
      {!d && !err && <div className="flex items-center gap-2 text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo cotizaciones y despachos de Odoo…</div>}
      {d && <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {[['Venta s/ITBIS', rd(tot.venta)], ['Materiales', rd(tot.mat)], ['MDO + logística Recubre', rd(tot.mdo), tot.pend ? `${tot.pend} obras sin MDO reportada` : ''], ['Beneficio bruto', rd(tot.ben), tot.n ? `${tot.n} obras liquidables` : ''], ['Recubre nos factura', rd(tot.fac), 'MDO + logística + 50%'], ['Nos queda (50%)', rd(tot.ben / 2)]].map(([t, v, s]) => (
            <div key={t} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 min-w-0"><div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">{t}</div><div className="text-lg font-black tabular-nums text-white">{v}</div>{s && <div className="text-[11px] text-zinc-500">{s}</div>}</div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Corte</span>
          {[['todos', 'Todos'], ...cortes.map(c => [c, mesLabel(c)]), ['sin', 'Sin corte']].map(([k, l]) => (
            <button key={k} onClick={() => setCorte(k)} className={`text-xs font-bold px-3 py-1.5 rounded-card border capitalize ${corte === k ? 'border-red-600 text-white bg-red-600/20' : 'border-zinc-800 text-zinc-400'}`}>{l}</button>
          ))}
          <button onClick={exportar} className="ml-auto flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold px-3 py-2 rounded-card"><Download className="w-3.5 h-3.5" /> Excel</button>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
          <table className="w-full text-sm min-w-[1450px]">
            <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
              {['', 'Sitio', 'Estado', 'Venta s/ITBIS', 'Materiales', 'Mat. extra', 'M² Recubre', 'MDO Recubre', 'Logística', 'Beneficio', 'Recubre factura', 'Nos queda', 'Margen', 'Corte', 'Factura Recubre'].map((h, i) => <th key={i} className={`px-2 py-2 ${i >= 3 && i <= 12 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {vis.map(f => { const c = f.c; const ab = abierta === f.ref; return (
                <React.Fragment key={f.ref}>
                  <tr onClick={() => setAbierta(ab ? null : f.ref)} className="border-t border-zinc-800 hover:bg-zinc-800/40 cursor-pointer">
                    <td className="pl-2 text-zinc-500">{ab ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                    <td className="px-2 py-2"><div className="font-bold text-white">{f.nombre}</div><div className="text-[11px] text-zinc-500">{f.ref}{!f.proyecto && ' · sin obra en el ERP'}{Number(f.liq?.visitas) > 1 && <span className="text-amber-300"> · {f.liq.visitas} visitas{f.liq.visitas_motivo ? ` (${f.liq.visitas_motivo})` : ''}</span>}</div></td>
                    <td className="px-2 py-2 text-zinc-400 whitespace-nowrap">{ESTADOS[f.proyecto?.estado] || '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{rd(c.venta)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{rd(f.materialesOdooRd)}</td>
                    <td className="px-2 py-2 text-right"><CeldaEditable valor={f.liq?.materiales_extra_rd || ''} placeholder="0" ancho="w-24" onGuardar={v => guardar(f, { materiales_extra_rd: v })} /></td>
                    <td className="px-2 py-2 text-right"><CeldaEditable valor={f.liq?.m2_recubre ?? ''} placeholder="m²" ancho="w-20" onGuardar={v => guardar(f, { m2_recubre: v })} /></td>
                    <td className="px-2 py-2 text-right"><CeldaEditable valor={f.liq?.mdo_rd ?? ''} placeholder="Reporte" onGuardar={v => guardar(f, { mdo_rd: v })} />{c.mdoM2 != null && <div className="text-[10px] text-zinc-500 tabular-nums">{rd(c.mdoM2)}/m²</div>}</td>
                    <td className="px-2 py-2 text-right"><CeldaEditable valor={f.liq?.logistica_rd ?? ''} placeholder="0" ancho="w-24" onGuardar={v => guardar(f, { logistica_rd: v })} /></td>
                    <td className={`px-2 py-2 text-right tabular-nums font-bold ${c.beneficio == null ? 'text-zinc-600' : c.beneficio < 0 ? 'text-red-400' : 'text-green-400'}`}>{rd(c.beneficio)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-amber-300">{rd(c.factura)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{rd(c.nuestro)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-400">{c.pct != null ? (c.pct * 100).toFixed(1) + '%' : '—'}</td>
                    <td className="px-2 py-2"><select value={f.liq?.corte || ''} onClick={e => e.stopPropagation()} onChange={e => guardar(f, { corte: e.target.value })} className="bg-zinc-950 border border-zinc-800 rounded-card px-1 py-1 text-xs text-white capitalize">
                      <option value="">—</option>{[...new Set([...meses, ...(f.liq?.corte ? [f.liq.corte] : [])])].sort().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}</select></td>
                    <td className="px-2 py-2"><CeldaEditable tipo="text" valor={f.liq?.factura_recubre || ''} placeholder="NCF / #" ancho="w-28" onGuardar={v => guardar(f, { factura_recubre: v })} /></td>
                  </tr>
                  {ab && (
                    <tr className="bg-zinc-950/60"><td colSpan={15} className="px-6 py-3">
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Materiales despachados (Odoo, a costo)</div>
                          {f.materiales.length ? f.materiales.map((m, i) => <div key={i} className="flex justify-between gap-3 border-t border-zinc-800 py-1"><span className="text-zinc-300">{m.cantidad} {m.unidad} · {m.producto}</span><span className="tabular-nums">{rd(m.costoRd)}</span></div>)
                            : <div className="text-zinc-500">Sin salidas de almacén con {f.ref} en el origen.</div>}
                        </div>
                        <div className="space-y-2">
                          <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Más control (opcional) — Recubre cobra por día</div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                            <span>Días pagados <CeldaEditable valor={f.liq?.dias_pagados ?? ''} placeholder="—" ancho="w-16" onGuardar={v => guardar(f, { dias_pagados: v })} /></span>
                            <span>Visitas al sitio <CeldaEditable valor={f.liq?.visitas ?? ''} placeholder="—" ancho="w-16" onGuardar={v => guardar(f, { visitas: v })} /></span>
                            {f.liq?.dias_pagados && f.c.mdo != null ? <span>= {rd(f.c.mdo / Number(f.liq.dias_pagados))} por día</span> : null}
                          </div>
                          {Number(f.liq?.visitas) > 1 && (
                            <select value={f.liq?.visitas_motivo || ''} onChange={e => guardar(f, { visitas_motivo: e.target.value })} className="bg-zinc-950 border border-amber-700 rounded-card px-2 py-1 text-xs text-amber-200">
                              <option value="">¿Por qué volvieron?</option>{['Techo sin terminar', 'Faltó material', 'Sin acceso / llave', 'Lluvia', 'Corrección / retoque', 'Otro'].map(m => <option key={m}>{m}</option>)}
                            </select>)}
                          <label className="block"><span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Detalle del reporte de MDO de Recubre</span>
                            <textarea defaultValue={f.liq?.mdo_nota || ''} onBlur={e => e.target.value !== (f.liq?.mdo_nota || '') && guardar(f, { mdo_nota: e.target.value })} rows={2} className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-card p-2 text-sm text-white" /></label>
                          <label className="block"><span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Materiales extra (compras fuera de Odoo): qué son</span>
                            <textarea defaultValue={f.liq?.materiales_extra_nota || ''} onBlur={e => e.target.value !== (f.liq?.materiales_extra_nota || '') && guardar(f, { materiales_extra_nota: e.target.value })} rows={2} className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-card p-2 text-sm text-white" /></label>
                          {f.liq?.updated_by && <div className="text-[11px] text-zinc-500">Último cambio: {f.liq.updated_by} · {new Date(f.liq.updated_at).toLocaleString('es-DO')}</div>}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>); })}
              {!vis.length && <tr><td colSpan={15} className="text-center py-8 text-zinc-500">Nada en este corte.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}
