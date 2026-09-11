'use client';

// v8.53.1 (Torre de Control · Fase 3B): control del embudo de RECLAMACIONES, desde que se
// crean hasta que el CLIENTE RECIBE el informe de solución. SLA por severidad + sub-alerta
// "resuelta pero sin informe entregado" (el arreglo está hecho pero el cliente no lo tiene).

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, FileText } from 'lucide-react';
import * as db from '../../lib/db';
import { evaluarSlaReclamacion, metricasCicloReclam } from '../../lib/helpers/slaReclamaciones';
import { formatHoras } from '../../lib/helpers/slaLevantamiento';
import { resolverContacto } from '../../lib/helpers/contactoCliente'; // v8.53.4

const SEM = {
  rojo: { punto: 'bg-red-500', txt: 'text-red-400', label: 'Vencida' },
  amarillo: { punto: 'bg-amber-500', txt: 'text-amber-400', label: 'En riesgo' },
  verde: { punto: 'bg-green-500', txt: 'text-green-400', label: 'En SLA' },
  exito: { punto: 'bg-emerald-600', txt: 'text-emerald-400', label: 'Entregada' },
  exitoTarde: { punto: 'bg-amber-600', txt: 'text-amber-400', label: 'Entregada (tarde)' },
  cerrado: { punto: 'bg-zinc-600', txt: 'text-zinc-400', label: 'Cerrada' },
};
const ORDEN = { rojo: 0, amarillo: 1, verde: 2 };

export default function TorreReclamaciones({ data }) {
  const [recs, setRecs] = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soloAtascadas, setSoloAtascadas] = useState(false);

  const [csat, setCsat] = useState([]); // v8.54.1 C3/C4
  const cargar = async () => {
    setLoading(true);
    try {
      const [r, u, c, cal] = await Promise.all([db.listarReclamaciones(), db.listarUbicacionesCliente(null), db.listarContactos(null), db.listarCalificaciones({ entityType: 'reclamacion' })]);
      setRecs(r); setUbicaciones(u || []); setContactos(c || []); setCsat(cal || []);
    } catch (e) { console.warn('TorreReclamaciones:', e?.message); setRecs([]); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  // CSAT del mes (calificaciones respondidas).
  const csatMes = useMemo(() => {
    const iniMes = new Date(); iniMes.setDate(1); iniMes.setHours(0, 0, 0, 0);
    const resp = (csat || []).filter((c) => c.calificacion != null && c.respondidoAt && new Date(c.respondidoAt) >= iniMes);
    const n = resp.length;
    const prom = n ? resp.reduce((a, c) => a + c.calificacion, 0) / n : null;
    const pendientes = (csat || []).filter((c) => c.calificacion == null).length;
    return { n, prom, pendientes };
  }, [csat]);

  const evaluados = useMemo(() => {
    const ahora = new Date();
    return (recs || []).map((r) => ({ r, sla: evaluarSlaReclamacion(r, ahora) }));
  }, [recs]);
  const activas = useMemo(() => evaluados.filter((e) => !e.sla.terminal), [evaluados]);
  const sinInforme = useMemo(() => evaluados.filter((e) => e.sla.resueltaSinInforme), [evaluados]);
  const ciclo = useMemo(() => {
    const iniMes = new Date(); iniMes.setDate(1); iniMes.setHours(0, 0, 0, 0);
    return metricasCicloReclam(evaluados, iniMes.toISOString());
  }, [evaluados]);

  const resumen = useMemo(() => {
    const r = { rojo: 0, amarillo: 0, verde: 0, total: activas.length };
    activas.forEach((e) => { r[e.sla.semaforo] = (r[e.sla.semaforo] || 0) + 1; });
    return r;
  }, [activas]);

  // v8.53.3: el nombre vive en clientes (por cliente_id) — cliente_nombre casi siempre viene vacío.
  // Las reclamaciones van amarradas a la UBICACIÓN del cliente (cliente_ubicaciones).
  const clienteDe = (id) => (data?.clientes || []).find((c) => c.id === id);
  const proyById = (id) => (data?.proyectos || []).find((p) => p.id === id);
  const ubicDe = (id) => ubicaciones.find((u) => u.id === id);
  const nombre = (r) => clienteDe(r.clienteId)?.nombre || proyById(r.proyectoId)?.cliente || r.clienteNombre || r.codigo || 'Sin cliente';
  const ubicNombre = (r) => ubicDe(r.ubicacionId)?.nombre || '';
  // v8.53.4: contacto amarrado a los contactos del cliente (empresa) o el cliente mismo (persona).
  const contactoDe = (r) => resolverContacto({
    cliente: clienteDe(r.clienteId),
    contacto: contactos.find((c) => c.id === r.contactoId) || null,
    ubicacion: ubicDe(r.ubicacionId),
  });
  const sinContacto = useMemo(() => activas.filter((e) => !contactoDe(e.r).localizable), [activas, ubicaciones, contactos, data]);
  const visibles = useMemo(() => {
    const base = soloAtascadas ? activas.filter((e) => e.sla.atascado) : activas;
    return [...base].sort((a, b) => (ORDEN[a.sla.semaforo] ?? 9) - (ORDEN[b.sla.semaforo] ?? 9) || b.sla.horasTotales - a.sla.horasTotales);
  }, [activas, soloAtascadas]);

  const Kpi = ({ n, label, color, onClick, active }) => (
    <button onClick={onClick} className={`bg-zinc-950 border rounded-card px-3 py-2 text-left ${active ? 'border-red-600' : 'border-zinc-800'} ${onClick ? 'hover:border-zinc-600' : ''}`}>
      <div className={`text-2xl font-black ${color}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-zinc-500">Reclamaciones: de creada a que el cliente recibe el informe · SLA por severidad (alta 48h · media 5d · baja 10d)</div>
        <button onClick={cargar} className="text-zinc-500 hover:text-white"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        <Kpi n={resumen.total} label="Activas" color="text-white" onClick={() => setSoloAtascadas(false)} active={!soloAtascadas} />
        <Kpi n={resumen.rojo} label="Vencidas" color="text-red-400" onClick={() => setSoloAtascadas(true)} active={soloAtascadas} />
        <Kpi n={resumen.amarillo} label="En riesgo" color="text-amber-400" onClick={() => setSoloAtascadas(true)} active={soloAtascadas} />
        <Kpi n={resumen.verde} label="En SLA" color="text-green-400" />
        <Kpi n={sinInforme.length} label="Falta informe" color="text-emerald-400" />
      </div>

      {/* Sub-alerta: resueltas pero sin informe entregado al cliente */}
      {sinInforme.length > 0 && (
        <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-card px-3 py-2.5">
          <div className="text-emerald-300 font-bold text-sm flex items-center gap-1.5"><FileText className="w-4 h-4" /> {sinInforme.length} resuelta{sinInforme.length !== 1 ? 's' : ''} sin informe entregado al cliente</div>
          <div className="text-[11px] text-emerald-500/80 mt-0.5">El arreglo está hecho pero el cliente aún no ha recibido el informe de solución. El ciclo no cierra hasta entregarlo.</div>
          <div className="text-[11px] text-emerald-200 mt-1">{sinInforme.map((e) => nombre(e.r)).join(' · ')}</div>
        </div>
      )}

      {/* Sin contacto localizable (WhatsApp o correo) — no se puede dar seguimiento al cliente */}
      {sinContacto.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-700/60 rounded-card px-3 py-2.5">
          <div className="text-amber-300 font-bold text-sm">⚠ {sinContacto.length} sin contacto localizable del cliente</div>
          <div className="text-[11px] text-amber-500/80 mt-0.5">No tienen ni WhatsApp ni correo para dar seguimiento. Asígnale a la ubicación/cliente un contacto con teléfono (WS) o correo.</div>
          <div className="text-[11px] text-amber-200 mt-1">{sinContacto.map((e) => nombre(e.r)).join(' · ')}</div>
        </div>
      )}

      {ciclo.n > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="text-zinc-500 uppercase tracking-wider font-bold text-[10px]">Ciclo del mes</span>
          <span>Mediana <b className="text-white">{formatHoras(ciclo.mediana)}</b></span>
          <span className="text-zinc-500">Promedio <b className="text-zinc-300">{formatHoras(ciclo.prom)}</b></span>
          <span>Dentro de SLA <b className={ciclo.pct >= 80 ? 'text-green-400' : ciclo.pct >= 50 ? 'text-amber-400' : 'text-red-400'}>{ciclo.pct}%</b></span>
          <span className="text-zinc-500">{ciclo.n} entregada{ciclo.n !== 1 ? 's' : ''}</span>
        </div>
      )}

      {(csatMes.n > 0 || csatMes.pendientes > 0) && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="text-zinc-500 uppercase tracking-wider font-bold text-[10px]">Satisfacción (CSAT)</span>
          {csatMes.n > 0
            ? <span>⭐ <b className={csatMes.prom >= 4 ? 'text-green-400' : csatMes.prom >= 3 ? 'text-amber-400' : 'text-red-400'}>{csatMes.prom.toFixed(1)}</b> <span className="text-zinc-500">/5 · {csatMes.n} este mes</span></span>
            : <span className="text-zinc-500">Sin respuestas este mes</span>}
          {csatMes.pendientes > 0 && <span className="text-zinc-500">{csatMes.pendientes} esperando respuesta</span>}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : visibles.length === 0 ? (
        <div className="py-12 text-center text-zinc-600 text-sm">{soloAtascadas ? 'Nada atascado 🎉' : 'No hay reclamaciones activas.'}</div>
      ) : (
        <div className="space-y-1.5">
          <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            <div className="col-span-5">Cliente</div>
            <div className="col-span-2">Severidad</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-3 text-right">Abierta hace / SLA</div>
          </div>
          {visibles.map(({ r, sla }) => {
            const s = SEM[sla.semaforo] || SEM.verde;
            return (
              <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2.5 grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-2 md:items-center">
                <div className="md:col-span-5 flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.punto}`} title={s.label} />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{nombre(r)}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{[ubicNombre(r), r.codigo, r.referenciaCotizacion].filter(Boolean).join(' · ')}{sla.resueltaSinInforme ? ' · ⚠ falta informe' : ''}</div>
                    {(() => { const ct = contactoDe(r); return ct.localizable
                      ? <div className="text-[10px] text-zinc-400 truncate">{[ct.nombre, ct.tel && `📱 ${ct.tel}`, ct.email && `✉ ${ct.email}`].filter(Boolean).join(' · ')}{ct.requiereAsignar ? ' · ⚠ asignar contacto' : ''}</div>
                      : <div className="text-[10px] text-amber-400 font-bold truncate">⚠ Sin contacto localizable (falta WhatsApp o correo)</div>; })()}
                  </div>
                </div>
                <div className="md:col-span-2 text-xs uppercase"><span className="md:hidden text-zinc-500">Sev: </span>{sla.severidad}</div>
                <div className="md:col-span-2 text-xs"><span className={s.txt}>{s.label}</span></div>
                <div className="md:col-span-3 md:text-right text-xs">
                  <span className={`font-bold ${s.txt}`}>{formatHoras(sla.horasTotales)}</span>
                  <span className="text-zinc-600"> / {Math.round(sla.slaTotal / 24)}d</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[10px] text-zinc-600 pt-1">🟢 en SLA · 🟡 pasó el SLA de su severidad · 🔴 el doble o más · 🟩 falta entregar el informe. SLA por severidad: alta 48h · media 5d · baja 10d (propuesto).</div>
    </div>
  );
}
