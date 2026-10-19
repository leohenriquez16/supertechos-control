'use client';

// v8.67.0: Vista "Compras" — todo lo que las obras pidieron y NO está en almacén,
// en un solo lugar para Compras (Yamel/Lily) y almacén. Lee las requisiciones
// abiertas, aplana los renglones con estado de compra y permite moverlos por el
// flujo: Solicitado → Cotizado → Esperando aprobación → Comprado.
// Dos modos: "Por estado" (columnas en desktop, secciones en teléfono) y
// "Por artículo" (agrupa por nombre normalizado para comprar junto).
// La OC de Odoo se sigue generando desde Almacén (no se duplica aquí).

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, ShoppingCart, Search, ChevronDown, ChevronRight, AlertTriangle, Clock } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';
import { ESTADOS_COMPRA } from './RequisicionesProyecto';
import {
  ESTADOS_FLUJO_COMPRAS, aplanarRenglonesCompras, kpisCompras, agruparPorArticulo,
  filtrarRenglones, claveObra,
} from '../../lib/helpers/compras';

const TITULOS = {
  solicitado: '🛒 Solicitado',
  cotizado: '💲 Cotizado',
  esperando_aprobacion: '⏳ Esperando aprobación',
  comprado: '✓ Comprado',
};
const fmtCant = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString());

export default function VistaCompras({ usuario, data, onVolver }) {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState('estado'); // 'estado' | 'articulo'
  const [texto, setTexto] = useState('');
  const [obraId, setObraId] = useState('');
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [verFuera, setVerFuera] = useState(false);
  const [abiertos, setAbiertos] = useState({}); // grupos expandidos en "Por artículo"
  const [guardando, setGuardando] = useState(null);

  const recargar = async () => {
    setLoading(true);
    try {
      // v8.67.0: solo requisiciones abiertas (las entregadas/canceladas no pasan por Compras)
      setReqs(await db.listarRequisiciones({ estados: ['pendiente', 'preparando', 'lista', 'en_ruta'] }));
    } catch (e) { console.warn('Compras:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, []);

  const proyectos = data?.proyectos || [];
  const etiquetaObra = (f) => {
    if (f.tipo === 'compra') return '🛒 Compra' + (f.referencia ? `: ${f.referencia}` : ' interna');
    if (f.tipo === 'despacho') return (f.clienteNombre || 'Despacho') + (f.referencia ? ` · ${f.referencia}` : '');
    const p = proyectos.find(x => x.id === f.proyectoId);
    return p ? ([p.referenciaOdoo, p.cliente || p.nombre].filter(Boolean).join(' · ') || f.proyectoId) : (f.proyectoId || '—');
  };

  const { renglones, fuera } = useMemo(() => aplanarRenglonesCompras(reqs), [reqs]);
  const kpis = useMemo(() => kpisCompras(renglones), [renglones]);
  const opcionesObra = useMemo(() => {
    const m = new Map();
    for (const f of renglones) { const k = claveObra(f); if (!m.has(k)) m.set(k, etiquetaObra(f)); }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    // eslint-disable-next-line
  }, [renglones, proyectos]);
  const filtrados = useMemo(
    () => filtrarRenglones(renglones, { texto, obraId, soloUrgentes, etiquetaObra })
      .sort((a, b) => (b.urgente - a.urgente) || ((b.dias ?? -1) - (a.dias ?? -1))),
    // eslint-disable-next-line
    [renglones, texto, obraId, soloUrgentes, proyectos]);
  const grupos = useMemo(() => agruparPorArticulo(filtrados), [filtrados]);

  // v8.67.0: cambio de estado optimista + recarga
  const cambiarEstado = async (f, estado) => {
    if (!estado || estado === f.estadoCompra) return;
    setGuardando(f.itemId);
    setReqs(prev => prev.map(r => r.id !== f.requisicionId ? r : {
      ...r, items: (r.items || []).map(i => i.id === f.itemId ? { ...i, estadoCompra: estado } : i),
    }));
    try { await db.marcarEstadoCompraItem(f.itemId, estado); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
    setGuardando(null);
    recargar();
  };

  const renglon = (f, compacto = false) => (
    <div className={`rounded-card border ${f.urgente ? 'border-red-700/60' : 'border-zinc-800'} bg-zinc-900 p-2.5 space-y-1.5`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-100 break-words">
            {f.descripcion || '(sin descripción)'}
            {f.urgente && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-card bg-red-600/25 text-red-300 align-middle">URGENTE</span>}
          </div>
          <div className="text-xs text-zinc-400">
            {f.cantidad != null && f.cantidad !== '' ? <b className="text-zinc-200">{fmtCant(Number(f.cantidad))} {f.unidad}</b> : <span className="italic">sin cantidad</span>}
            {!compacto && <> · <span className="text-zinc-300">{etiquetaObra(f)}</span></>}
          </div>
        </div>
        {f.dias != null && (
          <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-card ${f.dias > 3 && f.estadoCompra !== 'comprado' ? 'bg-red-600/20 text-red-300' : 'bg-zinc-800 text-zinc-400'}`}>
            <Clock className="w-3 h-3" />{f.dias}d
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
        {f.pedidoPor && <span>Pedido por {f.pedidoPor}</span>}
        {f.fecha && <span>· {formatFechaCorta(f.fecha)}</span>}
        {f.ocOdooName && <span className="font-bold px-1.5 py-0.5 rounded-card bg-purple-600/20 text-purple-300">📄 OC {f.ocOdooName}</span>}
      </div>
      <select value={f.estadoCompra} disabled={guardando === f.itemId} onChange={e => cambiarEstado(f, e.target.value)}
        className={`w-full rounded-card px-2 py-1.5 text-xs font-bold border border-transparent ${ESTADOS_COMPRA[f.estadoCompra]?.color || 'bg-zinc-950 text-zinc-400'}`}>
        {ESTADOS_FLUJO_COMPRAS.map(e => <option key={e} value={e}>{ESTADOS_COMPRA[e]?.label || e}</option>)}
        <option value="comprar_en_ruta">{ESTADOS_COMPRA.comprar_en_ruta.label}</option>
        <option value="compra_maestro">{ESTADOS_COMPRA.compra_maestro.label}</option>
      </select>
    </div>
  );

  const resumenCant = (c) => Object.entries(c).map(([u, n]) => `${fmtCant(n)} ${u || 'sin unidad'}`).join(' + ') || 'sin cantidad';

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center gap-2">
        {onVolver && <button onClick={onVolver} className="p-2 rounded-card bg-zinc-900 border border-zinc-800 text-zinc-300"><ArrowLeft className="w-4 h-4" /></button>}
        <ShoppingCart className="w-5 h-5 text-orange-400" />
        <h1 className="text-lg font-bold text-zinc-100 flex-1">Compras</h1>
        <button onClick={recargar} className="p-2 rounded-card bg-zinc-900 border border-zinc-800 text-zinc-300" title="Recargar">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {ESTADOS_FLUJO_COMPRAS.map(e => (
          <div key={e} className={`rounded-card p-2.5 ${ESTADOS_COMPRA[e]?.color}`}>
            <div className="text-[10px] font-bold uppercase opacity-90">{TITULOS[e]}</div>
            <div className="text-2xl font-black">{kpis.porEstado[e]}</div>
          </div>
        ))}
        <div className="rounded-card p-2.5 bg-zinc-900 border border-zinc-800 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold uppercase text-zinc-400">Más viejo esperando</div>
          {kpis.masViejo ? (
            <>
              <div className={`text-2xl font-black ${kpis.masViejo.dias > 3 ? 'text-red-400' : 'text-zinc-100'}`}>{kpis.masViejo.dias} días</div>
              <div className="text-[10px] text-zinc-400 truncate">{kpis.masViejo.descripcion} · {etiquetaObra(kpis.masViejo)}</div>
            </>
          ) : <div className="text-sm text-zinc-500 mt-1">Nada pendiente</div>}
        </div>
      </div>

      {/* Filtros + modo */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar artículo u obra…"
            className="w-full rounded-card bg-zinc-950 border border-zinc-800 pl-8 pr-2 py-2 text-sm text-zinc-100" />
        </div>
        <select value={obraId} onChange={e => setObraId(e.target.value)}
          className="rounded-card bg-zinc-950 border border-zinc-800 px-2 py-2 text-sm text-zinc-200 lg:max-w-xs">
          <option value="">Todas las obras</option>
          {opcionesObra.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 px-2">
          <input type="checkbox" checked={soloUrgentes} onChange={e => setSoloUrgentes(e.target.checked)} /> Solo urgentes
        </label>
        <div className="inline-flex rounded-card border border-zinc-800 overflow-hidden text-sm shrink-0">
          {[['estado', 'Por estado'], ['articulo', 'Por artículo']].map(([k, l]) => (
            <button key={k} onClick={() => setModo(k)}
              className={`px-3 py-2 ${modo === k ? 'bg-orange-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400'}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading && !reqs.length ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
      ) : modo === 'estado' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {ESTADOS_FLUJO_COMPRAS.map(e => {
            const lista = filtrados.filter(f => f.estadoCompra === e);
            return (
              <div key={e} className="rounded-card bg-zinc-950 border border-zinc-800 p-2 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-bold text-zinc-200">{TITULOS[e]}</span>
                  <span className="text-xs font-bold text-zinc-500">{lista.length}</span>
                </div>
                {lista.length ? lista.map(f => <React.Fragment key={f.itemId}>{renglon(f)}</React.Fragment>)
                  : <div className="text-xs text-zinc-600 text-center py-4">Nada aquí</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">Agrupación aproximada por nombre; se volverá exacta al amarrar los pedidos al maestro de productos.</p>
          {!grupos.length && <div className="text-sm text-zinc-500 text-center py-6">Nada que comprar con estos filtros.</div>}
          {grupos.map(g => {
            const abierto = !!abiertos[g.clave];
            return (
              <div key={g.clave} className={`rounded-card border ${g.urgente ? 'border-red-700/60' : 'border-zinc-800'} bg-zinc-900`}>
                <button onClick={() => setAbiertos(a => ({ ...a, [g.clave]: !abierto }))} className="w-full flex items-start gap-2 p-3 text-left">
                  {abierto ? <ChevronDown className="w-4 h-4 mt-0.5 text-zinc-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-zinc-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100 break-words">
                      {g.nombre}
                      {g.urgente && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-card bg-red-600/25 text-red-300 align-middle">URGENTE</span>}
                    </div>
                    <div className="text-xs text-zinc-400">
                      <b className="text-zinc-200">{resumenCant(g.cantidades)}</b> · {g.numObras} {g.numObras === 1 ? 'obra' : 'obras'} · {g.renglones.length} {g.renglones.length === 1 ? 'renglón' : 'renglones'}
                      {g.diasMax != null && <> · <span className={g.diasMax > 3 && g.estadoMasAtrasado !== 'comprado' ? 'text-red-400 font-bold' : ''}>{g.diasMax}d</span></>}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-card ${ESTADOS_COMPRA[g.estadoMasAtrasado]?.color}`}>{TITULOS[g.estadoMasAtrasado]}</span>
                </button>
                {abierto && (
                  <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {g.renglones.map(f => <React.Fragment key={f.itemId}>{renglon(f)}</React.Fragment>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No pasan por Compras */}
      {fuera.length > 0 && (
        <div className="rounded-card bg-zinc-950 border border-zinc-800">
          <button onClick={() => setVerFuera(v => !v)} className="w-full flex items-center gap-2 p-3 text-left text-sm text-zinc-400">
            {verFuera ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <AlertTriangle className="w-4 h-4 text-zinc-500" />
            No pasan por Compras: <b className="text-zinc-200">{fuera.length}</b>
            <span className="text-[11px] text-zinc-600">(se compran en la ruta o los compra el maestro)</span>
          </button>
          {verFuera && (
            <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {fuera.map(f => <React.Fragment key={f.itemId}>{renglon(f)}</React.Fragment>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
