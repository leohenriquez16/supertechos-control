'use client';

// v8.95.0 — COORDINACIÓN de levantamientos por campaña (Edwin y Leo).
// Una campaña = un proyecto de surveys con es_campana=true; cada oficina (surveys.sites) es un levantamiento.
// Pestañas: Oficinas (lista + mapa), Agenda (técnico × lun–sáb), Avance por zona, Atención, Por revisar.
// Reglas de negocio en lib/helpers/coordinacion.js (puro, con pruebas); escrituras en lib/surveys.js.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, RefreshCw, Navigation, ChevronLeft, ChevronRight, Users, Search, Loader2, Eye, Check, Undo2, CalendarClock } from 'lucide-react';
import { obtenerCampanas, listarSitesCampana, validarOficina, devolverOficina } from '../../lib/surveys';
import {
  ESTADO_OFICINA, estadoOficina, levantada, FRANJAS, hoyRD, sumarDias, lunesDe, diaCorto,
  avancePorZona, agendaSemana, bandejaAtencion, totalAtencion, coincideBusqueda, labelNoPudo, colorTecnico,
} from '../../lib/helpers/coordinacion';
import BarraAsignar from './BarraAsignar';
import ModalRevision from './ModalRevision';

const MapaCoordinacion = dynamic(() => import('./MapaCoordinacion'), {
  ssr: false, loading: () => <div className="h-[520px] grid place-items-center text-zinc-500 text-xs">Cargando mapa…</div>,
});

// Preferencias del navegador (filtros y equipo). Si el almacenamiento falla, la pantalla funciona igual.
const LS_FILTROS = 'coord_filtros_v1';
const LS_OCULTOS = 'coord_equipo_ocultos_v1';
const leerLS = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const FILTROS_VACIOS = { zona: '', provincia: '', estado: '', tecnico: '', q: '' };

const Pill = ({ site }) => {
  const e = ESTADO_OFICINA[estadoOficina(site)];
  if (!e) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap" style={{ background: e.color + '26', color: e.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.color }} />{e.label}
    </span>
  );
};
const cuando = (s) => s.visita_fecha ? `${diaCorto(s.visita_fecha)}${s.visita_franja ? ' · ' + FRANJAS[s.visita_franja] : ''}` : '';
const fechaCorta = (iso) => { try { return new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }); } catch { return ''; } };

export default function PantallaCoordinacion({ usuario, data, onVolver }) {
  const [campanas, setCampanas] = useState(null);
  const [campanaId, setCampanaId] = useState('');
  const [sites, setSites] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('oficinas');
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [ocultos, setOcultos] = useState([]);
  const [equipoAbierto, setEquipoAbierto] = useState(false);
  const [colorPor, setColorPor] = useState('estado');
  const [lunes, setLunes] = useState(() => lunesDe(hoyRD()));
  const [revisando, setRevisando] = useState(null); // site
  const [preset, setPreset] = useState(null); // abre el modal de asignar desde afuera
  const [devolverSite, setDevolverSite] = useState(null);
  const [notaDev, setNotaDev] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const hoy = hoyRD();

  useEffect(() => { setFiltros({ ...FILTROS_VACIOS, ...leerLS(LS_FILTROS, {}) }); setOcultos(leerLS(LS_OCULTOS, [])); }, []);
  const cambiarFiltro = (k, v) => setFiltros((f) => { const n = { ...f, [k]: v }; guardarLS(LS_FILTROS, n); return n; });
  const limpiarFiltros = () => { setFiltros(FILTROS_VACIOS); guardarLS(LS_FILTROS, FILTROS_VACIOS); };

  // ── Carga ──
  const cargarSites = useCallback(async (id) => {
    if (!id) return;
    setCargando(true); setError('');
    try {
      const lista = await listarSitesCampana(id);
      setSites(lista);
      const vivos = new Set(lista.map((s) => s.id));
      setSeleccion((sel) => new Set([...sel].filter((x) => vivos.has(x))));
      setRevisando((r) => (r ? lista.find((s) => s.id === r.id) || null : null));
    } catch (e) { setError(e?.message || String(e)); }
    setCargando(false);
  }, []);
  useEffect(() => {
    (async () => {
      const cs = await obtenerCampanas();
      setCampanas(cs);
      if (cs.length) setCampanaId(cs[0].id); else setCargando(false);
    })();
  }, []);
  useEffect(() => { if (campanaId) cargarSites(campanaId); }, [campanaId, cargarSites]);
  const recargar = useCallback(() => cargarSites(campanaId), [campanaId, cargarSites]);
  const proyecto = useMemo(() => (campanas || []).find((c) => c.id === campanaId) || null, [campanas, campanaId]);

  // ── Equipo de técnicos (personal habilitado para levantar, menos los que Edwin quitó) ──
  const habilitados = useMemo(() => (data?.personal || []).filter((p) => p.levantamientoHabilitado && !p.archivado)
    .map((p) => ({ id: p.id, nombre: p.nombre })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))), [data?.personal]);
  const tecnicos = useMemo(() => habilitados.filter((t) => !ocultos.includes(t.id)), [habilitados, ocultos]);
  const toggleOculto = (id) => setOcultos((o) => { const n = o.includes(id) ? o.filter((x) => x !== id) : [...o, id]; guardarLS(LS_OCULTOS, n); return n; });

  // ── Filtros ──
  const zonas = useMemo(() => [...new Set(sites.map((s) => s.zona || 'Sin zona'))].sort(), [sites]);
  const provincias = useMemo(() => [...new Set(sites.map((s) => s.province).filter(Boolean))].sort(), [sites]);
  const tecnicosFiltro = useMemo(() => {
    const m = new Map(tecnicos.map((t) => [t.id, t.nombre]));
    sites.forEach((s) => { if (s.asignado_a_id && !m.has(s.asignado_a_id)) m.set(s.asignado_a_id, s.asignado_a_nombre || s.asignado_a_id); });
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  }, [tecnicos, sites]);
  const filtradas = useMemo(() => sites.filter((s) => {
    if (filtros.zona && (s.zona || 'Sin zona') !== filtros.zona) return false;
    if (filtros.provincia && s.province !== filtros.provincia) return false;
    if (filtros.estado && estadoOficina(s) !== filtros.estado) return false;
    if (filtros.tecnico === '__sin' && s.asignado_a_id) return false;
    if (filtros.tecnico && filtros.tecnico !== '__sin' && s.asignado_a_id !== filtros.tecnico) return false;
    return coincideBusqueda(s, filtros.q);
  }), [sites, filtros]);
  const visiblesIds = useMemo(() => new Set(filtradas.map((s) => s.id)), [filtradas]);
  const hayFiltro = Object.values(filtros).some(Boolean);
  const fitKey = `${filtros.zona}|${filtros.provincia}|${filtros.estado}|${filtros.tecnico}`;

  // ── Selección ──
  const toggle = useCallback((id) => setSeleccion((sel) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const agregarVarias = useCallback((ids) => setSeleccion((sel) => new Set([...sel, ...ids])), []);
  const seleccionadas = useMemo(() => sites.filter((s) => seleccion.has(s.id)), [sites, seleccion]);
  const todasVisiblesSel = filtradas.length > 0 && filtradas.every((s) => seleccion.has(s.id));
  const toggleVisibles = () => setSeleccion((sel) => {
    const n = new Set(sel);
    if (todasVisiblesSel) filtradas.forEach((s) => n.delete(s.id)); else filtradas.forEach((s) => n.add(s.id));
    return n;
  });

  // ── Derivados ──
  const resumen = useMemo(() => {
    const r = { total: sites.length, sinAsignar: 0, hoy: 0, levantadas: 0, porRevisar: 0, validadas: 0 };
    sites.forEach((s) => {
      const e = estadoOficina(s);
      if (e === 'sin_asignar') r.sinAsignar++;
      if (s.visita_fecha === hoy && !levantada(s)) r.hoy++;
      if (levantada(s)) r.levantadas++;
      if (e === 'por_revisar') r.porRevisar++;
      if (e === 'validada') r.validadas++;
    });
    r.pct = r.total ? Math.round((r.validadas / r.total) * 100) : 0;
    return r;
  }, [sites, hoy]);
  const avance = useMemo(() => avancePorZona(sites), [sites]);
  const agenda = useMemo(() => agendaSemana(sites, tecnicos, lunes), [sites, tecnicos, lunes]);
  const bandeja = useMemo(() => bandejaAtencion(sites, hoy), [sites, hoy]);
  const nAtencion = totalAtencion(bandeja);
  const porRevisar = useMemo(() => sites.filter((s) => s.survey_status === 'completed')
    .sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || ''))), [sites]);

  // ── Acciones ──
  const reprogramar = (s) => { setSeleccion(new Set([s.id])); setPreset({ personaId: s.asignado_a_id || '', fecha: s.visita_fecha || hoy, franja: s.visita_franja || 'manana', t: Date.now() }); };
  const programarEnCelda = (tecnicoId, fecha, franja) => {
    if (!seleccion.size) return;
    setPreset({ personaId: tecnicoId, fecha, franja, t: Date.now() });
  };
  const validarRapido = async (s) => {
    if (!confirm(`¿Validar «${s.name}»?`)) return;
    setOcupado(true);
    try { await validarOficina(s.id, usuario?.nombre || null); await recargar(); }
    catch (e) { alert('No se pudo validar: ' + (e?.message || e)); }
    setOcupado(false);
  };
  const devolverRapido = async () => {
    if (!notaDev.trim()) return alert('Escribe qué hay que corregir.');
    setOcupado(true);
    try { await devolverOficina(devolverSite.id, usuario?.nombre || null, notaDev.trim()); setDevolverSite(null); setNotaDev(''); await recargar(); }
    catch (e) { alert('No se pudo devolver: ' + (e?.message || e)); }
    setOcupado(false);
  };

  // ── Sin campaña ──
  if (campanas && !campanas.length) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <Encabezado onVolver={onVolver} />
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-6 text-center">
          <Navigation className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <div className="text-white font-bold">Todavía no hay una campaña cargada.</div>
          <div className="text-sm text-zinc-400 mt-1">Pídele a Leo que cargue las oficinas.</div>
        </div>
      </div>
    );
  }

  const TABS = [
    ['oficinas', 'Oficinas'],
    ['agenda', 'Agenda'],
    ['zonas', 'Avance por zona'],
    ['atencion', `Atención${nAtencion ? ` (${nAtencion})` : ''}`],
    ['revisar', `Por revisar${porRevisar.length ? ` (${porRevisar.length})` : ''}`],
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 pb-28">
      <Encabezado onVolver={onVolver} cargando={cargando} onRecargar={recargar} subtitulo={proyecto?.name}>
        {campanas && campanas.length > 1 && (
          <select value={campanaId} onChange={(e) => { setSeleccion(new Set()); setCampanaId(e.target.value); }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm">
            {campanas.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
          </select>
        )}
      </Encabezado>

      {error && <div className="bg-red-950/40 border border-red-800 rounded-card px-3 py-2 text-sm text-red-300">No se pudieron cargar las oficinas: {error}</div>}

      {/* Resumen */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
        <Kpi n={resumen.total} label="Oficinas" color="text-white" />
        <Kpi n={resumen.sinAsignar} label="Sin asignar" color="text-zinc-300" onClick={() => { cambiarFiltro('estado', 'sin_asignar'); setTab('oficinas'); }} />
        <Kpi n={resumen.hoy} label="Programadas hoy" color="text-blue-400" />
        <Kpi n={resumen.levantadas} label="Levantadas" color="text-green-400" />
        <Kpi n={resumen.porRevisar} label="Por revisar" color="text-emerald-300" onClick={() => setTab('revisar')} />
        <Kpi n={resumen.validadas} label="Validadas" color="text-purple-400" />
        <Kpi n={`${resumen.pct}%`} label="Validado" color="text-red-400" />
      </div>

      {/* Pestañas + equipo */}
      <div className="flex flex-wrap items-end gap-2 border-b border-zinc-800">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 md:px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-red-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>{lbl}</button>
          ))}
        </div>
        <div className="relative ml-auto pb-1.5">
          <button onClick={() => setEquipoAbierto((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500">
            <Users className="w-3.5 h-3.5" /> Equipo ({tecnicos.length}/{habilitados.length})
          </button>
          {equipoAbierto && (
            <div className="absolute right-0 mt-1 z-30 w-64 bg-zinc-950 border border-zinc-700 rounded-card shadow-2xl p-2 max-h-80 overflow-y-auto">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold px-1 pb-1">Técnicos de la campaña</div>
              {habilitados.length === 0 && <div className="text-xs text-zinc-500 px-1 py-2">No hay personal habilitado para levantar.</div>}
              {habilitados.map((t) => (
                <label key={t.id} className="flex items-center gap-2 px-1 py-1.5 text-sm cursor-pointer hover:bg-zinc-900 rounded">
                  <input type="checkbox" checked={!ocultos.includes(t.id)} onChange={() => toggleOculto(t.id)} className="w-4 h-4 accent-red-600" />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorTecnico(t.id, tecnicos) }} />
                  {t.nombre}
                </label>
              ))}
              <button onClick={() => setEquipoAbierto(false)} className="w-full mt-1 py-1.5 text-xs text-zinc-400 hover:text-white">Listo</button>
            </div>
          )}
        </div>
      </div>

      {cargando && !sites.length ? (
        <div className="py-16 grid place-items-center text-zinc-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {/* ── OFICINAS ── */}
          {tab === 'oficinas' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={filtros.q} onChange={(e) => cambiarFiltro('q', e.target.value)} placeholder="Buscar código, nombre, dirección…"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm" />
                </div>
                <Sel value={filtros.zona} onChange={(v) => cambiarFiltro('zona', v)} todos="Todas las zonas" opciones={zonas.map((z) => [z, z])} />
                <Sel value={filtros.provincia} onChange={(v) => cambiarFiltro('provincia', v)} todos="Todas las provincias" opciones={provincias.map((p) => [p, p])} />
                <Sel value={filtros.estado} onChange={(v) => cambiarFiltro('estado', v)} todos="Todos los estados"
                  opciones={Object.entries(ESTADO_OFICINA).sort((a, b) => a[1].orden - b[1].orden).map(([k, v]) => [k, v.label])} />
                <Sel value={filtros.tecnico} onChange={(v) => cambiarFiltro('tecnico', v)} todos="Todos los técnicos"
                  opciones={[['__sin', 'Sin técnico'], ...tecnicosFiltro.map((t) => [t.id, t.nombre])]} />
                {hayFiltro && <button onClick={limpiarFiltros} className="text-xs text-zinc-400 hover:text-white underline">Quitar filtros</button>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Lista */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-card overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input type="checkbox" checked={todasVisiblesSel} onChange={toggleVisibles} className="w-4 h-4 accent-red-600" />
                      Seleccionar visibles ({filtradas.length})
                    </label>
                    <span className="ml-auto text-[11px] text-zinc-500">{filtradas.length} de {sites.length}</span>
                  </div>
                  <div className="overflow-y-auto max-h-[560px] divide-y divide-zinc-900">
                    {filtradas.length === 0 && <div className="p-6 text-center text-sm text-zinc-500">Ninguna oficina con esos filtros.</div>}
                    {filtradas.map((s) => (
                      <div key={s.id} className={`flex items-center gap-2 px-3 py-2 ${seleccion.has(s.id) ? 'bg-red-950/30' : 'hover:bg-zinc-900/60'}`}>
                        <input type="checkbox" checked={seleccion.has(s.id)} onChange={() => toggle(s.id)} className="w-5 h-5 accent-red-600 shrink-0" />
                        <button onClick={() => toggle(s.id)} className="min-w-0 flex-1 text-left">
                          <div className="text-sm text-white truncate"><span className="text-zinc-500 font-mono text-xs mr-1">{s.external_code}</span>{s.name}</div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            {[s.zona, s.province].filter(Boolean).join(' · ')}
                            {s.asignado_a_nombre ? ` · ${s.asignado_a_nombre}` : ''}{s.visita_fecha ? ` · ${cuando(s)}` : ''}
                          </div>
                        </button>
                        <Pill site={s} />
                        <button onClick={() => setRevisando(s)} title="Ver ficha" className="p-1.5 text-zinc-500 hover:text-white"><Eye className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Mapa */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Color por</span>
                    {[['estado', 'Estado'], ['tecnico', 'Técnico']].map(([k, lbl]) => (
                      <button key={k} onClick={() => setColorPor(k)}
                        className={`px-2.5 py-1 rounded-lg border font-bold ${colorPor === k ? 'bg-zinc-800 border-zinc-500 text-white' : 'border-zinc-800 text-zinc-500'}`}>{lbl}</button>
                    ))}
                  </div>
                  <MapaCoordinacion sites={sites} visibles={hayFiltro ? visiblesIds : null} seleccion={seleccion} colorPor={colorPor}
                    tecnicos={tecnicos} fitKey={fitKey} onToggle={toggle} onSeleccionarVarias={agregarVarias} />
                </div>
              </div>
            </div>
          )}

          {/* ── AGENDA ── */}
          {tab === 'agenda' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setLunes((l) => sumarDias(l, -7))} className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-zinc-500"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setLunes(lunesDe(hoy))} className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-bold hover:border-zinc-500">Esta semana</button>
                <button onClick={() => setLunes((l) => sumarDias(l, 7))} className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-zinc-500"><ChevronRight className="w-4 h-4" /></button>
                <span className="text-sm font-bold text-white ml-1">Semana del {diaCorto(lunes)}</span>
                <span className="text-[11px] text-zinc-500 ml-auto hidden md:inline">
                  {seleccion.size ? `Toca una franja para programar las ${seleccion.size} seleccionadas ahí.` : 'Toca una oficina para seleccionarla.'}
                </span>
              </div>
              {seleccion.size > 0 && <div className="md:hidden text-[11px] text-amber-300">Toca una franja para programar las {seleccion.size} seleccionadas ahí.</div>}
              <div className="overflow-x-auto bg-zinc-950 border border-zinc-800 rounded-card">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider text-zinc-500 w-36">Técnico</th>
                      {agenda.dias.map((f) => (
                        <th key={f} className={`px-1 py-2 text-[11px] uppercase tracking-wider ${f === hoy ? 'text-red-400' : 'text-zinc-500'}`}>{diaCorto(f)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agenda.filas.length === 0 && (
                      <tr><td colSpan={7} className="p-6 text-center text-zinc-500">No hay técnicos en el equipo. Agrégalos en «Equipo».</td></tr>
                    )}
                    {agenda.filas.map((fila) => (
                      <tr key={fila.tecnico.id} className="border-b border-zinc-900 align-top">
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorTecnico(fila.tecnico.id, tecnicos) }} />{fila.tecnico.nombre}
                          </div>
                          <div className="text-[10px] text-zinc-500">{fila.dias.reduce((n, d) => n + d.manana.length + d.tarde.length, 0)} en la semana</div>
                        </td>
                        {fila.dias.map((d) => (
                          <td key={d.fecha} className={`px-1 py-1 ${d.fecha === hoy ? 'bg-red-950/10' : ''}`}>
                            {['manana', 'tarde'].map((fr) => (
                              <div key={fr} onClick={() => programarEnCelda(fila.tecnico.id, d.fecha, fr)}
                                className={`min-h-[40px] rounded p-1 mb-1 border ${seleccion.size ? 'border-dashed border-zinc-600 cursor-pointer hover:border-red-500 hover:bg-red-950/20' : 'border-zinc-900'}`}>
                                <div className="text-[9px] uppercase text-zinc-600 font-bold">{FRANJAS[fr]}</div>
                                <div className="flex flex-wrap gap-0.5">
                                  {d[fr].map((s) => (
                                    <button key={s.id} title={`${s.name} · ${ESTADO_OFICINA[estadoOficina(s)]?.label || ''}`}
                                      onClick={(e) => { e.stopPropagation(); toggle(s.id); }}
                                      className={`px-1 py-0.5 rounded text-[10px] font-mono border ${seleccion.has(s.id) ? 'border-white text-white' : 'border-transparent text-zinc-200'}`}
                                      style={{ background: (ESTADO_OFICINA[estadoOficina(s)]?.color || '#71717a') + '40' }}>
                                      {s.external_code || s.name.slice(0, 8)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── AVANCE POR ZONA ── */}
          {tab === 'zonas' && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-card overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                    <th className="text-left px-3 py-2">Zona</th><th className="px-2">Oficinas</th><th className="px-2">Asignadas</th>
                    <th className="px-2">Levantadas</th><th className="px-2">Validadas</th><th className="px-2">Falta info</th><th className="px-3 text-left w-1/4">Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {[...avance.zonas, avance.total].map((z) => {
                    const esTotal = z === avance.total;
                    return (
                      <tr key={z.zona} onClick={esTotal ? undefined : () => { cambiarFiltro('zona', z.zona); setTab('oficinas'); }}
                        className={`border-b border-zinc-900 ${esTotal ? 'font-black bg-zinc-900/60' : 'cursor-pointer hover:bg-zinc-900/60'}`}>
                        <td className="px-3 py-2 text-white">{z.zona}</td>
                        <td className="text-center">{z.total}</td>
                        <td className="text-center text-zinc-300">{z.asignadas}</td>
                        <td className="text-center text-green-400">{z.levantadas}</td>
                        <td className="text-center text-purple-400">{z.validadas}</td>
                        <td className={`text-center ${z.faltaInfo ? 'text-red-400' : 'text-zinc-600'}`}>{z.faltaInfo}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-red-600" style={{ width: `${z.pct}%` }} /></div>
                            <span className="text-xs text-zinc-300 w-9 text-right">{z.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-3 py-2 text-[11px] text-zinc-500">Avance = levantadas (por revisar + validadas) sobre el total. Toca una zona para ver sus oficinas.</div>
            </div>
          )}

          {/* ── ATENCIÓN ── */}
          {tab === 'atencion' && (
            <div className="space-y-3">
              {nAtencion === 0 && <div className="bg-zinc-950 border border-zinc-800 rounded-card p-6 text-center text-sm text-zinc-400">Nada pendiente de atención.</div>}
              <SeccionAtencion titulo="Atrasadas" ayuda="El día ya pasó y no se ha levantado." lista={bandeja.atrasadas} color="text-red-400"
                onReprogramar={reprogramar} onVer={setRevisando} />
              <SeccionAtencion titulo="No se pudo" ayuda="El técnico no pudo levantar. Hay que reprogramar." lista={bandeja.noPudo} color="text-orange-400"
                onReprogramar={reprogramar} onVer={setRevisando}
                detalle={(s) => [labelNoPudo(s.no_pudo_motivo), s.no_pudo_nota].filter(Boolean).join(' — ')} />
              <SeccionAtencion titulo="Falta info" ayuda="Se cerró con jardín o techo pendiente." lista={bandeja.faltaInfo} color="text-red-400"
                onReprogramar={reprogramar} onVer={setRevisando} />
              <SeccionAtencion titulo="Devueltas sin corregir" lista={bandeja.devueltas} color="text-pink-400"
                onReprogramar={reprogramar} onVer={setRevisando} detalle={(s) => s.devuelto_nota} />
              <SeccionAtencion titulo="Sin ubicación" ayuda="No salen en el mapa. Corrige la ubicación desde la ficha." lista={bandeja.sinUbicacion} color="text-zinc-300"
                onReprogramar={reprogramar} onVer={setRevisando} />
            </div>
          )}

          {/* ── POR REVISAR ── */}
          {tab === 'revisar' && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-card divide-y divide-zinc-900">
              {porRevisar.length === 0 && <div className="p-6 text-center text-sm text-zinc-400">No hay oficinas por revisar.</div>}
              {porRevisar.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate"><span className="text-zinc-500 font-mono text-xs mr-1">{s.external_code}</span>{s.name}</div>
                    <div className="text-[11px] text-zinc-500">
                      {s.asignado_a_nombre || 'Sin técnico'}{s.zona ? ` · ${s.zona}` : ''}{s.updated_at ? ` · cerrada el ${fechaCorta(s.updated_at)}` : ''}
                    </div>
                  </div>
                  <button onClick={() => setRevisando(s)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-bold"><Eye className="w-4 h-4" /> Ver</button>
                  <button onClick={() => { setDevolverSite(s); setNotaDev(''); }} disabled={ocupado} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-pink-300 text-sm font-bold disabled:opacity-50"><Undo2 className="w-4 h-4" /> Devolver</button>
                  <button onClick={() => validarRapido(s)} disabled={ocupado} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold disabled:opacity-50"><Check className="w-4 h-4" /> Validar</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <BarraAsignar seleccionadas={seleccionadas} todas={sites} tecnicos={tecnicos} usuario={usuario} preset={preset}
        onHecho={recargar} onLimpiar={() => setSeleccion(new Set())} />

      {revisando && (
        <ModalRevision site={revisando} proyecto={proyecto} usuario={usuario} data={data}
          onCerrar={() => { setRevisando(null); recargar(); }} />
      )}

      {devolverSite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-3" onClick={() => !ocupado && setDevolverSite(null)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-card w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black">Devolver «{devolverSite.name}»</h3>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">¿Qué hay que corregir?</div>
            <textarea value={notaDev} onChange={(e) => setNotaDev(e.target.value)} rows={4} autoFocus
              placeholder="Ej.: falta la foto de la fachada y medir el muro del parqueo."
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setDevolverSite(null)} className="flex-1 py-3 rounded-lg bg-zinc-800 text-zinc-300 font-bold">Cancelar</button>
              <button onClick={devolverRapido} disabled={ocupado || !notaDev.trim()}
                className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black disabled:opacity-50 flex items-center justify-center gap-2">
                {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Devolver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Encabezado({ onVolver, cargando, onRecargar, subtitulo, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2"><CalendarClock className="w-6 h-6 text-red-500" /> Coordinación</h1>
          <div className="text-[11px] text-zinc-500">{subtitulo || 'Levantamientos por campaña: asignar, programar y revisar'}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onRecargar && <button onClick={onRecargar} title="Recargar" className="p-2 text-zinc-500 hover:text-white"><RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /></button>}
      </div>
    </div>
  );
}

function Kpi({ n, label, color, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`bg-zinc-950 border border-zinc-800 rounded-card px-3 py-2 text-left ${onClick ? 'hover:border-zinc-600' : ''}`}>
      <div className={`text-2xl font-black ${color}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
    </Tag>
  );
}

function Sel({ value, onChange, todos, opciones }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`bg-zinc-900 border rounded-lg px-2 py-2 text-sm max-w-[180px] ${value ? 'border-red-600 text-white' : 'border-zinc-700 text-zinc-300'}`}>
      <option value="">{todos}</option>
      {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function SeccionAtencion({ titulo, ayuda, lista, color, onReprogramar, onVer, detalle }) {
  if (!lista.length) return null;
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-card">
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className={`text-sm font-black ${color}`}>{titulo} ({lista.length})</div>
        {ayuda && <div className="text-[11px] text-zinc-500">{ayuda}</div>}
      </div>
      <div className="divide-y divide-zinc-900">
        {lista.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white truncate"><span className="text-zinc-500 font-mono text-xs mr-1">{s.external_code}</span>{s.name}</div>
              <div className="text-[11px] text-zinc-500 truncate">
                {s.asignado_a_nombre || 'Sin técnico'}{s.visita_fecha ? ` · ${cuando(s)}` : ''}{s.zona ? ` · ${s.zona}` : ''}
              </div>
              {detalle && detalle(s) && <div className="text-xs text-zinc-300 mt-0.5">{detalle(s)}</div>}
            </div>
            <Pill site={s} />
            <button onClick={() => onReprogramar(s)} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold">Reprogramar</button>
            <button onClick={() => onVer(s)} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold">Ver</button>
          </div>
        ))}
      </div>
    </div>
  );
}
