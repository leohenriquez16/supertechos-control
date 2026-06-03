'use client';

// v8.19.62: Módulo de Reclamaciones (estilo módulo de Levantamientos).
// Vistas: Kanban (por estado, drag&drop) · Lista · Mapa · Ficha de detalle.

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, Plus, X, MapPin, Search, MessageCircle, Mail, Building2, Wrench, Trash2 } from 'lucide-react';
import * as db from '../../lib/db';
import MapaLeaflet from '../common/MapaLeaflet';
import CalendarioLevantamientos from '../surveys/CalendarioLevantamientos';
import ChatterPanel from '../common/ChatterPanel';
import { registrarCreacion as chatterCreacion, registrarCambioEstado as chatterEstado } from '../../lib/chatter';

const fmtFecha = (s) => { if (!s) return '—'; try { return new Date(s + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
const COLS = [
  { e: 'abierta', label: 'Abierta', color: 'bg-amber-600', text: 'text-amber-400' },
  { e: 'en_proceso', label: 'En proceso', color: 'bg-blue-600', text: 'text-blue-400' },
  { e: 'resuelta', label: 'Resuelta', color: 'bg-green-600', text: 'text-green-400' },
  { e: 'cerrada', label: 'Cerrada', color: 'bg-zinc-600', text: 'text-zinc-400' },
  { e: 'rechazada', label: 'Rechazada', color: 'bg-red-700', text: 'text-red-400' },
];
const SEV = { baja: 'text-zinc-400', media: 'text-amber-400', alta: 'text-red-400' };
const CANAL_ICON = { whatsapp: '🟢 WS', email: '✉ Email', web: '🌐 Web', interno: '🏢 Interno' };

export default function ModuloReclamaciones({ data, usuario, onVolver, onVerProyecto }) {
  const [vista, setVista] = useState('kanban'); // kanban|lista|mapa
  const [loading, setLoading] = useState(true);
  const [recs, setRecs] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [garantias, setGarantias] = useState([]);
  const [reload, setReload] = useState(0);
  const [sel, setSel] = useState(null);          // ficha de detalle
  const [modalNueva, setModalNueva] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [agruparPor, setAgruparPor] = useState('estado'); // estado | severidad | canal | cliente | none
  const [fEstado, setFEstado] = useState('');
  const [fSeveridad, setFSeveridad] = useState('');
  const [fCanal, setFCanal] = useState('');
  const [dragId, setDragId] = useState(null);
  const [dropCol, setDropCol] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [r, u, g] = await Promise.all([db.listarReclamaciones(), db.listarUbicacionesCliente(null), db.listarGarantias()]);
        if (!cancel) { setRecs(r); setUbicaciones(u); setGarantias(g); }
      } catch (e) { console.warn('Reclamaciones:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [reload]);

  const clienteDe = (id) => (data.clientes || []).find(c => c.id === id);
  const proyById = (id) => (data.proyectos || []).find(p => p.id === id);
  const ubic = (id) => ubicaciones.find(u => u.id === id);
  const clienteNombre = (r) => clienteDe(r.clienteId)?.nombre || proyById(r.proyectoId)?.cliente || r.clienteNombre || '—';
  // Pipeline de reclamaciones de Odoo (equipo Customer Care), en orden.
  // Etapas del equipo Customer Care en Odoo, en su orden real (por sequence).
  const ORDEN_RECL = ['New', 'On Hold', 'Agendado', 'Visita Programada', 'In Progress', 'Solucion Cotizada espera Aprobación', 'Solved', 'Cancelled'];
  // Reclamaciones creadas localmente (sin odoo_stage) se mapean a una etapa de Odoo
  // para que el Kanban use SIEMPRE las columnas de Odoo en el mismo orden.
  const MAP_LOCAL_ODOO = { abierta: 'New', en_proceso: 'In Progress', resuelta: 'Solved', cerrada: 'Solved', rechazada: 'Cancelled' };
  const estadoOdoo = (r) => r.odooStage || MAP_LOCAL_ODOO[r.estado] || 'New';
  const columnasRecl = useMemo(() => {
    const extras = [...new Set(recs.map(estadoOdoo))].filter(e => !ORDEN_RECL.includes(e));
    return [...ORDEN_RECL, ...extras];
  }, [recs]);
  const ubicNombre = (r) => ubic(r.ubicacionId)?.nombre || proyById(r.proyectoId)?.referenciaProyecto || '';
  const coordsDe = (r) => {
    const u = ubic(r.ubicacionId); if (u && u.latitud != null) return { lat: u.latitud, lng: u.longitud };
    const p = proyById(r.proyectoId); if (p && p.ubicacionLat != null) return { lat: p.ubicacionLat, lng: p.ubicacionLng };
    return null;
  };

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return recs.filter(r => {
      if (q && !(clienteNombre(r).toLowerCase().includes(q) || (r.referenciaCotizacion || '').toLowerCase().includes(q) || (r.descripcion || '').toLowerCase().includes(q))) return false;
      if (fEstado && estadoOdoo(r) !== fEstado) return false;
      if (fSeveridad && r.severidad !== fSeveridad) return false;
      if (fCanal && (r.canal || '') !== fCanal) return false;
      return true;
    });
  }, [recs, busqueda, fEstado, fSeveridad, fCanal, data.clientes, ubicaciones]);

  // Opciones presentes para los filtros.
  const opcCanales = useMemo(() => [...new Set(recs.map(r => r.canal).filter(Boolean))], [recs]);
  const opcSeveridades = ['alta', 'media', 'baja'];

  // Agrupación según la dimensión elegida.
  const grupos = useMemo(() => {
    const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
    const defs = {
      estado:    { keyOf: estadoOdoo, orden: columnasRecl, labelOf: k => k },
      severidad: { keyOf: r => r.severidad || '—', orden: ['alta', 'media', 'baja'], labelOf: cap },
      canal:     { keyOf: r => r.canal || '—', orden: ['whatsapp', 'email', 'web', 'interno'], labelOf: k => CANAL_ICON[k] || k },
      cliente:   { keyOf: clienteNombre, orden: null, labelOf: k => k },
      none:      { keyOf: () => 'Todas', orden: ['Todas'], labelOf: k => k },
    };
    const { keyOf, orden, labelOf } = defs[agruparPor] || defs.estado;
    const map = new Map();
    for (const r of filtradas) { const k = keyOf(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
    const keys = [...map.keys()];
    const ordered = orden ? [...orden.filter(k => map.has(k)), ...keys.filter(k => !orden.includes(k)).sort()] : keys.sort();
    return ordered.map(k => ({ key: k, label: labelOf(k), items: map.get(k) }));
  }, [filtradas, agruparPor, columnasRecl]);

  const cambiarEstado = async (id, estado) => {
    const estadoPrev = recs.find(r => r.id === id)?.estado;
    setRecs(prev => prev.map(r => r.id === id ? { ...r, estado } : r)); // optimista
    try {
      await db.actualizarReclamacion(id, { estado });
      try { await chatterEstado('reclamacion', id, estadoPrev, estado, usuario, 'estado'); } catch {}
    } catch (e) { alert('Error: ' + (e.message || e)); setReload(x => x + 1); }
  };

  // v8.19.91: eliminación con autorización del OWNER DEL APP (rol 'owner').
  const esOwnerApp = (usuario?.roles || []).includes('owner');
  const esAdminApp = (usuario?.roles || []).includes('admin');
  const ownerNombreApp = (data.personal || []).find(p => (p.roles || []).includes('owner'))?.nombre || 'el dueño del app';
  const eliminarRec = async (id) => { if (!confirm('¿Eliminar esta reclamación? No se puede deshacer.')) return; try { await db.eliminarReclamacion(id); setSel(null); setReload(r => r + 1); } catch (e) { alert('Error: ' + (e.message || e)); } };
  const solicitarDelRec = async (id) => { try { await db.solicitarEliminacionReclamacion(id, usuario); setReload(r => r + 1); } catch (e) { alert('Error: ' + (e.message || e)); } };
  const cancelarDelRec = async (id) => { try { await db.cancelarSolicitudEliminacionReclamacion(id); setReload(r => r + 1); } catch (e) { alert('Error: ' + (e.message || e)); } };

  const recordarWhatsApp = (r) => {
    const cli = clienteDe(r.clienteId); const u = ubic(r.ubicacionId);
    const tel = (u?.contactoTelefono || cli?.telefonoPrincipal || proyById(r.proyectoId)?.contactoClienteTelefono || '').replace(/\D/g, '').replace(/^(?!1)(8[024]9)/, '1$1');
    const msg = `Hola, le saluda Super Techos sobre su reclamación${r.referenciaCotizacion ? ` (cot. ${r.referenciaCotizacion})` : ''}. `;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ---------- FICHA DE DETALLE ----------
  if (sel) {
    const r = recs.find(x => x.id === sel.id) || sel;
    const g = garantias.find(x => x.id === r.garantiaId);
    const p = proyById(r.proyectoId);
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <button onClick={() => setSel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Reclamación {r.codigo || ''}</div>
              <h1 className="text-2xl font-black">{clienteNombre(r)}</h1>
              <div className="text-xs text-zinc-400 mt-1">{ubicNombre(r)}{r.referenciaCotizacion ? ` · ${r.referenciaCotizacion}` : ''}</div>
            </div>
            <div className="text-right text-[11px] text-zinc-500">
              <div>{CANAL_ICON[r.canal] || r.canal}</div>
              <div>Abierta {fmtFecha(r.fechaApertura)}</div>
              <div className={`uppercase font-bold ${SEV[r.severidad] || ''}`}>Sev. {r.severidad}</div>
            </div>
          </div>
          <div className="mt-3 bg-zinc-950 border border-zinc-800 rounded-card p-3 text-sm text-zinc-300">{r.descripcion || 'Sin descripción.'}</div>
          {/* Estado */}
          <div className="mt-3">
            <div className="text-[10px] uppercase text-zinc-500 mb-1">Estado</div>
            <div className="flex gap-1 flex-wrap">
              {COLS.map(c => <button key={c.e} onClick={() => cambiarEstado(r.id, c.e)} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-card border ${r.estado === c.e ? `${c.color} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{c.label}</button>)}
            </div>
          </div>
          {/* Resolución: qué y cuándo se hizo */}
          <ResolucionReclamacion r={r} onGuardado={() => setReload(x => x + 1)} />
          <div className="mt-3 flex gap-2 flex-wrap">
            <button onClick={() => recordarWhatsApp(r)} className="bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded-card flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp al cliente</button>
            {p && onVerProyecto && <button onClick={() => onVerProyecto(p)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold uppercase px-3 py-1.5 rounded-card">Ver proyecto →</button>}
          </div>
          {g && <div className="mt-3 text-[11px] text-zinc-500">Garantía: {g.sistemaNombre || ''} · vence {fmtFecha(g.fechaVencimiento)}</div>}

          {/* v8.19.91: eliminación con autorización del owner del app */}
          {(esOwnerApp || esAdminApp) && (
            <div className="mt-3 bg-zinc-950 border border-red-900/50 rounded-card p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-red-400 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar reclamación</div>
              {esOwnerApp ? (
                <>
                  {r.eliminacionSolicitadaPor && <div className="text-[11px] text-amber-300">El admin <b>{r.eliminacionSolicitadaPorNombre || '—'}</b> solicitó eliminar esta reclamación.</div>}
                  <div className="flex gap-2">
                    {r.eliminacionSolicitadaPor && <button onClick={() => cancelarDelRec(r.id)} className="px-3 bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase py-2 rounded-card">Rechazar</button>}
                    <button onClick={() => eliminarRec(r.id)} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase py-2 rounded-card flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" /> {r.eliminacionSolicitadaPor ? 'Autorizar y eliminar' : 'Eliminar reclamación'}</button>
                  </div>
                </>
              ) : r.eliminacionSolicitadaPor === usuario.id ? (
                <>
                  <div className="text-[11px] text-amber-300">Solicitud enviada a <b>{ownerNombreApp}</b>. Esperando su autorización.</div>
                  <button onClick={() => cancelarDelRec(r.id)} className="px-3 bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase py-2 rounded-card">Cancelar solicitud</button>
                </>
              ) : r.eliminacionSolicitadaPor ? (
                <div className="text-[11px] text-zinc-500">Ya hay una solicitud de eliminación pendiente de autorización de <b>{ownerNombreApp}</b>.</div>
              ) : (
                <>
                  <div className="text-[11px] text-zinc-500">Solo <b>{ownerNombreApp}</b> (dueño del app) puede eliminar. Puedes solicitar su autorización.</div>
                  <button onClick={() => solicitarDelRec(r.id)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold uppercase py-2 rounded-card">Solicitar eliminación al dueño</button>
                </>
              )}
            </div>
          )}
        </div>

        <ChatterPanel entityType="reclamacion" entityId={r.id} usuario={usuario} />
      </div>
    );
  }

  const Card = (r) => (
    <div
      key={r.id}
      draggable
      onDragStart={() => setDragId(r.id)}
      onDragEnd={() => { setDragId(null); setDropCol(null); }}
      onClick={() => setSel(r)}
      className={`bg-zinc-900 border border-zinc-800 rounded-card p-2.5 cursor-pointer hover:border-red-600 ${dragId === r.id ? 'opacity-40' : ''}`}
    >
      <div className="font-bold text-sm truncate">{clienteNombre(r)}</div>
      <div className="text-[10px] text-zinc-500 truncate">{ubicNombre(r)}{r.referenciaCotizacion ? ` · ${r.referenciaCotizacion}` : ''}</div>
      <div className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{r.descripcion}</div>
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-[8px] uppercase font-black ${SEV[r.severidad] || ''}`}>● {r.severidad}</span>
        <span className="text-[9px] text-zinc-600">{fmtFecha(r.fechaApertura)}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2"><AlertTriangle className="w-7 h-7 text-red-500" /> Reclamaciones</h1>
        <button onClick={() => setModalNueva(true)} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center gap-1 rounded-card"><Plus className="w-3 h-3" /> Nueva</button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1 w-fit">
            {[['kanban', 'Kanban'], ['lista', 'Lista'], ['calendario', 'Calendario'], ['mapa', 'Mapa']].map(([k, l]) => <button key={k} onClick={() => setVista(k)} className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-card ${vista === k ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>{l}</button>)}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, # cot o descripción…" className="bg-zinc-950 border border-zinc-800 rounded-card pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-red-600 w-52 sm:w-72" />
          </div>
        </div>
        {recs.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <FiltroSelectRec value={fEstado} onChange={setFEstado} placeholder="Estado" options={columnasRecl.map(e => [e, e])} />
            <FiltroSelectRec value={fSeveridad} onChange={setFSeveridad} placeholder="Severidad" options={opcSeveridades.map(s => [s, s.charAt(0).toUpperCase() + s.slice(1)])} />
            <FiltroSelectRec value={fCanal} onChange={setFCanal} placeholder="Canal" options={opcCanales.map(c => [c, CANAL_ICON[c] || c])} />
            {(fEstado || fSeveridad || fCanal || busqueda) && (
              <button onClick={() => { setFEstado(''); setFSeveridad(''); setFCanal(''); setBusqueda(''); }} className="text-[10px] text-zinc-400 hover:text-red-500 underline px-1">Limpiar</button>
            )}
            <span className="text-[10px] text-zinc-600 ml-auto">{filtradas.length} de {recs.length}</span>
            {vista === 'lista' && (
              <label className="flex items-center gap-1 ml-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Agrupar:</span>
                <select value={agruparPor} onChange={e => setAgruparPor(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1 text-xs text-white outline-none focus:border-red-600">
                  <option value="estado">Estado</option>
                  <option value="severidad">Severidad</option>
                  <option value="canal">Canal</option>
                  <option value="cliente">Cliente</option>
                  <option value="none">Sin agrupar</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : recs.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="font-bold mb-1">Sin reclamaciones</div>
          <div className="text-xs">Crea una con "Nueva", o ábrela desde el detalle de una garantía/ubicación. Pronto: formulario público para el cliente.</div>
        </div>
      ) : vista === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columnasRecl.map(col => {
            const items = filtradas.filter(r => estadoOdoo(r) === col);
            return (
              <div key={col} className="w-60 flex-shrink-0 bg-zinc-950 border border-zinc-800 rounded-card">
                <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-300 truncate">{col}</span>
                  <span className="text-[9px] text-zinc-600">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[50px]">{items.map(Card)}</div>
              </div>
            );
          })}
        </div>
      ) : vista === 'lista' ? (
        <ReclamacionesTabla grupos={grupos} agrupado={agruparPor !== 'none'} clienteNombre={clienteNombre} ubicNombre={ubicNombre} estadoOdoo={estadoOdoo} onAbrir={setSel} />
      ) : vista === 'calendario' ? (
        <CalendarioLevantamientos proyectos={[]} reclamaciones={filtradas} onReload={() => setReload(r => r + 1)} />
      ) : (
        // Mapa
        (() => {
          const conC = filtradas.map(r => ({ r, c: coordsDe(r) })).filter(x => x.c);
          if (conC.length === 0) return <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500 text-sm">Ninguna reclamación (de las filtradas) tiene ubicación con GPS aún.</div>;
          const markers = conC.map(({ r, c }) => ({ lat: c.lat, lng: c.lng, color: COLS.find(x => x.e === r.estado)?.color?.includes('red') ? 'red' : r.estado === 'resuelta' ? 'green' : r.estado === 'en_proceso' ? 'blue' : 'orange', label: clienteNombre(r), popup: `<b>${clienteNombre(r)}</b><br/>${(r.descripcion || '').slice(0, 80)}`, onClick: () => setSel(r) }));
          return <MapaLeaflet center={[markers[0].lat, markers[0].lng]} zoom={11} height={460} markers={markers} scrollWheelZoom className="rounded-card overflow-hidden" />;
        })()
      )}

      {modalNueva && <ModalNuevaReclamacion data={data} usuario={usuario} ubicaciones={ubicaciones} garantias={garantias} onCerrar={() => setModalNueva(false)} onCreada={() => { setModalNueva(false); setReload(r => r + 1); }} />}
    </div>
  );
}

// ---------- RESOLUCIÓN: qué y cuándo se hizo ----------
function ResolucionReclamacion({ r, onGuardado }) {
  const [trabajo, setTrabajo] = useState(r.trabajoRealizado || '');
  const [fecha, setFecha] = useState(r.fechaResuelta || '');
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(!r.trabajoRealizado && !r.fechaResuelta);
  useEffect(() => { setTrabajo(r.trabajoRealizado || ''); setFecha(r.fechaResuelta || ''); }, [r.id]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await db.actualizarReclamacion(r.id, { trabajoRealizado: trabajo, fechaResuelta: fecha || null });
      setEditando(false);
      if (onGuardado) await onGuardado();
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  return (
    <div className="mt-3 bg-zinc-950 border border-zinc-800 rounded-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> Resolución — qué y cuándo se hizo</span>
        {!editando && <button onClick={() => setEditando(true)} className="text-red-400 hover:underline text-[10px] normal-case tracking-normal">Editar</button>}
      </div>
      {editando ? (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">¿Cuándo se hizo?</div>
            <input type="date" value={fecha || ''} onChange={e => setFecha(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-xs text-white outline-none focus:border-red-600" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">¿Qué se hizo?</div>
            <textarea value={trabajo} onChange={e => setTrabajo(e.target.value)} rows={3} placeholder="Describe la intervención realizada (materiales, área, hallazgos)…" className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-sm text-white outline-none focus:border-red-600" />
          </div>
          <button onClick={guardar} disabled={guardando} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-card">{guardando ? 'Guardando…' : 'Guardar resolución'}</button>
        </div>
      ) : (
        <div className="text-sm text-zinc-300">
          <div className="text-[11px] text-zinc-500 mb-1">{r.fechaResuelta ? `Realizado el ${fmtFecha(r.fechaResuelta)}` : 'Sin fecha registrada'}</div>
          <div className="whitespace-pre-wrap">{r.trabajoRealizado || 'Sin descripción del trabajo realizado.'}</div>
        </div>
      )}
    </div>
  );
}

// ---------- TABLA DENSA (desktop) + cards (mobile) ----------
const SEV_BAND = { alta: '#ef4444', media: '#f59e0b', baja: '#71717a' };

function FilaReclamacion({ r, estado, clienteNombre, ubicNombre, onAbrir }) {
  const band = SEV_BAND[r.severidad] || '#3f3f46';
  return (
    <tr onClick={() => onAbrir(r)} className="border-b border-zinc-800 hover:bg-zinc-800/40 cursor-pointer">
      <td className="w-1 p-0" style={{ backgroundColor: band }} />
      <td className="px-3 py-2 font-mono text-[11px] text-zinc-500 whitespace-nowrap">{r.codigo || '—'}</td>
      <td className="px-3 py-2 max-w-[200px]">
        <div className="font-bold truncate">{clienteNombre(r)}</div>
        {ubicNombre(r) && <div className="text-[10px] text-zinc-500 truncate">{ubicNombre(r)}</div>}
      </td>
      <td className="px-3 py-2 text-[11px] text-zinc-400 whitespace-nowrap">{r.referenciaCotizacion || '—'}</td>
      <td className="px-3 py-2 text-[10px] text-zinc-400 whitespace-nowrap">{CANAL_ICON[r.canal] || r.canal || '—'}</td>
      <td className={`px-3 py-2 text-[10px] uppercase font-black ${SEV[r.severidad] || 'text-zinc-400'} whitespace-nowrap`}>● {r.severidad}</td>
      <td className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-zinc-300 whitespace-nowrap">{estado}</td>
      <td className="px-3 py-2 text-zinc-400 text-xs max-w-[280px] truncate">{r.descripcion || '—'}</td>
      <td className="px-3 py-2 text-right text-[10px] text-zinc-500 whitespace-nowrap">{fmtFecha(r.fechaApertura)}</td>
    </tr>
  );
}

// Select de filtro compacto reutilizable.
function FiltroSelectRec({ value, onChange, placeholder, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`bg-zinc-900 border rounded-card px-2 py-1 text-xs outline-none focus:border-red-600 ${value ? 'border-red-600 text-white' : 'border-zinc-800 text-zinc-400'}`}>
      <option value="">{placeholder}: todos</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function ReclamacionesTabla({ grupos, agrupado, clienteNombre, ubicNombre, estadoOdoo, onAbrir }) {
  const total = grupos.reduce((a, g) => a + g.items.length, 0);
  if (total === 0) {
    return <div className="bg-zinc-950 border border-zinc-800 rounded-card p-6 text-center text-zinc-500 text-sm">Sin resultados.</div>;
  }

  return (
    <>
      {/* DESKTOP: tabla densa */}
      <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-10">
            <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold text-left">
              <th className="w-1 p-0" />
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Ref. cot.</th>
              <th className="px-3 py-2">Canal</th>
              <th className="px-3 py-2">Severidad</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2 text-right">Abierta</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <React.Fragment key={g.key}>
                {agrupado && (
                  <tr className="bg-zinc-950/80 border-b border-zinc-800">
                    <td colSpan={9} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-black text-zinc-400">
                      {g.label} <span className="text-zinc-600">· {g.items.length}</span>
                    </td>
                  </tr>
                )}
                {g.items.map(r => (
                  <FilaReclamacion key={r.id} r={r} estado={estadoOdoo(r)} clienteNombre={clienteNombre} ubicNombre={ubicNombre} onAbrir={onAbrir} />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE: cards (agrupadas si aplica) */}
      <div className="md:hidden space-y-3">
        {grupos.map(g => (
          <div key={g.key} className="space-y-2">
            {agrupado && <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500 px-1">{g.label} · {g.items.length}</div>}
            {g.items.map(r => (
              <button key={r.id} onClick={() => onAbrir(r)} className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card p-3 hover:border-red-600 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="font-bold">{clienteNombre(r)}</span><span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded-full text-zinc-300 border border-zinc-700">{estadoOdoo(r)}</span></div>
                  <div className="text-[10px] text-zinc-500">{ubicNombre(r)}{r.referenciaCotizacion ? ` · ${r.referenciaCotizacion}` : ''} · {CANAL_ICON[r.canal] || r.canal}</div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">{r.descripcion}</div>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">{fmtFecha(r.fechaApertura)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- MODAL NUEVA RECLAMACIÓN ----------
function ModalNuevaReclamacion({ data, usuario, ubicaciones, garantias, onCerrar, onCreada }) {
  const [clienteId, setClienteId] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [severidad, setSeveridad] = useState('media');
  const [canal, setCanal] = useState('interno');
  const [guardando, setGuardando] = useState(false);

  const clientes = (data.clientes || []).filter(c => !c.archivado);
  const ubicsCli = ubicaciones.filter(u => u.clienteId === clienteId);
  const proysCli = (data.proyectos || []).filter(p => !p.archivado && p.clienteId === clienteId);
  const garantiaDeProy = garantias.find(g => g.proyectoId === proyectoId);

  const guardar = async () => {
    if (!descripcion.trim()) { alert('Describe la reclamación.'); return; }
    setGuardando(true);
    try {
      const proy = (data.proyectos || []).find(p => p.id === proyectoId);
      const rec = await db.crearReclamacion({
        clienteId: clienteId || null, ubicacionId: ubicacionId || null, proyectoId: proyectoId || null,
        garantiaId: garantiaDeProy?.id || null, referenciaCotizacion: proy?.referenciaOdoo || null,
        canal, descripcion: descripcion.trim(), severidad,
      });
      try { await chatterCreacion('reclamacion', rec.id, usuario, 'Creó la reclamación'); } catch {}
      onCreada();
    } catch (e) { alert('Error: ' + (e.message || e)); setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800"><div className="text-sm font-bold">Nueva reclamación</div><button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button></div>
        <div className="p-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase text-zinc-500 mb-1">Cliente</div>
            <select value={clienteId} onChange={e => { setClienteId(e.target.value); setUbicacionId(''); setProyectoId(''); }} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
              <option value="">— Seleccionar —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {clienteId && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase text-zinc-500 mb-1">Ubicación</div>
                <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs"><option value="">—</option>{ubicsCli.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.ciudad ? ` · ${u.ciudad}` : ''}</option>)}</select>
              </div>
              <div>
                <div className="text-[10px] uppercase text-zinc-500 mb-1">Proyecto</div>
                <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs"><option value="">—</option>{proysCli.map(p => <option key={p.id} value={p.id}>{p.referenciaProyecto || p.referenciaOdoo || p.nombre}</option>)}</select>
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase text-zinc-500 mb-1">Descripción *</div>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="Qué reporta el cliente…" className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase text-zinc-500 mb-1">Severidad</div>
              <div className="flex gap-1">{['baja', 'media', 'alta'].map(s => <button key={s} onClick={() => setSeveridad(s)} className={`flex-1 px-2 py-1.5 text-[10px] font-bold uppercase rounded-card border ${severidad === s ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>{s}</button>)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-zinc-500 mb-1">Canal</div>
              <select value={canal} onChange={e => setCanal(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs"><option value="interno">Interno</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="web">Web</option></select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5 rounded-card">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-2.5 rounded-card">{guardando ? 'Creando…' : 'Crear reclamación'}</button>
        </div>
      </div>
    </div>
  );
}
