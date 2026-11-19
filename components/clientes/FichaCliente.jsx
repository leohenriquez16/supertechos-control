'use client';

// v8.74.25: ficha 360 del cliente. Encabezado con datos clave, KPIs, proyectos / garantías /
// reclamaciones en tablas y, a la derecha, contactos y ubicaciones (lista o mapa).
// Los modales de edición viven en app/page.jsx (GestionClientes) y llegan por callbacks.
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Building2, User as UserIcon, Phone, Mail, MapPin, MessageCircle, Star, Plus, Edit2, Trash2,
  Briefcase, ShieldCheck, AlertTriangle, Wallet, Clock, Copy, Loader2, CheckCircle2, FileText, Receipt, Truck,
} from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD } from '../../lib/helpers/formato';
import TablaDatos from '../common/TablaDatos';

const MapaLeaflet = React.lazy(() => import('../common/MapaLeaflet'));

const ESTADOS = {
  aprobado: { l: 'Aprobado', c: 'bg-blue-900/40 text-blue-300 border-blue-800' },
  planificado: { l: 'Planificado', c: 'bg-indigo-900/40 text-indigo-300 border-indigo-800' },
  en_ejecucion: { l: 'En ejecución', c: 'bg-green-900/40 text-green-300 border-green-800' },
  parado: { l: 'Parado', c: 'bg-amber-900/40 text-amber-300 border-amber-800' },
  finalizado_no_entregado: { l: 'Fin. no entregado', c: 'bg-purple-900/40 text-purple-300 border-purple-800' },
  finalizado_recibido_conforme: { l: 'Recibido conforme', c: 'bg-teal-900/40 text-teal-300 border-teal-800' },
  facturado: { l: 'Facturado', c: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  cobrado: { l: 'Cobrado', c: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  cancelado: { l: 'Cancelado', c: 'bg-red-900/30 text-red-300 border-red-900' },
};
const CERRADOS = ['finalizado_recibido_conforme', 'facturado', 'cobrado', 'cancelado', 'entregado'];
const Badge = ({ estado }) => {
  const e = ESTADOS[estado] || { l: estado || '—', c: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 border rounded whitespace-nowrap ${e.c}`}>{e.l}</span>;
};
const f10 = (d) => (d ? String(d).slice(0, 10) : '—');
const esc = (t) => String(t || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const soloDigitos = (t) => String(t || '').replace(/\D/g, '');

function Kpi({ icon: Icon, label, valor, sub, color = 'text-white' }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</div>
      <div className={`text-xl font-black tabular-nums truncate ${color}`}>{valor}</div>
      {sub && <div className="text-[10px] text-zinc-500 truncate">{sub}</div>}
    </div>
  );
}

function Tarjeta({ icon: Icon, titulo, n, accion, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card min-w-0">
      <div className="flex justify-between items-center px-3 py-2.5 border-b border-zinc-800 gap-2">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-red-500" /> {titulo}{n != null && <span className="text-zinc-600">({n})</span>}
        </div>
        {accion}
      </div>
      {children}
    </div>
  );
}

const BotonAgregar = ({ onClick }) => (
  <button onClick={onClick} className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 font-bold uppercase flex items-center gap-1 rounded-card">
    <Plus className="w-3 h-3" /> Agregar
  </button>
);

export default function FichaCliente({
  cliente, contactos, proyectos, ubicaciones,
  onVolver, onEditar, onArchivar,
  onAgregarContacto, onEditarContacto, onEliminarContacto,
  onAgregarUbicacion, onEditarUbicacion, onEliminarUbicacion,
  onVerProyecto,
}) {
  const [garantias, setGarantias] = useState([]);
  const [reclamaciones, setReclamaciones] = useState([]);
  const [mantenimientos, setMantenimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [verMapa, setVerMapa] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [tab, setTab] = useState('obras');
  const [odoo, setOdoo] = useState(null); // { encontrado, cotizaciones, facturas } | { error }
  const [gpsVisitas, setGpsVisitas] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [viajes, setViajes] = useState([]);

  // Historial Odoo (cotizaciones + facturas), por RNC o nombre.
  useEffect(() => {
    let cancel = false;
    setOdoo(null);
    // v8.85.1: + ID de Odoo y las cotizaciones de sus obras (encuentra las hechas a nombre de un contacto)
    const refs = [...new Set((proyectos || []).filter(p => p.clienteId === cliente.id).flatMap(p => [p.referenciaOdoo, ...((p.subCotizaciones || []).map(x => x.ref))]).filter(Boolean))];
    const qs = new URLSearchParams({ rnc: cliente.rnc || '', nombre: cliente.nombre || '', partnerId: cliente.odooPartnerId || '', refs: refs.join(',') });
    fetch(`/api/odoo/cliente-historial?${qs}`).then(r => r.json())
      .then(j => { if (!cancel) setOdoo(j?.error ? { error: j.error } : j); })
      .catch(e => { if (!cancel) setOdoo({ error: e?.message || 'Error' }); });
    return () => { cancel = true; };
  }, [cliente.id, cliente.rnc, cliente.nombre, cliente.odooPartnerId]);

  // Visitas: resumen GPS de la flota + viajes de logística.
  useEffect(() => {
    let cancel = false;
    Promise.all([
      db.listarGpsVisitas({ proyectoIds: proyectos.map(p => p.id) }).catch(() => []),
      db.listarVehiculos({}).catch(() => []),
      db.listarViajes({}).catch(() => []),
    ]).then(([g, v, vj]) => { if (!cancel) { setGpsVisitas(g || []); setVehiculos(v || []); setViajes(vj || []); } });
    return () => { cancel = true; };
  }, [cliente.id, proyectos.length]);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    Promise.all([
      db.listarGarantias().catch(() => []),
      db.listarReclamaciones().catch(() => []),
      db.listarMantenimientos({}).catch(() => []),
    ]).then(([g, r, m]) => {
      if (cancel) return;
      const idsProy = new Set(proyectos.map(p => p.id));
      const mia = (x) => x.clienteId === cliente.id || (x.proyectoId && idsProy.has(x.proyectoId));
      const gs = (g || []).filter(mia);
      setGarantias(gs);
      setReclamaciones((r || []).filter(mia));
      const idsG = new Set(gs.map(x => x.id));
      setMantenimientos((m || []).filter(x => x.clienteId === cliente.id || idsG.has(x.garantiaId)));
      setCargando(false);
    });
    return () => { cancel = true; };
  }, [cliente.id, proyectos.length]);

  const ubicPorId = useMemo(() => Object.fromEntries(ubicaciones.map(u => [u.id, u])), [ubicaciones]);
  const activos = proyectos.filter(p => !CERRADOS.includes(p.estado));
  const valorTotal = proyectos.reduce((a, p) => a + (Number(p.valorCotizacion) || 0), 0);
  const valorActivo = activos.reduce((a, p) => a + (Number(p.valorCotizacion) || 0), 0);
  const facturados = proyectos.filter(p => ['facturado', 'cobrado'].includes(p.estado));
  const fechasProy = proyectos.map(p => p.fechaAprobacion || p.fechaInicio || '').filter(Boolean).map(String).sort();
  const clienteDesde = fechasProy[0] || cliente.createdAt || '';
  const ultimaAct = [...fechasProy, ...reclamaciones.map(r => r.fechaApertura || ''), ...garantias.map(g => g.fechaInicio || '')]
    .filter(Boolean).map(String).sort().pop() || '';
  const garVigentes = garantias.filter(g => (g.estadoCalc || g.estado) !== 'vencida' && g.estado !== 'anulada');
  const recAbiertas = reclamaciones.filter(r => !['resuelta', 'cerrada', 'descartada'].includes(r.estado));
  const mantPend = mantenimientos.filter(m => ['pendiente', 'agendado', 'vencido'].includes(m.estado));
  const principal = contactos.find(c => c.esPrincipal) || contactos[0] || null;
  const tel = cliente.telefonoPrincipal || principal?.telefono || '';
  const mail = cliente.emailPrincipal || principal?.email || '';
  const esPersona = cliente.tipo === 'persona';

  // ---- Visitas ----
  const vehPorId = useMemo(() => Object.fromEntries(vehiculos.map(v => [v.id, v])), [vehiculos]);
  const nombreVeh = (id, fallback) => { const v = vehPorId[id]; return v ? [v.marca, v.modelo, v.placa].filter(Boolean).join(' ') : (fallback || '—'); };
  const idsProy = new Set(proyectos.map(p => p.id));
  const proyPorId = Object.fromEntries(proyectos.map(p => [p.id, p]));
  const visitas = useMemo(() => {
    const out = [];
    gpsVisitas.forEach(g => {
      const pr = proyPorId[g.proyectoId];
      const h = g.segundos / 3600, ht = g.segundosTotal / 3600;
      out.push({ id: `g_${g.id}`, fuente: 'GPS', fecha: g.fecha, vehiculo: nombreVeh(g.vehiculoId, g.deviceName),
        lugar: pr?.referenciaProyecto || pr?.nombre || g.proyectoId,
        detalle: `${g.llegada || '?'}–${g.salida || '?'} · ${h.toFixed(1)} h en sitio${ht - h > 0.25 ? ` (+${(ht - h).toFixed(1)} h fuera de horario)` : ''}${g.paradas > 1 ? ` · ${g.paradas} paradas` : ''}`,
        horas: h });
    });
    viajes.forEach(v => (v.paradas || []).forEach(pa => {
      if (!pa.proyectoId || !idsProy.has(pa.proyectoId)) return;
      const pr = proyPorId[pa.proyectoId];
      out.push({ id: `v_${pa.id}`, fuente: 'Logística', fecha: v.fecha, vehiculo: nombreVeh(v.vehiculoId, v.vehiculo),
        lugar: pr?.referenciaProyecto || pr?.nombre || pa.lugar,
        detalle: [pa.tipo, pa.descripcion, v.choferNombre && `chofer ${v.choferNombre}`, pa.recibidoPorNombre && `recibió ${pa.recibidoPorNombre}`, pa.estado].filter(Boolean).join(' · '), horas: 0 });
    }));
    return out;
  }, [gpsVisitas, viajes, vehiculos, proyectos]);
  const horasGps = visitas.reduce((a, v) => a + v.horas, 0);
  const vehDistintos = new Set(visitas.map(v => v.vehiculo)).size;

  // ---- Odoo ----
  const cots = odoo?.cotizaciones || [];
  const facts = odoo?.facturas || [];
  const cotizado = cots.reduce((a, c) => a + c.montoSinItbis, 0);
  const ganadas = cots.filter(c => ['sale', 'done'].includes(c.estado));
  const facturadoOdoo = facts.reduce((a, f) => a + f.montoTotal, 0);
  const porCobrar = facts.reduce((a, f) => a + f.pendiente, 0);
  const vencido = facts.filter(f => f.pendiente > 0 && f.vence && f.vence < new Date().toISOString().slice(0, 10)).reduce((a, f) => a + f.pendiente, 0);

  const copiarRnc = async () => {
    try { await navigator.clipboard.writeText(cliente.rnc); setCopiado(true); setTimeout(() => setCopiado(false), 1200); } catch {}
  };

  // Ubicaciones con su GPS (propio o del proyecto) para el mapa.
  const pts = ubicaciones.map(u => {
    const pg = proyectos.find(p => p.ubicacionId === u.id && p.ubicacionLat != null && p.ubicacionLng != null);
    const lat = u.latitud != null ? Number(u.latitud) : pg ? Number(pg.ubicacionLat) : null;
    const lng = u.longitud != null ? Number(u.longitud) : pg ? Number(pg.ubicacionLng) : null;
    return { u, lat, lng, n: proyectos.filter(p => p.ubicacionId === u.id).length };
  });
  const conGps = pts.filter(x => x.lat != null && x.lng != null);

  return (
    <div className="space-y-3">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver a clientes</button>

      {/* Encabezado */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 flex flex-wrap gap-4 items-start">
        <div className="w-14 h-14 rounded-card bg-red-600/15 border border-red-600/40 flex items-center justify-center shrink-0">
          {esPersona ? <UserIcon className="w-7 h-7 text-red-500" /> : <Building2 className="w-7 h-7 text-red-500" />}
        </div>
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight">{cliente.nombre}</h1>
            <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 border border-zinc-700 text-zinc-400 rounded">{esPersona ? 'Persona' : 'Empresa'}</span>
            {activos.length > 0 && <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 border border-green-800 bg-green-900/30 text-green-300 rounded">Con obras activas</span>}
            {recAbiertas.length > 0 && <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 border border-orange-800 bg-orange-900/30 text-orange-300 rounded">{recAbiertas.length} reclamación{recAbiertas.length !== 1 ? 'es' : ''} abierta{recAbiertas.length !== 1 ? 's' : ''}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            {cliente.rnc ? (
              <button onClick={copiarRnc} className="inline-flex items-center gap-1 hover:text-white" title="Copiar RNC">
                RNC <span className="font-mono text-zinc-200">{cliente.rnc}</span>{copiado ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            ) : <span className="text-amber-400">Sin RNC</span>}
            {tel && <a href={`tel:${tel}`} className="inline-flex items-center gap-1 hover:text-white"><Phone className="w-3 h-3" /> {tel}</a>}
            {mail && <a href={`mailto:${mail}`} className="inline-flex items-center gap-1 hover:text-white break-all"><Mail className="w-3 h-3" /> {mail}</a>}
            {cliente.direccion && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {cliente.direccion}</span>}
            {clienteDesde && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Cliente desde {f10(clienteDesde).slice(0, 7)}</span>}
          </div>
          {cliente.nota && <div className="mt-2 text-xs bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-zinc-400 italic">{cliente.nota}</div>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={onEditar} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 font-bold uppercase rounded-card flex items-center gap-1"><Edit2 className="w-3 h-3" /> Editar</button>
          <button onClick={onArchivar} className="text-xs bg-zinc-800 hover:bg-red-900 text-zinc-400 hover:text-white px-3 py-2 font-bold uppercase rounded-card">Archivar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <Kpi icon={Briefcase} label="Obras" valor={proyectos.length} sub={`${activos.length} activa${activos.length !== 1 ? 's' : ''} · ${formatRD(valorActivo)}`} />
        <Kpi icon={FileText} label="Cotizado (Odoo)" valor={odoo ? (odoo.error ? '—' : formatRD(cotizado)) : '…'} sub={odoo && !odoo.error ? `${cots.length} cot. · ${ganadas.length} ganadas${cots.length ? ` (${Math.round(ganadas.length / cots.length * 100)}%)` : ''}` : ''} />
        <Kpi icon={Receipt} label="Facturado (Odoo)" valor={odoo ? (odoo.error ? '—' : formatRD(facturadoOdoo)) : '…'} sub={odoo && !odoo.error ? `${facts.length} documento${facts.length !== 1 ? 's' : ''}` : ''} />
        <Kpi icon={Wallet} label="Por cobrar" valor={odoo ? (odoo.error ? '—' : formatRD(porCobrar)) : '…'} sub={vencido > 0 ? `${formatRD(vencido)} vencido` : 'nada vencido'} color={vencido > 0 ? 'text-red-400' : porCobrar > 0 ? 'text-amber-400' : 'text-white'} />
        <Kpi icon={ShieldCheck} label="Garantías vigentes" valor={cargando ? '…' : garVigentes.length} sub={cargando ? '' : `${mantPend.length} mant. pendiente${mantPend.length !== 1 ? 's' : ''}`} color="text-green-400" />
        <Kpi icon={AlertTriangle} label="Reclamaciones" valor={cargando ? '…' : recAbiertas.length} sub={cargando ? '' : `abiertas · ${reclamaciones.length} en total`} color={recAbiertas.length ? 'text-orange-400' : 'text-white'} />
        <Kpi icon={Truck} label="Visitas" valor={visitas.length} sub={`${horasGps.toFixed(0)} h GPS · ${vehDistintos} vehículo${vehDistintos !== 1 ? 's' : ''}`} />
        <Kpi icon={Clock} label="Última actividad" valor={ultimaAct ? f10(ultimaAct) : '—'} sub={`${ubicaciones.length} ubic. · ${contactos.length} contacto${contactos.length !== 1 ? 's' : ''}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-3 min-w-0">
          <div className="flex flex-wrap gap-1 border-b border-zinc-800">
            {[
              ['obras', 'Obras', proyectos.length],
              ['cotizaciones', 'Cotizaciones Odoo', odoo && !odoo.error ? cots.length : null],
              ['facturas', 'Facturas', odoo && !odoo.error ? facts.length : null],
              ['garantias', 'Garantías', cargando ? null : garantias.length],
              ['reclamaciones', 'Reclamaciones', cargando ? null : reclamaciones.length],
              ['visitas', 'Visitas', visitas.length],
            ].map(([k, l, n]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border-b-2 -mb-px ${tab === k ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}>
                {l}{n != null && <span className="ml-1 text-zinc-500 tabular-nums">{n}</span>}
              </button>
            ))}
          </div>
          {tab === 'obras' && <Tarjeta icon={Briefcase} titulo="Proyectos" n={proyectos.length}>
            <div className="p-2">
              <TablaDatos
                alturaMax="420px"
                filas={proyectos}
                rowKey={p => p.id}
                onFilaClick={onVerProyecto ? (p => onVerProyecto(p)) : undefined}
                ordenInicial={{ key: 'fecha', dir: 'desc' }}
                vacio="Este cliente no tiene proyectos."
                columnas={[
                  { key: 'ref', label: 'Ref.', sortValue: p => p.referenciaOdoo || '', render: p => <span className="font-mono text-zinc-400 whitespace-nowrap">{p.referenciaOdoo || '—'}</span> },
                  { key: 'obra', label: 'Obra', sortValue: p => p.referenciaProyecto || p.nombre || '', render: p => <span className="font-bold text-white">{p.referenciaProyecto || p.nombre}</span>, className: 'min-w-[180px]' },
                  { key: 'ubic', label: 'Ubicación', sortValue: p => ubicPorId[p.ubicacionId]?.nombre || '', render: p => <span className="text-zinc-400">{ubicPorId[p.ubicacionId]?.nombre || '—'}</span> },
                  { key: 'estado', label: 'Estado', sortValue: p => p.estado || '', render: p => <Badge estado={p.estado} /> },
                  { key: 'valor', label: 'Valor RD$', align: 'right', sortValue: p => Number(p.valorCotizacion) || 0, render: p => p.valorCotizacion ? formatRD(p.valorCotizacion) : <span className="text-zinc-600">—</span> },
                  { key: 'fecha', label: 'Aprobado', sortValue: p => p.fechaAprobacion || p.fechaInicio || '', render: p => <span className="text-zinc-400 whitespace-nowrap">{f10(p.fechaAprobacion || p.fechaInicio)}</span> },
                ]}
              />
            </div>
          </Tarjeta>}

          {tab === 'garantias' && <Tarjeta icon={ShieldCheck} titulo="Garantías" n={cargando ? null : garantias.length}>
            <div className="p-2">
              {cargando ? <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-zinc-500" /></div> : (
                <TablaDatos
                  alturaMax="320px"
                  filas={garantias}
                  rowKey={g => g.id}
                  ordenInicial={{ key: 'vence', dir: 'asc' }}
                  vacio="Sin garantías registradas."
                  columnas={[
                    { key: 'cod', label: 'Código', sortValue: g => g.codigo || '', render: g => <span className="font-mono text-zinc-400 whitespace-nowrap">{g.codigo || '—'}</span> },
                    { key: 'sis', label: 'Sistema', sortValue: g => g.sistemaNombre || '', render: g => <span className="text-white">{g.sistemaNombre || '—'}</span>, className: 'min-w-[160px]' },
                    { key: 'ubic', label: 'Ubicación', sortValue: g => ubicPorId[g.ubicacionId]?.nombre || '', render: g => <span className="text-zinc-400">{ubicPorId[g.ubicacionId]?.nombre || '—'}</span> },
                    { key: 'm2', label: 'm²', align: 'right', sortValue: g => g.m2 || 0, render: g => g.m2 ? g.m2.toLocaleString('es-DO') : '—' },
                    { key: 'ini', label: 'Inicio', sortValue: g => g.fechaInicio || '', render: g => <span className="whitespace-nowrap text-zinc-400">{f10(g.fechaInicio)}</span> },
                    { key: 'vence', label: 'Vence', sortValue: g => g.fechaVencimiento || '', render: g => <span className="whitespace-nowrap">{f10(g.fechaVencimiento)}</span> },
                    { key: 'est', label: 'Estado', sortValue: g => g.estadoCalc || g.estado || '', render: g => {
                      const e = g.estado === 'suspendida' ? 'suspendida' : (g.estadoCalc || g.estado);
                      const c = e === 'vigente' ? 'text-green-400' : e === 'por_vencer' ? 'text-amber-400' : e === 'suspendida' ? 'text-orange-400' : 'text-zinc-500';
                      return <span className={`font-bold text-[11px] ${c}`}>{String(e || '—').replace('_', ' ')}</span>;
                    } },
                  ]}
                />
              )}
            </div>
          </Tarjeta>}

          {tab === 'reclamaciones' && <Tarjeta icon={AlertTriangle} titulo="Reclamaciones" n={cargando ? null : reclamaciones.length}>
            <div className="p-2">
              {cargando ? <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-zinc-500" /></div> : (
                <TablaDatos
                  alturaMax="320px"
                  filas={reclamaciones}
                  rowKey={r => r.id}
                  ordenInicial={{ key: 'fecha', dir: 'desc' }}
                  vacio="Sin reclamaciones. 👍"
                  columnas={[
                    { key: 'cod', label: 'Código', sortValue: r => r.codigo || '', render: r => <span className="font-mono text-zinc-400 whitespace-nowrap">{r.codigo || '—'}</span> },
                    { key: 'fecha', label: 'Abierta', sortValue: r => r.fechaApertura || '', render: r => <span className="whitespace-nowrap text-zinc-400">{f10(r.fechaApertura)}</span> },
                    { key: 'desc', label: 'Descripción', sortValue: r => r.descripcion || '', render: r => <span className="text-zinc-300 line-clamp-2">{r.descripcion || '—'}</span>, className: 'min-w-[220px]' },
                    { key: 'ubic', label: 'Ubicación', sortValue: r => ubicPorId[r.ubicacionId]?.nombre || '', render: r => <span className="text-zinc-400">{ubicPorId[r.ubicacionId]?.nombre || '—'}</span> },
                    { key: 'sev', label: 'Severidad', sortValue: r => r.severidad || '', render: r => <span className={r.severidad === 'alta' || r.severidad === 'critica' ? 'text-red-400 font-bold' : 'text-zinc-400'}>{r.severidad || '—'}</span> },
                    { key: 'est', label: 'Estado', sortValue: r => r.estado || '', render: r => <span className={`text-[11px] font-bold ${recAbiertas.includes(r) ? 'text-orange-400' : 'text-zinc-500'}`}>{String(r.estado || '—').replace(/_/g, ' ')}</span> },
                  ]}
                />
              )}
            </div>
          </Tarjeta>}

          {(tab === 'cotizaciones' || tab === 'facturas') && !odoo && <div className="py-10 flex justify-center text-zinc-500 text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Consultando Odoo…</div>}
          {(tab === 'cotizaciones' || tab === 'facturas') && odoo?.error && <div className="bg-red-900/20 border border-red-900 rounded-card p-3 text-xs text-red-300">No se pudo leer Odoo: {odoo.error}</div>}
          {(tab === 'cotizaciones' || tab === 'facturas') && odoo && !odoo.error && !odoo.encontrado && <div className="bg-zinc-900 border border-zinc-800 rounded-card p-6 text-center text-xs text-zinc-500">No encontré este cliente en Odoo {cliente.rnc ? `por RNC ${cliente.rnc}` : 'por nombre'}. Revisa que el RNC del ERP sea el mismo de Odoo.</div>}
          {tab === 'cotizaciones' && odoo?.encontrado && (
            <Tarjeta icon={FileText} titulo="Cotizaciones en Odoo" n={cots.length} accion={<span className="text-[10px] text-zinc-500">{formatRD(cotizado)} sin ITBIS · {ganadas.length} ganadas</span>}>
              <div className="p-2">
                <TablaDatos alturaMax="480px" filas={cots} rowKey={c => c.referencia} ordenInicial={{ key: 'fecha', dir: 'desc' }} vacio="Sin cotizaciones en Odoo."
                  columnas={[
                    { key: 'ref', label: 'Cotización', sortValue: c => c.referencia, render: c => <span className="font-mono font-bold text-white whitespace-nowrap">{c.referencia}</span> },
                    { key: 'fecha', label: 'Fecha', sortValue: c => c.fecha, render: c => <span className="text-zinc-400 whitespace-nowrap">{c.fecha}</span> },
                    { key: 'est', label: 'Estado', sortValue: c => c.estado, render: c => {
                      const m = { draft: ['Borrador', 'text-zinc-400'], sent: ['Enviada', 'text-blue-300'], sale: ['Aprobada', 'text-green-400'], done: ['Bloqueada', 'text-green-400'] }[c.estado] || [c.estado, 'text-zinc-400'];
                      return <span className={`font-bold text-[11px] ${m[1]}`}>{m[0]}</span>;
                    } },
                    { key: 'monto', label: 'Sin ITBIS', align: 'right', sortValue: c => c.montoSinItbis, render: c => <span className="whitespace-nowrap">{formatRD(c.montoSinItbis)}{c.moneda && c.moneda !== 'DOP' ? <span className="text-zinc-500 text-[10px]"> {c.moneda}</span> : ''}</span> },
                    { key: 'fact', label: 'Facturación', sortValue: c => c.facturacion || '', render: c => <span className="text-zinc-400 text-[11px]">{{ invoiced: 'Facturada', 'to invoice': 'Por facturar', no: '—', upselling: 'Adicional' }[c.facturacion] || c.facturacion || '—'}</span> },
                    { key: 'vend', label: 'Vendedor', sortValue: c => c.vendedor, render: c => <span className="text-zinc-400">{c.vendedor || '—'}</span> },
                    { key: 'emp', label: 'Empresa', sortValue: c => c.empresa, render: c => <span className="text-zinc-500 text-[11px]">{c.empresa}</span> },
                  ]} />
              </div>
            </Tarjeta>
          )}
          {tab === 'facturas' && odoo?.encontrado && (
            <Tarjeta icon={Receipt} titulo="Facturas en Odoo" n={facts.length} accion={<span className="text-[10px] text-zinc-500">{formatRD(facturadoOdoo)} facturado · {formatRD(porCobrar)} por cobrar</span>}>
              <div className="p-2">
                <TablaDatos alturaMax="480px" filas={facts} rowKey={f => f.numero} ordenInicial={{ key: 'fecha', dir: 'desc' }} vacio="Sin facturas en Odoo."
                  columnas={[
                    { key: 'num', label: 'Factura', sortValue: f => f.numero, render: f => <span className={`font-mono font-bold whitespace-nowrap ${f.tipo === 'nota_credito' ? 'text-purple-300' : 'text-white'}`}>{f.numero}{f.tipo === 'nota_credito' ? ' (NC)' : ''}</span> },
                    { key: 'ncf', label: 'NCF', sortValue: f => f.ncf, render: f => <span className="font-mono text-zinc-400 text-[11px]">{f.ncf || '—'}</span> },
                    { key: 'fecha', label: 'Fecha', sortValue: f => f.fecha, render: f => <span className="text-zinc-400 whitespace-nowrap">{f.fecha}</span> },
                    { key: 'orig', label: 'Origen', sortValue: f => f.origen, render: f => <span className="font-mono text-zinc-400 text-[11px]">{f.origen || '—'}</span> },
                    { key: 'total', label: 'Total', align: 'right', sortValue: f => f.montoTotal, render: f => <span className="whitespace-nowrap">{formatRD(f.montoTotal)}</span> },
                    { key: 'pend', label: 'Pendiente', align: 'right', sortValue: f => f.pendiente, render: f => f.pendiente ? <span className={`font-bold whitespace-nowrap ${f.vence && f.vence < new Date().toISOString().slice(0, 10) ? 'text-red-400' : 'text-amber-400'}`}>{formatRD(f.pendiente)}</span> : <span className="text-zinc-600">—</span> },
                    { key: 'vence', label: 'Vence', sortValue: f => f.vence, render: f => <span className="text-zinc-400 whitespace-nowrap">{f.pendiente ? f.vence : '—'}</span> },
                    { key: 'pago', label: 'Pago', sortValue: f => f.estadoPago, render: f => {
                      const m = { paid: ['Pagada', 'text-green-400'], in_payment: ['En pago', 'text-green-300'], partial: ['Parcial', 'text-amber-400'], not_paid: ['Sin pagar', 'text-red-400'], reversed: ['Revertida', 'text-zinc-500'] }[f.estadoPago] || [f.estadoPago, 'text-zinc-400'];
                      return <span className={`font-bold text-[11px] ${m[1]}`}>{m[0]}</span>;
                    } },
                  ]} />
              </div>
            </Tarjeta>
          )}
          {tab === 'visitas' && (
            <Tarjeta icon={Truck} titulo="Visitas (GPS y logística)" n={visitas.length} accion={<span className="text-[10px] text-zinc-500">{horasGps.toFixed(1)} h en sitio · {vehDistintos} vehículo{vehDistintos !== 1 ? 's' : ''}</span>}>
              <div className="p-2 space-y-1.5">
                <TablaDatos alturaMax="480px" filas={visitas} rowKey={v => v.id} ordenInicial={{ key: 'fecha', dir: 'desc' }}
                  vacio="Sin visitas registradas por GPS ni por logística para este cliente."
                  columnas={[
                    { key: 'fecha', label: 'Fecha / Mes', sortValue: v => v.fecha, render: v => <span className="whitespace-nowrap text-zinc-300">{v.fecha}</span> },
                    { key: 'fuente', label: 'Fuente', sortValue: v => v.fuente, render: v => <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${v.fuente === 'GPS' ? 'border-blue-800 text-blue-300 bg-blue-900/30' : 'border-teal-800 text-teal-300 bg-teal-900/30'}`}>{v.fuente}</span> },
                    { key: 'veh', label: 'Vehículo', sortValue: v => v.vehiculo, render: v => <span className="text-white">{v.vehiculo}</span> },
                    { key: 'lugar', label: 'Lugar / Obra', sortValue: v => v.lugar, render: v => <span className="text-zinc-300">{v.lugar}</span>, className: 'min-w-[160px]' },
                    { key: 'det', label: 'Detalle', sortValue: v => v.horas || 0, render: v => <span className="text-zinc-400">{v.detalle}</span>, className: 'min-w-[200px]' },
                  ]} />
                <div className="text-[10px] text-zinc-500 px-1">GPS: cada día que un vehículo se detuvo en una obra del cliente (llegada, salida y horas en horario laboral, lun–sáb 6:00–19:00), desde jul-2026. Logística: paradas de viajes en las obras del cliente.</div>
              </div>
            </Tarjeta>
          )}
        </div>

        {/* Columna lateral */}
        <div className="space-y-3 min-w-0">
          <Tarjeta icon={UserIcon} titulo="Contactos" n={contactos.length} accion={<BotonAgregar onClick={onAgregarContacto} />}>
            {contactos.length === 0 ? (
              <div className="p-5 text-center text-xs text-zinc-500">Sin contactos. Agrega el primero.</div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {[...contactos].sort((a, b) => (b.esPrincipal ? 1 : 0) - (a.esPrincipal ? 1 : 0)).map(ct => {
                  const wa = soloDigitos(ct.whatsapp || ct.telefono);
                  return (
                    <div key={ct.id} className="px-3 py-2.5 group">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-sm flex items-center gap-1">{ct.esPrincipal && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}{ct.nombre}</div>
                          {ct.cargo && <div className="text-[11px] text-zinc-500">{ct.cargo}</div>}
                        </div>
                        <div className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                          <button onClick={() => onEditarContacto(ct)} className="text-zinc-500 hover:text-white p-1" title="Editar"><Edit2 className="w-3 h-3" /></button>
                          <button onClick={() => onEliminarContacto(ct.id)} className="text-zinc-500 hover:text-red-400 p-1" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                        {ct.telefono && <a href={`tel:${ct.telefono}`} className="text-green-400 hover:underline inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {ct.telefono}</a>}
                        {wa.length >= 10 && <a href={`https://wa.me/${wa.length === 10 ? '1' + wa : wa}`} target="_blank" rel="noreferrer" className="text-green-400 hover:underline inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp</a>}
                        {ct.email && <a href={`mailto:${ct.email}`} className="text-blue-400 hover:underline inline-flex items-center gap-1 break-all"><Mail className="w-3 h-3" /> {ct.email}</a>}
                      </div>
                      {ct.nota && <div className="mt-1 text-[10px] text-zinc-500 italic">{ct.nota}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </Tarjeta>

          <Tarjeta icon={MapPin} titulo="Ubicaciones" n={ubicaciones.length} accion={
            <div className="flex items-center gap-1.5">
              {ubicaciones.length > 0 && (
                <div className="flex gap-0.5 bg-zinc-950 border border-zinc-800 rounded-card p-0.5">
                  {[[false, 'Lista'], [true, 'Mapa']].map(([v, l]) => (
                    <button key={l} onClick={() => setVerMapa(v)} className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-card ${verMapa === v ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}>{l}</button>
                  ))}
                </div>
              )}
              <BotonAgregar onClick={onAgregarUbicacion} />
            </div>
          }>
            {ubicaciones.length === 0 ? (
              <div className="p-5 text-center text-xs text-zinc-500">Sin ubicaciones. Agrega la primera localidad.</div>
            ) : verMapa ? (
              <div className="p-2 space-y-1.5">
                {conGps.length === 0 ? <div className="p-5 text-center text-xs text-zinc-500">Ninguna ubicación tiene GPS todavía.</div> : (
                  <React.Suspense fallback={<div className="h-[320px] flex items-center justify-center text-zinc-500 text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando mapa…</div>}>
                    <MapaLeaflet center={[conGps[0].lat, conGps[0].lng]} zoom={14} height={320} scrollWheelZoom className="rounded-card overflow-hidden"
                      markers={conGps.map(x => ({ lat: x.lat, lng: x.lng, color: x.n ? 'green' : 'red', label: x.u.nombre,
                        popup: `<b>${esc(x.u.nombre)}</b><br/>${esc(x.u.direccion)}<br/>${x.n} proyecto${x.n !== 1 ? 's' : ''}`,
                        onClick: () => onEditarUbicacion(x.u) }))} />
                  </React.Suspense>
                )}
                <div className="text-[10px] text-zinc-500 px-1">{conGps.length} de {pts.length} en el mapa · verde con proyectos · rojo sin proyectos</div>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {pts.map(({ u, lat, n }) => (
                  <div key={u.id} className="px-3 py-2.5 flex justify-between items-start gap-2 group">
                    <div className="min-w-0">
                      <div className="font-bold text-sm flex items-center gap-1.5 flex-wrap">{u.nombre}
                        {lat != null
                          ? <a href={`https://maps.google.com/?q=${u.latitud ?? lat},${u.longitud ?? ''}`} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" /> mapa</a>
                          : <button onClick={() => onEditarUbicacion(u, true)} className="text-[9px] font-bold px-1.5 py-0.5 rounded-card bg-amber-600/20 text-amber-300 border border-amber-800/60">Sin GPS · asignar</button>}
                      </div>
                      {(u.direccion || u.sector) && <div className="text-[11px] text-zinc-400">{u.direccion}{u.sector ? ` · ${u.sector}` : ''}</div>}
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {n} proyecto{n !== 1 ? 's' : ''}{u.contactoNombre ? ` · ${u.contactoNombre}${u.contactoTelefono ? ` ${u.contactoTelefono}` : ''}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 shrink-0">
                      <button onClick={() => onEditarUbicacion(u)} className="text-zinc-500 hover:text-white p-1" title="Editar"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => onEliminarUbicacion(u.id)} className="text-zinc-500 hover:text-red-400 p-1" title="Archivar"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
