'use client';

// v8.19.58: Módulo de Garantías — múltiples vistas:
//   Vigentes · Por cliente · Por ubicación (+ detalle) · Mapa · Próximos mantenimientos.

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, ShieldCheck, MapPin, Search, Calendar, Check, MessageCircle, Wrench, ChevronDown, Building2, Users } from 'lucide-react';
import * as db from '../../lib/db';
import { formatNum } from '../../lib/helpers/formato';
import MapaLeaflet from '../common/MapaLeaflet';

const fmtFecha = (s) => { if (!s) return '—'; try { return new Date(s + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
const diasHasta = (s) => { if (!s) return null; const h = new Date(); h.setHours(0, 0, 0, 0); return Math.round((new Date(s + 'T12:00:00') - h) / 86400000); };
const ESTADO_GAR = {
  vigente:    { label: 'Vigente',    cls: 'bg-green-900/40 text-green-300 border-green-700/60', color: 'green' },
  por_vencer: { label: 'Por vencer', cls: 'bg-amber-900/40 text-amber-300 border-amber-700/60', color: 'orange' },
  vencida:    { label: 'Vencida',    cls: 'bg-red-900/40 text-red-300 border-red-800/60', color: 'red' },
  anulada:    { label: 'Anulada',    cls: 'bg-zinc-800 text-zinc-400 border-zinc-700', color: 'zinc' },
};
const RANK = { vencida: 3, por_vencer: 2, vigente: 1, anulada: 0 };

function BadgeEstado({ estado }) {
  const e = ESTADO_GAR[estado] || ESTADO_GAR.vigente;
  return <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border rounded-full ${e.cls}`}>{e.label}</span>;
}

export default function VistaGarantias({ data, usuario, onVolver, onVerProyecto }) {
  const [tab, setTab] = useState('vigentes'); // vigentes|cliente|ubicacion|mapa|mantenimientos
  const [loading, setLoading] = useState(true);
  const [garantias, setGarantias] = useState([]);
  const [mantenimientos, setMantenimientos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [surveysProj, setSurveysProj] = useState([]);
  const [reclamaciones, setReclamaciones] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [ubicSel, setUbicSel] = useState(null); // detalle de ubicación
  const [reload, setReload] = useState(0);
  const [vistaMant, setVistaMant] = useState('lista'); // lista|calendario
  const [mesCal, setMesCal] = useState(() => new Date());
  const [mesCalAuto, setMesCalAuto] = useState(false);
  const [diaSel, setDiaSel] = useState(null); // 'YYYY-MM-DD' seleccionado en el calendario

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [g, m, u, sp, rec] = await Promise.all([
          db.listarGarantias(), db.listarMantenimientos({}), db.listarUbicacionesCliente(null),
          import('../../lib/surveys').then(s => s.listarProyectosSurveys()).catch(() => []),
          db.listarReclamaciones().catch(() => []),
        ]);
        if (!cancel) { setGarantias(g.map(x => ({ ...x, estado: x.estadoCalc || x.estado }))); setMantenimientos(m); setUbicaciones(u); setSurveysProj(sp || []); setReclamaciones(rec || []); }
      } catch (e) { console.warn('Garantías:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [reload]);

  const proyById = (id) => (data.proyectos || []).find(p => p.id === id);
  const ubic = (id) => ubicaciones.find(u => u.id === id);
  const clienteDe = (id) => (data.clientes || []).find(c => c.id === id);
  const garantiaDe = (id) => garantias.find(g => g.id === id);
  const clienteNombre = (g) => {
    if (!g) return '—';
    const c = clienteDe(g.clienteId); if (c) return c.nombre;
    return proyById(g.proyectoId)?.cliente || '—';
  };
  const coordsDe = (g) => {
    const u = ubic(g.ubicacionId);
    if (u && u.latitud != null) return { lat: u.latitud, lng: u.longitud };
    const p = proyById(g.proyectoId);
    if (p && p.ubicacionLat != null) return { lat: p.ubicacionLat, lng: p.ubicacionLng };
    return null;
  };
  const locKey = (g) => g.ubicacionId || (g.proyectoId ? 'proy:' + g.proyectoId : 'sin');
  const locNombre = (g) => {
    const u = ubic(g.ubicacionId); if (u) return u.nombre;
    const p = proyById(g.proyectoId); return p?.referenciaProyecto || p?.nombre || p?.cliente || 'Sin ubicación';
  };

  const garantiasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return garantias;
    return garantias.filter(g =>
      clienteNombre(g).toLowerCase().includes(q) ||
      (g.referenciaCotizacion || '').toLowerCase().includes(q) ||
      (g.sistemaNombre || '').toLowerCase().includes(q) ||
      (clienteDe(g.clienteId)?.rnc || '').toLowerCase().includes(q)
    );
  }, [garantias, busqueda, data.clientes, ubicaciones]);

  // Agrupaciones
  const porCliente = useMemo(() => {
    const map = new Map();
    for (const g of garantias) {
      const k = g.clienteId || ('proy:' + (proyById(g.proyectoId)?.cliente || g.proyectoId || 'sin'));
      if (!map.has(k)) map.set(k, { nombre: clienteNombre(g), garantias: [] });
      map.get(k).garantias.push(g);
    }
    return [...map.values()].sort((a, b) => b.garantias.length - a.garantias.length);
  }, [garantias, data.clientes, ubicaciones]);

  const porUbicacion = useMemo(() => {
    const map = new Map();
    for (const g of garantias) {
      const k = locKey(g);
      if (!map.has(k)) map.set(k, { key: k, nombre: locNombre(g), cliente: clienteNombre(g), coords: coordsDe(g), garantias: [] });
      map.get(k).garantias.push(g);
    }
    return [...map.values()];
  }, [garantias, ubicaciones, data.clientes]);

  const peorEstado = (gs) => { let p = 'vigente'; for (const g of gs) if (RANK[g.estado] > RANK[p]) p = g.estado; return p; };

  const proximos = useMemo(() => mantenimientos.filter(m => ['pendiente', 'agendado', 'vencido'].includes(m.estado)).sort((a, b) => (a.fechaProgramada || '').localeCompare(b.fechaProgramada || '')), [mantenimientos]);
  const buckets = useMemo(() => {
    const b = { vencidos: [], prox90: [], futuro: [] };
    for (const m of proximos) { const d = diasHasta(m.fechaProgramada); if (d != null && d < 0) b.vencidos.push(m); else if (d != null && d <= 90) b.prox90.push(m); else b.futuro.push(m); }
    return b;
  }, [proximos]);
  // Abrir el calendario en el mes del próximo mantenimiento (una vez).
  useEffect(() => {
    if (!mesCalAuto && proximos.length > 0 && proximos[0].fechaProgramada) {
      setMesCal(new Date(proximos[0].fechaProgramada + 'T12:00:00'));
      setMesCalAuto(true);
    }
  }, [proximos, mesCalAuto]);

  const recordarWhatsApp = (m) => {
    const g = garantiaDe(m.garantiaId); const u = ubic(g?.ubicacionId); const nombre = clienteNombre(g);
    const tel = (u?.contactoTelefono || clienteDe(g?.clienteId)?.telefonoPrincipal || proyById(g?.proyectoId)?.contactoClienteTelefono || '').replace(/\D/g, '').replace(/^(?!1)(8[024]9)/, '1$1');
    const msg = `Hola${nombre && nombre !== '—' ? ' ' + nombre : ''}, le saluda Super Techos. Su sistema${g?.referenciaCotizacion ? ` (cot. ${g.referenciaCotizacion})` : ''}${u?.nombre ? ` en ${u.nombre}` : ''} tiene un mantenimiento de inspección programado para el ${fmtFecha(m.fechaProgramada)}. ¿Coordinamos la visita?`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
  };
  const marcarRealizado = async (m) => { try { await db.actualizarMantenimiento(m.id, { estado: 'realizado' }); setReload(r => r + 1); } catch (e) { alert('Error: ' + (e.message || e)); } };

  // --- Render de una garantía (fila compacta) ---
  const FilaGarantia = (g) => {
    const d = diasHasta(g.fechaVencimiento);
    const u = ubic(g.ubicacionId);
    return (
      <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">{clienteNombre(g)}</span>
            {g.referenciaCotizacion && <span className="text-[10px] font-mono text-zinc-500">{g.referenciaCotizacion}</span>}
            <BadgeEstado estado={g.estado} />
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">{g.sistemaNombre || 'Sistema —'}{u?.nombre ? ` · ${u.nombre}` : ''}{g.m2 ? ` · ${formatNum(g.m2)} m²` : ''}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Inicio {fmtFecha(g.fechaInicio)} · Vence {fmtFecha(g.fechaVencimiento)}{d != null && d >= 0 && <span className={d <= 60 ? 'text-amber-400' : ''}> · faltan {d} días</span>}{d != null && d < 0 && <span className="text-red-400"> · venció hace {Math.abs(d)} días</span>}</div>
        </div>
        {g.proyectoId && onVerProyecto && <button onClick={() => { const p = proyById(g.proyectoId); if (p) onVerProyecto(p); }} className="text-[10px] text-red-400 hover:underline shrink-0">Ver proyecto →</button>}
      </div>
    );
  };

  const FilaMantenimiento = (m) => {
    const g = garantiaDe(m.garantiaId); const d = diasHasta(m.fechaProgramada);
    const vencido = m.estado === 'vencido' || (d != null && d < 0); const u = ubic(m.ubicacionId); const p = proyById(g?.proyectoId);
    return (
      <div key={m.id} className={`bg-zinc-900 border rounded-card p-3 flex items-center justify-between gap-3 ${vencido ? 'border-red-800/60' : d != null && d <= 30 ? 'border-amber-700/50' : 'border-zinc-800'}`}>
        <div className="min-w-0 flex-1">
          <div className="font-bold flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-red-500" />{fmtFecha(m.fechaProgramada)}{vencido ? <span className="text-[9px] text-red-400 uppercase font-black">vencido</span> : d != null && d <= 30 && <span className="text-[9px] text-amber-400 uppercase font-black">en {d}d</span>}</div>
          <div className="text-xs text-zinc-300 mt-0.5 truncate font-bold">{clienteNombre(g)}</div>
          <div className="text-[10px] text-zinc-500 truncate">{g?.referenciaCotizacion ? `${g.referenciaCotizacion} · ` : ''}{u?.nombre || p?.referenciaProyecto || ''}{g?.sistemaNombre ? ` · ${g.sistemaNombre}` : ''}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => recordarWhatsApp(m)} className="bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded-card flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WS</button>
          <button onClick={() => marcarRealizado(m)} className="bg-zinc-800 hover:bg-green-700 text-zinc-300 hover:text-white text-[10px] font-bold uppercase px-2 py-1.5 rounded-card flex items-center gap-1"><Check className="w-3 h-3" /> Hecho</button>
        </div>
      </div>
    );
  };

  const TABS = [
    { k: 'vigentes', label: `Vigentes (${garantias.length})` },
    { k: 'cliente', label: 'Por cliente' },
    { k: 'ubicacion', label: 'Por ubicación' },
    { k: 'mapa', label: 'Mapa' },
    { k: 'mantenimientos', label: `Mantenimientos (${proximos.length})` },
  ];

  // Detalle de ubicación (360 de la localidad)
  if (ubicSel) {
    const gs = ubicSel.garantias;
    const mants = mantenimientos.filter(m => gs.some(g => g.id === m.garantiaId)).sort((a, b) => (a.fechaProgramada || '').localeCompare(b.fechaProgramada || ''));
    const u = ubicaciones.find(x => x.id === ubicSel.key);
    const proyIds = [...new Set(gs.map(g => g.proyectoId).filter(Boolean))];
    const proyectosLoc = proyIds.map(id => proyById(id)).filter(Boolean);
    // Levantamientos: match best-effort por nombre de cliente.
    const cliN = (ubicSel.cliente || '').toLowerCase().trim();
    const primeraPalabra = cliN.split(/\s+/)[0] || '';
    const levs = primeraPalabra.length >= 3 ? (surveysProj || []).filter(sp => (sp.client_name || '').toLowerCase().includes(primeraPalabra)) : [];
    // Reclamaciones de la localidad.
    const recsLoc = reclamaciones.filter(r => proyIds.includes(r.proyectoId) || (u && r.ubicacionId === u.id) || gs.some(g => g.id === r.garantiaId));
    // Fechas de intervención por área (de los reportes).
    const intervArea = (pid, areaId) => {
      const fs = (data.reportes || []).filter(r => r.proyectoId === pid && r.areaId === areaId).map(r => r.fecha).filter(Boolean).sort();
      return fs.length ? { primera: fs[0], ultima: fs[fs.length - 1], n: fs.length } : null;
    };
    const abrirReclamacion = async () => {
      const desc = prompt('Describe la reclamación del cliente:');
      if (!desc) return;
      try {
        const g0 = gs[0] || {};
        await db.crearReclamacion({ clienteId: g0.clienteId, ubicacionId: u?.id || g0.ubicacionId, garantiaId: g0.id, proyectoId: g0.proyectoId, referenciaCotizacion: g0.referenciaCotizacion, canal: 'interno', descripcion: desc });
        setReload(r => r + 1);
      } catch (e) { alert('Error: ' + (e.message || e)); }
    };
    const SEV = { abierta: 'text-amber-300', en_proceso: 'text-blue-300', resuelta: 'text-green-300', cerrada: 'text-zinc-400', rechazada: 'text-red-300' };
    return (
      <div className="space-y-4">
        <button onClick={() => setUbicSel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver a ubicaciones</button>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{ubicSel.cliente}</div>
          <h1 className="text-2xl font-black flex items-center gap-2"><MapPin className="w-6 h-6 text-red-500" /> {ubicSel.nombre}</h1>
          {u?.direccion && <div className="text-xs text-zinc-400 mt-1">{u.direccion}{u.sector ? ` · ${u.sector}` : ''}</div>}
          {ubicSel.coords && <a href={`https://maps.google.com/?q=${ubicSel.coords.lat},${ubicSel.coords.lng}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:underline">Ver en mapa →</a>}
        </div>
        {ubicSel.coords && <MapaLeaflet center={[ubicSel.coords.lat, ubicSel.coords.lng]} zoom={16} height={180} markers={[{ lat: ubicSel.coords.lat, lng: ubicSel.coords.lng, color: ESTADO_GAR[peorEstado(gs)].color }]} className="rounded-card overflow-hidden" />}

        {/* Levantamientos */}
        {levs.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-2">Levantamientos ({levs.length})</div>
            <div className="space-y-2">{levs.map(l => (
              <div key={l.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 text-sm"><span className="font-bold">{l.name}</span><span className="text-[10px] text-zinc-500 ml-2 uppercase">{l.service_line}</span></div>
            ))}</div>
          </div>
        )}

        {/* Proyectos + áreas con fechas de intervención */}
        {proyectosLoc.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-2">Proyectos ({proyectosLoc.length})</div>
            <div className="space-y-2">{proyectosLoc.map(p => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0"><span className="font-bold">{p.referenciaProyecto || p.nombre || p.cliente}</span>{p.referenciaOdoo && <span className="text-[10px] font-mono text-zinc-500 ml-2">{p.referenciaOdoo}</span>}</div>
                  {onVerProyecto && <button onClick={() => onVerProyecto(p)} className="text-[10px] text-red-400 hover:underline shrink-0">Ver →</button>}
                </div>
                {(p.areas || []).length > 0 && (
                  <div className="mt-2 space-y-1">{(p.areas || []).map(a => {
                    const iv = intervArea(p.id, a.id);
                    return (
                      <div key={a.id} className="flex items-center justify-between text-[11px] border-t border-zinc-800/60 pt-1">
                        <span className="text-zinc-300 truncate">{a.nombre || 'Área'}{a.m2 ? ` · ${formatNum(a.m2)} m²` : ''}</span>
                        <span className="text-zinc-500 shrink-0">{iv ? `intervenida ${fmtFecha(iv.ultima)}${iv.n > 1 ? ` (${iv.n} reportes)` : ''}` : 'sin intervención'}</span>
                      </div>
                    );
                  })}</div>
                )}
              </div>
            ))}</div>
          </div>
        )}

        {/* Garantías */}
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-2">Garantías ({gs.length})</div>
          <div className="space-y-2">{gs.map(FilaGarantia)}</div>
        </div>

        {/* Mantenimientos */}
        {mants.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-2">Mantenimientos ({mants.length})</div>
            <div className="space-y-2">{mants.map(FilaMantenimiento)}</div>
          </div>
        )}

        {/* Reclamaciones */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">Reclamaciones ({recsLoc.length})</div>
            <button onClick={abrirReclamacion} className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-card font-bold uppercase">+ Abrir reclamación</button>
          </div>
          {recsLoc.length === 0 ? (
            <div className="text-xs text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-card p-3">Sin reclamaciones en esta localidad.</div>
          ) : (
            <div className="space-y-2">{recsLoc.map(r => (
              <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                <div className="flex items-center gap-2"><span className={`text-[9px] font-black uppercase ${SEV[r.estado] || 'text-zinc-400'}`}>{r.estado}</span><span className="text-[10px] text-zinc-500 uppercase">{r.canal}</span><span className="text-[10px] text-zinc-500">{fmtFecha(r.fechaApertura)}</span></div>
                <div className="text-sm text-zinc-300 mt-1">{r.descripcion}</div>
              </div>
            ))}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <h1 className="text-3xl font-black tracking-tight flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-red-500" /> Garantías</h1>

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1 w-fit flex-wrap">
        {TABS.map(t => <button key={t.k} onClick={() => setTab(t.k)} className={`px-3 py-1.5 text-[11px] font-bold uppercase rounded-card ${tab === t.k ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}>{t.label}</button>)}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : garantias.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="font-bold mb-1">Sin garantías</div>
          <div className="text-xs">Se crean al cerrar un proyecto (Recibido Conforme) o importando de Odoo.</div>
        </div>
      ) : tab === 'vigentes' ? (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por cliente, # cotización, RNC o sistema…" className="w-full bg-zinc-950 border border-zinc-800 rounded-card pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-red-600" />
          </div>
          <div className="space-y-2">{garantiasFiltradas.map(FilaGarantia)}</div>
        </>
      ) : tab === 'cliente' ? (
        <div className="space-y-2">
          {porCliente.map((c, i) => (
            <details key={i} className="bg-zinc-900 border border-zinc-800 rounded-card overflow-hidden">
              <summary className="p-3 flex items-center justify-between cursor-pointer hover:bg-zinc-800/40 list-none">
                <span className="font-bold flex items-center gap-2"><Users className="w-4 h-4 text-red-500" /> {c.nombre}</span>
                <span className="text-xs text-zinc-500">{c.garantias.length} garantía{c.garantias.length !== 1 ? 's' : ''} · <BadgeEstado estado={peorEstado(c.garantias)} /></span>
              </summary>
              <div className="p-3 pt-0 space-y-2 border-t border-zinc-800">{c.garantias.map(FilaGarantia)}</div>
            </details>
          ))}
        </div>
      ) : tab === 'ubicacion' ? (
        <div className="space-y-2">
          {porUbicacion.map(u => (
            <button key={u.key} onClick={() => setUbicSel(u)} className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center justify-between hover:border-red-600">
              <div className="min-w-0">
                <div className="font-bold flex items-center gap-2 truncate"><MapPin className="w-4 h-4 text-red-500 shrink-0" /> {u.nombre}</div>
                <div className="text-[11px] text-zinc-500 truncate">{u.cliente} · {u.garantias.length} garantía{u.garantias.length !== 1 ? 's' : ''}{u.coords ? '' : ' · sin GPS'}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0"><BadgeEstado estado={peorEstado(u.garantias)} /><ChevronDown className="w-4 h-4 text-zinc-600 -rotate-90" /></div>
            </button>
          ))}
        </div>
      ) : tab === 'mapa' ? (
        (() => {
          const conCoords = porUbicacion.filter(u => u.coords);
          if (conCoords.length === 0) return <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500 text-sm">Ninguna garantía tiene ubicación con GPS aún. Agrega la ubicación al cliente o al proyecto.</div>;
          const markers = conCoords.map(u => ({
            lat: u.coords.lat, lng: u.coords.lng, color: ESTADO_GAR[peorEstado(u.garantias)].color,
            label: u.nombre,
            popup: `<b>${u.cliente}</b><br/>${u.nombre}<br/>${u.garantias.length} garantía(s)`,
            onClick: () => setUbicSel(u),
          }));
          return (
            <div>
              <MapaLeaflet center={[markers[0].lat, markers[0].lng]} zoom={11} height={460} markers={markers} scrollWheelZoom className="rounded-card overflow-hidden" />
              <div className="text-[10px] text-zinc-500 mt-2 flex gap-3"><span>🟢 vigente</span><span>🟠 por vencer</span><span>🔴 vencida</span> · Click en un pin para ver la ubicación.</div>
            </div>
          );
        })()
      ) : (
        // Mantenimientos
        proximos.length === 0 ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500">
            <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <div className="font-bold mb-1">Sin mantenimientos pendientes</div>
            <div className="text-xs">Se generan según la periodicidad elegida al entregar cada proyecto.</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1 w-fit">
              <button onClick={() => setVistaMant('lista')} className={`px-3 py-1 text-[10px] font-bold uppercase rounded-card ${vistaMant === 'lista' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Lista</button>
              <button onClick={() => setVistaMant('calendario')} className={`px-3 py-1 text-[10px] font-bold uppercase rounded-card ${vistaMant === 'calendario' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Calendario</button>
            </div>

            {vistaMant === 'lista' ? (
              <div className="space-y-5">
                {[{ key: 'vencidos', label: '⚠ Vencidos', items: buckets.vencidos, cls: 'text-red-400' }, { key: 'prox90', label: 'Próximos 90 días', items: buckets.prox90, cls: 'text-amber-400' }, { key: 'futuro', label: 'Más adelante', items: buckets.futuro, cls: 'text-zinc-400' }]
                  .filter(s => s.items.length > 0).map(sec => (
                    <div key={sec.key} className="space-y-2">
                      <div className={`text-[11px] uppercase tracking-widest font-bold ${sec.cls}`}>{sec.label} ({sec.items.length})</div>
                      {sec.items.map(FilaMantenimiento)}
                    </div>
                  ))}
              </div>
            ) : (() => {
              const y = mesCal.getFullYear(), mo = mesCal.getMonth();
              const pad = (n) => String(n).padStart(2, '0');
              const offset = (new Date(y, mo, 1).getDay() + 6) % 7; // lunes = 0
              const diasMes = new Date(y, mo + 1, 0).getDate();
              const porDia = {};
              proximos.forEach(m => { if (m.fechaProgramada) (porDia[m.fechaProgramada] = porDia[m.fechaProgramada] || []).push(m); });
              const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];
              const iso = (d) => `${y}-${pad(mo + 1)}-${pad(d)}`;
              const mesLabel = mesCal.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
              const prefMes = `${y}-${pad(mo + 1)}`;
              const delMes = proximos.filter(m => (m.fechaProgramada || '').startsWith(prefMes));
              const lista = diaSel ? proximos.filter(m => m.fechaProgramada === diaSel) : delMes;
              const irMes = (delta) => { setMesCal(new Date(y, mo + delta, 1)); setDiaSel(null); };
              return (
                <div className="space-y-3">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <button onClick={() => irMes(-1)} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-card text-zinc-300 text-sm">‹</button>
                      <div className="font-bold capitalize">{mesLabel}</div>
                      <button onClick={() => irMes(1)} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-card text-zinc-300 text-sm">›</button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d, i) => <div key={'h' + i} className="text-[9px] text-zinc-500 uppercase font-bold pb-1">{d}</div>)}
                      {celdas.map((d, i) => {
                        if (d === null) return <div key={'e' + i} />;
                        const k = iso(d); const items = porDia[k] || []; const sel = diaSel === k;
                        const venc = items.some(x => diasHasta(x.fechaProgramada) < 0);
                        return (
                          <button key={k} onClick={() => setDiaSel(sel ? null : (items.length ? k : null))}
                            className={`aspect-square rounded-card text-xs flex flex-col items-center justify-center transition-colors ${sel ? 'bg-red-600 text-white' : items.length ? (venc ? 'bg-red-900/50 text-red-200 hover:bg-red-900/70' : 'bg-amber-900/40 text-amber-200 hover:bg-amber-900/60') : 'text-zinc-600 hover:bg-zinc-800/50'}`}>
                            <span>{d}</span>
                            {items.length > 0 && <span className="text-[8px] font-black">{items.length}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-2">{diaSel ? fmtFecha(diaSel) : 'Este mes'} ({lista.length})</div>
                    <div className="space-y-2">{lista.map(FilaMantenimiento)}</div>
                    {lista.length === 0 && <div className="text-center text-xs text-zinc-500 py-4">Sin mantenimientos {diaSel ? 'ese día' : 'este mes'}.</div>}
                  </div>
                </div>
              );
            })()}
          </div>
        )
      )}
    </div>
  );
}
