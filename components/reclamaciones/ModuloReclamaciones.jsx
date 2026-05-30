'use client';

// v8.19.62: Módulo de Reclamaciones (estilo módulo de Levantamientos).
// Vistas: Kanban (por estado, drag&drop) · Lista · Mapa · Ficha de detalle.

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, Plus, X, MapPin, Search, MessageCircle, Mail, Building2 } from 'lucide-react';
import * as db from '../../lib/db';
import MapaLeaflet from '../common/MapaLeaflet';

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
  const clienteNombre = (r) => clienteDe(r.clienteId)?.nombre || proyById(r.proyectoId)?.cliente || '—';
  const ubicNombre = (r) => ubic(r.ubicacionId)?.nombre || proyById(r.proyectoId)?.referenciaProyecto || '';
  const coordsDe = (r) => {
    const u = ubic(r.ubicacionId); if (u && u.latitud != null) return { lat: u.latitud, lng: u.longitud };
    const p = proyById(r.proyectoId); if (p && p.ubicacionLat != null) return { lat: p.ubicacionLat, lng: p.ubicacionLng };
    return null;
  };

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return recs;
    return recs.filter(r => clienteNombre(r).toLowerCase().includes(q) || (r.referenciaCotizacion || '').toLowerCase().includes(q) || (r.descripcion || '').toLowerCase().includes(q));
  }, [recs, busqueda, data.clientes, ubicaciones]);

  const cambiarEstado = async (id, estado) => {
    setRecs(prev => prev.map(r => r.id === id ? { ...r, estado } : r)); // optimista
    try { await db.actualizarReclamacion(id, { estado }); } catch (e) { alert('Error: ' + (e.message || e)); setReload(x => x + 1); }
  };

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
          <div className="mt-3 flex gap-2 flex-wrap">
            <button onClick={() => recordarWhatsApp(r)} className="bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded-card flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp al cliente</button>
            {p && onVerProyecto && <button onClick={() => onVerProyecto(p)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold uppercase px-3 py-1.5 rounded-card">Ver proyecto →</button>}
          </div>
          {g && <div className="mt-3 text-[11px] text-zinc-500">Garantía: {g.sistemaNombre || ''} · vence {fmtFecha(g.fechaVencimiento)}</div>}
        </div>
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

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1 w-fit">
        {[['kanban', 'Kanban'], ['lista', 'Lista'], ['mapa', 'Mapa']].map(([k, l]) => <button key={k} onClick={() => setVista(k)} className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-card ${vista === k ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>{l}</button>)}
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
          {COLS.map(c => {
            const items = recs.filter(r => r.estado === c.e);
            return (
              <div key={c.e}
                onDragOver={(e) => { e.preventDefault(); setDropCol(c.e); }}
                onDragLeave={() => setDropCol(null)}
                onDrop={() => { if (dragId) cambiarEstado(dragId, c.e); setDragId(null); setDropCol(null); }}
                className={`w-64 flex-shrink-0 bg-zinc-950 border rounded-card ${dropCol === c.e ? 'border-red-600' : 'border-zinc-800'}`}>
                <div className={`h-1 rounded-t-card ${c.color}`} />
                <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800">
                  <span className={`text-[10px] uppercase tracking-widest font-bold ${c.text}`}>{c.label}</span>
                  <span className="text-[9px] text-zinc-600">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[60px]">{items.map(Card)}{items.length === 0 && <div className="text-center text-[10px] text-zinc-700 py-3 italic">—</div>}</div>
              </div>
            );
          })}
        </div>
      ) : vista === 'lista' ? (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por cliente, # cotización o descripción…" className="w-full bg-zinc-950 border border-zinc-800 rounded-card pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-red-600" />
          </div>
          <div className="space-y-2">{filtradas.map(r => {
            const col = COLS.find(c => c.e === r.estado);
            return (
              <button key={r.id} onClick={() => setSel(r)} className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card p-3 hover:border-red-600 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="font-bold">{clienteNombre(r)}</span><span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded-full ${col?.text} border border-zinc-700`}>{col?.label}</span></div>
                  <div className="text-[10px] text-zinc-500">{ubicNombre(r)}{r.referenciaCotizacion ? ` · ${r.referenciaCotizacion}` : ''} · {CANAL_ICON[r.canal] || r.canal}</div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">{r.descripcion}</div>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">{fmtFecha(r.fechaApertura)}</span>
              </button>
            );
          })}</div>
        </>
      ) : (
        // Mapa
        (() => {
          const conC = recs.map(r => ({ r, c: coordsDe(r) })).filter(x => x.c);
          if (conC.length === 0) return <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500 text-sm">Ninguna reclamación tiene ubicación con GPS aún.</div>;
          const markers = conC.map(({ r, c }) => ({ lat: c.lat, lng: c.lng, color: COLS.find(x => x.e === r.estado)?.color?.includes('red') ? 'red' : r.estado === 'resuelta' ? 'green' : r.estado === 'en_proceso' ? 'blue' : 'orange', label: clienteNombre(r), popup: `<b>${clienteNombre(r)}</b><br/>${(r.descripcion || '').slice(0, 80)}`, onClick: () => setSel(r) }));
          return <MapaLeaflet center={[markers[0].lat, markers[0].lng]} zoom={11} height={460} markers={markers} scrollWheelZoom className="rounded-card overflow-hidden" />;
        })()
      )}

      {modalNueva && <ModalNuevaReclamacion data={data} ubicaciones={ubicaciones} garantias={garantias} onCerrar={() => setModalNueva(false)} onCreada={() => { setModalNueva(false); setReload(r => r + 1); }} />}
    </div>
  );
}

// ---------- MODAL NUEVA RECLAMACIÓN ----------
function ModalNuevaReclamacion({ data, ubicaciones, garantias, onCerrar, onCreada }) {
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
      await db.crearReclamacion({
        clienteId: clienteId || null, ubicacionId: ubicacionId || null, proyectoId: proyectoId || null,
        garantiaId: garantiaDeProy?.id || null, referenciaCotizacion: proy?.referenciaOdoo || null,
        canal, descripcion: descripcion.trim(), severidad,
      });
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
                <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-2 text-white text-xs"><option value="">—</option>{ubicsCli.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
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
