'use client';

// v8.19.62: Módulo de Reclamaciones (estilo módulo de Levantamientos).
// Vistas: Kanban (por estado, drag&drop) · Lista · Mapa · Ficha de detalle.

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, Plus, X, MapPin, Search, MessageCircle, Mail, Building2, Wrench, Trash2, FileText, Upload, CheckCircle2 } from 'lucide-react';
import * as db from '../../lib/db';
import MapaLeaflet from '../common/MapaLeaflet';
import CalendarioLevantamientos from '../surveys/CalendarioLevantamientos';
import ChatterPanel from '../common/ChatterPanel';
import { registrarCreacion as chatterCreacion, registrarCambioEstado as chatterEstado, registrarComunicacion } from '../../lib/chatter';
import { formatRD } from '../../lib/helpers/formato';
import { comprimirImagenABlob } from '../../lib/imports'; // v8.49.11: fotos
import { evaluarSlaReclamacion, SLA_SEVERIDAD_HORAS } from '../../lib/helpers/slaReclamaciones'; // v8.53.1 Fase 3B
import { resolverContacto, contactoLocalizable } from '../../lib/helpers/contactoCliente'; // v8.53.4
import SolicitarCalificacion from '../common/SolicitarCalificacion'; // v8.54.1 C3
import ModalInformeVisitaPDF from './ModalInformeVisitaPDF'; // v8.68.0 (ticket Edwin)
import { sistemasDeCotizacion } from '../../lib/helpers/sistemasCotizacion'; // v8.74.3

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
  // v8.74.6: supervisores que pueden tomar/visitar una reclamación.
  const supervisores = useMemo(() => (data.personal || []).filter(p => p.activo !== false && (p.roles || []).includes('supervisor')), [data.personal]);
  const nombreSup = (id) => (data.personal || []).find(p => p.id === id)?.nombre || '';
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
  const [fSup, setFSup] = useState(''); // v8.74.6
  const [dragId, setDragId] = useState(null);
  const [dropCol, setDropCol] = useState(null);
  // v8.66.0: selector de etapa en el detalle (iPad/teléfono, sin drag)
  const [pendienteVisita, setPendienteVisita] = useState(null); // { col } etapa que espera fecha de visita
  const [fechaVisitaNueva, setFechaVisitaNueva] = useState('');
  const [avisoCierre, setAvisoCierre] = useState('');
  const [resaltarResolucion, setResaltarResolucion] = useState(false);
  const resolucionRef = useRef(null);

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
      if (fSup && (fSup === '_sin' ? !!r.asignadoA : r.asignadoA !== fSup)) return false;
      return true;
    });
  }, [recs, busqueda, fEstado, fSeveridad, fCanal, fSup, data.clientes, ubicaciones]);

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

  // v8.65.0: el ciclo tiene puertas — tomar exige visita programada; cerrar exige evidencia.
  const validarTransicion = (r, estado) => {
    if (!r) return null;
    if (estado === 'en_proceso' && r.estado === 'abierta' && !r.fechaVisitaProgramada) {
      return 'Para tomar la reclamación programa primero la FECHA DE VISITA (campo "📅 Visita" en el detalle). Así el cliente sabe cuándo vamos y la Torre lo mide.';
    }
    if (estado === 'resuelta' || estado === 'cerrada') {
      const faltan = [];
      if (!(r.fotos || []).length) faltan.push('al menos una FOTO del trabajo');
      if (!(r.trabajoRealizado || '').trim()) faltan.push('QUÉ SE HIZO (bloque Resolución)');
      if (!r.causaRaiz) faltan.push('la CAUSA RAÍZ (bloque Resolución)');
      if (faltan.length) return 'Para marcarla resuelta falta registrar: ' + faltan.join(', ') + '. El trabajo se hizo — que quede la constancia.';
    }
    return null;
  };
  // v8.65.0: al resolver, la encuesta de satisfacción se genera SOLA y queda en la bitácora.
  const dispararCsat = async (r) => {
    try {
      const sol = await db.crearSolicitudCalificacion({
        entityType: 'reclamacion', entityId: r.id, clienteNombre: clienteNombre(r),
        contexto: 'la atención de su reclamación', creadoPor: usuario,
      });
      const link = `${window.location.origin}/calificar/${sol.token}`;
      try { await registrarComunicacion('reclamacion', r.id, { canal: 'sistema', direccion: 'saliente', cuerpo: `Encuesta de satisfacción generada automáticamente al resolver: ${link}`, autor: usuario }); } catch {}
    } catch (e) { console.warn('CSAT auto:', e?.message); }
  };

  // v8.50.0 (ticket Edwin): al cambiar el estado local se sincroniza también la etapa
  // Odoo (odoo_stage) — antes la tarjeta no se movía de columna en el Kanban.
  const cambiarEstado = async (id, estado) => {
    const rec = recs.find(r => r.id === id);
    const estadoPrev = rec?.estado;
    const err = validarTransicion(rec, estado); // v8.65.0
    if (err) { if (!manejarPuertaDetalle(rec, estado, MAP_LOCAL_ODOO[estado] || 'New', err)) alert(err); return; }
    const odooStage = MAP_LOCAL_ODOO[estado] || 'New';
    setRecs(prev => prev.map(r => r.id === id ? { ...r, estado, odooStage } : r)); // optimista
    try {
      await db.actualizarReclamacion(id, { estado, odooStage });
      try { await chatterEstado('reclamacion', id, estadoPrev, estado, usuario, 'estado'); } catch {}
      if (estado === 'resuelta' && estadoPrev !== 'resuelta') await dispararCsat(rec); // v8.65.0
    } catch (e) { alert('Error: ' + (e.message || e)); setReload(x => x + 1); }
  };

  // v8.50.0: soltar una tarjeta en una columna del Kanban la mueve a ESA etapa Odoo
  // (y ajusta el estado local equivalente). El drag&drop existía pero estaba muerto.
  const MAP_ODOO_LOCAL = { 'New': 'abierta', 'On Hold': 'en_proceso', 'Agendado': 'en_proceso', 'Visita Programada': 'en_proceso', 'In Progress': 'en_proceso', 'Solucion Cotizada espera Aprobación': 'en_proceso', 'Solved': 'resuelta', 'Cancelled': 'rechazada' };
  const soltarEnColumna = async (col) => {
    if (!dragId) return;
    const id = dragId;
    setDragId(null); setDropCol(null);
    await moverAEtapa(id, col);
  };
  // v8.66.0: lógica común del drag y del selector de etapa del detalle.
  // `extra` permite grabar campos en el mismo paso (ej. la fecha de visita).
  const moverAEtapa = async (id, col, { enDetalle = false, extra = null } = {}) => {
    const recBase = recs.find(r => r.id === id);
    const rec = recBase && extra ? { ...recBase, ...extra } : recBase;
    const estadoPrev = recBase?.estado;
    const estado = MAP_ODOO_LOCAL[col] || estadoPrev || 'en_proceso';
    const err = validarTransicion(rec, estado); // v8.65.0: mismas puertas que los botones
    if (err) { if (!(enDetalle && manejarPuertaDetalle(rec, estado, col, err))) alert(err); return false; }
    setRecs(prev => prev.map(r => r.id === id ? { ...r, ...(extra || {}), estado, odooStage: col } : r));
    setPendienteVisita(null); setAvisoCierre('');
    try {
      await db.actualizarReclamacion(id, { ...(extra || {}), estado, odooStage: col });
      try { await chatterEstado('reclamacion', id, estadoPrev, `${estado} · ${col}`, usuario, 'estado'); } catch {}
      if (estado === 'resuelta' && estadoPrev !== 'resuelta') await dispararCsat(rec); // v8.65.0
      return true;
    } catch (e) { alert('Error: ' + (e.message || e)); setReload(x => x + 1); return false; }
  };
  // v8.66.0: etapas que exigen fecha de visita antes de entrar
  const ETAPAS_CON_VISITA = ['Agendado', 'Visita Programada'];
  const elegirEtapa = (r, col) => {
    if (!col || col === estadoOdoo(r)) return;
    setAvisoCierre('');
    const estado = MAP_ODOO_LOCAL[col] || r.estado;
    if (!r.fechaVisitaProgramada && (ETAPAS_CON_VISITA.includes(col) || (estado === 'en_proceso' && r.estado === 'abierta'))) {
      setPendienteVisita({ col }); setFechaVisitaNueva(''); return;
    }
    moverAEtapa(r.id, col, { enDetalle: true });
  };
  // v8.66.0: en el detalle, las puertas se resuelven en línea en vez de un alert.
  // Devuelve true si la manejó.
  const manejarPuertaDetalle = (rec, estado, col, err) => {
    if (!sel || !rec) return false;
    if (estado === 'en_proceso' && !rec.fechaVisitaProgramada) {
      setPendienteVisita({ col }); setFechaVisitaNueva(''); return true;
    }
    if (estado === 'resuelta' || estado === 'cerrada') {
      setAvisoCierre(err);
      setResaltarResolucion(true);
      setTimeout(() => setResaltarResolucion(false), 4000);
      try { resolucionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      return true;
    }
    return false;
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
    // v8.54.0 (C1): queda registrado en la bitácora de comunicación.
    try { registrarComunicacion('reclamacion', r.id, { canal: 'whatsapp', direccion: 'saliente', cuerpo: 'Se abrió WhatsApp para contactar al cliente.', autor: usuario }); } catch { /* noop */ }
  };

  // ---------- FICHA DE DETALLE ----------
  if (sel) {
    const r = recs.find(x => x.id === sel.id) || sel;
    const g = garantias.find(x => x.id === r.garantiaId);
    const p = proyById(r.proyectoId);
    const slaR = evaluarSlaReclamacion(r); // v8.53.1 Fase 3B
    const SLA_TXT = { rojo: 'text-red-400', amarillo: 'text-amber-400', verde: 'text-green-400', exito: 'text-emerald-400', exitoTarde: 'text-amber-400', cerrado: 'text-zinc-400' };
    const SLA_LBL = { rojo: 'SLA vencido', amarillo: 'SLA en riesgo', verde: 'En SLA', exito: 'Informe entregado', exitoTarde: 'Entregado (tarde)', cerrado: 'Cerrada' };
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
              <div className={`font-bold ${SLA_TXT[slaR.semaforo] || 'text-zinc-400'}`} title={`Meta ${slaR.severidad}: ${Math.round(slaR.slaTotal / 24)}d`}>● {SLA_LBL[slaR.semaforo] || ''}</div>
              {slaR.resueltaSinInforme && <div className="text-amber-400 font-bold">⚠ Falta entregar informe</div>}
            </div>
          </div>
          <div className="mt-3 bg-zinc-950 border border-zinc-800 rounded-card p-3 text-sm text-zinc-300">{r.descripcion || 'Sin descripción.'}</div>
          {/* v8.53.4: contacto del cliente amarrado a sus contactos (empresa) o el cliente (persona) */}
          <ContactoReclamacion r={r} cliente={clienteDe(r.clienteId)} ubicacion={ubic(r.ubicacionId)} onGuardado={() => setReload(x => x + 1)} />
          {/* v8.65.0: reclamación sin trabajo amarrado → clasificarla aquí (triage) */}
          {!r.proyectoId && !r.referenciaCotizacion && (
            <ClasificarTrabajoReclamacion r={r} data={data} garantias={garantias} usuario={usuario} onGuardado={() => setReload(x => x + 1)} />
          )}
          {/* v8.49.11: fotos del trabajo realizado (ticket Edwin) */}
          <FotosReclamacion r={r} usuario={usuario} onCambio={() => setReload(x => x + 1)} />
          {/* v8.74.6: supervisor asignado → le aparece en Inicio y Mis asignaciones */}
          <div className="mt-3 flex items-center gap-2 flex-wrap bg-zinc-950 border border-zinc-800 rounded-card px-3 py-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">👷 Supervisor</span>
            <select value={r.asignadoA || ''} onChange={async e => {
              try { await db.actualizarReclamacion(r.id, { asignadoA: e.target.value || null }); setReload(x => x + 1); }
              catch (err) { alert('Error: ' + (err.message || err)); }
            }} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-xs text-white outline-none focus:border-red-600">
              <option value="">— Sin asignar —</option>
              {r.asignadoA && !supervisores.some(p => p.id === r.asignadoA) && <option value={r.asignadoA}>{nombreSup(r.asignadoA) || r.asignadoA}</option>}
              {supervisores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {!r.asignadoA && r.estado !== 'resuelta' && r.estado !== 'cerrada' && <span className="text-[10px] text-amber-400 font-bold">⚠ nadie la va a visitar hasta que la asignes</span>}
          </div>
          {/* v8.65.0: la visita programada es la puerta para tomar la reclamación */}
          <div className="mt-3 flex items-center gap-2 flex-wrap bg-zinc-950 border border-zinc-800 rounded-card px-3 py-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">📅 Visita</span>
            <input type="date" value={r.fechaVisitaProgramada || ''} onChange={async e => {
              try { await db.actualizarReclamacion(r.id, { fechaVisitaProgramada: e.target.value || null }); setReload(x => x + 1); }
              catch (err) { alert('Error: ' + (err.message || err)); }
            }} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-xs text-white outline-none focus:border-red-600 [color-scheme:dark]" />
            {!r.fechaVisitaProgramada && r.estado === 'abierta' && <span className="text-[10px] text-amber-400 font-bold">⚠ sin visita — necesaria para tomar la reclamación</span>}
          </div>
          {/* v8.66.0: selector de ETAPA (mismo orden y puertas que el kanban) — funciona en iPad/teléfono */}
          <div className="mt-3">
            <div className="text-[10px] uppercase text-zinc-500 mb-1">Etapa</div>
            <select value={estadoOdoo(r)} onChange={e => elegirEtapa(r, e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-sm text-white outline-none focus:border-red-600">
              {columnasRecl.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {pendienteVisita && (
              <div className="mt-2 bg-amber-900/10 border border-amber-700 rounded-card p-2 space-y-2">
                <div className="text-[11px] text-amber-300 font-bold">Para pasar a «{pendienteVisita.col}» indica la fecha de visita:</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" value={fechaVisitaNueva} onChange={e => setFechaVisitaNueva(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-xs text-white outline-none focus:border-red-600 [color-scheme:dark]" />
                  <button disabled={!fechaVisitaNueva} onClick={() => moverAEtapa(r.id, pendienteVisita.col, { enDetalle: true, extra: { fechaVisitaProgramada: fechaVisitaNueva } })} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-card">Guardar</button>
                  <button onClick={() => setPendienteVisita(null)} className="text-zinc-400 hover:text-white text-[10px] uppercase">Cancelar</button>
                </div>
              </div>
            )}
            {avisoCierre && <div className="mt-2 text-[11px] text-amber-300 bg-amber-900/10 border border-amber-700 rounded-card px-2 py-1.5">⚠ {avisoCierre}</div>}
          </div>
          {/* Estado */}
          <div className="mt-3">
            <div className="text-[10px] uppercase text-zinc-500 mb-1">Estado</div>
            <div className="flex gap-1 flex-wrap">
              {COLS.map(c => <button key={c.e} onClick={() => cambiarEstado(r.id, c.e)} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-card border ${r.estado === c.e ? `${c.color} text-white border-transparent` : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{c.label}</button>)}
            </div>
          </div>
          {/* Resolución: qué y cuándo se hizo */}
          {/* v8.66.0: se resalta (ámbar) cuando falla la puerta de cierre */}
          <div ref={resolucionRef} className={`rounded-card transition-all ${resaltarResolucion ? 'ring-2 ring-amber-500' : ''}`}>
            <ResolucionReclamacion r={r} onGuardado={() => { setAvisoCierre(''); setReload(x => x + 1); }} />
          </div>
          {/* v8.53.1 (Fase 3B): hito informe de solución entregado al cliente — cierra el ciclo */}
          <InformeSolucionReclamacion r={r} onGuardado={() => setReload(x => x + 1)}
            cliente={clienteDe(r.clienteId)} clienteNombre={clienteNombre(r)} ubicacion={ubic(r.ubicacionId)} ubicacionNombre={ubicNombre(r)} proyecto={p} usuario={usuario} />
          {/* v8.54.1 (C3): calificación del cliente (CSAT) */}
          <SolicitarCalificacion key={r.id + '-' + r.estado} entityType="reclamacion" entityId={r.id} clienteNombre={clienteNombre(r)} contexto="la atención de su reclamación" usuario={usuario} />
          {/* v8.26.8: pago de mano de obra de la reclamación → cae a nómina como ajuste */}
          <PagoManoObraReclamacion r={r} data={data} usuario={usuario} permitido={esOwnerApp || esAdminApp} />
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
        {r.asignadoA ? <span className="text-[9px] text-zinc-300 font-bold truncate max-w-[45%]">👷 {nombreSup(r.asignadoA).split(' ')[0]}</span> : <span className="text-[9px] text-amber-500">sin asignar</span>}
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
            <FiltroSelectRec value={fSup} onChange={setFSup} placeholder="Supervisor" options={[['_sin', 'Sin asignar'], ...supervisores.map(p => [p.id, p.nombre])]} />
            {(fEstado || fSeveridad || fCanal || fSup || busqueda) && (
              <button onClick={() => { setFEstado(''); setFSeveridad(''); setFCanal(''); setFSup(''); setBusqueda(''); }} className="text-[10px] text-zinc-400 hover:text-red-500 underline px-1">Limpiar</button>
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
              <div key={col}
                onDragOver={(e) => { e.preventDefault(); if (dropCol !== col) setDropCol(col); }}
                onDrop={(e) => { e.preventDefault(); soltarEnColumna(col); }}
                className={`w-60 flex-shrink-0 bg-zinc-950 border rounded-card ${dropCol === col && dragId ? 'border-red-600' : 'border-zinc-800'}`}>
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

// ---------- v8.26.8: PAGO DE MANO DE OBRA de la reclamación ----------
// Cada pago se registra como ajuste de nómina (tipo bono) vinculado a la
// reclamación: cae al corte abierto por su fecha y aquí se acumula como
// costo de mano de obra de la reclamación.
function PagoManoObraReclamacion({ r, data, usuario, permitido }) {
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [personaId, setPersonaId] = useState('');
  const [dias, setDias] = useState('1');
  const [tarifa, setTarifa] = useState('');
  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [guardando, setGuardando] = useState(false);
  const [reloadP, setReloadP] = useState(0);

  useEffect(() => {
    let off = false;
    (async () => {
      setLoading(true);
      try { const lista = await db.listarAjustes({ reclamacionId: r.id }); if (!off) setPagos(lista); }
      catch { if (!off) setPagos([]); }
      if (!off) setLoading(false);
    })();
    return () => { off = true; };
  }, [r.id, reloadP]);

  const total = pagos.reduce((s, a) => s + ((a.tipo === 'descuento' || a.tipo === 'adelanto') ? -a.monto : a.monto), 0);
  const nombreDe = (pid) => (data.personal || []).find(p => p.id === pid)?.nombre || pid;
  const dN = parseFloat(dias) || 0;
  const tN = parseFloat(tarifa) || 0;

  const guardar = async () => {
    if (!personaId || dN <= 0 || tN <= 0) return;
    setGuardando(true);
    try {
      await db.crearAjuste({
        id: 'a_' + Date.now(), personaId, tipo: 'bono', monto: dN * tN, fecha,
        concepto: `Reclamación${r.codigo ? ' ' + r.codigo : ''} — ${nota || 'trabajo realizado'} (${dN} día${dN !== 1 ? 's' : ''} × RD$${tN})`,
        reclamacionId: r.id, proyectoId: r.proyectoId || null, creadoPorId: usuario.id,
      });
      setAbierto(false); setPersonaId(''); setDias('1'); setTarifa(''); setNota('');
      setReloadP(x => x + 1);
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  return (
    <div className="mt-3 bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold flex items-center gap-1"><Wrench className="w-3 h-3" /> Pago de mano de obra</div>
        {total > 0 && <div className="text-xs font-bold text-green-400">{formatRD(total)}</div>}
      </div>
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
      ) : pagos.length === 0 ? (
        <div className="text-[11px] text-zinc-600">Sin pagos registrados. Lo que registres aquí cae automáticamente al corte de nómina abierto (por la fecha del pago).</div>
      ) : (
        <div className="space-y-1">
          {pagos.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-[11px] border-b border-zinc-900 pb-1">
              <div className="min-w-0">
                <span className="text-zinc-300 font-bold">{nombreDe(a.personaId)}</span>
                <span className="text-zinc-500"> · {fmtFecha(a.fecha)} · {a.concepto}</span>
                {a.aplicadoACorteId && <span className="text-green-600 ml-1">(pagado)</span>}
              </div>
              <span className="text-green-400 font-bold shrink-0">{formatRD(a.monto)}</span>
            </div>
          ))}
        </div>
      )}
      {permitido && !abierto && (
        <button onClick={() => setAbierto(true)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold uppercase py-2 rounded-card flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Registrar pago</button>
      )}
      {permitido && abierto && (
        <div className="space-y-2 border border-zinc-800 rounded-card p-2 bg-zinc-900/50">
          <select value={personaId} onChange={e => setPersonaId(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white outline-none focus:border-red-600">
            <option value="">Persona…</option>
            {(data.personal || []).filter(p => p.activo !== false).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[9px] uppercase text-zinc-500 mb-0.5">Días</div>
              <input type="text" inputMode="decimal" value={dias} onChange={e => setDias(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white text-right outline-none focus:border-red-600" />
            </div>
            <div>
              <div className="text-[9px] uppercase text-zinc-500 mb-0.5">RD$/día</div>
              <input type="text" inputMode="decimal" value={tarifa} onChange={e => setTarifa(e.target.value)} placeholder="0" className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white text-right outline-none focus:border-red-600" />
            </div>
            <div>
              <div className="text-[9px] uppercase text-zinc-500 mb-0.5">Fecha</div>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-1 py-2 text-xs text-white outline-none focus:border-red-600" />
            </div>
          </div>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Trabajo realizado (ej. reparación de filtración)" className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-white outline-none focus:border-red-600" />
          {dN > 0 && tN > 0 && <div className="text-[11px] text-zinc-400 text-right">Total: <span className="text-green-400 font-bold">{formatRD(dN * tN)}</span></div>}
          <div className="flex gap-2">
            <button onClick={() => setAbierto(false)} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-2 rounded-card">Cancelar</button>
            <button onClick={guardar} disabled={guardando || !personaId || dN <= 0 || tN <= 0} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[11px] font-black uppercase py-2 rounded-card">
              {guardando ? 'Guardando…' : 'Registrar pago'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- RESOLUCIÓN: qué y cuándo se hizo ----------
// v8.65.0: TRIAGE — clasificar una reclamación creada sin trabajo amarrado.
// Mismo menú que el form de creación: obra del ERP, cotización vieja de Odoo.
function ClasificarTrabajoReclamacion({ r, data, garantias, usuario, onGuardado }) {
  const [abierto, setAbierto] = useState(false);
  const [odooCots, setOdooCots] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // v8.74.5 (Leo): buscar por número de cotización (de cualquier cliente) y, si la cotización
  // salió a otro nombre, elegir si la reclamación pasa a ese cliente o se queda con el suyo.
  const [num, setNum] = useState('');
  const [elegida, setElegida] = useState(null); // { campos, etiqueta, clienteCot: {id?, nombre, partnerId?} }
  const [nombreNuevo, setNombreNuevo] = useState('');
  const clientes = data.clientes || [];
  const cli = clientes.find(c => c.id === r.clienteId);
  const proysCli = (data.proyectos || []).filter(p => p.clienteId === r.clienteId);
  const n = (num.match(/\d{3,}/) || [''])[0];
  const proysNum = n ? (data.proyectos || []).filter(p => String(p.referenciaOdoo || '').includes(n) && p.clienteId !== r.clienteId).slice(0, 6) : [];

  const amarrar = async (campos, etiqueta) => {
    setGuardando(true);
    try {
      await db.actualizarReclamacion(r.id, campos);
      try { await chatterCreacion('reclamacion', r.id, usuario, `Clasificó el trabajo: ${etiqueta}`); } catch {}
      onGuardado?.();
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };
  // Si el cliente de la cotización es otro, primero se pregunta; si es el mismo, se amarra directo.
  const elegir = (campos, etiqueta, clienteCot) => {
    const mismo = clienteCot && (clienteCot.id === r.clienteId || (cli && normNombre(cli.nombre) === normNombre(clienteCot.nombre)));
    if (!clienteCot || mismo) { amarrar(campos, etiqueta); return; }
    setElegida({ campos, etiqueta, clienteCot }); setNombreNuevo(clienteCot.nombre);
  };
  const confirmar = async (pasar) => {
    if (!pasar) { await amarrar(elegida.campos, elegida.etiqueta); setElegida(null); return; }
    let id = elegida.clienteCot.id;
    if (!id) {
      const existe = clientes.find(c => (elegida.clienteCot.partnerId && c.odooPartnerId === elegida.clienteCot.partnerId) || normNombre(c.nombre) === normNombre(nombreNuevo));
      if (existe) id = existe.id;
      else {
        if (!nombreNuevo.trim()) { alert('Pon el nombre del cliente.'); return; }
        id = 'cli_' + Date.now() + Math.random().toString(36).slice(2, 7);
        try { await db.crearCliente({ id, nombre: nombreNuevo.trim(), tipo: 'empresa', odooPartnerId: elegida.clienteCot.partnerId || null }); }
        catch (e) { alert('No se pudo crear el cliente: ' + (e.message || e)); return; }
      }
    }
    await amarrar({ ...elegida.campos, clienteId: id, contactoId: null }, `${elegida.etiqueta} · pasó al cliente ${nombreNuevo || elegida.clienteCot.nombre}`);
    setElegida(null);
  };
  const buscarOdoo = async (q) => {
    if (!q) { alert('La reclamación no tiene cliente del catálogo.'); return; }
    setBuscando(true);
    try {
      const j = await (await fetch(`/api/odoo/cotizaciones-cliente?q=${encodeURIComponent(q)}`)).json();
      setOdooCots(j.ok ? j.cotizaciones : []);
    } catch { setOdooCots([]); }
    setBuscando(false);
  };
  const camposProy = (p) => ({ proyectoId: p.id, referenciaCotizacion: p.referenciaOdoo || null, ubicacionId: p.ubicacionId || r.ubicacionId || null, garantiaId: (garantias.find(g => g.proyectoId === p.id)?.id) || null, asignadoA: p.supervisorId || null });

  return (
    <div className="mt-3 bg-amber-950/25 border border-amber-800/60 rounded-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-1 flex items-center justify-between">
        <span>⚠ Sin trabajo amarrado — por clasificar</span>
        {!abierto && <button onClick={() => setAbierto(true)} className="text-amber-300 hover:underline text-[10px] normal-case tracking-normal font-bold">Clasificar ahora</button>}
      </div>
      {!abierto ? (
        <div className="text-[11px] text-zinc-400">Esta reclamación no sabe de cuál obra/cotización es: sin eso no hay garantía, ni ubicación, ni responsable claro.</div>
      ) : elegida ? (
        <div className="space-y-2 text-[11px]">
          <div className="text-zinc-300">La cotización <b>{elegida.etiqueta}</b> está a nombre de <b>{elegida.clienteCot.nombre}</b>, y la reclamación de <b>{cli?.nombre || 'sin cliente'}</b>.</div>
          {!elegida.clienteCot.id && (
            <label className="block text-[10px] text-zinc-500">Nombre del cliente en el ERP (puedes corregirlo)
              <input value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" />
            </label>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button disabled={guardando} onClick={() => confirmar(true)} className="flex-1 py-1.5 bg-red-600 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase rounded-card">Pasar a {nombreNuevo || elegida.clienteCot.nombre}</button>
            <button disabled={guardando} onClick={() => confirmar(false)} className="flex-1 py-1.5 bg-zinc-800 text-zinc-200 text-[10px] font-bold uppercase rounded-card">Dejar {cli?.nombre || 'el actual'}</button>
            <button onClick={() => setElegida(null)} className="px-3 py-1.5 text-zinc-500 text-[10px] uppercase">Volver</button>
          </div>
          <div className="text-[10px] text-zinc-500">Si la pasas, hay que volver a elegir el contacto (es del otro cliente).</div>
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          <div className="flex gap-1.5">
            <input value={num} onChange={e => setNum(e.target.value)} placeholder="Número de cotización (ej. 5338)" className="flex-1 bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-amber-500 outline-none px-2 py-1.5 text-white text-xs" />
            <button disabled={!n || buscando} onClick={() => buscarOdoo(n)} className="px-3 bg-sky-800 disabled:bg-zinc-800 text-white text-[10px] font-bold uppercase rounded-card">Buscar</button>
          </div>
          {proysNum.map(p => (
            <button key={p.id} disabled={guardando} onClick={() => elegir(camposProy(p), p.referenciaOdoo || p.nombre, { id: p.clienteId, nombre: clientes.find(c => c.id === p.clienteId)?.nombre || p.cliente || '' })}
              className="w-full text-left px-2.5 py-2 rounded-card border text-xs bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-amber-500">
              <div className="font-bold truncate">{p.referenciaOdoo} · {p.nombre}</div>
              <div className="text-[10px] text-zinc-500 truncate">{clientes.find(c => c.id === p.clienteId)?.nombre}</div>
            </button>
          ))}
          {proysCli.map(p => (
            <button key={p.id} disabled={guardando} onClick={() => amarrar(camposProy(p), p.referenciaOdoo || p.nombre)}
              className="w-full text-left px-2.5 py-2 rounded-card border text-xs bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-amber-500">
              <div className="font-bold truncate">{p.referenciaOdoo || 'sin ref'} · {p.nombre}</div>
            </button>
          ))}
          {odooCots === null ? (
            <button onClick={() => buscarOdoo(cli?.nombre)} disabled={buscando} className="w-full text-left px-2.5 py-2 rounded-card border border-dashed border-sky-800 text-sky-300 hover:border-sky-500 text-[11px] font-bold">{buscando ? 'Buscando en Odoo…' : '🔎 Buscar cotizaciones viejas del cliente en Odoo'}</button>
          ) : odooCots.length === 0 ? (
            <div className="text-[11px] text-amber-400 px-2 py-1">Sin cotizaciones en Odoo para esa búsqueda.</div>
          ) : odooCots.map(c => {
            const clCot = clientes.find(x => (c.partnerId && x.odooPartnerId === c.partnerId) || normNombre(x.nombre) === normNombre(c.cliente));
            return (
              <button key={c.referencia} disabled={guardando} onClick={() => elegir({ referenciaCotizacion: c.referencia }, c.referencia + ' (Odoo)', clCot ? { id: clCot.id, nombre: clCot.nombre } : { nombre: c.cliente, partnerId: c.partnerId })}
                className="w-full text-left px-2.5 py-2 rounded-card border text-xs bg-zinc-950 border-sky-900/60 text-zinc-300 hover:border-sky-500">
                <div className="font-bold">{c.referencia} <span className="text-[10px] text-sky-400">· Odoo</span></div>
                <div className="text-[10px] text-zinc-500">{c.fecha} · RD$ {Number(c.monto).toLocaleString()} · {c.cliente}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// v8.65.0: catálogo de causa raíz — la estadística de calidad (por qué reclamó).
const CAUSAS_RAIZ = [
  ['aplicacion', 'Falla de aplicación (nuestra)'],
  ['sistema_producto', 'Sistema / producto'],
  ['sustrato_estructura', 'Sustrato o estructura (ajeno al sistema)'],
  ['mal_uso_cliente', 'Mal uso / intervención del cliente'],
  ['fuera_garantia', 'Fuera de garantía / otro trabajo'],
  ['otro', 'Otro'],
];

function ResolucionReclamacion({ r, onGuardado }) {
  const [trabajo, setTrabajo] = useState(r.trabajoRealizado || '');
  const [fecha, setFecha] = useState(r.fechaResuelta || '');
  const [causa, setCausa] = useState(r.causaRaiz || ''); // v8.65.0
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(!r.trabajoRealizado && !r.fechaResuelta);
  useEffect(() => { setTrabajo(r.trabajoRealizado || ''); setFecha(r.fechaResuelta || ''); setCausa(r.causaRaiz || ''); }, [r.id]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await db.actualizarReclamacion(r.id, { trabajoRealizado: trabajo, fechaResuelta: fecha || null, causaRaiz: causa || null });
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
          {/* v8.65.0: causa raíz — obligatoria para marcar resuelta */}
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">¿Por qué reclamó? (causa raíz) *</div>
            <select value={causa} onChange={e => setCausa(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-xs text-white outline-none focus:border-red-600">
              <option value="">— elegir —</option>
              {CAUSAS_RAIZ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button onClick={guardar} disabled={guardando} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-card">{guardando ? 'Guardando…' : 'Guardar resolución'}</button>
        </div>
      ) : (
        <div className="text-sm text-zinc-300">
          <div className="text-[11px] text-zinc-500 mb-1">{r.fechaResuelta ? `Realizado el ${fmtFecha(r.fechaResuelta)}` : 'Sin fecha registrada'}</div>
          <div className="whitespace-pre-wrap">{r.trabajoRealizado || 'Sin descripción del trabajo realizado.'}</div>
          {r.causaRaiz && <div className="text-[11px] text-emerald-400/90 mt-1">🔍 Causa: {(CAUSAS_RAIZ.find(c => c[0] === r.causaRaiz) || [])[1] || r.causaRaiz}</div>}
        </div>
      )}
    </div>
  );
}

// ---------- v8.53.1 (Fase 3B): Informe de solución entregado al cliente ----------
// Cierra el ciclo de la reclamación. Sube el PDF del informe + registra la fecha de entrega.
// v8.68.0: una sola función marca el informe entregado — la usan la subida manual y el
// informe de visita generado en el ERP (ModalInformeVisitaPDF).
async function marcarInformeEntregado(r, { fecha, url, nombre }) {
  const yaEntregado = !!r.informeEntregadoAt;
  await db.actualizarReclamacion(r.id, {
    informeEntregadoAt: new Date(fecha + 'T12:00:00').toISOString(),
    informeUrl: url || null, informeNombre: nombre || null,
  });
  // v8.54.0 (C1): la entrega del informe queda en la bitácora de comunicación (solo la 1ª vez).
  if (!yaEntregado) { try { registrarComunicacion('reclamacion', r.id, { canal: 'correo', direccion: 'saliente', cuerpo: `Informe de solución entregado al cliente${nombre ? ` (${nombre})` : ''}.`, meta: { informeUrl: url || null } }); } catch { /* noop */ } }
}

function InformeSolucionReclamacion({ r, onGuardado, cliente, clienteNombre, ubicacion, ubicacionNombre, proyecto, usuario }) {
  const [modalVisita, setModalVisita] = useState(false); // v8.68.0
  const entregado = !!r.informeEntregadoAt;
  const hoyISO = () => new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(r.informeEntregadoAt ? r.informeEntregadoAt.slice(0, 10) : hoyISO());
  const [url, setUrl] = useState(r.informeUrl || '');
  const [nombre, setNombre] = useState(r.informeNombre || '');
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(!entregado);
  useEffect(() => {
    setFecha(r.informeEntregadoAt ? r.informeEntregadoAt.slice(0, 10) : hoyISO());
    setUrl(r.informeUrl || ''); setNombre(r.informeNombre || ''); setEditando(!r.informeEntregadoAt);
  }, [r.id]);

  const subirPDF = async (file) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const u = await db.subirInformeReclamacion(file, r.id, file.name);
      setUrl(u); setNombre(file.name);
    } catch (e) { alert('No se pudo subir el PDF: ' + (e.message || e)); }
    setSubiendo(false);
  };
  const guardar = async () => {
    if (!fecha) { alert('Indica la fecha de entrega del informe.'); return; }
    setGuardando(true);
    try {
      await marcarInformeEntregado(r, { fecha, url, nombre });
      setEditando(false);
      if (onGuardado) await onGuardado();
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  return (
    <div className={`mt-3 rounded-card p-3 border ${entregado && !editando ? 'bg-emerald-950/30 border-emerald-800/60' : 'bg-zinc-950 border-zinc-800'}`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Informe de solución entregado al cliente</span>
        <span className="flex items-center gap-2">
          {/* v8.68.0: generar el informe de visita en PDF desde el ERP */}
          <button onClick={() => setModalVisita(true)} className="text-emerald-400 hover:underline text-[10px] normal-case tracking-normal flex items-center gap-1"><FileText className="w-3 h-3" /> Generar informe de visita</button>
          {entregado && !editando && <button onClick={() => setEditando(true)} className="text-red-400 hover:underline text-[10px] normal-case tracking-normal">Editar</button>}
        </span>
      </div>
      {modalVisita && (
        <ModalInformeVisitaPDF r={r} cliente={cliente} clienteNombre={clienteNombre} ubicacion={ubicacion} ubicacionNombre={ubicacionNombre}
          proyecto={proyecto} usuario={usuario} causasRaiz={CAUSAS_RAIZ} onCerrar={() => setModalVisita(false)}
          onGuardarInforme={async (blob, nombreArchivo) => {
            // mismo bucket/path que la subida manual + misma función que marca entregado
            const u = await db.subirInformeReclamacion(blob, r.id, nombreArchivo);
            await marcarInformeEntregado(r, { fecha: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date()), url: u, nombre: nombreArchivo });
            setUrl(u); setNombre(nombreArchivo); setEditando(false);
            if (onGuardado) await onGuardado();
          }} />
      )}
      {editando ? (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">Fecha de entrega al cliente</div>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-xs text-white outline-none focus:border-red-600" />
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">PDF del informe (opcional pero recomendado)</div>
            {url ? (
              <div className="flex items-center gap-2 text-xs">
                <a href={url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline flex items-center gap-1"><FileText className="w-3 h-3" /> {nombre || 'Ver PDF'}</a>
                <button onClick={() => { setUrl(''); setNombre(''); }} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <label className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-card border border-zinc-700 text-xs cursor-pointer hover:border-zinc-500 ${subiendo ? 'opacity-60' : ''}`}>
                {subiendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} {subiendo ? 'Subiendo…' : 'Subir PDF'}
                <input type="file" accept="application/pdf" className="hidden" disabled={subiendo} onChange={e => subirPDF(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <button onClick={guardar} disabled={guardando || subiendo} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-card flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {guardando ? 'Guardando…' : 'Marcar informe entregado'}</button>
        </div>
      ) : (
        <div className="text-sm text-zinc-300">
          <div className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Entregado el {fmtFecha(r.informeEntregadoAt.slice(0, 10))}</div>
          {r.informeUrl && <a href={r.informeUrl} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 mt-1"><FileText className="w-3 h-3" /> {r.informeNombre || 'Ver PDF del informe'}</a>}
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
// v8.53.4: selector de contacto del cliente (tabla contactos). Solo para EMPRESAS; para
// clientes PERSONA el contacto es el cliente mismo, así que no se muestra. Carga los contactos
// del cliente y solo ofrece los localizables (con WhatsApp o correo).
function SelectorContactoCliente({ clienteId, value, onChange, autoPrincipal = true }) {
  const [contactos, setContactos] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!clienteId) { setContactos([]); return; }
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const cs = await db.listarContactos(clienteId);
        if (cancel) return;
        setContactos(cs);
        if (autoPrincipal && !value) {
          const pr = cs.find(c => c.esPrincipal && contactoLocalizable(c)) || cs.find(c => contactoLocalizable(c));
          if (pr) onChange(pr.id);
        }
      } catch { if (!cancel) setContactos([]); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [clienteId]);

  // v8.74.2 (Leo): agregar el contacto aquí mismo, sin salir a la ficha del cliente.
  const [nuevo, setNuevo] = useState(null); // { nombre, whatsapp, email }
  const [guardandoCt, setGuardandoCt] = useState(false);
  const guardarNuevo = async () => {
    const ct = { id: 'ct_' + Date.now() + Math.random().toString(36).slice(2, 7), clienteId, nombre: nuevo.nombre.trim(), whatsapp: nuevo.whatsapp.trim() || null, email: nuevo.email.trim() || null, esPrincipal: !contactos.length };
    if (!ct.nombre) { alert('Pon el nombre del contacto.'); return; }
    if (!contactoLocalizable(ct)) { alert('Pon su WhatsApp o su correo.'); return; }
    setGuardandoCt(true);
    try { await db.crearContacto(ct); setContactos(cs => [...cs, ct]); onChange(ct.id); setNuevo(null); }
    catch (e) { alert('No se pudo guardar el contacto: ' + (e.message || e)); }
    setGuardandoCt(false);
  };
  const localizables = contactos.filter(contactoLocalizable);
  if (loading) return <div className="text-[11px] text-zinc-500">Cargando contactos…</div>;
  const inp = 'w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs';
  if (nuevo) return (
    <div className="space-y-1.5 border border-zinc-800 rounded-card p-2 bg-zinc-900/40">
      <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre del contacto" autoFocus className={inp} />
      <div className="grid grid-cols-2 gap-1.5">
        <input value={nuevo.whatsapp} onChange={e => setNuevo({ ...nuevo, whatsapp: e.target.value })} placeholder="WhatsApp" inputMode="tel" className={inp} />
        <input value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })} placeholder="Correo" inputMode="email" className={inp} />
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => setNuevo(null)} className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase rounded-card">Cancelar</button>
        <button onClick={guardarNuevo} disabled={guardandoCt} className="flex-1 py-1.5 bg-red-600 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase rounded-card">{guardandoCt ? 'Guardando…' : 'Guardar contacto'}</button>
      </div>
    </div>
  );
  const botonNuevo = <button onClick={() => setNuevo({ nombre: '', whatsapp: '', email: '' })} className="text-[10px] font-bold uppercase text-sky-300 hover:text-white">+ Agregar contacto</button>;
  if (!localizables.length) return (
    <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded-card px-2 py-1.5 flex items-center justify-between gap-2">
      <span>⚠ Este cliente no tiene contactos con WhatsApp o correo.</span>{botonNuevo}
    </div>
  );
  return (
    <div className="space-y-1">
    <select value={value || ''} onChange={e => onChange(e.target.value || null)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs">
      <option value="">— Elige contacto —</option>
      {localizables.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cargo ? ` (${c.cargo})` : ''} · {(c.whatsapp || c.telefono) ? `📱 ${c.whatsapp || c.telefono}` : ''}{c.email ? ` ✉ ${c.email}` : ''}</option>)}
    </select>
    <div className="text-right">{botonNuevo}</div>
    </div>
  );
}

// v8.53.4: panel de contacto del cliente en el detalle. Empresa → contacto de sus `contactos`
// (asignable); persona → el cliente es el contacto. Marca cuando falta un contacto localizable.
function ContactoReclamacion({ r, cliente, ubicacion, onGuardado }) {
  const esEmpresa = !cliente || cliente.tipo !== 'persona';
  const [contactos, setContactos] = useState([]);
  const [editando, setEditando] = useState(false);
  const [sel, setSel] = useState(r.contactoId || '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (!esEmpresa || !r.clienteId) { setContactos([]); return; }
    let cancel = false;
    (async () => { try { const cs = await db.listarContactos(r.clienteId); if (!cancel) setContactos(cs); } catch { if (!cancel) setContactos([]); } })();
    return () => { cancel = true; };
  }, [r.clienteId, esEmpresa]);
  useEffect(() => { setSel(r.contactoId || ''); setEditando(false); }, [r.id]);

  const asignado = contactos.find(c => c.id === r.contactoId) || null;
  const info = resolverContacto({ cliente, contacto: asignado, ubicacion });
  const localizables = contactos.filter(contactoLocalizable);

  const guardar = async () => {
    setGuardando(true);
    try { await db.actualizarReclamacion(r.id, { contactoId: sel || null }); setEditando(false); if (onGuardado) await onGuardado(); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(false);
  };

  const bordeAlerta = (info.requiereAsignar || !info.localizable);
  return (
    <div className={`mt-3 rounded-card p-3 border ${bordeAlerta ? 'bg-amber-950/30 border-amber-800/60' : 'bg-zinc-950 border-zinc-800'}`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Contacto del cliente {esEmpresa ? '' : '(cliente personal)'}</span>
        {esEmpresa && !editando && <button onClick={() => setEditando(true)} className="text-red-400 hover:underline text-[10px] normal-case tracking-normal">{r.contactoId ? 'Cambiar' : 'Asignar'}</button>}
      </div>
      {esEmpresa && editando ? (
        <div className="space-y-2">
          {localizables.length ? (
            <select value={sel || ''} onChange={e => setSel(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs">
              <option value="">— Elige contacto —</option>
              {localizables.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cargo ? ` (${c.cargo})` : ''} · {(c.whatsapp || c.telefono) ? `📱 ${c.whatsapp || c.telefono}` : ''}{c.email ? ` ✉ ${c.email}` : ''}</option>)}
            </select>
          ) : <div className="text-[11px] text-amber-400">Este cliente no tiene contactos con WhatsApp o correo. Agrégalo en la ficha del cliente.</div>}
          <div className="flex gap-2">
            <button onClick={() => setEditando(false)} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-1.5 rounded-card">Cancelar</button>
            <button onClick={guardar} disabled={guardando || !sel} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-card">{guardando ? 'Guardando…' : 'Guardar contacto'}</button>
          </div>
        </div>
      ) : (
        info.localizable ? (
          <div className="text-sm text-zinc-200">
            <span className="font-bold">{info.nombre || (info.esPersona ? cliente?.nombre : 'Contacto')}</span>
            <span className="text-zinc-400 text-xs"> · {[info.tel && `📱 ${info.tel}`, info.email && `✉ ${info.email}`].filter(Boolean).join(' · ')}</span>
            {info.requiereAsignar && <div className="text-[11px] text-amber-400 mt-1">⚠ Falta asignar un contacto formal del cliente (se está usando el dato de la ubicación/cliente).</div>}
          </div>
        ) : (
          <div className="text-[12px] text-amber-400 font-bold">⚠ Sin contacto localizable — {esEmpresa ? 'asigna un contacto del cliente con WhatsApp o correo.' : 'completa el teléfono o correo del cliente en su ficha.'}</div>
        )
      )}
    </div>
  );
}

function ModalNuevaReclamacion({ data, usuario, ubicaciones, garantias, onCerrar, onCreada }) {
  const [clienteId, setClienteId] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [contactoId, setContactoId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [severidad, setSeveridad] = useState('media');
  const [canal, setCanal] = useState('interno');
  const [guardando, setGuardando] = useState(false);
  // v8.63.0 (Leo): el TRABAJO es el paso central — obra del ERP, cotización vieja
  // de Odoo (obras de antes del ERP), o "no identificado" (triage en 24h).
  const [trabajoSel, setTrabajoSel] = useState(null); // {tipo:'erp',proyectoId} | {tipo:'odoo',ref} | {tipo:'desconocido'}
  const [odooAbierto, setOdooAbierto] = useState(false);
  const [odooCots, setOdooCots] = useState(null); // null=no buscado · []=sin resultados
  const [odooBuscando, setOdooBuscando] = useState(false);

  const [clientesNuevos, setClientesNuevos] = useState([]); // v8.74.1: creados aquí desde una cotización de Odoo
  // v8.74.3 (Leo): locación obligatoria (elegir o crear aquí) y, si la obra es de antes del ERP, la garantía también.
  const [ubicsNuevas, setUbicsNuevas] = useState([]);
  const [nuevaUbic, setNuevaUbic] = useState(null); // { nombre, direccion, ciudad }
  const [gar, setGar] = useState({ fechaInicio: '', anios: '', sistemaId: '', m2: '' });
  const clientes = [...(data.clientes || []).filter(c => !c.archivado), ...clientesNuevos];
  const cli = clientes.find(c => c.id === clienteId);
  const esEmpresa = cli && cli.tipo !== 'persona'; // v8.53.4: persona = el cliente es el contacto
  const clientePersonaLocalizable = cli && !esEmpresa && !!((cli.telefonoPrincipal || '').trim() || (cli.emailPrincipal || '').trim());
  const ubicsCli = [...ubicaciones, ...ubicsNuevas].filter(u => u.clienteId === clienteId);
  const listaSistemas = Array.isArray(data.sistemas) ? data.sistemas : Object.entries(data.sistemas || {}).map(([id, v]) => ({ id, ...v }));
  const nombreSis = (x) => x?.data?.nombre || x?.nombre || x?.name || x?.id;
  // Garantía de una cotización vieja: se reusa si ya existe por la referencia; si no, hay que crearla.
  const garantiaOdoo = trabajoSel?.tipo === 'odoo' ? garantias.find(g => String(g.referenciaCotizacion || '').toUpperCase() === String(trabajoSel.ref).toUpperCase()) : null;
  const pideGarantia = trabajoSel?.tipo === 'odoo' && !garantiaOdoo;
  // v8.74.3 (Leo): los m² y el sistema se leen de la cotización de Odoo.
  const [sisCot, setSisCot] = useState(null); // null=leyendo · [] = no reconoció sistemas
  const aniosDe = (id) => { const x = listaSistemas.find(y => y.id === id); const m = x?.garantia_meses || x?.garantiaMeses || x?.data?.garantia_meses; return m ? String(m / 12) : ''; };
  useEffect(() => {
    if (!pideGarantia) { setSisCot(null); return; }
    let vivo = true;
    setSisCot(null);
    fetch(`/api/odoo/cotizacion-ref?ref=${encodeURIComponent(trabajoSel.ref)}`).then(r => r.json()).then(j => {
      if (!vivo) return;
      const lista = j.ok ? sistemasDeCotizacion(j.cotizacion, listaSistemas) : [];
      setSisCot(lista);
      const p = lista[0];
      if (p) setGar(g => ({ ...g, sistemaId: p.sistemaId, m2: String(p.m2 || ''), anios: g.anios || aniosDe(p.sistemaId) }));
      const f = j.ok && j.cotizacion?.fechaOrden ? String(j.cotizacion.fechaOrden).slice(0, 10) : '';
      if (f) setGar(g => ({ ...g, fechaInicio: g.fechaInicio || f }));
    }).catch(() => vivo && setSisCot([]));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pideGarantia, trabajoSel?.ref]);
  const crearUbicAqui = async () => {
    if (!nuevaUbic.nombre.trim()) { alert('Ponle nombre a la locación.'); return; }
    try {
      const u = await db.crearUbicacionCliente({ clienteId, nombre: nuevaUbic.nombre.trim(), direccion: nuevaUbic.direccion.trim() || null, ciudad: nuevaUbic.ciudad.trim() || null });
      setUbicsNuevas(us => [...us, u]); setUbicacionId(u.id); setNuevaUbic(null);
    } catch (e) { alert('No se pudo crear la locación: ' + (e.message || e)); }
  };
  // Sin filtrar archivados: una reclamación suele ser de una obra YA terminada.
  const proysCli = (data.proyectos || []).filter(p => p.clienteId === clienteId);
  const garantiaDeProy = garantias.find(g => g.proyectoId === proyectoId);

  const elegirTrabajoERP = (p) => {
    setTrabajoSel({ tipo: 'erp', proyectoId: p.id });
    setProyectoId(p.id);
    if (p.ubicacionId) setUbicacionId(p.ubicacionId); // la obra trae su ubicación
  };
  const buscarEnOdoo = async () => {
    if (!cli) return;
    setOdooAbierto(true); setOdooBuscando(true);
    try {
      const r = await fetch(`/api/odoo/cotizaciones-cliente?q=${encodeURIComponent(cli.nombre)}`);
      const j = await r.json();
      setOdooCots(j.ok ? j.cotizaciones : []);
    } catch { setOdooCots([]); }
    setOdooBuscando(false);
  };

  const guardar = async () => {
    if (!clienteId) { alert('Elige el cliente.'); return; }
    // v8.63.0: el trabajo es obligatorio — obra ERP, cotización de Odoo, o "no identificado" explícito.
    if (!trabajoSel) { alert('Elige de cuál trabajo es la reclamación (o marca "no identificado aún").'); return; }
    if (trabajoSel.tipo !== 'desconocido' && !ubicacionId) { alert('Elige o crea la locación del trabajo.'); return; }
    if (pideGarantia && (!gar.fechaInicio || !Number(gar.anios) || !gar.sistemaId)) { alert('Esta obra es de antes del ERP: completa la garantía (fecha de entrega, años y sistema).'); return; }
    if (!descripcion.trim()) { alert('Describe la reclamación.'); return; }
    // v8.53.4: contacto obligatorio con WhatsApp o correo (empresa: de sus contactos; persona: el cliente).
    if (esEmpresa && !contactoId) { alert('Elige un contacto del cliente (con WhatsApp o correo) para dar seguimiento.'); return; }
    if (!esEmpresa && !clientePersonaLocalizable) { alert('Este cliente (persona) no tiene teléfono ni correo. Complétalo en su ficha para poder contactarlo.'); return; }
    setGuardando(true);
    try {
      const proy = trabajoSel.tipo === 'erp' ? (data.proyectos || []).find(p => p.id === trabajoSel.proyectoId) : null;
      let garOdooId = garantiaOdoo?.id || null;
      if (pideGarantia) {
        const sis = listaSistemas.find(x => x.id === gar.sistemaId);
        const g = await db.crearGarantia({
          clienteId, ubicacionId, referenciaCotizacion: trabajoSel.ref, sistemaId: gar.sistemaId, sistemaNombre: nombreSis(sis),
          fechaInicio: gar.fechaInicio, duracionMeses: Math.round(Number(gar.anios) * 12), m2: gar.m2 ? Number(gar.m2) : null,
          origen: 'reclamacion', notas: 'Creada al abrir una reclamación (obra de antes del ERP).',
        }, { cadaMeses: sis?.mantenimiento_cada_meses || sis?.mantenimientoCadaMeses || null }); // v8.74.4: con su calendario de mantenimientos
        garOdooId = g.id;
      }
      const rec = await db.crearReclamacion({
        clienteId: clienteId || null, ubicacionId: ubicacionId || null,
        proyectoId: proy?.id || null,
        contactoId: esEmpresa ? (contactoId || null) : null,
        garantiaId: proy ? (garantias.find(g => g.proyectoId === proy.id)?.id || null) : garOdooId,
        referenciaCotizacion: trabajoSel.tipo === 'odoo' ? trabajoSel.ref : (proy?.referenciaOdoo || null),
        // v8.63.0: responsable automático = el supervisor de la obra (puede cambiarse luego)
        asignadoA: proy?.supervisorId || null,
        notas: trabajoSel.tipo === 'desconocido' ? '⚠ Trabajo no identificado al crear — clasificar.' : null,
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
            {/* v8.49.11 (ticket Edwin): buscador con sugerencias — el select plano no servía con cientos de clientes */}
            <BuscadorCliente clientes={clientes} clienteId={clienteId} proyectos={data.proyectos || []}
              onElegir={(id) => { setClienteId(id); setUbicacionId(''); setProyectoId(''); setContactoId(''); setTrabajoSel(null); setOdooAbierto(false); setOdooCots(null); }}
              onClienteCreado={(c) => setClientesNuevos(cs => [...cs, c])}
              onElegirCotizacion={(id, t) => {
                // v8.74.1 (Leo): abrir por número de cotización — trae cliente y trabajo de una vez.
                setClienteId(id); setUbicacionId(''); setContactoId(''); setOdooAbierto(false); setOdooCots(null);
                if (t.tipo === 'erp') elegirTrabajoERP(t.proyecto);
                else { setTrabajoSel({ tipo: 'odoo', ref: t.ref }); setProyectoId(''); }
              }} />
          </div>
          {clienteId && (
            <>
            {/* v8.63.0 (Leo): ¿DE CUÁL TRABAJO ES? — el amarre a la obra/cotización es el
                corazón de la reclamación: trae ubicación, garantía y responsable. */}
            <div>
              <div className="text-[10px] uppercase text-zinc-500 mb-1">¿De cuál trabajo es? *</div>
              <div className="space-y-1 max-h-44 overflow-y-auto border border-zinc-800 rounded-card p-1.5 bg-zinc-900/40">
                {/* v8.74.2: la cotización elegida desde el buscador por número se ve marcada */}
                {trabajoSel?.tipo === 'odoo' && !(odooCots || []).some(c => c.referencia === trabajoSel.ref) && (
                  <div className="px-2.5 py-2 rounded-card border text-xs bg-sky-600/15 border-sky-500 text-white font-bold">{trabajoSel.ref} <span className="text-[10px] text-sky-400">· Odoo · elegida</span></div>
                )}
                {proysCli.length === 0 && trabajoSel?.tipo !== 'odoo' && <div className="text-[11px] text-zinc-500 px-1.5 py-1">Este cliente no tiene obras en el ERP — busca su cotización en Odoo abajo.</div>}
                {proysCli.map(p => {
                  const sel = trabajoSel?.tipo === 'erp' && trabajoSel.proyectoId === p.id;
                  const gar = garantias.find(g => g.proyectoId === p.id);
                  const ubi = ubicaciones.find(u => u.id === p.ubicacionId);
                  return (
                    <button key={p.id} onClick={() => elegirTrabajoERP(p)}
                      className={`w-full text-left px-2.5 py-2 rounded-card border text-xs ${sel ? 'bg-red-600/15 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600'}`}>
                      <div className="font-bold truncate">{p.referenciaOdoo || p.referenciaProyecto || 'sin ref'} · {p.nombre}</div>
                      <div className="text-[10px] text-zinc-500 flex gap-2 flex-wrap">
                        {ubi && <span>📍 {ubi.nombre}</span>}
                        {gar && <span className="text-emerald-400">🛡 con garantía</span>}
                        {p.archivado && <span>archivada</span>}
                      </div>
                    </button>
                  );
                })}
                {/* Obras de ANTES del ERP: la cotización vive solo en Odoo */}
                {!odooAbierto ? (
                  <button onClick={buscarEnOdoo} className="w-full text-left px-2.5 py-2 rounded-card border border-dashed border-sky-800 text-sky-300 hover:border-sky-500 text-[11px] font-bold">
                    🔎 No está aquí — buscar cotizaciones viejas del cliente en Odoo
                  </button>
                ) : odooBuscando ? (
                  <div className="text-[11px] text-zinc-500 px-2 py-1.5">Buscando en Odoo…</div>
                ) : (
                  <>
                    {(odooCots || []).map(c => {
                      const sel = trabajoSel?.tipo === 'odoo' && trabajoSel.ref === c.referencia;
                      return (
                        <button key={c.referencia} onClick={() => { setTrabajoSel({ tipo: 'odoo', ref: c.referencia }); setProyectoId(''); }}
                          className={`w-full text-left px-2.5 py-2 rounded-card border text-xs ${sel ? 'bg-sky-600/15 border-sky-500 text-white' : 'bg-zinc-950 border-sky-900/60 text-zinc-300 hover:border-sky-600'}`}>
                          <div className="font-bold">{c.referencia} <span className="text-[10px] text-sky-400">· Odoo</span></div>
                          <div className="text-[10px] text-zinc-500">{c.fecha} · RD$ {Number(c.monto).toLocaleString()} · {c.cliente}</div>
                        </button>
                      );
                    })}
                    {odooCots && odooCots.length === 0 && <div className="text-[11px] text-amber-400 px-2 py-1">Sin cotizaciones en Odoo para este nombre de cliente.</div>}
                  </>
                )}
                <button onClick={() => { setTrabajoSel({ tipo: 'desconocido' }); setProyectoId(''); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-card border text-[11px] ${trabajoSel?.tipo === 'desconocido' ? 'bg-amber-600/15 border-amber-600 text-amber-200' : 'border-zinc-800 text-zinc-500 hover:text-amber-300'}`}>
                  ⚠ No identificado aún — la oficina lo clasifica en 24h
                </button>
              </div>
            </div>
            {/* Ubicación: viene sola con la obra del ERP; editable solo si falta */}
            {trabajoSel && (
              <div>
                <div className="text-[10px] uppercase text-zinc-500 mb-1">Locación{trabajoSel.tipo !== 'desconocido' ? ' *' : ''}</div>
                {ubicacionId && trabajoSel.tipo === 'erp' ? (
                  <div className="flex items-center gap-2 text-[11px] text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded-card px-2 py-1.5">
                    📍 {ubicsCli.find(u => u.id === ubicacionId)?.nombre || 'de la obra'} <span className="text-zinc-500">(de la obra)</span>
                    <button onClick={() => setUbicacionId('')} className="ml-auto text-zinc-500 hover:text-white text-[10px] underline">cambiar</button>
                  </div>
                ) : (
                  nuevaUbic ? (
                    <div className="space-y-1.5 border border-zinc-800 rounded-card p-2 bg-zinc-900/40">
                      <input value={nuevaUbic.nombre} onChange={e => setNuevaUbic({ ...nuevaUbic, nombre: e.target.value })} placeholder="Nombre (ej. Oficina principal)" autoFocus className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" />
                      <div className="grid grid-cols-2 gap-1.5">
                        <input value={nuevaUbic.direccion} onChange={e => setNuevaUbic({ ...nuevaUbic, direccion: e.target.value })} placeholder="Dirección" className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" />
                        <input value={nuevaUbic.ciudad} onChange={e => setNuevaUbic({ ...nuevaUbic, ciudad: e.target.value })} placeholder="Ciudad" className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" />
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => setNuevaUbic(null)} className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase rounded-card">Cancelar</button>
                        <button onClick={crearUbicAqui} className="flex-1 py-1.5 bg-red-600 text-white text-[10px] font-black uppercase rounded-card">Guardar locación</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs"><option value="">{ubicsCli.length ? '— elegir —' : '— este cliente no tiene locaciones —'}</option>{ubicsCli.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.ciudad ? ` · ${u.ciudad}` : ''}</option>)}</select>
                      <div className="text-right"><button onClick={() => setNuevaUbic({ nombre: '', direccion: '', ciudad: '' })} className="text-[10px] font-bold uppercase text-sky-300 hover:text-white">+ Nueva locación</button></div>
                    </div>
                  )
                )}
              </div>
            )}
            {trabajoSel?.tipo === 'odoo' && (
              <div>
                <div className="text-[10px] uppercase text-zinc-500 mb-1">Garantía{pideGarantia ? ' *' : ''}</div>
                {garantiaOdoo ? (
                  <div className="text-[11px] text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded-card px-2 py-1.5">🛡 {garantiaOdoo.codigo || 'Garantía'} · {garantiaOdoo.sistemaNombre || ''} · vence {garantiaOdoo.fechaVencimiento || '—'}</div>
                ) : (
                  <div className="space-y-1.5 border border-amber-800/50 rounded-card p-2 bg-amber-950/20">
                    <div className="text-[10px] text-amber-300">Obra de antes del ERP: registra su garantía para saber si la reclamación está cubierta.</div>
                    {sisCot === null
                      ? <div className="text-[10px] text-zinc-500">Leyendo la cotización en Odoo…</div>
                      : sisCot.length
                        ? <div className="text-[10px] text-zinc-400">De la cotización: {sisCot.map(x => `${x.nombre} ${x.m2.toLocaleString()} m²`).join(' · ')}</div>
                        : <div className="text-[10px] text-zinc-500">No reconocí el sistema en la cotización: elígelo y pon los m².</div>}
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="text-[10px] text-zinc-500">Fecha de entrega (aprox.)<input type="date" value={gar.fechaInicio} onChange={e => setGar({ ...gar, fechaInicio: e.target.value })} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" /></label>
                      <label className="text-[10px] text-zinc-500">Años de garantía<input type="number" min="1" value={gar.anios} onChange={e => setGar({ ...gar, anios: e.target.value })} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" /></label>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select value={gar.sistemaId} onChange={e => { const id = e.target.value; const deCot = (sisCot || []).find(x => x.sistemaId === id); setGar({ ...gar, sistemaId: id, anios: aniosDe(id) || gar.anios, m2: deCot ? String(deCot.m2) : gar.m2 }); }} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs">
                        <option value="">— Sistema —</option>{listaSistemas.map(x => <option key={x.id} value={x.id}>{nombreSis(x)}</option>)}
                      </select>
                      <input type="number" min="0" value={gar.m2} onChange={e => setGar({ ...gar, m2: e.target.value })} placeholder="m²" className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* v8.53.4: contacto del cliente — obligatorio para empresas (de sus contactos, con WS/correo) */}
            <div>
              <div className="text-[10px] uppercase text-zinc-500 mb-1">Contacto del cliente *</div>
              {esEmpresa
                ? <SelectorContactoCliente clienteId={clienteId} value={contactoId} onChange={setContactoId} />
                : <div className={`text-[11px] rounded-card px-2 py-1.5 border ${clientePersonaLocalizable ? 'text-zinc-300 bg-zinc-900 border-zinc-800' : 'text-amber-400 bg-amber-950/30 border-amber-800/50'}`}>
                    {clientePersonaLocalizable
                      ? <>Cliente personal — el contacto es el cliente: {[cli.telefonoPrincipal && `📱 ${cli.telefonoPrincipal}`, cli.emailPrincipal && `✉ ${cli.emailPrincipal}`].filter(Boolean).join(' · ')}</>
                      : <>⚠ Cliente personal sin teléfono ni correo. Complétalo en su ficha para poder contactarlo.</>}
                  </div>}
            </div>
            </>
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

// v8.49.11 (ticket Edwin): buscador de cliente con sugerencias en vivo.
// v8.74.1 (Leo): también por número de cotización — "5338" encuentra ST-C5338 (obra del ERP o, si es vieja, en Odoo).
const normNombre = (s) => String(s || '').split(',')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b(S ?R ?L|S ?A ?S|S ?A|EIRL)\b/g, ' ').replace(/\s+/g, ' ').trim();
function BuscadorCliente({ clientes, clienteId, proyectos = [], onElegir, onElegirCotizacion, onClienteCreado }) {
  const elegido = clientes.find(c => c.id === clienteId);
  const [texto, setTexto] = useState('');
  const [foco, setFoco] = useState(false);
  const [odoo, setOdoo] = useState(null); // cotizaciones de Odoo por número
  const q = texto.toLowerCase().trim();
  const num = (q.match(/\d{3,}/) || [''])[0]; // "stc5338", "st-c5338" o "5338" → 5338
  const esNumero = !!num;
  const sugerencias = q.length >= 2 ? clientes.filter(c => (c.nombre || '').toLowerCase().includes(q)).slice(0, 10) : [];
  const cliPorId = new Map(clientes.map(c => [c.id, c]));
  const obras = esNumero ? proyectos.filter(p => cliPorId.has(p.clienteId) && String(p.referenciaOdoo || '').includes(num)).slice(0, 8) : [];
  const refsErp = new Set(obras.map(p => String(p.referenciaOdoo || '').toUpperCase()));
  const cliDeOdoo = (c) => clientes.find(x => c.partnerId && x.odooPartnerId === c.partnerId)
    || (normNombre(c.cliente) && clientes.find(x => normNombre(x.nombre) === normNombre(c.cliente))) || null;
  const [creando, setCreando] = useState(false);
  // Cotización vieja de un cliente que no está en el ERP: se crea con el nombre y el id de Odoo.
  const [porCrear, setPorCrear] = useState(null); // v8.74.5: { c, nombre } — revisar el nombre antes de crear el cliente
  const elegirOdoo = (c) => {
    const cl = cliDeOdoo(c);
    if (cl) { onElegirCotizacion?.(cl.id, { tipo: 'odoo', ref: c.referencia }); return; }
    setPorCrear({ c, nombre: c.cliente });
  };
  const crearYElegir = async () => {
    const nombre = porCrear.nombre.trim();
    if (!nombre) { alert('Pon el nombre del cliente.'); return; }
    setCreando(true);
    try {
      const cl = { id: 'cli_' + Date.now() + Math.random().toString(36).slice(2, 7), nombre, tipo: 'empresa', odooPartnerId: porCrear.c.partnerId || null };
      await db.crearCliente(cl);
      onClienteCreado?.(cl);
      onElegirCotizacion?.(cl.id, { tipo: 'odoo', ref: porCrear.c.referencia });
      setPorCrear(null);
    } catch (e) { alert('No se pudo crear el cliente: ' + (e.message || e)); }
    setCreando(false);
  };
  useEffect(() => {
    if (!esNumero || elegido) { setOdoo(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      fetch(`/api/odoo/cotizaciones-cliente?q=${encodeURIComponent(num)}`).then(r => r.json())
        .then(j => { if (vivo) setOdoo(j.ok ? j.cotizaciones.filter(c => String(c.referencia).includes(num)) : []); })
        .catch(() => vivo && setOdoo([]));
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [num, !!elegido]);

  if (elegido) {
    return (
      <div className="flex items-center gap-2 bg-zinc-900 border-2 border-zinc-800 rounded-card px-3 py-2">
        <span className="text-sm font-bold flex-1 truncate">{elegido.nombre}</span>
        <button onClick={() => { onElegir(''); setTexto(''); }} className="text-[10px] uppercase font-bold text-zinc-500 hover:text-white">cambiar</button>
      </div>
    );
  }
  if (porCrear) {
    return (
      <div className="space-y-1.5 border border-sky-800 rounded-card p-2 bg-zinc-900/40">
        <div className="text-[10px] text-sky-300">{porCrear.c.referencia} · cliente nuevo en el ERP — revisa el nombre:</div>
        <input value={porCrear.nombre} onChange={e => setPorCrear({ ...porCrear, nombre: e.target.value })} autoFocus
          className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
        <div className="flex gap-1.5">
          <button onClick={() => setPorCrear(null)} className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase rounded-card">Volver</button>
          <button onClick={crearYElegir} disabled={creando} className="flex-1 py-1.5 bg-red-600 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase rounded-card">{creando ? 'Creando…' : 'Crear cliente y seguir'}</button>
        </div>
      </div>
    );
  }
  const vacio = sugerencias.length === 0 && obras.length === 0 && (!esNumero || (odoo && odooFuera.length === 0));
  return (
    <div className="relative">
      <input value={texto} onChange={e => setTexto(e.target.value)} onFocus={() => setFoco(true)} onBlur={() => setTimeout(() => setFoco(false), 200)}
        placeholder="Nombre del cliente o número de cotización…" autoFocus
        className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
      {foco && q.length >= 2 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-card overflow-hidden shadow-pop max-h-72 overflow-y-auto">
          {obras.map(p => (
            <button key={p.id} onMouseDown={(e) => { e.preventDefault(); onElegirCotizacion?.(p.clienteId, { tipo: 'erp', proyecto: p }); }}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 border-t border-zinc-800 first:border-t-0">
              <div className="font-bold truncate">{p.referenciaOdoo} · {cliPorId.get(p.clienteId)?.nombre}</div>
              <div className="text-[10px] text-zinc-500 truncate">{p.nombre}</div>
            </button>
          ))}
          {esNumero && odoo === null && <div className="px-3 py-2 text-[11px] text-zinc-500 border-t border-zinc-800 first:border-t-0">Buscando la cotización en Odoo…</div>}
          {odooFuera.map(c => {
            const cl = cliDeOdoo(c);
            return (
              <button key={c.referencia} disabled={creando} onMouseDown={(e) => { e.preventDefault(); elegirOdoo(c); }}
                className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 border-t border-zinc-800 first:border-t-0">
                <div className="font-bold truncate">{c.referencia} · {c.cliente} <span className="text-[10px] text-sky-400">· Odoo</span></div>
                <div className="text-[10px] text-zinc-500">{c.fecha} · RD$ {Number(c.monto).toLocaleString()}{!cl && <span className="text-amber-400"> · {creando ? 'creando el cliente…' : 'cliente nuevo en el ERP: revisas el nombre al elegir'}</span>}</div>
              </button>
            );
          })}
          {sugerencias.map(c => (
            <button key={c.id} onMouseDown={(e) => { e.preventDefault(); onElegir(c.id); }}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 border-t border-zinc-800 first:border-t-0 truncate">{c.nombre}</button>
          ))}
          {vacio && <div className="px-3 py-2 text-xs text-zinc-500">Sin resultados para "{texto}".</div>}
        </div>
      )}
    </div>
  );
}

// v8.49.11 (ticket Edwin): fotos del trabajo realizado — se comprimen al subir.
function FotosReclamacion({ r, usuario, onCambio }) {
  const [subiendo, setSubiendo] = useState(false);
  const fotos = r.fotos || [];
  const subir = async (files) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const nuevas = [];
      for (const f of Array.from(files).slice(0, 6)) {
        const blob = await comprimirImagenABlob(f);
        nuevas.push(await db.subirFotoReclamacion(blob, r.id));
      }
      await db.guardarFotosReclamacion(r.id, [...fotos, ...nuevas]);
      onCambio();
    } catch (e) { alert('Error subiendo fotos: ' + (e?.message || e)); }
    setSubiendo(false);
  };
  const quitar = async (url) => {
    if (!confirm('¿Quitar esta foto de la reclamación?')) return;
    try { await db.guardarFotosReclamacion(r.id, fotos.filter(u => u !== url)); onCambio(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase text-zinc-500 mb-1">📷 Fotos del trabajo ({fotos.length})</div>
      <div className="flex gap-2 flex-wrap">
        {fotos.map(u => (
          <div key={u} className="relative group">
            <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-20 h-20 object-cover rounded-card border border-zinc-800" /></a>
            <button onClick={() => quitar(u)} className="absolute -top-1.5 -right-1.5 bg-zinc-900 border border-zinc-700 rounded-full p-0.5 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <label className="w-20 h-20 border border-dashed border-zinc-700 hover:border-red-500 rounded-card flex flex-col items-center justify-center text-zinc-500 hover:text-zinc-300 cursor-pointer text-[10px] gap-1">
          {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Fotos</>}
          <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => { subir(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );
}
