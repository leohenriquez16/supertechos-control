'use client';

// v8.29.0: Vista "Almacén" — la cola de requisiciones del encargado de almacén.
// Recibe los pedidos de las obras al instante (adiós grupos de WhatsApp), va marcando
// cada renglón despachado, y avanza el estado: preparando → LISTA para envío.
// Cuando está lista, Rutas la monta en un camión o en un envío pagado.
// v8.38.0 (desktop-first 3): en lg+ son DOS PANELES — cola compacta a la izquierda,
// detalle de la requisición sticky a la derecha. En celular/iPad vertical igual que
// siempre (tarjetas completas). Todo clickeable sin hover (el iPad no tiene mouse).

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Package, RefreshCw, ChevronRight } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';
import { ESTADOS_REQ, ESTADOS_COMPRA } from './RequisicionesProyecto';

const COLS = [
  { estado: 'pendiente', titulo: '📥 Nuevas', siguiente: 'preparando', btn: 'Empezar a preparar' },
  { estado: 'preparando', titulo: '🔧 Preparando', siguiente: 'lista', btn: 'Marcar LISTA para envío' },
  { estado: 'lista', titulo: '📦 Listas para envío', siguiente: null, btn: null },
  { estado: 'en_ruta', titulo: '🚚 En ruta', siguiente: null, btn: null },
];

export default function VistaAlmacen({ usuario, data, onVolver }) {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const [selId, setSelId] = useState(null); // v8.38.0: requisición abierta en el panel

  const recargar = async () => {
    setLoading(true);
    try { setReqs(await db.listarRequisiciones({})); }
    catch (e) { console.warn('Almacén:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, []);

  const enCola = (r) => COLS.some(c => c.estado === r.estado);
  // Auto-selección: la primera de la cola (urgentes primero, por orden de COLS).
  useEffect(() => {
    if (loading) return;
    if (selId && reqs.some(r => r.id === selId && enCola(r))) return;
    for (const col of COLS) {
      const del = reqs.filter(r => r.estado === col.estado).sort((a, b) => (b.urgente - a.urgente) || (a.createdAt || '').localeCompare(b.createdAt || ''));
      if (del.length) { setSelId(del[0].id); return; }
    }
    setSelId(null);
    // eslint-disable-next-line
  }, [reqs, loading]);

  const proyectoDe = (r) => (data.proyectos || []).find(p => p.id === r.proyectoId);
  const etiqueta = (r) => { const p = proyectoDe(r); return p ? (p.cliente || p.nombre || p.referenciaOdoo) : r.proyectoId; };

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
    try { await db.marcarEstadoCompraItem(it.id, estado || null); await recargar(); }
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

  // La tarjeta completa de siempre — se usa inline en móvil y como panel en desktop.
  const DetalleRequisicion = ({ r, col }) => {
    const todosDespachados = r.items.length > 0 && r.items.every(i => i.despachado);
    return (
      <div className={`bg-zinc-900 border rounded-card p-3 ${r.urgente ? 'border-red-800/70' : 'border-zinc-800'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{etiqueta(r)} {r.urgente && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-red-600/20 text-red-400 align-middle">🔥 Urgente</span>} {r.esCompra && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-orange-600/20 text-orange-300 align-middle">🛒 Compra</span>}</div>
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
            </div>
          ))}
        </div>
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
        {col.estado === 'lista' && <div className="text-[10px] text-purple-400 mt-1.5">Esperando que Rutas la monte en un viaje o envío pagado.</div>}
      </div>
    );
  };

  const reqSel = reqs.find(r => r.id === selId && enCola(r));
  const colSel = reqSel ? COLS.find(c => c.estado === reqSel.estado) : null;

  return (
    <div className="p-4 md:p-6 max-w-4xl lg:max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Package className="w-6 h-6 text-amber-400" /> Almacén</h1>
            <div className="text-[11px] text-zinc-500">Requisiciones de las obras · el pedido llega aquí, no al WhatsApp</div>
          </div>
        </div>
        <button onClick={recargar} className="text-zinc-500 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="text-center py-10"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <div className="lg:flex lg:gap-5 lg:items-start">
        {/* ===== Cola (izquierda) ===== */}
        <div className="min-w-0 flex-1 space-y-4">
          {COLS.map(col => {
            const del = reqs.filter(r => r.estado === col.estado)
              .sort((a, b) => (b.urgente - a.urgente) || (a.createdAt || '').localeCompare(b.createdAt || ''));
            return (
              <div key={col.estado}>
                <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">{col.titulo} ({del.length})</div>
                {del.length === 0 ? (
                  <div className="text-xs text-zinc-600 italic mb-3">Nada aquí.</div>
                ) : (
                  <div className="space-y-2 mb-4 lg:space-y-1.5">
                    {del.map(r => {
                      const despachados = r.items.filter(i => i.despachado).length;
                      return (
                        <React.Fragment key={r.id}>
                          {/* Móvil / iPad vertical: la tarjeta completa de siempre */}
                          <div className="lg:hidden"><DetalleRequisicion r={r} col={col} /></div>
                          {/* Desktop: fila compacta que abre el panel */}
                          <button onClick={() => setSelId(r.id)}
                            className={`hidden lg:flex w-full items-center gap-2.5 px-3 py-2.5 rounded-card border bg-zinc-900 text-left ${selId === r.id ? 'border-amber-500 bg-zinc-800/70' : r.urgente ? 'border-red-800/70 hover:border-red-700' : 'border-zinc-800 hover:border-zinc-600'}`}>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold truncate">{r.urgente && '🔥 '}{etiqueta(r)}</div>
                              <div className="text-[10px] text-zinc-500">{formatFechaCorta((r.createdAt || '').slice(0, 10))} · {r.solicitadoPorNombre || '—'}</div>
                            </div>
                            <span className={`shrink-0 text-[10px] font-bold ${despachados === r.items.length && r.items.length > 0 ? 'text-green-400' : 'text-zinc-400'}`}>☑ {despachados}/{r.items.length}</span>
                            <ChevronRight className={`w-4 h-4 shrink-0 ${selId === r.id ? 'text-amber-400' : 'text-zinc-600'}`} />
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="text-[11px] text-zinc-500 border-t border-zinc-800 pt-2">
            ✓ Entregadas hoy: <b className="text-green-400">{entregadasHoy.length}</b>
          </div>
        </div>

        {/* ===== Detalle (derecha, solo desktop) ===== */}
        <aside className="hidden lg:block w-[400px] xl:w-[440px] shrink-0">
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            {reqSel && colSel ? (
              <DetalleRequisicion r={reqSel} col={colSel} />
            ) : (
              <div className="bg-zinc-950/50 border border-dashed border-zinc-800 rounded-card p-6 text-center text-xs text-zinc-600">
                Elige una requisición de la cola para despacharla aquí.
              </div>
            )}
          </div>
        </aside>
        </div>
      )}
    </div>
  );
}
