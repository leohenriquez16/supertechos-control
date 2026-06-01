'use client';

// v8.19.79: Hub maestro de UBICACIONES — unifica todas las localidades del cliente
// (cliente_ubicaciones), tengan lo que tengan: levantamientos, proyectos, garantías,
// mantenimientos o reclamaciones. Lista + Mapa + filtros + ficha 360 por localidad.

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, MapPin, Search, Briefcase, ShieldCheck, AlertTriangle, ClipboardList, Wrench } from 'lucide-react';
import * as db from '../../lib/db';
import { listarProyectosSurveys, SERVICE_LINES } from '../../lib/surveys';
import { formatNum } from '../../lib/helpers/formato';
import MapaLeaflet from '../common/MapaLeaflet';

const fmt = (s) => { if (!s) return '—'; try { return new Date((s.length <= 10 ? s + 'T12:00:00' : s)).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
const SEV = { baja: 'text-zinc-400', media: 'text-amber-400', alta: 'text-red-400' };
const EST_GAR = { vigente: '#22c55e', por_vencer: '#f59e0b', suspendida: '#fb923c', vencida: '#ef4444', anulada: '#71717a' };

export default function VistaUbicaciones({ data, onVolver, onVerProyecto }) {
  const [loading, setLoading] = useState(true);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [garantias, setGarantias] = useState([]);
  const [mantenimientos, setMantenimientos] = useState([]);
  const [reclamaciones, setReclamaciones] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [vista, setVista] = useState('lista'); // lista | mapa
  const [busqueda, setBusqueda] = useState('');
  const [fActividad, setFActividad] = useState(''); // '' | proyecto | garantia | reclamacion | levantamiento
  const [sel, setSel] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [u, g, m, r, sp] = await Promise.all([
          db.listarUbicacionesCliente(null), db.listarGarantias(), db.listarMantenimientos({}), db.listarReclamaciones(), listarProyectosSurveys(),
        ]);
        if (cancel) return;
        setUbicaciones(u); setGarantias(g); setMantenimientos(m); setReclamaciones(r); setSurveys(sp);
      } catch (e) { console.warn('Ubicaciones:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const clienteDe = (id) => (data.clientes || []).find(c => c.id === id);
  const proyectos = data.proyectos || [];

  // Para cada ubicación, reúne lo que ocurrió en ella.
  const items = useMemo(() => {
    const reportesPorProy = {};
    for (const rep of (data.reportes || [])) { const k = rep.proyectoId; if (rep.fecha && (!reportesPorProy[k] || rep.fecha > reportesPorProy[k])) reportesPorProy[k] = rep.fecha; }
    return ubicaciones.map(u => {
      const cli = clienteDe(u.clienteId);
      const cliNombre = cli?.nombre || '';
      const proys = proyectos.filter(p => !p.archivado && p.ubicacionId === u.id);
      const gars = garantias.filter(g => g.ubicacionId === u.id);
      const recs = reclamaciones.filter(r => r.ubicacionId === u.id);
      const mants = mantenimientos.filter(m => gars.some(g => g.id === m.garantiaId));
      // levantamientos: no hay link directo, se asocian por cliente (best-effort).
      const cn = norm(cliNombre); const primera = cn.split(' ')[0] || '';
      const levs = primera.length >= 3 ? surveys.filter(s => norm(s.client_name).includes(primera)) : [];
      // Coordenadas: propias de la ubicación; si no tiene, toma automáticamente las
      // del primer proyecto de esa ubicación que tenga GPS.
      const proyGps = proys.find(p => p.ubicacionLat != null && p.ubicacionLng != null);
      const coords = (u.latitud != null && u.longitud != null)
        ? { lat: Number(u.latitud), lng: Number(u.longitud), fuente: 'ubicacion' }
        : proyGps ? { lat: Number(proyGps.ubicacionLat), lng: Number(proyGps.ubicacionLng), fuente: 'proyecto' }
          : null;
      return { u, cliNombre, proys, gars, recs, mants, levs, reportesPorProy, coords };
    });
  }, [ubicaciones, garantias, mantenimientos, reclamaciones, surveys, proyectos, data.clientes, data.reportes]);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return items.filter(it => {
      if (q && !((it.u.nombre || '').toLowerCase().includes(q) || it.cliNombre.toLowerCase().includes(q) || (it.u.direccion || '').toLowerCase().includes(q) || (it.u.ciudad || '').toLowerCase().includes(q))) return false;
      if (fActividad === 'proyecto' && it.proys.length === 0) return false;
      if (fActividad === 'garantia' && it.gars.length === 0) return false;
      if (fActividad === 'reclamacion' && it.recs.length === 0) return false;
      if (fActividad === 'levantamiento' && it.levs.length === 0) return false;
      return true;
    });
  }, [items, busqueda, fActividad]);

  // ---------- FICHA 360 ----------
  if (sel) {
    const it = items.find(x => x.u.id === sel.u.id) || sel;
    const { u, proys, gars, recs, mants, levs, reportesPorProy } = it;
    const mantsProx = mants.filter(m => ['pendiente', 'agendado', 'vencido'].includes(m.estado)).sort((a, b) => (a.fechaProgramada || '').localeCompare(b.fechaProgramada || ''));
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <button onClick={() => setSel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver a Ubicaciones</button>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{it.cliNombre}</div>
          <h1 className="text-2xl font-black flex items-center gap-2"><MapPin className="w-6 h-6 text-red-500" /> {u.nombre}</h1>
          <div className="text-xs text-zinc-500 mt-0.5">{[u.direccion, u.sector, u.ciudad, u.provincia].filter(Boolean).join(', ') || 'Sin dirección'}</div>
        </div>
        {it.coords && <MapaLeaflet center={[it.coords.lat, it.coords.lng]} zoom={16} height={180} markers={[{ lat: it.coords.lat, lng: it.coords.lng, color: 'red' }]} className="rounded-card overflow-hidden" />}
        {it.coords?.fuente === 'proyecto' && <div className="text-[10px] text-zinc-500">📍 Ubicación tomada automáticamente del proyecto (la localidad no tiene GPS propio).</div>}

        <Seccion icon={ClipboardList} color="#3b82f6" titulo="Levantamientos (del cliente)" n={levs.length}>
          {levs.map(s => (
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-2.5 flex items-center justify-between gap-2" style={{ borderLeftColor: SERVICE_LINES[s.service_line]?.color || '#3b82f6', borderLeftWidth: 4 }}>
              <div className="min-w-0"><div className="text-sm font-bold truncate">{s.client_name}</div><div className="text-[10px] text-zinc-500 truncate">{SERVICE_LINES[s.service_line]?.label || ''}{s.odoo_stage ? ` · ${s.odoo_stage}` : ''}</div></div>
            </div>
          ))}
        </Seccion>

        <Seccion icon={Briefcase} color="#ef4444" titulo="Proyectos" n={proys.length}>
          {proys.map(p => {
            const m2 = (p.areas || []).reduce((a, ar) => a + (Number(ar.m2) || 0), 0);
            return (
              <button key={p.id} onClick={() => onVerProyecto?.(p)} className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card p-2.5 hover:border-red-600 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{p.referenciaProyecto || p.nombre || p.cliente}{p.referenciaOdoo ? <span className="text-[10px] font-mono text-zinc-500 ml-2">{p.referenciaOdoo}</span> : ''}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{(p.areas || []).length} área(s) · {formatNum(m2)} m²{reportesPorProy[p.id] ? ` · última intervención ${fmt(reportesPorProy[p.id])}` : ''}</div>
                </div>
                <span className="text-[10px] text-red-400 shrink-0">Ver →</span>
              </button>
            );
          })}
        </Seccion>

        <Seccion icon={ShieldCheck} color="#22c55e" titulo="Garantías" n={gars.length}>
          {gars.map(g => (
            <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-2.5" style={{ borderLeftColor: EST_GAR[g.estado] || '#71717a', borderLeftWidth: 4 }}>
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold truncate">{g.sistemaNombre || 'Sistema —'}</span><span className="text-[9px] uppercase font-black" style={{ color: EST_GAR[g.estado] }}>{g.estado}</span></div>
              <div className="text-[10px] text-zinc-500">{g.referenciaCotizacion ? `${g.referenciaCotizacion} · ` : ''}vence {fmt(g.fechaVencimiento)}</div>
            </div>
          ))}
        </Seccion>

        <Seccion icon={Wrench} color="#f59e0b" titulo="Próximos mantenimientos" n={mantsProx.length}>
          {mantsProx.map(m => (
            <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-2.5 flex items-center justify-between gap-2">
              <span className="text-sm">{fmt(m.fechaProgramada)}{m.obligatorio ? ' · obligatorio' : ''}</span>
              <span className={`text-[9px] uppercase font-black ${m.estado === 'vencido' ? 'text-red-400' : 'text-amber-400'}`}>{m.estado}</span>
            </div>
          ))}
        </Seccion>

        <Seccion icon={AlertTriangle} color="#fb923c" titulo="Reclamaciones" n={recs.length}>
          {recs.map(r => (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-2.5">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold truncate">{r.descripcion || 'Reclamación'}</span><span className={`text-[9px] uppercase font-black ${SEV[r.severidad] || ''}`}>● {r.severidad}</span></div>
              <div className="text-[10px] text-zinc-500">{r.odooStage || r.estado} · abierta {fmt(r.fechaApertura)}{r.fechaResuelta ? ` · resuelta ${fmt(r.fechaResuelta)}` : ''}</div>
              {r.trabajoRealizado && <div className="text-[11px] text-zinc-400 mt-1">Se hizo: {r.trabajoRealizado}</div>}
            </div>
          ))}
        </Seccion>
      </div>
    );
  }

  // ---------- LISTA / MAPA ----------
  const Chip = ({ n, label, color }) => n > 0 ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: color + '22', color, border: `1px solid ${color}55` }}>{label} {n}</span> : null;
  const markers = filtrados.filter(it => it.coords).map(it => ({ lat: it.coords.lat, lng: it.coords.lng, color: it.gars.length ? 'green' : it.recs.length ? 'orange' : 'red', label: it.u.nombre, popup: `<b>${it.cliNombre}</b><br/>${it.u.nombre}<br/>${it.proys.length} proy · ${it.gars.length} gar · ${it.recs.length} recl`, onClick: () => setSel(it) }));

  return (
    <div className="space-y-4">
      {onVolver && <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>}
      <div>
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2"><MapPin className="w-7 h-7 text-red-500" /> Ubicaciones</h1>
        <div className="text-xs text-zinc-500 mt-1">Todas las localidades donde hemos trabajado: levantamientos, proyectos, garantías, mantenimientos y reclamaciones.</div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1 w-fit">
            {[['lista', 'Lista'], ['mapa', 'Mapa']].map(([k, l]) => <button key={k} onClick={() => setVista(k)} className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-card ${vista === k ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>{l}</button>)}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar localidad, cliente, dirección…" className="bg-zinc-950 border border-zinc-800 rounded-card pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-red-600 w-56 sm:w-72" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {[['', 'Todas'], ['levantamiento', 'Con levantamiento'], ['proyecto', 'Con proyecto'], ['garantia', 'Con garantía'], ['reclamacion', 'Con reclamación']].map(([k, l]) => (
            <button key={k} onClick={() => setFActividad(k)} className={`px-3 py-1 rounded-card border text-[10px] font-bold uppercase ${fActividad === k ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{l}</button>
          ))}
          <span className="text-[10px] text-zinc-600 ml-auto">{filtrados.length} de {items.length}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : vista === 'mapa' ? (
        markers.length === 0 ? <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500 text-sm">Ninguna localidad (de las filtradas) tiene GPS. Agrega coordenadas a la ubicación del cliente.</div>
          : <MapaLeaflet center={[markers[0].lat, markers[0].lng]} zoom={11} height={460} markers={markers} scrollWheelZoom className="rounded-card overflow-hidden" />
      ) : (
        <div className="space-y-2">
          {filtrados.length === 0 && <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500 text-sm">Sin resultados.</div>}
          {filtrados.map(it => (
            <button key={it.u.id} onClick={() => setSel(it)} className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card p-3 hover:border-red-600 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold flex items-center gap-2 truncate"><MapPin className="w-4 h-4 text-red-500 shrink-0" /> {it.u.nombre}</div>
                <div className="text-[11px] text-zinc-500 truncate">{it.cliNombre}{it.u.ciudad ? ` · ${it.u.ciudad}` : ''}{it.coords ? '' : ' · sin GPS'}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Chip n={it.levs.length} label="Lev" color="#3b82f6" />
                  <Chip n={it.proys.length} label="Proy" color="#ef4444" />
                  <Chip n={it.gars.length} label="Gar" color="#22c55e" />
                  <Chip n={it.mants.length} label="Mant" color="#f59e0b" />
                  <Chip n={it.recs.length} label="Recl" color="#fb923c" />
                </div>
              </div>
              <span className="text-[10px] text-zinc-600 shrink-0">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Seccion({ icon: Icon, color, titulo, n, children }) {
  if (n === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest font-black mb-2 flex items-center gap-1.5" style={{ color }}>
        <Icon className="w-3.5 h-3.5" /> {titulo} <span className="text-zinc-600">({n})</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
