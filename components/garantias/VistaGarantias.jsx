'use client';

// v8.19.55: Módulo de Garantías + Mantenimientos.
// Vista de garantías vigentes (por cliente / cotización) y agenda de
// mantenimientos próximos, con recordatorio al cliente por WhatsApp/Email.

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, ShieldCheck, MapPin, Search, Calendar, Check, MessageCircle, Mail, Wrench } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatNum } from '../../lib/helpers/formato';

const fmtFecha = (s) => {
  if (!s) return '—';
  try { return new Date(s + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
};
const diasHasta = (s) => {
  if (!s) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(s + 'T12:00:00') - hoy) / 86400000);
};
const ESTADO_GAR = {
  vigente:   { label: 'Vigente',    cls: 'bg-green-900/40 text-green-300 border-green-700/60' },
  por_vencer:{ label: 'Por vencer', cls: 'bg-amber-900/40 text-amber-300 border-amber-700/60' },
  vencida:   { label: 'Vencida',    cls: 'bg-red-900/40 text-red-300 border-red-800/60' },
  anulada:   { label: 'Anulada',    cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
};

export default function VistaGarantias({ data, usuario, onVolver, onVerProyecto }) {
  const [tab, setTab] = useState('garantias'); // garantias | mantenimientos
  const [loading, setLoading] = useState(true);
  const [garantias, setGarantias] = useState([]);
  const [mantenimientos, setMantenimientos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [g, m, u] = await Promise.all([
          db.listarGarantias(),
          db.listarMantenimientos({}),
          db.listarUbicacionesCliente(null),
        ]);
        if (!cancel) { setGarantias(g); setMantenimientos(m); setUbicaciones(u); }
      } catch (e) { console.warn('Garantías:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [reload]);

  const nombreCliente = (id) => (data.clientes || []).find(c => c.id === id)?.nombre || '—';
  const clienteDe = (id) => (data.clientes || []).find(c => c.id === id);
  const ubic = (id) => ubicaciones.find(u => u.id === id);

  const garantiasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    let arr = garantias.map(g => ({ ...g, estado: g.estadoCalc || g.estado }));
    if (q) arr = arr.filter(g =>
      (nombreCliente(g.clienteId) || '').toLowerCase().includes(q) ||
      (g.referenciaCotizacion || '').toLowerCase().includes(q) ||
      (g.sistemaNombre || '').toLowerCase().includes(q) ||
      (clienteDe(g.clienteId)?.rnc || '').toLowerCase().includes(q)
    );
    return arr;
  }, [garantias, busqueda, data.clientes]);

  // Mantenimientos próximos: pendientes/agendados, ordenados por fecha.
  const proximos = useMemo(() =>
    mantenimientos
      .filter(m => m.estado === 'pendiente' || m.estado === 'agendado' || m.estado === 'vencido')
      .sort((a, b) => (a.fechaProgramada || '').localeCompare(b.fechaProgramada || '')),
    [mantenimientos]);

  const garantiaDe = (id) => garantias.find(g => g.id === id);

  const recordarWhatsApp = (m) => {
    const g = garantiaDe(m.garantiaId);
    const cli = clienteDe(m.clienteId);
    const u = ubic(m.ubicacionId);
    const tel = (u?.contactoTelefono || cli?.telefonoPrincipal || '').replace(/\D/g, '').replace(/^(?!1)(8[024]9)/, '1$1');
    const msg = `Hola${cli?.nombre ? ' ' + cli.nombre : ''}, le saluda Super Techos. Su sistema impermeabilizante${g?.referenciaCotizacion ? ` (cot. ${g.referenciaCotizacion})` : ''}${u?.nombre ? ` en ${u.nombre}` : ''} tiene programado un mantenimiento de inspección para el ${fmtFecha(m.fechaProgramada)}. ¿Coordinamos la visita?`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const marcarRealizado = async (m) => {
    try { await db.actualizarMantenimiento(m.id, { estado: 'realizado' }); setReload(r => r + 1); }
    catch (e) { alert('Error: ' + (e.message || e)); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-red-500" /> Garantías</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1 w-fit">
        <button onClick={() => setTab('garantias')} className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-card ${tab === 'garantias' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Vigentes ({garantias.length})</button>
        <button onClick={() => setTab('mantenimientos')} className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-card ${tab === 'mantenimientos' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Próximos mantenimientos ({proximos.length})</button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : tab === 'garantias' ? (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por cliente, # cotización, RNC o sistema…" className="w-full bg-zinc-950 border border-zinc-800 rounded-card pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-red-600" />
          </div>
          {garantiasFiltradas.length === 0 ? (
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <div className="font-bold mb-1">Sin garantías</div>
              <div className="text-xs">Se crean al cerrar un proyecto (Recibido Conforme) o importando de Odoo.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {garantiasFiltradas.map(g => {
                const est = ESTADO_GAR[g.estado] || ESTADO_GAR.vigente;
                const d = diasHasta(g.fechaVencimiento);
                const u = ubic(g.ubicacionId);
                return (
                  <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">{nombreCliente(g.clienteId)}</span>
                        {g.referenciaCotizacion && <span className="text-[10px] font-mono text-zinc-500">{g.referenciaCotizacion}</span>}
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border rounded-full ${est.cls}`}>{est.label}</span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {g.sistemaNombre || 'Sistema —'}{u?.nombre ? ` · ${u.nombre}` : ''}{g.m2 ? ` · ${formatNum(g.m2)} m²` : ''}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        Inicio {fmtFecha(g.fechaInicio)} · Vence {fmtFecha(g.fechaVencimiento)}
                        {d != null && d >= 0 && <span className={d <= 60 ? 'text-amber-400' : 'text-zinc-500'}> · faltan {d} días</span>}
                        {d != null && d < 0 && <span className="text-red-400"> · venció hace {Math.abs(d)} días</span>}
                      </div>
                    </div>
                    {g.proyectoId && onVerProyecto && (
                      <button onClick={() => { const p = (data.proyectos || []).find(x => x.id === g.proyectoId); if (p) onVerProyecto(p); }} className="text-[10px] text-red-400 hover:underline shrink-0">Ver proyecto →</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        // Mantenimientos próximos
        proximos.length === 0 ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500">
            <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <div className="font-bold mb-1">Sin mantenimientos pendientes</div>
            <div className="text-xs">Se generan automáticamente según la frecuencia del sistema de cada garantía.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {proximos.map(m => {
              const g = garantiaDe(m.garantiaId);
              const d = diasHasta(m.fechaProgramada);
              const vencido = m.estado === 'vencido' || (d != null && d < 0);
              const u = ubic(m.ubicacionId);
              return (
                <div key={m.id} className={`bg-zinc-900 border rounded-card p-3 flex items-center justify-between gap-3 ${vencido ? 'border-red-800/60' : d != null && d <= 30 ? 'border-amber-700/50' : 'border-zinc-800'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-red-500" />
                      {fmtFecha(m.fechaProgramada)}
                      {vencido ? <span className="text-[9px] text-red-400 uppercase font-black">vencido</span> : d != null && d <= 30 && <span className="text-[9px] text-amber-400 uppercase font-black">en {d}d</span>}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5 truncate">
                      {nombreCliente(m.clienteId)}{u?.nombre ? ` · ${u.nombre}` : ''}{g?.sistemaNombre ? ` · ${g.sistemaNombre}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => recordarWhatsApp(m)} className="bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded-card flex items-center gap-1" title="Recordar al cliente por WhatsApp"><MessageCircle className="w-3 h-3" /> WS</button>
                    <button onClick={() => marcarRealizado(m)} className="bg-zinc-800 hover:bg-green-700 text-zinc-300 hover:text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded-card flex items-center gap-1" title="Marcar realizado"><Check className="w-3 h-3" /> Hecho</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
