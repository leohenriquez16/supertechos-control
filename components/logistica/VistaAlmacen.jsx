'use client';

// v8.29.0: Vista "Almacén" — la cola de requisiciones del encargado de almacén.
// Recibe los pedidos de las obras al instante (adiós grupos de WhatsApp), va marcando
// cada renglón despachado, y avanza el estado: preparando → LISTA para envío.
// Cuando está lista, Rutas la monta en un camión o en un envío pagado.
// v8.38.0 (desktop-first 3): en lg+ son DOS PANELES — cola compacta a la izquierda,
// detalle de la requisición sticky a la derecha. En celular/iPad vertical igual que
// siempre (tarjetas completas). Todo clickeable sin hover (el iPad no tiene mouse).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Package, RefreshCw, Plus, X, Camera } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';
import { comprimirImagenABlob } from '../../lib/imports';
import FirmaPad, { firmaABlob } from '../common/FirmaPad';
import { ESTADOS_REQ, ESTADOS_COMPRA } from './RequisicionesProyecto';
import ModalConfirmarRecepcion from './ModalConfirmarRecepcion'; // v8.49.4

const COLS = [
  { estado: 'pendiente', titulo: '📥 Nuevas', siguiente: 'preparando', btn: 'Empezar a preparar' },
  { estado: 'preparando', titulo: '🔧 Preparando', siguiente: 'lista', btn: 'Marcar LISTA para envío' },
  { estado: 'lista', titulo: '📦 Listas para despacho', siguiente: null, btn: null },
  { estado: 'en_ruta', titulo: '🚚 En ruta', siguiente: null, btn: null },
];

// v8.48.0: badge del modo de entrega del alisto
const ModoBadge = ({ r }) => r.modoEntrega === 'retiro'
  ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-sky-600/20 text-sky-300 align-middle">🙋 Retiro</span>
  : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-emerald-600/20 text-emerald-300 align-middle">🚚 Envío</span>;

export default function VistaAlmacen({ usuario, data, onVolver }) {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const [selId, setSelId] = useState(null); // v8.38.0: requisición abierta en el panel
  const [nuevoAbierto, setNuevoAbierto] = useState(false); // v8.48.0: modal nuevo despacho
  const [retiroDe, setRetiroDe] = useState(null); // v8.48.0: alisto en sign-off de retiro
  const [confirmandoReq, setConfirmandoReq] = useState(null); // v8.49.4: confirmación de oficina
  // v8.49.11 (ticket Erisdania): modificar la solicitud después de enviada
  const [nuevoItemDe, setNuevoItemDe] = useState(null); // requisicionId con el form abierto
  const [nuevoItem, setNuevoItem] = useState({ descripcion: '', cantidad: '', unidad: '' });
  const agregarRenglon = async (r) => {
    if (!(nuevoItem.descripcion || '').trim()) return alert('Escribe la descripción del renglón.');
    try {
      await db.agregarItemRequisicion(r.id, nuevoItem);
      setNuevoItemDe(null); setNuevoItem({ descripcion: '', cantidad: '', unidad: '' });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  const quitarRenglon = async (it) => {
    if (!confirm(`¿Quitar el renglón "${it.descripcion}"?`)) return;
    try { await db.eliminarItemRequisicion(it.id); await recargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  // v8.49.5: ventas de Odoo por entregar (salidas de almacén pendientes, read-only)
  const [odooPend, setOdooPend] = useState(null); // null = no buscado aún
  const [odooCargando, setOdooCargando] = useState(false);
  const [importando, setImportando] = useState(null);
  const buscarVentasOdoo = async () => {
    setOdooCargando(true);
    try {
      const res = await fetch('/api/odoo/salidas-pendientes');
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || res.status);
      setOdooPend(d.pendientes || []);
    } catch (e) { alert('No se pudo leer Odoo: ' + (e?.message || e)); }
    setOdooCargando(false);
  };
  const importarVenta = async (v, modo) => {
    setImportando(v.pickingId);
    try {
      await db.crearRequisicion({
        tipo: 'despacho', modoEntrega: modo, clienteNombre: v.cliente || 'Venta Odoo',
        referencia: v.origin || v.name, odooPickingId: v.pickingId, odooPickingName: v.name,
        items: v.items, urgente: false, notas: null,
        solicitadoPorId: usuario?.id || null, solicitadoPorNombre: usuario?.nombre || null,
      });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setImportando(null);
  };
  const puedeCrear = ['admin', 'almacen'].some(rr => usuario?.roles?.includes(rr));

  const recargar = async () => {
    setLoading(true);
    try { setReqs(await db.listarRequisiciones({})); }
    catch (e) { console.warn('Almacén:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, []);

  const enCola = (r) => COLS.some(c => c.estado === r.estado);
  // v8.49.3: si la requisición abierta en el drawer sale de la cola, cerrarlo.
  useEffect(() => {
    if (!loading && selId && !reqs.some(r => r.id === selId && (enCola(r) || r.estado === 'entregada'))) setSelId(null);
    // eslint-disable-next-line
  }, [reqs, loading]);

  const proyectoDe = (r) => (data.proyectos || []).find(p => p.id === r.proyectoId);
  const etiqueta = (r) => {
    if (r.tipo === 'despacho') return (r.clienteNombre || 'Despacho') + (r.referencia ? ` · ${r.referencia}` : '');
    const p = proyectoDe(r); return p ? ([p.referenciaOdoo, p.cliente || p.nombre].filter(Boolean).join(' · ') || r.proyectoId) : r.proyectoId; // v8.49.2 (ticket Miguel M.): incluir código del proyecto
  };

  const avanzar = async (r, estado) => {
    setProcesando(r.id);
    try { await db.actualizarRequisicion(r.id, { estado }); await recargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
    setProcesando(null);
  };
  const toggleItem = async (r, it) => {
    try { await db.marcarItemRequisicion(it.id, !it.despachado); await recargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  // v8.39.0: renglón sin stock → flujo de compras (solicitado → cotizado → esperando → comprado).
  const marcarCompra = async (it, estado) => {
    try {
      await db.marcarEstadoCompraItem(it.id, estado || null);
      // v8.49.2 (ticket Jacobo): al marcar "comprar", avisar a Compras por correo (fire-and-forget)
      if (estado === 'comprar') {
        const r = (reqs || []).find(x => (x.items || []).some(i => i.id === it.id));
        fetch('/api/email/alerta-compras', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            articulo: it.nombre || it.descripcion || 'Artículo', cantidad: it.cantidad, unidad: it.unidad,
            proyecto: r ? etiqueta(r) : null, requisicion: r?.id || null, marcadoPor: usuario?.nombre || null,
          }),
        }).catch(() => {});
      }
      await recargar();
    }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  const puedeOC = ['admin', 'facturas'].some(r => usuario?.roles?.includes(r));
  const [generandoOC, setGenerandoOC] = useState(null);
  const generarOC = async (r) => {
    if (!confirm(`¿Leer la cotización adjunta con la IA y crear la ORDEN DE COMPRA en BORRADOR en Odoo?\n(No se confirma sola — compras la revisa en Odoo.)`)) return;
    setGenerandoOC(r.id);
    try {
      const res = await fetch('/api/compras/generar-oc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requisicionId: r.id }),
      });
      const d = await res.json();
      if (!res.ok || d.error) alert('No se pudo generar la OC: ' + (d.error || res.status) + (d.advertencias?.length ? '\n· ' + d.advertencias.join('\n· ') : ''));
      else alert(`✅ OC ${d.oc.name} creada en BORRADOR en Odoo\nProveedor: ${d.oc.proveedor}\nRenglones con producto: ${d.oc.lineas}${d.sinMatch?.length ? `\n⚠ Sin producto en Odoo (quedaron en las notas de la OC):\n· ${d.sinMatch.join('\n· ')}` : ''}`);
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setGenerandoOC(null);
  };

  const entregadasHoy = useMemo(() => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
    return reqs.filter(r => r.estado === 'entregada' && (r.entregadaAt || '').slice(0, 10) === hoy);
  }, [reqs]);
  // v8.49.8: columna de ENTREGADAS de los últimos 7 días (las más nuevas primero)
  const COL_ENTREGADA = { estado: 'entregada', titulo: '✓ Entregadas · 7 días', siguiente: null, btn: null };
  const entregadas7 = useMemo(() => {
    const corte = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    return reqs.filter(r => r.estado === 'entregada' && (r.entregadaAt || r.retiradaAt || '').slice(0, 10) >= corte)
      .sort((a, b) => (b.entregadaAt || b.retiradaAt || '').localeCompare(a.entregadaAt || a.retiradaAt || ''));
  }, [reqs]);

  // La tarjeta completa de siempre — se usa inline en móvil y como panel en desktop.
  const DetalleRequisicion = ({ r, col }) => {
    const todosDespachados = r.items.length > 0 && r.items.every(i => i.despachado);
    return (
      <div className={`bg-zinc-900 border rounded-card p-3 ${r.urgente ? 'border-red-800/70' : 'border-zinc-800'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{etiqueta(r)} {r.tipo === 'despacho' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-amber-600/20 text-amber-300 align-middle">📦 Despacho</span>} <ModoBadge r={r} /> {r.urgente && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-red-600/20 text-red-400 align-middle">🔥 Urgente</span>} {r.esCompra && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-orange-600/20 text-orange-300 align-middle">🛒 Compra</span>} {r.odooPickingName && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-purple-600/20 text-purple-300 align-middle">🧾 {r.odooPickingName}</span>}</div>
            <div className="text-[10px] text-zinc-500">{formatFechaCorta((r.createdAt || '').slice(0, 10))} · pidió {r.solicitadoPorNombre || '—'} · <span className={ESTADOS_REQ[r.estado]?.color || ''}>{ESTADOS_REQ[r.estado]?.label || r.estado}</span></div>
          </div>
          {col.siguiente && (
            <button onClick={() => avanzar(r, col.siguiente)} disabled={procesando === r.id || (col.siguiente === 'lista' && !todosDespachados)}
              title={col.siguiente === 'lista' && !todosDespachados ? 'Marca todos los renglones primero' : ''}
              className="shrink-0 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-[10px] font-black uppercase px-3 py-2 rounded-card">
              {procesando === r.id ? '…' : col.btn}
            </button>
          )}
        </div>
        <div className="mt-1.5 space-y-1">
          {r.items.map(it => (
            <div key={it.id} className="flex items-center gap-2 text-xs py-0.5 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                <input type="checkbox" checked={it.despachado} disabled={col.estado === 'en_ruta'} onChange={() => toggleItem(r, it)} className="w-4 h-4 accent-green-500 shrink-0" />
                <span className={it.despachado ? 'line-through text-zinc-500' : 'text-zinc-200'}>
                  {it.descripcion}{it.cantidad != null && it.cantidad !== '' ? ` — ${it.cantidad} ${it.unidad || ''}` : ''}
                </span>
              </label>
              {/* v8.39.0: lo que no está en stock entra al flujo de compras */}
              {col.estado !== 'en_ruta' && !it.despachado ? (
                <select value={it.estadoCompra || ''} onChange={e => marcarCompra(it, e.target.value)}
                  className={`shrink-0 rounded-card px-1.5 py-1 text-[10px] font-bold border ${it.estadoCompra ? ESTADOS_COMPRA[it.estadoCompra]?.color + ' border-transparent' : 'bg-zinc-950 border-zinc-700 text-zinc-500'}`}>
                  <option value="">En stock</option>
                  <option value="solicitado">🛒 Solicitado a compras</option>
                  <option value="cotizado">💲 Cotizado</option>
                  <option value="esperando_aprobacion">⏳ Esperando aprobación</option>
                  <option value="comprado">✓ Comprado</option>
                </select>
              ) : it.estadoCompra && ESTADOS_COMPRA[it.estadoCompra] ? (
                <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-card ${ESTADOS_COMPRA[it.estadoCompra].color}`}>{ESTADOS_COMPRA[it.estadoCompra].label}</span>
              ) : null}
              {/* v8.49.11: quitar renglón (admin/almacén, antes de estar lista) */}
              {puedeCrear && (col.estado === 'pendiente' || col.estado === 'preparando') && !it.despachado && (
                <button onClick={() => quitarRenglon(it)} className="shrink-0 text-zinc-700 hover:text-red-400" title="Quitar renglón"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
        </div>
        {/* v8.49.11 (ticket Erisdania): agregar renglones después de enviada la solicitud */}
        {puedeCrear && (col.estado === 'pendiente' || col.estado === 'preparando') && (
          nuevoItemDe === r.id ? (
            <div className="mt-1.5 flex gap-1.5 items-center">
              <input value={nuevoItem.descripcion} onChange={e => setNuevoItem({ ...nuevoItem, descripcion: e.target.value })} placeholder="Descripción" autoFocus
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-xs min-w-0" />
              <input value={nuevoItem.cantidad} onChange={e => setNuevoItem({ ...nuevoItem, cantidad: e.target.value })} placeholder="Cant" type="number"
                className="w-14 bg-zinc-950 border border-zinc-700 rounded-card px-1.5 py-1.5 text-xs text-right" />
              <input value={nuevoItem.unidad} onChange={e => setNuevoItem({ ...nuevoItem, unidad: e.target.value })} placeholder="Und"
                className="w-14 bg-zinc-950 border border-zinc-700 rounded-card px-1.5 py-1.5 text-xs" />
              <button onClick={() => agregarRenglon(r)} className="shrink-0 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black uppercase px-2.5 py-1.5 rounded-card">OK</button>
              <button onClick={() => setNuevoItemDe(null)} className="shrink-0 text-zinc-600 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={() => setNuevoItemDe(r.id)} className="mt-1.5 text-[10px] text-amber-400 font-bold flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar renglón</button>
          )
        )}
        {r.notas && <div className="text-[10px] text-zinc-500 mt-1">📝 {r.notas}</div>}
        {/* v8.39.0: cotización adjunta + OC en Odoo */}
        {(r.cotizacionUrl || r.ocOdooName) && (
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {r.cotizacionUrl && <a href={r.cotizacionUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline">📎 Ver cotización</a>}
            {r.ocOdooName && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-purple-600/20 text-purple-300">📄 OC {r.ocOdooName} (borrador en Odoo)</span>}
          </div>
        )}
        {puedeOC && r.esCompra && r.cotizacionUrl && !r.ocOdooId && (
          <button onClick={() => generarOC(r)} disabled={generandoOC === r.id}
            className="mt-2 w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-[10px] font-black uppercase py-2 rounded-card flex items-center justify-center gap-1.5">
            {generandoOC === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '🤖'} Leer cotización con IA y crear OC en Odoo (borrador)
          </button>
        )}
        {col.estado === 'lista' && (
          r.modoEntrega === 'retiro' ? (
            <button onClick={() => setRetiroDe(r)}
              className="mt-2 w-full bg-sky-700 hover:bg-sky-600 text-white text-[10px] font-black uppercase py-2 rounded-card">
              🙋 Registrar retiro (firma del que retira)
            </button>
          ) : (
            <div className="text-[10px] text-purple-400 mt-1.5">Esperando que Rutas la monte en un viaje o envío pagado.</div>
          )
        )}
      </div>
    );
  };

  const reqSel = reqs.find(r => r.id === selId && (enCola(r) || r.estado === 'entregada'));
  const colSel = reqSel ? (COLS.find(c => c.estado === reqSel.estado) || (reqSel.estado === 'entregada' ? COL_ENTREGADA : null)) : null;

  return (
    <div className="p-4 md:p-6 max-w-4xl lg:max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Package className="w-6 h-6 text-amber-400" /> Almacén</h1>
            <div className="text-[11px] text-zinc-500">Pedidos de obra y despachos/ventas · se alistan aquí, no en el WhatsApp</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {puedeCrear && (
            <button onClick={() => setNuevoAbierto(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-black uppercase px-3 py-2 rounded-card flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Nuevo despacho
            </button>
          )}
          <button onClick={recargar} className="text-zinc-500 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <>
        {/* ===== v8.49.5: ventas de Odoo por entregar → se traen como despachos ===== */}
        {puedeCrear && (
          <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-card p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">🧾 Ventas de Odoo por entregar</div>
              <button onClick={buscarVentasOdoo} disabled={odooCargando}
                className="text-[10px] font-black uppercase px-2.5 py-1.5 rounded-card border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-50">
                {odooCargando ? 'Buscando…' : odooPend === null ? 'Buscar en Odoo' : 'Actualizar'}
              </button>
            </div>
            {odooPend !== null && (() => {
              const importados = new Set(reqs.map(r => r.odooPickingId).filter(Boolean));
              const nuevas = odooPend.filter(v => !importados.has(v.pickingId));
              if (!nuevas.length) return <div className="text-xs text-zinc-600 italic mt-2">Sin ventas pendientes de traer{odooPend.length ? ` (${odooPend.length} ya están en la cola)` : ''}.</div>;
              return (
                <div className="space-y-1.5 mt-2">
                  {nuevas.map(v => (
                    <div key={v.pickingId} className="flex items-center justify-between gap-2 text-xs flex-wrap">
                      <div className="min-w-0">
                        <span className="font-bold">{v.cliente || 'Venta'}</span>
                        <span className="text-zinc-500"> · {v.origin || v.name} · {v.items.length} renglones{v.fecha ? ` · ${v.fecha}` : ''}</span>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => importarVenta(v, 'retiro')} disabled={importando === v.pickingId}
                          className="text-[10px] font-black uppercase px-2 py-1.5 rounded-card bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white">🙋 Retiro</button>
                        <button onClick={() => importarVenta(v, 'envio')} disabled={importando === v.pickingId}
                          className="text-[10px] font-black uppercase px-2 py-1.5 rounded-card bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white">🚚 Envío</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ===== Móvil / iPad vertical: tarjetas completas apiladas (igual que siempre) ===== */}
        <div className="lg:hidden space-y-4">
          {COLS.map(col => {
            const del = reqs.filter(r => r.estado === col.estado)
              .sort((a, b) => (b.urgente - a.urgente) || (a.createdAt || '').localeCompare(b.createdAt || ''));
            return (
              <div key={col.estado}>
                <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">{col.titulo} ({del.length})</div>
                {del.length === 0
                  ? <div className="text-xs text-zinc-600 italic mb-3">Nada aquí.</div>
                  : <div className="space-y-2 mb-4">{del.map(r => <DetalleRequisicion key={r.id} r={r} col={col} />)}</div>}
              </div>
            );
          })}
          {entregadas7.length > 0 && (
            <div>
              <div className="text-[11px] tracking-widest uppercase text-green-500 font-bold mb-1.5">{COL_ENTREGADA.titulo} ({entregadas7.length})</div>
              <div className="space-y-2 mb-4">{entregadas7.map(r => <DetalleRequisicion key={r.id} r={r} col={COL_ENTREGADA} />)}</div>
            </div>
          )}
        </div>

        {/* ===== Desktop: KANBAN de 4 columnas (v8.49.3) — el flujo completo de un vistazo ===== */}
        <div className="hidden lg:grid grid-cols-5 gap-3 items-start">
          {COLS.map(col => {
            const del = reqs.filter(r => r.estado === col.estado)
              .sort((a, b) => (b.urgente - a.urgente) || (a.createdAt || '').localeCompare(b.createdAt || ''));
            return (
              <div key={col.estado} className="bg-zinc-950/60 border border-zinc-800/70 rounded-card p-2 min-h-[140px]">
                <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2 px-1">{col.titulo} <span className="text-zinc-600">({del.length})</span></div>
                {del.length === 0 ? (
                  <div className="text-xs text-zinc-700 italic px-1 pb-2">Nada aquí.</div>
                ) : (
                  <div className="space-y-1.5">
                    {del.map(r => {
                      const despachados = r.items.filter(i => i.despachado).length;
                      const completo = despachados === r.items.length && r.items.length > 0;
                      return (
                        <button key={r.id} onClick={() => setSelId(r.id)}
                          className={`w-full text-left px-2.5 py-2 rounded-card border bg-zinc-900 ${selId === r.id ? 'border-amber-500 bg-zinc-800/70' : r.urgente ? 'border-red-800/70 hover:border-red-700' : 'border-zinc-800 hover:border-zinc-600'}`}>
                          <div className="text-xs font-bold truncate">{r.urgente && '🔥 '}{r.tipo === 'despacho' && '📦 '}{etiqueta(r)}</div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[10px] text-zinc-500 truncate">{formatFechaCorta((r.createdAt || '').slice(0, 10))} · {r.modoEntrega === 'retiro' ? '🙋' : '🚚'} {r.solicitadoPorNombre || '—'}</span>
                            <span className={`shrink-0 text-[10px] font-bold ml-1.5 ${completo ? 'text-green-400' : 'text-zinc-400'}`}>☑ {despachados}/{r.items.length}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {/* v8.49.8: columna de entregadas (últimos 7 días) con estado de confirmación */}
          <div className="bg-zinc-950/60 border border-green-900/40 rounded-card p-2 min-h-[140px]">
            <div className="text-[11px] tracking-widest uppercase text-green-500 font-bold mb-2 px-1">{COL_ENTREGADA.titulo} <span className="text-zinc-600">({entregadas7.length})</span></div>
            {entregadas7.length === 0 ? (
              <div className="text-xs text-zinc-700 italic px-1 pb-2">Nada esta semana.</div>
            ) : (
              <div className="space-y-1.5">
                {entregadas7.map(r => (
                  <button key={r.id} onClick={() => setSelId(r.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-card border bg-zinc-900 ${selId === r.id ? 'border-amber-500 bg-zinc-800/70' : 'border-zinc-800 hover:border-zinc-600'}`}>
                    <div className="text-xs font-bold truncate text-green-300">{r.tipo === 'despacho' && '📦 '}{etiqueta(r)}</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-zinc-500 truncate">✓ {formatFechaCorta(((r.entregadaAt || r.retiradaAt || '')).slice(0, 10))} · {r.modoEntrega === 'retiro' ? '🙋' : '🚚'}</span>
                      <span className={`shrink-0 text-[9px] font-bold ml-1 ${r.recepcionConfirmadaAt ? 'text-green-400' : 'text-amber-400'}`}>{r.recepcionConfirmadaAt ? '✅ conf.' : '⏳ sin conf.'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* v8.49.4: entregadas sin doble confirmación — la oficina (Erisdania) las cierra
            corroborando con la firma del chofer si la obra no lo ha hecho */}
        {(() => {
          const sinConfirmar = reqs.filter(r => r.estado === 'entregada' && !r.recepcionConfirmadaAt);
          if (!sinConfirmar.length) return null;
          return (
            <div className="border border-amber-800/50 bg-amber-950/20 rounded-card p-3">
              <div className="text-[11px] tracking-widest uppercase text-amber-400 font-bold mb-1.5">⏳ Entregadas sin confirmar de la obra ({sinConfirmar.length})</div>
              <div className="space-y-1.5">
                {sinConfirmar.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{etiqueta(r)} <span className="text-zinc-500">· entregada {formatFechaCorta((r.entregadaAt || '').slice(0, 10))}</span></span>
                    {puedeCrear && (
                      <button onClick={() => setConfirmandoReq(r)}
                        className="shrink-0 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-card bg-green-700 hover:bg-green-600 text-white">
                        ✅ Confirmar de oficina
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="text-[11px] text-zinc-500 border-t border-zinc-800 pt-2">
          ✓ Entregadas hoy: <b className="text-green-400">{entregadasHoy.length}</b>
        </div>

        {/* ===== Drawer de detalle (desktop): clic en una tarjeta del kanban ===== */}
        {reqSel && colSel && (
          <div className="hidden lg:block fixed inset-0 z-40" onClick={() => setSelId(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute right-0 top-0 h-full w-[440px] xl:w-[480px] bg-zinc-950 border-l border-zinc-800 p-4 overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">{colSel.titulo}</div>
                <button onClick={() => setSelId(null)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <DetalleRequisicion r={reqSel} col={colSel} />
            </div>
          </div>
        )}
        </>
      )}

      {nuevoAbierto && (
        <ModalNuevoDespacho usuario={usuario}
          onCerrar={() => setNuevoAbierto(false)}
          onCreado={async () => { setNuevoAbierto(false); await recargar(); }} />
      )}
      {confirmandoReq && (
        <ModalConfirmarRecepcion req={confirmandoReq} etiqueta={etiqueta(confirmandoReq)}
          usuario={usuario} origen="oficina"
          onCerrar={() => setConfirmandoReq(null)}
          onConfirmado={async () => { setConfirmandoReq(null); await recargar(); }} />
      )}
      {retiroDe && (
        <ModalRegistrarRetiro alisto={retiroDe} etiqueta={etiqueta(retiroDe)}
          onCerrar={() => setRetiroDe(null)}
          onListo={async () => { setRetiroDe(null); await recargar(); }} />
      )}
    </div>
  );
}

// v8.48.0: crear un DESPACHO/venta a un cliente (no una obra). Nace en 'pendiente'
// como borrador que el almacén alista igual que un pedido de obra.
function ModalNuevoDespacho({ usuario, onCerrar, onCreado }) {
  const [cliente, setCliente] = useState('');
  const [referencia, setReferencia] = useState('');
  const [modoEntrega, setModoEntrega] = useState('retiro');
  const [urgente, setUrgente] = useState(false);
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState([{ descripcion: '', cantidad: '', unidad: '' }]);
  const [guardando, setGuardando] = useState(false);

  const setItem = (i, campo, val) => setItems(arr => arr.map((it, n) => n === i ? { ...it, [campo]: val } : it));
  const addItem = () => setItems(arr => [...arr, { descripcion: '', cantidad: '', unidad: '' }]);
  const delItem = (i) => setItems(arr => arr.length > 1 ? arr.filter((_, n) => n !== i) : arr);

  const guardar = async () => {
    if (!cliente.trim()) return alert('Pon el nombre del cliente / destinatario.');
    if (!items.some(it => (it.descripcion || '').trim())) return alert('Agrega al menos un renglón de material.');
    setGuardando(true);
    try {
      await db.crearRequisicion({
        tipo: 'despacho', clienteNombre: cliente.trim(), referencia: referencia.trim() || null,
        modoEntrega, urgente, notas: notas.trim() || null, items,
        solicitadoPorId: usuario?.id || null, solicitadoPorNombre: usuario?.nombre || null,
      });
      await onCreado();
    } catch (e) { alert('Error: ' + (e?.message || e)); setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2"><Package className="w-5 h-5 text-amber-400" /> Nuevo despacho</h2>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Cliente / destinatario *</label>
          <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="A quién se le entrega"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm mt-1" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Referencia (cotización/venta) — opcional</label>
          <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="ST-C0000 / PG-C0000"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm mt-1" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Modo de entrega</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button onClick={() => setModoEntrega('retiro')}
              className={`text-xs font-bold py-2 rounded-card border ${modoEntrega === 'retiro' ? 'bg-sky-600/20 border-sky-500 text-sky-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>🙋 Retiro (pasa a buscarlo)</button>
            <button onClick={() => setModoEntrega('envio')}
              className={`text-xs font-bold py-2 rounded-card border ${modoEntrega === 'envio' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>🚚 Envío (va en vehículo)</button>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">{modoEntrega === 'retiro' ? 'Al alistarlo, se firma aquí en el almacén. No pasa por Rutas.' : 'Al alistarlo, cae a Rutas para montarlo en un viaje.'}</div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Material</label>
          <div className="space-y-1.5 mt-1">
            {items.map((it, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)} placeholder="Descripción"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-xs" />
                <input value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} placeholder="Cant" type="number"
                  className="w-16 bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-xs text-right" />
                <input value={it.unidad} onChange={e => setItem(i, 'unidad', e.target.value)} placeholder="Und"
                  className="w-16 bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-xs" />
                <button onClick={() => delItem(i)} className="text-zinc-600 hover:text-red-400"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="text-[11px] text-amber-400 font-bold mt-1.5 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Agregar renglón</button>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={urgente} onChange={e => setUrgente(e.target.checked)} className="w-4 h-4 accent-red-600" /> 🔥 Urgente
        </label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)" rows={2}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-xs" />
        <button onClick={guardar} disabled={guardando}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-2">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear despacho
        </button>
      </div>
    </div>
  );
}

// v8.48.0: sign-off de un RETIRO — quién retira (nombre + cédula), su firma y foto opcional.
function ModalRegistrarRetiro({ alisto, etiqueta, onCerrar, onListo }) {
  const [porNombre, setPorNombre] = useState('');
  const [cedula, setCedula] = useState('');
  const [tieneFirma, setTieneFirma] = useState(false);
  const [fotoFile, setFotoFile] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const firmaRef = useRef(null);

  const confirmar = async () => {
    if (!porNombre.trim()) return alert('Pon el nombre de quien retira.');
    if (!tieneFirma) return alert('Falta la firma de quien retira.');
    setGuardando(true);
    try {
      let firmaBlob;
      try { firmaBlob = await firmaABlob(firmaRef.current); } catch { alert('Firma inválida — vuelve a firmar.'); setGuardando(false); return; }
      const firmaUrl = await db.subirRetiroAlisto(firmaBlob, alisto.id, 'firma');
      let fotoUrl = null;
      if (fotoFile) { const b = await comprimirImagenABlob(fotoFile); fotoUrl = await db.subirRetiroAlisto(b, alisto.id, 'foto'); }
      await db.registrarRetiroAlisto(alisto.id, { porNombre: porNombre.trim(), cedula: cedula.trim() || null, firmaUrl, fotoUrl });
      await onListo();
    } catch (e) { alert('Error: ' + (e?.message || e)); setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black flex items-center gap-2">🙋 Registrar retiro</h2>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-xs text-zinc-400">{etiqueta}</div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Quién retira *</label>
          <input value={porNombre} onChange={e => setPorNombre(e.target.value)} placeholder="Nombre completo"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm mt-1" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Cédula — opcional</label>
          <input value={cedula} onChange={e => setCedula(e.target.value)} placeholder="000-0000000-0"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm mt-1" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Foto del retiro — opcional</label>
          <label className="mt-1 flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-card px-2 py-2 text-xs text-zinc-400 cursor-pointer">
            <Camera className="w-4 h-4" /> {fotoFile ? fotoFile.name : 'Tomar / elegir foto'}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setFotoFile(e.target.files?.[0] || null)} />
          </label>
        </div>
        <div ref={firmaRef}>
          <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Firma de quien retira *</label>
          <div className="mt-1"><FirmaPad alto={150} onCambio={setTieneFirma} /></div>
        </div>
        <button onClick={confirmar} disabled={guardando}
          className="w-full bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-2">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : '✓'} Confirmar retiro
        </button>
      </div>
    </div>
  );
}
