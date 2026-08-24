'use client';

// v8.33.1: Tareas estilo task manager (Asana): secciones por vencimiento
// (Vencidas / Hoy / Esta semana / Más adelante / Sin fecha) colapsables,
// buscador, filtros Me tocan / Superviso / Todas (+ por persona para admin),
// filas limpias con acciones al hover, delegación y fechas inline.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Loader2, X, Save, Trash2, Search, ChevronDown, ChevronRight, CircleCheck, CircleDashed } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';
import Campo from '../common/Campo';
import Input from '../common/Input';

const tieneRol = (p, r) => p?.roles?.includes(r);
const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const addDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const PRIORIDADES = { alta: { label: '🔥 Alta', orden: 0, chip: 'bg-red-600/20 text-red-400 border-red-800' }, normal: { label: 'Normal', orden: 1, chip: '' }, baja: { label: '▽ Baja', orden: 2, chip: 'bg-zinc-800 text-zinc-500 border-zinc-700' } };

const SECCIONES = [
  { key: 'vencidas', label: '🔴 Vencidas', color: 'text-red-400' },
  { key: 'hoy', label: '🟠 Para hoy', color: 'text-amber-400' },
  { key: 'semana', label: '🔵 Esta semana', color: 'text-blue-400' },
  { key: 'luego', label: '⚪ Más adelante', color: 'text-zinc-400' },
  { key: 'sinFecha', label: '◽ Sin fecha', color: 'text-zinc-500' },
];

export default function VistaTareas({ usuario, data, onVolver, onCompletarTarea, onCrearTarea, onEliminarTarea }) {
  const esAdmin = tieneRol(usuario, 'admin');
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false);
  const [crearModal, setCrearModal] = useState(false);
  const [delegando, setDelegando] = useState(null);
  const [detalle, setDetalle] = useState(null); // v8.33.2: tarea abierta en detalle (comentarios)
  const [filtro, setFiltro] = useState('mias');       // mias | superviso | todas
  const [busca, setBusca] = useState('');
  const [personaFiltro, setPersonaFiltro] = useState(''); // admin: filtrar por responsable
  const [colapsadas, setColapsadas] = useState({});

  const recargar = async () => {
    setLoading(true);
    try {
      const t = await db.listarTareas({ completadas: mostrarCompletadas });
      setTareas(esAdmin ? t : t.filter(x => x.asignadaAId === usuario.id || x.supervisorId === usuario.id));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [mostrarCompletadas]);

  const hoy = hoyRD();
  const finSemana = addDias(hoy, 7 - ((new Date(hoy + 'T12:00:00').getDay() + 6) % 7) - 1); // domingo de esta semana

  const visibles = useMemo(() => {
    let v = tareas;
    if (filtro === 'mias') v = v.filter(t => t.asignadaAId === usuario.id);
    else if (filtro === 'superviso') v = v.filter(t => t.supervisorId === usuario.id);
    if (personaFiltro) v = v.filter(t => t.asignadaAId === personaFiltro);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      v = v.filter(t => `${t.titulo} ${t.descripcion || ''} ${t.asignadaANombre || ''}`.toLowerCase().includes(q));
    }
    return v;
  }, [tareas, filtro, personaFiltro, busca, usuario.id]);

  const porSeccion = useMemo(() => {
    const m = { vencidas: [], hoy: [], semana: [], luego: [], sinFecha: [] };
    visibles.forEach(t => {
      const f = (t.fechaLimite || '').slice(0, 10);
      if (!f) m.sinFecha.push(t);
      else if (f < hoy) m.vencidas.push(t);
      else if (f === hoy) m.hoy.push(t);
      else if (f <= finSemana) m.semana.push(t);
      else m.luego.push(t);
    });
    Object.values(m).forEach(arr => arr.sort((a, b) => ((PRIORIDADES[a.prioridad]?.orden ?? 1) - (PRIORIDADES[b.prioridad]?.orden ?? 1)) || (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999')));
    return m;
  }, [visibles, hoy, finSemana]);

  const responsablesConTareas = useMemo(() => {
    const ids = [...new Set(tareas.map(t => t.asignadaAId).filter(Boolean))];
    return ids.map(id => (data.personal || []).find(p => p.id === id)).filter(Boolean)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [tareas, data.personal]);

  const completar = async (id) => { await onCompletarTarea(id); await recargar(); };
  const eliminar = async (id) => { if (confirm('¿Eliminar tarea?')) { await onEliminarTarea(id); await recargar(); } };
  const cambiarFecha = async (t) => {
    const f = prompt('Nueva fecha límite (YYYY-MM-DD, vacío = sin fecha):', t.fechaLimite || '');
    if (f === null) return;
    await db.actualizarTarea(t.id, { fechaLimite: f || null });
    await recargar();
  };
  // v8.33.2: "inbox" — aviso por correo cuando te asignan o delegan una tarea.
  const avisarAsignacion = (personaId, titulo, quien, fecha) => {
    try {
      const p = (data.personal || []).find(x => x.id === personaId);
      if (!p?.email || !p.email.includes('@')) return;
      db.enviarCorreoReporte([p.email], `📌 Nueva tarea para ti: ${titulo}`,
        `<div style="font-family:Arial,sans-serif;max-width:520px"><h3 style="color:#D71920">📌 ${titulo}</h3><p style="font-size:13px">${quien} te asignó esta tarea${fecha ? ` con fecha límite <b>${fecha}</b>` : ''}. La ves en el ERP → Tareas → "Me tocan".</p><p style="font-size:12px;color:#666">— ERP Super Techos</p></div>`);
    } catch (e) { /* no bloquear */ }
  };

  const delegar = async (tarea, nuevaPersonaId, nuevaFecha) => {
    const p = (data.personal || []).find(x => x.id === nuevaPersonaId);
    if (!p) return;
    avisarAsignacion(p.id, tarea.titulo, usuario.nombre, nuevaFecha);
    await db.actualizarTarea(tarea.id, {
      asignadaAId: p.id, asignadaANombre: p.nombre,
      ...(tarea.supervisorId ? {} : { supervisorId: usuario.id, supervisorNombre: usuario.nombre }),
      ...(nuevaFecha !== undefined ? { fechaLimite: nuevaFecha } : {}),
    });
    setDelegando(null);
    await recargar();
  };

  const FilaTarea = ({ t }) => {
    const proy = (data.proyectos || []).find(p => p.id === t.proyectoId);
    const vencida = t.fechaLimite && t.fechaLimite.slice(0, 10) < hoy && !t.completada;
    const puedeGestionar = !t.completada && (t.asignadaAId === usuario.id || t.supervisorId === usuario.id || esAdmin);
    return (
      <div className={`group flex items-center gap-2.5 px-3 py-2 rounded-card border bg-zinc-900 hover:bg-zinc-800/70 ${vencida ? 'border-red-900/60' : 'border-zinc-800'} ${t.completada ? 'opacity-60' : ''}`}>
        <button onClick={() => !t.completada && completar(t.id)} disabled={t.completada} className="shrink-0" title="Completar">
          {t.completada ? <CircleCheck className="w-5 h-5 text-green-500" /> : <CircleDashed className="w-5 h-5 text-zinc-600 hover:text-green-400" />}
        </button>
        <button onClick={() => setDetalle(t)} className="min-w-0 flex-1 text-left">
          <div className={`text-sm font-semibold truncate ${t.completada ? 'line-through text-zinc-500' : ''}`} title={t.descripcion || t.titulo}>
            {t.prioridad === 'alta' && <span className="mr-1">🔥</span>}{t.titulo}
            {(t.comentarios || []).length > 0 && <span className="ml-1.5 text-[10px] text-zinc-500">💬 {t.comentarios.length}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-zinc-500 mt-0.5">
            {proy && <span className="bg-zinc-950 border border-zinc-800 rounded-full px-1.5 py-0.5 truncate max-w-[160px]">📋 {proy.referenciaOdoo || proy.cliente}</span>}
            {t.asignadaANombre && <span className={t.asignadaAId === usuario.id ? 'text-blue-400 font-bold' : ''}>👤 {t.asignadaANombre.split(' ').slice(0, 2).join(' ')}</span>}
            {t.supervisorNombre && <span>👁 {t.supervisorNombre.split(' ')[0]}</span>}
          </div>
        </button>
        {t.fechaLimite && (
          <button onClick={() => puedeGestionar && cambiarFecha(t)}
            className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${vencida ? 'bg-red-900/40 border-red-700 text-red-300' : t.fechaLimite.slice(0, 10) === hoy ? 'bg-amber-900/40 border-amber-700 text-amber-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>
            {formatFechaCorta(t.fechaLimite)}
          </button>
        )}
        {puedeGestionar && (
          <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setDelegando(t)} title="Delegar" className="p-1.5 rounded-card border border-zinc-700 hover:border-blue-500 text-zinc-400 hover:text-blue-400 text-[10px] font-black">↪</button>
            {!t.fechaLimite && <button onClick={() => cambiarFecha(t)} title="Poner fecha" className="p-1.5 rounded-card border border-zinc-700 hover:border-amber-500 text-zinc-400 hover:text-amber-400 text-[10px] font-black">📅</button>}
            {esAdmin && <button onClick={() => eliminar(t.id)} title="Eliminar" className="p-1.5 rounded-card border border-zinc-700 hover:border-red-500 text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h1 className="text-3xl font-black tracking-tight">Tareas</h1>
        {esAdmin && <button onClick={() => setCrearModal(true)} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase px-4 py-2 text-xs flex items-center gap-1 rounded-card"><Plus className="w-3 h-3" /> Nueva</button>}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setFiltro('mias')} className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-card border ${filtro === 'mias' ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>👤 Me tocan ({tareas.filter(t => t.asignadaAId === usuario.id).length})</button>
        <button onClick={() => setFiltro('superviso')} className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-card border ${filtro === 'superviso' ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>👁 Superviso ({tareas.filter(t => t.supervisorId === usuario.id).length})</button>
        {esAdmin && <button onClick={() => setFiltro('todas')} className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-card border ${filtro === 'todas' ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Todas ({tareas.length})</button>}
        <button onClick={() => setMostrarCompletadas(!mostrarCompletadas)} className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-card border ml-auto ${mostrarCompletadas ? 'bg-green-700 border-green-700 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>✓ Completadas</button>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar tarea…" className="flex-1 bg-transparent outline-none text-sm min-w-0" />
          {busca && <button onClick={() => setBusca('')} className="text-zinc-600 hover:text-white"><X className="w-3.5 h-3.5" /></button>}
        </div>
        {esAdmin && filtro === 'todas' && (
          <select value={personaFiltro} onChange={e => setPersonaFiltro(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-xs text-zinc-300 max-w-[160px]">
            <option value="">Todos</option>
            {responsablesConTareas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>
      ) : mostrarCompletadas ? (
        <div className="space-y-1.5">
          {visibles.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin tareas completadas en este filtro.</div>}
          {visibles.slice(0, 60).map(t => <FilaTarea key={t.id} t={t} />)}
        </div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">🎉 Nada pendiente en este filtro.</div>
      ) : (
        <div className="space-y-4">
          {SECCIONES.map(sec => {
            const items = porSeccion[sec.key];
            if (!items.length) return null;
            const colapsada = !!colapsadas[sec.key];
            return (
              <div key={sec.key}>
                <button onClick={() => setColapsadas({ ...colapsadas, [sec.key]: !colapsada })}
                  className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider mb-1.5 ${sec.color}`}>
                  {colapsada ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {sec.label} <span className="text-zinc-600 font-bold">({items.length})</span>
                </button>
                {!colapsada && <div className="space-y-1.5">{items.map(t => <FilaTarea key={t.id} t={t} />)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {crearModal && <ModalCrearTarea usuario={usuario} proyectos={data.proyectos || []} personal={data.personal || []} onCerrar={() => setCrearModal(false)} onCrear={async (t) => { await onCrearTarea(t); if (t.asignadaAId && t.asignadaAId !== usuario.id) avisarAsignacion(t.asignadaAId, t.titulo, usuario.nombre, t.fechaLimite); setCrearModal(false); await recargar(); }} />}
      {delegando && <ModalDelegarTarea tarea={delegando} personal={data.personal || []} onCerrar={() => setDelegando(null)} onDelegar={delegar} />}
      {detalle && <ModalDetalleTarea tarea={tareas.find(x => x.id === detalle.id) || detalle} usuario={usuario} data={data} esAdmin={esAdmin}
        onCerrar={() => setDetalle(null)} onRecargar={recargar}
        onCompletar={completar} onDelegar={(t) => { setDetalle(null); setDelegando(t); }} onCambiarFecha={cambiarFecha} />}
    </div>
  );
}

export function ModalDelegarTarea({ tarea, personal, onCerrar, onDelegar }) {
  const [personaId, setPersonaId] = useState('');
  const [fecha, setFecha] = useState(tarea.fechaLimite || '');
  const candidatos = (personal || []).filter(p => ['admin', 'supervisor', 'maestro', 'facturas', 'almacen', 'chofer'].some(r => tieneRol(p, r)));
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-blue-600 rounded-card max-w-sm w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-blue-400 font-bold">↪ Delegar tarea</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <div className="text-sm font-bold">{tarea.titulo}</div>
        <Campo label="Delegar a">
          <select value={personaId} onChange={e => setPersonaId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-blue-600 outline-none px-3 py-3 text-white">
            <option value="">Elegir persona…</option>
            {candidatos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="Fecha de vencimiento"><Input type="date" value={fecha} onChange={setFecha} /></Campo>
        <div className="text-[10px] text-zinc-500">Al delegar, tú quedas como supervisor de la tarea (la sigues viendo en "👁 Superviso").</div>
        <button onClick={() => onDelegar(tarea, personaId, fecha || null)} disabled={!personaId} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3 rounded-card">Delegar</button>
      </div>
    </div>
  );
}

export function ModalCrearTarea({ usuario, proyectos, personal, onCerrar, onCrear, proyectoFijo = null }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [proyectoId, setProyectoId] = useState(proyectoFijo || '');
  const [asignadaAId, setAsignadaAId] = useState('');
  const [supervisorId, setSupervisorId] = useState(usuario.id);
  const [fechaLimite, setFechaLimite] = useState('');
  const [prioridad, setPrioridad] = useState('normal');
  const asignables = personal.filter(p => ['admin', 'supervisor', 'maestro', 'facturas', 'almacen', 'chofer'].some(r => tieneRol(p, r)));
  const crear = () => {
    if (!titulo) return;
    const persona = personal.find(p => p.id === asignadaAId);
    onCrear({
      id: 't_' + Date.now() + Math.random(),
      proyectoId: proyectoId || null, tipo: 'otro', titulo, descripcion,
      asignadaAId: asignadaAId || null, asignadaANombre: persona?.nombre || null,
      supervisorId: supervisorId || null, supervisorNombre: personal.find(p => p.id === supervisorId)?.nombre || null,
      prioridad, fechaLimite: fechaLimite || null,
    });
  };
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nueva tarea</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <Campo label="Título"><Input value={titulo} onChange={setTitulo} /></Campo>
        <Campo label="Descripción"><textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" /></Campo>
        {!proyectoFijo && <Campo label="Proyecto"><select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">(General)</option>{proyectos.map(p => <option key={p.id} value={p.id}>{[p.referenciaOdoo, p.cliente || p.nombre].filter(Boolean).join(' · ')}</option>)}</select></Campo>}
        <Campo label="Responsable"><select value={asignadaAId} onChange={e => setAsignadaAId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin asignar</option>{asignables.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo label="Supervisor de la tarea"><select value={supervisorId} onChange={e => setSupervisorId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin supervisor</option>{asignables.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Prioridad">
            <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white">
              <option value="alta">🔥 Alta</option><option value="normal">Normal</option><option value="baja">▽ Baja</option>
            </select>
          </Campo>
          <Campo label="Fecha límite"><Input type="date" value={fechaLimite} onChange={setFechaLimite} /></Campo>
        </div>
        <div className="flex gap-2 pt-1"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={crear} disabled={!titulo} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3"><Save className="w-3 h-3 inline mr-1" /> Crear</button></div>
      </div>
    </div>
  );
}

// v8.33.2: Detalle de la tarea — descripción completa, prioridad editable,
// comentarios (el hilo de la tarea) y acciones.
function ModalDetalleTarea({ tarea, usuario, data, esAdmin, onCerrar, onRecargar, onCompletar, onDelegar, onCambiarFecha }) {
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const puedeGestionar = tarea.asignadaAId === usuario.id || tarea.supervisorId === usuario.id || esAdmin;

  const comentar = async () => {
    if (!comentario.trim()) return;
    setEnviando(true);
    try {
      await db.comentarTarea(tarea.id, { porId: usuario.id, porNombre: usuario.nombre, texto: comentario.trim() });
      setComentario('');
      await onRecargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setEnviando(false);
  };
  const setPrioridad = async (p) => {
    await db.actualizarTarea(tarea.id, { prioridad: p });
    await onRecargar();
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-zinc-700 rounded-card max-w-lg w-full p-5 space-y-3 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <div className="text-xs tracking-widest uppercase text-zinc-500 font-bold">Tarea</div>
            <div className="text-lg font-black leading-snug">{tarea.prioridad === 'alta' ? '🔥 ' : ''}{tarea.titulo}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>
        {tarea.descripcion && <div className="text-sm text-zinc-300 whitespace-pre-wrap">{tarea.descripcion}</div>}
        <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
          {tarea.asignadaANombre && <span className="bg-zinc-950 border border-zinc-800 rounded-full px-2 py-0.5">👤 {tarea.asignadaANombre}</span>}
          {tarea.supervisorNombre && <span className="bg-zinc-950 border border-zinc-800 rounded-full px-2 py-0.5">👁 {tarea.supervisorNombre}</span>}
          {tarea.fechaLimite && <span className="bg-zinc-950 border border-zinc-800 rounded-full px-2 py-0.5">📅 {formatFechaCorta(tarea.fechaLimite)}</span>}
        </div>
        {puedeGestionar && !tarea.completada && (
          <div className="flex flex-wrap gap-1.5 items-center border-t border-zinc-800 pt-2.5">
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Prioridad:</span>
            {['alta', 'normal', 'baja'].map(p => (
              <button key={p} onClick={() => setPrioridad(p)} className={`text-[10px] font-bold uppercase px-2 py-1 rounded-card border ${tarea.prioridad === p ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{p === 'alta' ? '🔥 Alta' : p === 'baja' ? '▽ Baja' : 'Normal'}</button>
            ))}
            <span className="flex-1" />
            <button onClick={() => onDelegar(tarea)} className="text-[10px] font-black uppercase px-2.5 py-1.5 rounded-card border border-zinc-700 hover:border-blue-500 text-zinc-300">↪ Delegar</button>
            <button onClick={() => { onCambiarFecha(tarea); }} className="text-[10px] font-black uppercase px-2.5 py-1.5 rounded-card border border-zinc-700 hover:border-amber-500 text-zinc-300">📅 Fecha</button>
            <button onClick={async () => { await onCompletar(tarea.id); onCerrar(); }} className="text-[10px] font-black uppercase px-2.5 py-1.5 rounded-card bg-green-700 hover:bg-green-600 text-white">✓ Completar</button>
          </div>
        )}
        {/* Comentarios */}
        <div className="border-t border-zinc-800 pt-2.5">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1.5">💬 Comentarios ({(tarea.comentarios || []).length})</div>
          <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
            {(tarea.comentarios || []).map((c, i) => (
              <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-1.5">
                <div className="text-[10px] text-zinc-500"><b className="text-zinc-300">{c.porNombre}</b> · {new Date(c.at).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                <div className="text-xs text-zinc-200 mt-0.5 whitespace-pre-wrap">{c.texto}</div>
              </div>
            ))}
            {(tarea.comentarios || []).length === 0 && <div className="text-[11px] text-zinc-600 italic">Sin comentarios.</div>}
          </div>
          <div className="flex gap-1.5 mt-2">
            <input value={comentario} onChange={e => setComentario(e.target.value)} onKeyDown={e => e.key === 'Enter' && comentar()}
              placeholder="Escribe un comentario…" className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2.5 py-2 text-sm min-w-0" />
            <button onClick={comentar} disabled={enviando || !comentario.trim()} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-black uppercase px-3 py-2 rounded-card shrink-0">
              {enviando ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
