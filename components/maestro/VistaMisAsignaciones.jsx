'use client';

// v8.19.72: Vista limpia para el maestro — sus PROYECTOS, LEVANTAMIENTOS y
// RECLAMACIONES asignadas. Capas que se muestran/ocultan en el mapa y en la lista,
// con detalle de cada item. Para levantamientos resalta si requiere escalera (y si
// es larga). Para reclamaciones muestra cuándo y qué se hizo.

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, Briefcase, MapPin, AlertTriangle, ChevronDown, MessageCircle, Mail, Clock, User as UserIcon } from 'lucide-react';
import * as db from '../../lib/db';
import { obtenerUbicacion, distanciaMetros, formatDistancia } from '../../lib/geo';
import { listarProyectosSurveys, listarTodosLosSitesSurvey, SERVICE_LINES, ESCALERA } from '../../lib/surveys';
import { EscaleraBadge } from '../surveys/ModuloSurveys';
import MapaLeaflet from '../common/MapaLeaflet';

const fmt = (s) => { if (!s) return '—'; try { return new Date((s.length <= 10 ? s + 'T12:00:00' : s)).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
const SEV = { baja: 'text-zinc-400', media: 'text-amber-400', alta: 'text-red-400' };

// v8.25.3: contacto principal + canal preferido, y tiempo en etapa (igual que el Kanban).
function infoContactoLev(l, clientes = [], contactos = []) {
  const cli = clientes.find(c => (c.nombre || '').trim().toLowerCase() === (l.client_name || '').trim().toLowerCase());
  const cts = contactos.filter(c => c.clienteId === cli?.id);
  const ppal = cts.find(c => c.esPrincipal) || cts[0];
  const ws = ppal?.whatsapp || ppal?.telefono || '';
  const email = ppal?.email || '';
  return { contacto: ppal?.nombre || '', canal: ppal?.prefComunicacion || (ws ? 'ws' : email ? 'email' : null) };
}
function tiempoEnEtapaLev(l) {
  const iso = l.stage_changed_at || l.updated_at || l.created_at;
  if (!iso) return '';
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'hoy';
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} d` : `${Math.floor(d / 30)} mes`;
}

const ESTADOS_PROY = [
  ['planificado', 'Planificado'],
  ['aprobado', 'Aprobado'],
  ['en_ejecucion', 'En ejecución'],
  ['parado', 'Parado'],
  ['finalizado_no_entregado', 'Fin. no entregado'],
  ['finalizado_recibido_conforme', 'Entregado'],
  ['facturado', 'Facturado'],
];

const CAPAS = [
  { key: 'proyectos', label: 'Proyectos', icon: Briefcase, color: '#ef4444', leaflet: 'red' },
  { key: 'levantamientos', label: 'Levantamientos', icon: MapPin, color: '#3b82f6', leaflet: 'blue' },
  { key: 'reclamaciones', label: 'Reclamaciones', icon: AlertTriangle, color: '#f59e0b', leaflet: 'orange' },
];

export default function VistaMisAsignaciones({ usuario, data, onVolver, onVerProyecto }) {
  const [loading, setLoading] = useState(true);
  const [levs, setLevs] = useState([]);
  const [recs, setRecs] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [show, setShow] = useState({ proyectos: true, levantamientos: true, reclamaciones: true });
  const [exp, setExp] = useState(null); // item expandido (lev/rec)
  const [miUbic, setMiUbic] = useState(null); // v8.19.96: ubicación del supervisor
  const [buscandoUbic, setBuscandoUbic] = useState(false);
  const verMiUbicacion = async () => {
    setBuscandoUbic(true);
    const u = await obtenerUbicacion();
    setBuscandoUbic(false);
    if (u) setMiUbic(u); else alert('No se pudo obtener tu ubicación. Activa el GPS y dale permiso al navegador.');
  };
  const distTxt = (coords) => (miUbic && coords && coords.lat != null) ? formatDistancia(distanciaMetros(miUbic.lat, miUbic.lng, coords.lat, coords.lng)) : null;

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [sp, sites, rs, us] = await Promise.all([
          listarProyectosSurveys(), listarTodosLosSitesSurvey(), db.listarReclamaciones(), db.listarUbicacionesCliente(null),
        ]);
        if (cancel) return;
        const coordsProj = {};
        for (const s of sites) { if (s.latitude != null && s.longitude != null && !coordsProj[s.project_id]) coordsProj[s.project_id] = { lat: Number(s.latitude), lng: Number(s.longitude) }; }
        const dirProj = {};
        for (const s of sites) { if (!dirProj[s.project_id] && (s.address || s.name)) dirProj[s.project_id] = s.address || s.name; }
        const misLev = sp.filter(p => p.asignado_a_id === usuario.id).map(p => ({ ...p, _coords: coordsProj[p.id] || null, _dir: dirProj[p.id] || '' }));
        setLevs(misLev);
        setRecs(rs.filter(r => r.asignadoA === usuario.id));
        setUbicaciones(us);
      } catch (e) { console.warn('MisAsignaciones:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [usuario.id]);

  // Proyectos asignados al usuario (supervisor / maestro / ayudante).
  const proyectosAsignados = useMemo(() => (data.proyectos || []).filter(p => !p.archivado && (
    p.supervisorId === usuario.id || p.maestroId === usuario.id || (p.ayudantesIds || []).includes(usuario.id)
  )), [data.proyectos, usuario.id]);
  // v8.19.95: por defecto solo activos (planificado/aprobado/en ejecución); el
  // supervisor puede encender parados/entregados/facturados con los chips.
  const [estadosSel, setEstadosSel] = useState(() => new Set(['planificado', 'aprobado', 'en_ejecucion']));
  const proyectos = useMemo(() => proyectosAsignados.filter(p => estadosSel.has(p.estado || 'en_ejecucion')), [proyectosAsignados, estadosSel]);
  const ubic = (id) => ubicaciones.find(u => u.id === id);
  const proyById = (id) => (data.proyectos || []).find(p => p.id === id);
  const clienteDe = (id) => (data.clientes || []).find(c => c.id === id);
  const recCliente = (r) => clienteDe(r.clienteId)?.nombre || proyById(r.proyectoId)?.cliente || r.clienteNombre || '—';
  const recCoords = (r) => { const u = ubic(r.ubicacionId); if (u && u.latitud != null) return { lat: u.latitud, lng: u.longitud }; const p = proyById(r.proyectoId); if (p && p.ubicacionLat != null) return { lat: p.ubicacionLat, lng: p.ubicacionLng }; return null; };

  const conteos = { proyectos: proyectos.length, levantamientos: levs.length, reclamaciones: recs.length };

  // Marcadores del mapa según capas activas.
  const markers = useMemo(() => {
    const out = [];
    if (show.proyectos) for (const p of proyectos) { if (p.ubicacionLat != null && p.ubicacionLng != null) out.push({ lat: Number(p.ubicacionLat), lng: Number(p.ubicacionLng), color: 'red', label: p.cliente, popup: `<b>🔧 ${p.cliente}</b><br/>${p.referenciaProyecto || p.nombre || ''}`, onClick: () => onVerProyecto?.(p) }); }
    if (show.levantamientos) for (const l of levs) { if (l._coords) { const esc = ESCALERA[l.requiere_escalera]; out.push({ lat: l._coords.lat, lng: l._coords.lng, color: 'blue', label: l.client_name, popup: `<b>📍 ${l.client_name}</b><br/>${SERVICE_LINES[l.service_line]?.label || ''}${esc ? `<br/>🪜 ${esc.label}` : ''}`, onClick: () => setExp('lev-' + l.id) }); } }
    if (show.reclamaciones) for (const r of recs) { const c = recCoords(r); if (c) out.push({ lat: c.lat, lng: c.lng, color: 'orange', label: recCliente(r), popup: `<b>⚠ ${recCliente(r)}</b><br/>${(r.descripcion || '').slice(0, 70)}`, onClick: () => setExp('rec-' + r.id) }); }
    // v8.19.96: tu ubicación actual (para ver qué te queda cerca).
    if (miUbic) out.push({ lat: miUbic.lat, lng: miUbic.lng, color: 'green', label: 'Tú', popup: `<b>📍 Tu ubicación</b>${miUbic.precision ? `<br/>±${miUbic.precision} m` : ''}` });
    return out;
  }, [show, proyectos, levs, recs, ubicaciones, miUbic]);

  return (
    <div className="space-y-4">
      {onVolver && <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Mis asignaciones</h1>
          <div className="text-xs text-zinc-500 mt-1">Tus proyectos, levantamientos y reclamaciones. Elige qué ver en el mapa.</div>
        </div>
        <button onClick={verMiUbicacion} disabled={buscandoUbic} className={`flex-shrink-0 px-3 py-2 rounded-card text-xs font-bold uppercase flex items-center gap-1.5 border ${miUbic ? 'bg-green-600/20 border-green-600 text-green-300' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-red-600'}`}>
          {buscandoUbic ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />} {miUbic ? 'Ubicación activa' : 'Mi ubicación'}
        </button>
      </div>

      {/* Capas */}
      <div className="flex gap-2 flex-wrap">
        {CAPAS.map(c => {
          const on = show[c.key]; const Icon = c.icon;
          return (
            <button key={c.key} onClick={() => setShow(s => ({ ...s, [c.key]: !s[c.key] }))}
              className="px-3 py-1.5 rounded-card border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              style={on ? { backgroundColor: c.color + '22', borderColor: c.color, color: c.color } : { borderColor: '#3f3f46', color: '#71717a' }}>
              <Icon className="w-3.5 h-3.5" /> {c.label}
              <span className="text-[10px] opacity-80">({conteos[c.key]})</span>
            </button>
          );
        })}
      </div>

      {/* v8.19.95: estados de proyecto a mostrar (por defecto solo activos) */}
      {show.proyectos && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Proyectos:</span>
          {ESTADOS_PROY.map(([k, label]) => {
            const n = proyectosAsignados.filter(p => (p.estado || 'en_ejecucion') === k).length;
            if (n === 0) return null;
            const on = estadosSel.has(k);
            return (
              <button key={k} onClick={() => setEstadosSel(s => { const ns = new Set(s); ns.has(k) ? ns.delete(k) : ns.add(k); return ns; })}
                className={`px-2.5 py-1 rounded-card border text-[10px] font-bold uppercase ${on ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>
                {label} <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : (
        <>
          {/* Mapa */}
          {markers.length > 0 ? (
            <MapaLeaflet center={[markers[0].lat, markers[0].lng]} zoom={11} height={360} markers={markers} scrollWheelZoom className="rounded-card overflow-hidden" />
          ) : (
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-6 text-center text-zinc-500 text-sm">Ninguna asignación visible tiene ubicación con GPS. (Igual puedes ver el detalle en la lista de abajo.)</div>
          )}

          {/* Listas por capa */}
          {show.proyectos && (
            <Seccion icon={Briefcase} color="#ef4444" titulo="Proyectos" n={proyectos.length} vacio="No tienes proyectos asignados.">
              {proyectos.map(p => (
                <button key={p.id} onClick={() => onVerProyecto?.(p)} className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card p-3 hover:border-red-600 flex items-center justify-between gap-3" style={{ borderLeftColor: '#ef4444', borderLeftWidth: 4 }}>
                  <div className="min-w-0">
                    <div className="font-bold truncate">{p.cliente}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{p.referenciaProyecto || p.nombre}{p.referenciaOdoo ? ` · ${p.referenciaOdoo}` : ''}</div>
                  </div>
                  <span className="shrink-0 text-right">
                    {distTxt({ lat: p.ubicacionLat, lng: p.ubicacionLng }) && <span className="block text-[10px] font-bold text-green-400">📍 {distTxt({ lat: p.ubicacionLat, lng: p.ubicacionLng })}</span>}
                    <span className="text-[10px] text-red-400">Ver →</span>
                  </span>
                </button>
              ))}
            </Seccion>
          )}

          {show.levantamientos && (
            <Seccion icon={MapPin} color="#3b82f6" titulo="Levantamientos" n={levs.length} vacio="No tienes levantamientos asignados.">
              {levs.map(l => {
                const abierto = exp === 'lev-' + l.id;
                const ci = infoContactoLev(l, data?.clientes || [], data?.contactos || []);
                return (
                  <div key={l.id} className="bg-zinc-900 border border-zinc-800 rounded-card" style={{ borderLeftColor: SERVICE_LINES[l.service_line]?.color || '#3b82f6', borderLeftWidth: 4 }}>
                    <button onClick={() => setExp(abierto ? null : 'lev-' + l.id)} className="w-full text-left p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold truncate">{l.client_name}</div>
                        {ci.contacto && <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1"><UserIcon className="w-2.5 h-2.5 text-zinc-600" />{ci.contacto}</div>}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <EscaleraBadge valor={l.requiere_escalera} />
                          <span className="text-[10px] text-zinc-500">{SERVICE_LINES[l.service_line]?.label || ''}</span>
                          <span className="text-[9px] text-zinc-500 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {tiempoEnEtapaLev(l)}</span>
                        </div>
                      </div>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        {ci.canal === 'ws' ? <MessageCircle className="w-4 h-4 text-green-500" /> : ci.canal === 'email' ? <Mail className="w-4 h-4 text-blue-400" /> : null}
                        {distTxt(l._coords) && <span className="text-[10px] font-bold text-green-400">📍 {distTxt(l._coords)}</span>}
                        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {abierto && (
                      <div className="border-t border-zinc-800 p-3 space-y-2 text-xs">
                        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 flex items-center gap-2">
                          <span className="text-zinc-500">🪜 Escalera:</span> <EscaleraBadge valor={l.requiere_escalera} full />
                        </div>
                        {l._dir && <div><span className="text-zinc-500">Dirección: </span><span className="text-zinc-300">{l._dir}</span></div>}
                        {l.name && <div><span className="text-zinc-500">Levantamiento: </span><span className="text-zinc-300">{l.name}</span></div>}
                        {l.description && <div className="text-zinc-400">{l.description}</div>}
                        {l._coords && <a href={`https://www.google.com/maps?q=${l._coords.lat},${l._coords.lng}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> Abrir en Maps</a>}
                      </div>
                    )}
                  </div>
                );
              })}
            </Seccion>
          )}

          {show.reclamaciones && (
            <Seccion icon={AlertTriangle} color="#f59e0b" titulo="Reclamaciones" n={recs.length} vacio="No tienes reclamaciones asignadas.">
              {recs.map(r => {
                const abierto = exp === 'rec-' + r.id;
                return (
                  <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-card" style={{ borderLeftColor: '#f59e0b', borderLeftWidth: 4 }}>
                    <button onClick={() => setExp(abierto ? null : 'rec-' + r.id)} className="w-full text-left p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-bold truncate">{recCliente(r)}</span>
                          <span className={`text-[9px] uppercase font-black ${SEV[r.severidad] || ''}`}>● {r.severidad}</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">{r.odooStage || r.estado} · abierta {fmt(r.fechaApertura)}</div>
                      </div>
                      <span className="flex items-center gap-2 shrink-0">
                        {distTxt(recCoords(r)) && <span className="text-[10px] font-bold text-green-400">📍 {distTxt(recCoords(r))}</span>}
                        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {abierto && (
                      <div className="border-t border-zinc-800 p-3 space-y-2 text-xs">
                        <div><span className="text-zinc-500">Reporte del cliente: </span><span className="text-zinc-300">{r.descripcion || '—'}</span></div>
                        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
                          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Qué y cuándo se hizo</div>
                          <div className="text-[11px] text-zinc-400 mb-0.5">{r.fechaResuelta ? `Realizado el ${fmt(r.fechaResuelta)}` : 'Aún sin registrar fecha'}</div>
                          <div className="text-zinc-300 whitespace-pre-wrap">{r.trabajoRealizado || 'Sin descripción del trabajo realizado.'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Seccion>
          )}
        </>
      )}
    </div>
  );
}

function Seccion({ icon: Icon, color, titulo, n, vacio, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest font-black mb-2 flex items-center gap-1.5" style={{ color }}>
        <Icon className="w-3.5 h-3.5" /> {titulo} <span className="text-zinc-600">({n})</span>
      </div>
      {n === 0 ? <div className="text-xs text-zinc-600 px-1">{vacio}</div> : <div className="space-y-2">{children}</div>}
    </div>
  );
}
