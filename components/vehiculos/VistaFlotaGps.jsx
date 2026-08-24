'use client';

// v8.42.1: Pestaña "Flota GPS" en el módulo Vehículos. Muestra el resumen de
// recorridos por vehículo (km, tiempo en obra, motor prendido detenido) cruzado
// con las obras del ERP. Lo llena el agente diario desde los reportes de Pressto.

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Truck, Satellite, MapPin } from 'lucide-react';
import * as db from '../../lib/db';

const CAT = [
  { k: 'obraS', l: 'Obra', c: '#22c55e' },
  { k: 'baseS', l: 'Base', c: '#14b8a6' },
  { k: 'casaS', l: 'Casa', c: '#60a5fa' },
  { k: 'otrosS', l: 'Otros', c: '#eab308' },
];
const hhmm = (s) => { const H = Math.floor(s / 3600), M = Math.round((s % 3600) / 60); return H > 0 ? `${H}h${M ? ' ' + M + 'm' : ''}` : `${M}m`; };
const nfmt = (n) => Number(n || 0).toLocaleString('es-DO');
const sevRal = (p) => p >= 30 ? 'crit' : p >= 13 ? 'warn' : 'good';
const chipCls = { crit: 'text-red-300 bg-red-950/50', warn: 'text-amber-300 bg-amber-950/50', good: 'text-green-300 bg-green-950/40' };
const flagBorder = { crit: 'border-l-red-500', warn: 'border-l-amber-500', good: 'border-l-green-500' };

export default function VistaFlotaGps({ usuario, data }) {
  const [loading, setLoading] = useState(true);
  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [resumen, setResumen] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const ps = await db.periodosGpsDisponibles();
      if (cancel) return;
      setPeriodos(ps);
      setPeriodo((p) => p || ps[0] || null);
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!periodo) { setLoading(false); return; }
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [r, vs] = await Promise.all([db.listarGpsResumen({ periodo }), db.listarVehiculos({})]);
        if (!cancel) { setResumen(r); setVehiculos(vs); }
      } catch (e) { console.warn('flota gps:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [periodo]);

  const filas = useMemo(() => {
    const vmap = Object.fromEntries(vehiculos.map((v) => [v.id, v]));
    const pmap = Object.fromEntries((data?.personal || []).map((p) => [p.id, p.nombre]));
    return resumen.map((r) => {
      const v = vmap[r.vehiculoId] || {};
      const nombre = [v.marca, v.modelo].filter(Boolean).join(' ') || r.deviceName || 'Vehículo';
      const chofer = v.responsableId ? (pmap[v.responsableId] || 'Chofer') : 'Oficina';
      return { ...r, nombre, placa: v.placa, chofer, esOficina: !v.responsableId };
    }).sort((a, b) => b.km - a.km);
  }, [resumen, vehiculos, data]);

  const tot = useMemo(() => filas.reduce((a, f) => ({ km: a.km + f.km, mot: a.mot + f.motorS, ral: a.ral + f.ralentiS }), { km: 0, mot: 0, ral: 0 }), [filas]);

  const flags = useMemo(() => {
    const out = [];
    const ral = [...filas].sort((a, b) => b.ralentiPct - a.ralentiPct)[0];
    if (ral && ral.ralentiPct >= 30) out.push({ s: 'crit', t: `🔴 ${ral.nombre} — ${ral.chofer}`, d: `${hhmm(ral.ralentiS)} con el motor prendido detenido = ${ral.ralentiPct}% del tiempo encendido, parado sin moverse. Combustible quemado. Revisar.` });
    filas.filter((f) => f.km < 1000 && !f.esOficina).forEach((f) => out.push({ s: 'warn', t: `🟡 ${f.nombre} — ${f.chofer}`, d: `Solo ${nfmt(f.km)} km y ${hhmm(f.obraS)} en obra en el período. Sub-utilizado.` }));
    const limpio = [...filas].filter((f) => f.motorS > 3600).sort((a, b) => a.ralentiPct - b.ralentiPct)[0];
    if (limpio) out.push({ s: 'good', t: `🟢 ${limpio.nombre} — ${limpio.chofer}`, d: `Casi nunca deja el motor prendido detenido (${hhmm(limpio.ralentiS)}). El uso más limpio de la flota.` });
    return out;
  }, [filas]);

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  if (!periodo || filas.length === 0) return (
    <div className="py-14 text-center text-zinc-500">
      <Satellite className="w-10 h-10 mx-auto mb-2 opacity-50" />
      <div className="text-sm">Aún no hay datos de GPS cargados.</div>
      <div className="text-[11px] mt-1">Cuando lleguen los reportes de Pressto al buzón, aparecerán aquí.</div>
    </div>
  );

  const kpis = [
    [String(filas.length), 'Vehículos'],
    [nfmt(tot.km), 'Kilómetros'],
    [hhmm(tot.mot), 'Motor encendido'],
    [hhmm(tot.ral), 'Motor prendido detenido'],
    [(tot.mot ? Math.round(tot.ral / tot.mot * 100) : 0) + '%', 'prendido detenido'],
  ];

  return (
    <div className="space-y-4">
      {/* selector de período */}
      <div className="flex flex-wrap items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-2.5">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Período</span>
        {periodos.map((p) => (
          <button key={p} onClick={() => setPeriodo(p)}
            className={`text-xs font-bold px-3 py-1.5 rounded-card border ${p === periodo ? 'border-red-600 text-white bg-red-950/40' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}>
            {p}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-zinc-600">{filas.length} vehículos · GPS Pressto cruzado con obras del ERP</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {kpis.map((k, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
            <div className="text-2xl font-black tabular-nums">{k[0]}</div>
            <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mt-1">{k[1]}</div>
          </div>
        ))}
      </div>

      {/* banderas */}
      {flags.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Atención</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {flags.map((f, i) => (
              <div key={i} className={`bg-zinc-900 border border-zinc-800 border-l-2 ${flagBorder[f.s]} rounded-card p-3`}>
                <div className="text-[13px] font-bold">{f.t}</div>
                <div className="text-xs text-zinc-400 mt-1">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* tarjetas por vehículo */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Por vehículo · ordenado por kilómetros</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filas.map((f) => {
            const totS = f.casaS + f.baseS + f.obraS + f.otrosS || 1;
            const sev = sevRal(f.ralentiPct);
            const obras = (f.obras || []).filter((o) => o.s > 60).slice(0, 3);
            return (
              <div key={f.id} className="bg-zinc-900 border border-zinc-800 hover:border-red-600 transition-colors rounded-card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-black leading-tight">{f.nombre}
                      {f.placa && <span className="ml-2 font-mono text-[11px] font-semibold bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-400 align-middle">{f.placa}</span>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">🧑‍✈️ {f.chofer}</div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${chipCls[sev]}`} title="Motor prendido detenido (ralentí)">Detenido {f.ralentiPct}%</span>
                </div>
                <div className="flex flex-wrap gap-4">
                  {[[nfmt(f.km), 'km'], [f.viajes, 'viajes'], [f.velMax, 'vel máx'], [hhmm(f.obraS), 'en obra']].map((s, i) => (
                    <div key={i}><div className="text-xl font-black tabular-nums leading-none">{s[0]}</div><div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold mt-1">{s[1]}</div></div>
                  ))}
                </div>
                <div>
                  <div className="h-3 rounded-md overflow-hidden flex bg-zinc-950 border border-zinc-800">
                    {CAT.map((c) => <span key={c.k} style={{ width: `${(f[c.k] / totS * 100).toFixed(2)}%`, background: c.c }} />)}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-zinc-400">
                    {CAT.filter((c) => f[c.k] > 0).map((c) => (
                      <span key={c.k}><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: c.c }} />{c.l} <b className="text-zinc-200 tabular-nums">{hhmm(f[c.k])}</b></span>
                    ))}
                  </div>
                </div>
                <div className="border-t border-dashed border-zinc-800 pt-2 text-xs">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold mb-1">Top obras visitadas</div>
                  {obras.length ? obras.map((o, i) => (
                    <div key={i} className="flex justify-between gap-2"><span className="truncate">{o.nombre}</span><span className="text-zinc-500 tabular-nums shrink-0">{hhmm(o.s)}</span></div>
                  )) : <div className="text-zinc-600">Sin obras identificadas con GPS</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 leading-relaxed">
        <b>«Motor prendido detenido»</b> (ralentí) = el motor encendido sin que el vehículo se mueva; gasta combustible parado. «Otros» incluye paradas cerca de obras que aún no tienen ubicación registrada en el ERP. Datos GPS de Pressto cruzados con las obras del ERP, la oficina y el parqueo de cada chofer.
      </div>
    </div>
  );
}
