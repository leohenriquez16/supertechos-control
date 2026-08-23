'use client';

// v8.25.23: Pantalla de INICIO (home) del supervisor. Resumen del día:
//  - Clima
//  - Citas (levantamientos) agendadas para hoy → abrir/capturar
//  - Cierre del día (después de las 5pm): proyectos que faltan por reportar y
//    lo que ya reportó el maestro hoy.
// Es distinta de "Mis Asignaciones" (mapa + listas completas), accesible desde el menú.

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, Clock, Play, MapPin, Briefcase, ChevronRight, RefreshCw, Sun, CheckCircle2 } from 'lucide-react';
import * as db from '../../lib/db';
import { obtenerUbicacion, distanciaMetros } from '../../lib/geo';
import { listarProyectosSurveys, listarTodosLosSitesSurvey, listarSitesProyectoSurvey, TIPO_CITA, ESCALERA, citaTextoHora } from '../../lib/surveys';
import SurveySiteDetail from '../surveys/SurveySiteDetail';
import CitaRuta from '../surveys/CitaRuta';
import ClimaWidget from './ClimaWidget';
import MiBono from '../bonos/MiBono'; // v8.28.2
import MisPendientes from '../pendientes/MisPendientes'; // v8.28.3

export default function InicioSupervisor({ usuario, data, onIrAReportar, onVerProyecto, onIrAAsignaciones, onIrAProyectos, onIrAVista, onRecargar }) {
  const [levs, setLevs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  // Captura de levantamiento (igual que en Mis Asignaciones).
  const [capturaLev, setCapturaLev] = useState(null);
  const [capturaSites, setCapturaSites] = useState([]);
  const [capturaSite, setCapturaSite] = useState(null);
  const [cargandoCaptura, setCargandoCaptura] = useState(false);
  const abrirCaptura = async (l) => {
    setCargandoCaptura(true);
    try {
      const sites = await listarSitesProyectoSurvey(l.id);
      setCapturaLev(l); setCapturaSites(sites); setCapturaSite(sites.length === 1 ? sites[0] : null);
    } catch (e) { alert('No se pudo abrir el levantamiento: ' + (e?.message || 'error')); }
    setCargandoCaptura(false);
  };
  const cerrarCaptura = () => { setCapturaLev(null); setCapturaSites([]); setCapturaSite(null); };

  const cargar = async ({ silent } = {}) => {
    if (silent) setRefrescando(true); else setLoading(true);
    try {
      const [sp, sites] = await Promise.all([listarProyectosSurveys(), listarTodosLosSitesSurvey()]);
      const dirProj = {}, coordsProj = {};
      for (const s of sites) {
        if (!dirProj[s.project_id] && (s.address || s.name)) dirProj[s.project_id] = s.address || s.name;
        if (s.latitude != null && s.longitude != null && !coordsProj[s.project_id]) coordsProj[s.project_id] = { lat: Number(s.latitude), lng: Number(s.longitude) };
      }
      setLevs(sp.filter(p => p.asignado_a_id === usuario.id).map(p => ({ ...p, _dir: dirProj[p.id] || '', _coords: coordsProj[p.id] || null })));
    } catch (e) { console.warn('InicioSupervisor:', e?.message); }
    setLoading(false); setRefrescando(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [usuario.id]);
  const refrescar = async () => { await Promise.all([cargar({ silent: true }), cargarJornadas(), onRecargar?.()]); };

  const hoyLocal = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
  // "Cualquier día (hora laboral)" siempre disponible; el resto, si su fecha es hoy.
  const citasHoy = useMemo(() => levs.filter(l => l.tipo_cita === 'cualquier_dia' || (l.fecha_visita_programada || '').slice(0, 10) === hoyLocal), [levs, hoyLocal]);

  // Clima: se abre automático cada día desde las 7am; si lo cierras, no reaparece hasta el día siguiente.
  const [climaVisible, setClimaVisible] = useState(false);
  useEffect(() => {
    let v = new Date().getHours() >= 7;
    try { if (localStorage.getItem('clima_dismiss_' + usuario.id) === hoyLocal) v = false; } catch (e) {}
    setClimaVisible(v);
  }, [hoyLocal, usuario.id]);
  const cerrarClima = () => { setClimaVisible(false); try { localStorage.setItem('clima_dismiss_' + usuario.id, hoyLocal); } catch (e) {} };

  // Contacto principal del cliente (best-effort).
  const contactoDe = (l) => {
    const cli = (data.clientes || []).find(c => (c.nombre || '').trim().toLowerCase() === (l.client_name || '').trim().toLowerCase());
    const cts = (data.contactos || []).filter(c => c.clienteId === cli?.id);
    const ppal = cts.find(c => c.esPrincipal) || cts[0];
    return ppal?.nombre || '';
  };

  // v8.28.1: Jornadas de hoy — obras en ejecución donde este usuario es supervisor o
  // maestro titular (los que pueden operar la jornada). Arranque en un toque desde el
  // home; el cierre navega a la obra (ahí vive el modal de dieta/estadía).
  const hoyRD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
  const proyOperables = useMemo(() => (data.proyectos || []).filter(p => !p.archivado && (p.estado || 'en_ejecucion') === 'en_ejecucion' && (
    p.supervisorId === usuario.id || p.maestroId === usuario.id
  )), [data.proyectos, usuario.id]);
  const [jornadas, setJornadas] = useState({});
  const [jornadasLoading, setJornadasLoading] = useState(true);
  const [iniciando, setIniciando] = useState(null);
  const cargarJornadas = async () => {
    setJornadasLoading(true);
    try {
      const pares = await Promise.all(proyOperables.map(async p => {
        const [abierta, hoyJ] = await Promise.all([
          db.obtenerJornadaAbiertaProyecto(p.id),
          db.obtenerJornadaHoy(p.id, hoyRD),
        ]);
        return [p.id, (abierta && !abierta.horaFin) ? abierta : (hoyJ || null)];
      }));
      setJornadas(Object.fromEntries(pares));
    } catch (e) { console.warn('Jornadas inicio:', e?.message); }
    setJornadasLoading(false);
  };
  useEffect(() => { cargarJornadas(); /* eslint-disable-next-line */ }, [proyOperables.map(p => p.id).join(',')]);
  const iniciarRapido = async (p) => {
    setIniciando(p.id);
    try {
      const ubi = await obtenerUbicacion();
      let distancia = null;
      if (ubi && p.ubicacionLat != null && p.ubicacionLng != null) {
        distancia = distanciaMetros(ubi.lat, ubi.lng, p.ubicacionLat, p.ubicacionLng);
      }
      await db.iniciarJornada({
        id: 'j_' + Date.now() + Math.random(),
        proyectoId: p.id, fecha: hoyRD,
        horaInicio: new Date().toISOString(),
        iniciadaPorId: usuario.id, iniciadaPorNombre: usuario.nombre,
        inicioLat: ubi?.lat ?? null, inicioLng: ubi?.lng ?? null,
        inicioPrecisionM: ubi?.precision ?? null,
        inicioDistanciaObraM: distancia,
        personasPresentesIds: [p.maestroId, ...(p.ayudantesIds || [])].filter(Boolean),
      });
      await cargarJornadas();
    } catch (e) { alert('Error iniciando jornada: ' + (e?.message || e)); }
    setIniciando(null);
  };
  const horaCorta = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

  // Cierre del día: proyectos en ejecución asignados a este usuario.
  const esTarde = new Date().getHours() >= 17;
  const proyEnEjec = useMemo(() => (data.proyectos || []).filter(p => !p.archivado && (p.estado || 'en_ejecucion') === 'en_ejecucion' && (
    p.supervisorId === usuario.id || p.maestroId === usuario.id || (p.ayudantesIds || []).includes(usuario.id)
  )), [data.proyectos, usuario.id]);
  const reportesHoy = useMemo(() => (data.reportes || []).filter(r => (r.fecha || '').slice(0, 10) === hoyLocal), [data.reportes, hoyLocal]);
  const cierre = useMemo(() => {
    const faltan = [], hechos = [];
    proyEnEjec.forEach(p => {
      const rs = reportesHoy.filter(r => r.proyectoId === p.id);
      if (rs.length === 0) faltan.push(p); else hechos.push({ p, rs });
    });
    return { faltan, hechos };
  }, [proyEnEjec, reportesHoy]);
  const nombreArea = (p, areaId) => (p.areas || []).find(a => a.id === areaId)?.nombre || '(área)';
  const nombreTarea = (p, areaId, tareaId) => { const a = (p.areas || []).find(x => x.id === areaId); const sis = data.sistemas[a?.sistemaId || p.sistema]; return (sis?.tareas || []).find(t => t.id === tareaId)?.nombre || '(paso)'; };
  const cantTxt = (r) => r.rollos != null ? `${Math.round(r.rollos * 10) / 10} rollos` : r.m2 != null ? `${Math.round(r.m2 * 10) / 10} m²` : '—';

  // --- Captura embebida ---
  if (capturaLev && capturaSite) {
    return <SurveySiteDetail site={capturaSite} proyecto={capturaLev} usuario={usuario} data={data} onVerEdificaciones={capturaSites.length > 1 ? () => setCapturaSite(null) : undefined} onVolver={cerrarCaptura} />;
  }
  if (capturaLev && !capturaSite) {
    return (
      <div className="space-y-4">
        <button onClick={cerrarCaptura} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
        <div><h1 className="text-2xl font-black tracking-tight">{capturaLev.client_name}</h1><div className="text-xs text-zinc-500 mt-1">Elige la edificación a levantar.</div></div>
        {capturaSites.length === 0 ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-6 text-center text-zinc-500 text-sm">Este levantamiento aún no tiene edificaciones registradas. Avisa al administrador.</div>
        ) : (
          <div className="space-y-2">
            {capturaSites.map(s => (
              <button key={s.id} onClick={() => setCapturaSite(s)} className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card p-3 hover:border-blue-600 flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="font-bold truncate">{s.name || s.external_code || 'Edificación'}</div>{s.address && <div className="text-[11px] text-zinc-500 truncate">{s.address}</div>}</div>
                <span className="text-[10px] text-blue-400 shrink-0">Abrir →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Home ---
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Hola, {usuario.nombre.split(' ')[0]}</div>
          <h1 className="text-2xl font-black tracking-tight">Tu día</h1>
        </div>
        <button onClick={refrescar} disabled={refrescando} className="flex-shrink-0 px-3 py-2 rounded-card text-xs font-bold uppercase flex items-center gap-1.5 border bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-blue-500 disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${refrescando ? 'animate-spin' : ''}`} /> {refrescando ? '…' : 'Refrescar'}
        </button>
      </div>

      {/* Clima (cerrable; reaparece al día siguiente desde las 7am) */}
      {climaVisible && <ClimaWidget cerrable onClose={cerrarClima} />}

      {/* v8.28.3: Mis pendientes de hoy — tareas diarias generadas solas por responsable */}
      <MisPendientes usuario={usuario} data={data} compact
        onIrAProyecto={(p, tab) => onVerProyecto?.(p, tab)}
        onIrAReportar={(p) => onIrAReportar?.(p)}
        onIrAVista={(v) => onIrAVista?.(v)} />

      {/* v8.28.2: Mi bono trimestral por KPIs — solo aparece si está configurado */}
      <MiBono usuario={usuario} data={data} />

      {/* v8.28.1: Jornadas de hoy — abrir/cerrar sin navegar a cada obra */}
      {proyOperables.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sun className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] tracking-widest uppercase text-amber-400 font-bold">Jornadas de hoy</span>
            <span className="text-[10px] text-zinc-500">({jornadasLoading ? '…' : proyOperables.length})</span>
          </div>
          {jornadasLoading ? (
            <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</div>
          ) : (
            <div className="space-y-2">
              {proyOperables.map(p => {
                const j = jornadas[p.id];
                const enCurso = !!(j?.horaInicio && !j?.horaFin);
                const cerrada = !!j?.horaFin;
                return (
                  <div key={p.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{p.cliente || p.nombre}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {cerrada ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-green-600/20 text-green-400">✓ Cerrada {horaCorta(j.horaFin)}</span>
                        ) : enCurso ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-red-600/20 text-red-400 animate-pulse">● En curso desde {horaCorta(j.horaInicio)}</span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-zinc-700/40 text-zinc-400">Sin abrir</span>
                        )}
                      </div>
                    </div>
                    {cerrada ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : enCurso ? (
                      <button onClick={() => onVerProyecto?.(p, 'asistencia')} className="flex-shrink-0 px-3 py-2.5 rounded-card bg-zinc-800 border border-zinc-700 hover:border-red-500 text-white text-xs font-black uppercase tracking-wide">
                        Cerrar →
                      </button>
                    ) : (
                      <button onClick={() => iniciarRapido(p)} disabled={iniciando === p.id} className="flex-shrink-0 px-3 py-2.5 rounded-card bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wide flex items-center gap-1.5">
                        {iniciando === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Iniciar
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="text-[10px] text-zinc-600">Al iniciar se marca la brigada completa; ajusta los presentes desde la obra (Asistencia → Jornada).</div>
            </div>
          )}
        </div>
      )}

      {/* Citas de hoy */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="text-[11px] tracking-widest uppercase text-blue-400 font-bold">Citas de hoy</span>
          <span className="text-[10px] text-zinc-500">({loading ? '…' : citasHoy.length})</span>
        </div>
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</div>
        ) : citasHoy.length === 0 ? (
          <div className="text-xs text-zinc-500">No tienes levantamientos agendados para hoy.</div>
        ) : (
          <div className="space-y-2">
            {citasHoy.map(l => {
              const contacto = contactoDe(l);
              const tipo = TIPO_CITA[l.tipo_cita];
              const esc = ESCALERA[l.requiere_escalera];
              const cuando = citaTextoHora(l);
              return (
                <div key={l.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{l.client_name || '(sin cliente)'}</div>
                    {l._dir && <div className="text-[11px] text-zinc-500 truncate">📍 {l._dir}</div>}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {cuando && <span className="text-[11px] text-white font-bold">🕐 {cuando}</span>}
                      {tipo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card" style={{ backgroundColor: tipo.color + '22', color: tipo.color }}>{tipo.icon} {tipo.short}</span>}
                      {esc && l.requiere_escalera !== 'no' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card" style={{ backgroundColor: esc.color + '22', color: esc.color }}>🪜{l.requiere_escalera === 'larga' ? ' larga' : ''}</span>}
                      {l.cita_confirmada
                        ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-green-600/20 text-green-400">✓ Confirmada</span>
                        : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-amber-600/20 text-amber-400">⏳ Por confirmar</span>}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{l.service_line || ''}{contacto ? ` · 👤 ${contacto}` : ''}</div>
                    {l._coords && <CitaRuta lat={l._coords.lat} lng={l._coords.lng} />}
                  </div>
                  <button onClick={() => abrirCaptura(l)} disabled={cargandoCaptura} className="flex-shrink-0 px-3 py-2.5 rounded-card bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wide flex items-center gap-1.5">
                    {cargandoCaptura ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Abrir
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cierre del día (después de las 5pm) */}
      {esTarde && proyEnEjec.length > 0 && (
        <div className="bg-zinc-900 border border-amber-800/40 rounded-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] tracking-widest uppercase text-amber-400 font-bold">Cierre del día</span>
          </div>

          <div className="text-[11px] uppercase font-bold text-amber-400 mb-1">⏳ Faltan por reportar ({cierre.faltan.length})</div>
          {cierre.faltan.length === 0 ? (
            <div className="text-xs text-green-400 mb-3">¡Todos los proyectos en ejecución reportaron hoy! 🎉</div>
          ) : (
            <div className="space-y-1 mb-3">
              {cierre.faltan.map(p => (
                <div key={p.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{p.cliente || p.nombre}</div>
                    <div className="text-[10px] font-mono text-zinc-500">{p.referenciaOdoo || ''}</div>
                  </div>
                  {onIrAReportar && <button onClick={() => onIrAReportar(p)} className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-3 py-2 rounded-card">Reportar</button>}
                </div>
              ))}
            </div>
          )}

          <div className="text-[11px] uppercase font-bold text-green-400 mb-1">✓ Ya reportado hoy ({cierre.hechos.length})</div>
          {cierre.hechos.length === 0 ? (
            <div className="text-xs text-zinc-500">Aún nadie ha reportado hoy.</div>
          ) : (
            <div className="space-y-2">
              {cierre.hechos.map(({ p, rs }) => (
                <div key={p.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
                  <div className="text-sm font-bold truncate">{p.cliente || p.nombre} <span className="text-[10px] text-zinc-500">· {rs.length} reporte{rs.length !== 1 ? 's' : ''}</span></div>
                  <div className="mt-1 space-y-0.5">
                    {rs.map((r, i) => (
                      <div key={i} className="text-[11px] text-zinc-400">📍 {nombreArea(p, r.areaId)} · {nombreTarea(p, r.areaId, r.tareaId)} · <span className="text-white">{cantTxt(r)}</span>{r.supervisor && <span className="text-zinc-600"> — {r.supervisor}</span>}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onIrAAsignaciones?.()} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center justify-between hover:border-blue-600">
          <span className="flex items-center gap-2 text-sm font-bold"><MapPin className="w-4 h-4 text-blue-400" /> Mis asignaciones</span>
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </button>
        <button onClick={() => onIrAProyectos?.()} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center justify-between hover:border-red-600">
          <span className="flex items-center gap-2 text-sm font-bold"><Briefcase className="w-4 h-4 text-red-400" /> Proyectos</span>
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </button>
      </div>
    </div>
  );
}
