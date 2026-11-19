'use client';

// v8.79.0: pronóstico de inventario de productos importados (pestaña de Importaciones).
// Por producto: existencia y salidas de Odoo, llegadas de las cargas abiertas y proyección
// semanal con la fecha en que se acaba. Alerta si se acaba antes de la próxima llegada.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import * as db from '../../lib/db';
import { consumoMensual, llegadasPorProducto, proyectar } from '../../lib/helpers/forecastInventario';

const num = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fecha = (f) => f ? new Date(String(f).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const corto = (p) => p.replace(/^INSUTECH\s+/i, '').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim();
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Gráfico de la proyección: barras de salida mensual (histórico) + línea de saldo proyectado
function Grafico({ prod, r, llegadas }) {
  const W = 760, H = 200, pl = 44, pr = 12, pt = 12, pb = 28;
  const pts = r.puntos;
  const max = Math.max(1, ...pts.map(p => p.saldo), prod.stock);
  const min = Math.min(0, ...pts.map(p => p.saldo));
  const x = (i) => pl + (i / (pts.length - 1)) * (W - pl - pr);
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(min + f * (max - min)));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label={`Proyección de ${prod.producto}`}>
        {ticks.map(t => (
          <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-zinc-800" strokeWidth="1" />
            <text x={pl - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="currentColor" className="text-zinc-500">{num(t)}</text></g>
        ))}
        {min < 0 && <rect x={pl} y={y(0)} width={W - pl - pr} height={y(min) - y(0)} fill="#ef4444" opacity="0.08" />}
        <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} stroke="#ef4444" strokeWidth="1" strokeDasharray="3 3" />
        {pts.map((p, i) => p.llega > 0 && (
          <g key={'l' + i}><line x1={x(i)} x2={x(i)} y1={pt} y2={H - pb} stroke="#60a5fa" strokeWidth="1" strokeDasharray="2 3" />
            <text x={x(i)} y={pt + 9} textAnchor="middle" fontSize="10" fill="#60a5fa">+{num(p.llega)}</text></g>
        ))}
        <path d={linea} fill="none" stroke="#f4f4f5" strokeWidth="2" />
        {pts.map((p, i) => i % 4 === 0 && (
          <text key={'x' + i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="currentColor" className="text-zinc-500">
            {(() => { const d = new Date(p.fecha + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]}`; })()}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function ForecastInventario({ importaciones }) {
  const [prods, setProds] = useState(null);
  const [meses, setMeses] = useState(6);
  const [abierto, setAbierto] = useState(null);
  const [demanda, setDemanda] = useState([]);
  useEffect(() => { db.listarInventarioProductos().then(setProds); db.listarInventarioDemanda().then(setDemanda); }, []);

  const llegadas = useMemo(() => llegadasPorProducto(importaciones), [importaciones]);
  const filas = useMemo(() => (prods || []).map(p => {
    const c = consumoMensual(p.mensual, meses);
    const ll = llegadas[p.odooProductId] || [];
    const dem = demanda.filter(d => d.odooProductId === p.odooProductId && d.pendiente > 0);
    const r = proyectar({ stock: p.stock, comprometido: p.comprometido, consumoMes: c, llegadas: ll, demandas: dem });
    return { p, c, ll, r, dem };
  }).filter(f => f.p.stock > 0 || f.c > 0 || f.ll.length || f.dem.length)
    .sort((a, b) => (a.r.agota || '9999').localeCompare(b.r.agota || '9999')), [prods, meses, llegadas]);

  if (!prods) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;

  const historico = (m) => Object.entries(m).sort().slice(-8);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-400">Existencia y salidas de Odoo · llegadas de las cargas abiertas · obras aprobadas: lo que requieren (presupuesto o m² del sistema) menos lo que ya salió · cada semana sale lo mayor entre el promedio y las obras.</p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-zinc-500 mr-1">Consumo promedio de</span>
          {[3, 6, 12].map(n => (
            <button key={n} onClick={() => setMeses(n)} className={`px-2 py-1 rounded ${meses === n ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{n} meses</button>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-2.5 py-2 text-left w-6"></th>
              <th className="px-2.5 py-2 text-left">Producto</th>
              <th className="px-2.5 py-2 text-right">Existencia</th>
              <th className="px-2.5 py-2 text-right">Comprometido</th>
              <th className="px-2.5 py-2 text-right">Consumo / mes</th>
              <th className="px-2.5 py-2 text-right">Obras aprobadas</th>
              <th className="px-2.5 py-2 text-right">Cobertura</th>
              <th className="px-2.5 py-2 text-left">En camino</th>
              <th className="px-2.5 py-2 text-left">Se acaba</th>
              <th className="px-2.5 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ p, c, ll, r, dem }) => {
              const enCamino = ll.reduce((s, l) => s + l.cantidad, 0);
              const abiertoEste = abierto === p.odooProductId;
              return (
                <React.Fragment key={p.odooProductId}>
                  <tr onClick={() => setAbierto(abiertoEste ? null : p.odooProductId)} className="border-t border-zinc-800 cursor-pointer hover:bg-zinc-800/40">
                    <td className="px-2.5 py-2 text-zinc-500">{abiertoEste ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                    <td className="px-2.5 py-2 text-white font-medium">{corto(p.producto)}<div className="text-[10px] text-zinc-500">{p.proveedor} · {p.uom}</div></td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-white">{num(p.stock)}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-zinc-400">{p.comprometido ? num(p.comprometido) : '—'}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{num(c)}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{dem.length ? <>{num(r.pendienteObras)} <span className="text-zinc-500">· {dem.length} obra{dem.length > 1 ? 's' : ''}</span></> : '—'}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{r.coberturaSemanas == null ? '—' : `${num(r.coberturaSemanas, 1)} sem`}</td>
                    <td className="px-2.5 py-2 text-zinc-300">{enCamino ? <>{num(enCamino)} <span className="text-zinc-500">· próx. {fecha(r.proxima?.fecha)}</span></> : '—'}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{c > 0 ? fecha(r.agota) : <span className="text-zinc-500">sin consumo</span>}</td>
                    <td className="px-2.5 py-2">
                      {r.quiebre ? (
                        <span className="inline-flex items-center gap-1 text-red-400" title="Se acaba antes de la próxima llegada">
                          <AlertTriangle className="w-3.5 h-3.5" />{r.quiebre.dias != null ? `${r.quiebre.dias} días sin material` : 'sin llegada en camino'}
                        </span>
                      ) : (c > 0 && r.coberturaSemanas != null && r.coberturaSemanas < 8 && !ll.length) ? (
                        <span className="text-amber-400">pedir ya</span>
                      ) : null}
                    </td>
                  </tr>
                  {abiertoEste && (
                    <tr className="bg-zinc-950/50"><td colSpan={10} className="px-4 py-3">
                      <div className="grid lg:grid-cols-[1fr_260px] gap-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Saldo proyectado (26 semanas) · cada semana sale lo mayor entre el consumo promedio ({num(r.semanal, 1)}/sem) y lo que piden las obras aprobadas</div>
                          <Grafico prod={p} r={r} llegadas={ll} />
                        </div>
                        <div className="space-y-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Salidas por mes (Odoo)</div>
                            {historico(p.mensual).map(([m, v]) => (
                              <div key={m} className="flex justify-between"><span className="text-zinc-400">{MES[Number(m.slice(5)) - 1]} {m.slice(2, 4)}</span><span className="tabular-nums">{num(v)}</span></div>
                            ))}
                            {!Object.keys(p.mensual).length && <div className="text-zinc-500">Sin salidas registradas.</div>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Obras aprobadas (falta por sacar)</div>
                            {dem.map(d => (
                              <div key={d.id} className="flex justify-between gap-2" title={`${d.fuente === 'presupuesto' ? 'Presupuesto aprobado' : `Sistema: ${num(d.m2)} m²`} · requiere ${num(d.requerido, 1)}, salió ${num(d.salido, 1)} · ${fecha(d.desde)} → ${fecha(d.hasta)}`}>
                                <span className="text-zinc-400 truncate">{d.referencia} · {d.proyecto}</span><span className="tabular-nums shrink-0">{num(d.pendiente, 1)}</span>
                              </div>
                            ))}
                            {!dem.length && <div className="text-zinc-500">Ninguna obra aprobada lo usa.</div>}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Llegadas</div>
                            {ll.map((l, k) => (
                              <div key={k} className="flex justify-between"><span className="text-zinc-400">{l.oc} · {fecha(l.fecha)}{l.etaReal ? ' (naviera)' : ''}</span><span className="tabular-nums">+{num(l.cantidad)}</span></div>
                            ))}
                            {!ll.length && <div className="text-zinc-500">Nada en camino.</div>}
                          </div>
                          {Object.keys(p.stockUbicaciones).length > 1 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Existencia por almacén</div>
                              {Object.entries(p.stockUbicaciones).map(([u, v]) => <div key={u} className="flex justify-between"><span className="text-zinc-400">{u}</span><span className="tabular-nums">{num(v)}</span></div>)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
            {!filas.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-zinc-500">Sin productos.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-zinc-500">Actualizado desde Odoo {prods[0]?.updatedAt ? new Date(prods[0].updatedAt).toLocaleString('es-DO') : '—'}. Clic en un producto para ver la proyección.</p>
    </div>
  );
}
