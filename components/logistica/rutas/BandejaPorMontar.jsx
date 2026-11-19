'use client';

// v8.75: bandeja "Por montar" — requisiciones listas del almacén y retiros de
// sobrante sin planificar. Un clic y quedan en la ruta que tienes abierta.
// v8.76: LISTA clara, una fila por pedido: número REQ grande, su salida de Odoo
// (AL/OUT; "≈ por cotización" si se amarró aproximado, "sin salida en Odoo" en ámbar),
// obra y cliente completos, resumen de artículos, antigüedad (rojo si pasa de 7 días)
// y urgente. Buscador + orden arriba. "Ampliar" la abre en un panel ancho.

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Maximize2, X, Search, RefreshCw } from 'lucide-react';
import { formatFechaCorta } from '../../../lib/helpers/formato';
import { datosPedido, salidaDePedidoVista, resumenItems, antiguedadPedido, filtrarPorMontar, ordenarPorMontar } from '../../../lib/helpers/porMontar';
import SalidaOdooChip from '../SalidaOdooChip';

const CLAVE_ORDEN = 'rutas.porMontar.orden';
const ORDENES = [['viejo', 'Más viejo primero'], ['urgente', 'Urgentes primero'], ['obra', 'Por obra']];
const leerOrden = () => { try { const v = localStorage.getItem(CLAVE_ORDEN); return ORDENES.some(([k]) => k === v) ? v : 'viejo'; } catch { return 'viejo'; } };

export default function BandejaPorMontar({ listas, diligencias, enAlmacen, nombreObra, proyectoDe = () => null, salidas = null, tieneGps, destino, onMontarRequisicion, onMontarDiligencia }) {
  const [ocupado, setOcupado] = useState(null);
  const [verAlmacen, setVerAlmacen] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden] = useState('viejo');
  const [amplia, setAmplia] = useState(false);
  const [soloSinSalida, setSoloSinSalida] = useState(false);
  useEffect(() => { setOrden(leerOrden()); }, []);
  useEffect(() => {
    if (!amplia) return;
    const f = (e) => { if (e.key === 'Escape') setAmplia(false); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [amplia]);
  const cambiarOrden = (v) => { setOrden(v); try { localStorage.setItem(CLAVE_ORDEN, v); } catch { /* sin storage */ } };

  const correr = async (id, fn) => { setOcupado(id); try { await fn(); } finally { setOcupado(null); } };

  const filas = useMemo(() => (listas || []).map(r => {
    const proyecto = proyectoDe(r.proyectoId);
    return {
      pedido: r, datos: datosPedido(r, proyecto),
      salida: salidaDePedidoVista(r, salidas?.resp, proyecto, { cargando: !!salidas?.cargando }),
      items: resumenItems(r.items), edad: antiguedadPedido(r),
    };
  }), [listas, salidas, proyectoDe]);
  const visibles = useMemo(() => ordenarPorMontar(filtrarPorMontar(filas, buscar), orden)
    .filter(f => !soloSinSalida || f.salida.estado === 'sin_salida'), [filas, buscar, orden, soloSinSalida]);
  const dilVisibles = useMemo(() => {
    const w = buscar.trim().toLowerCase();
    if (!w) return diligencias;
    return diligencias.filter(d => `retiro sobrante ${nombreObra(d.proyectoId)} ${d.descripcion || ''}`.toLowerCase().includes(w));
  }, [diligencias, buscar, nombreObra]);
  const total = listas.length + diligencias.length;
  const sinSalida = filas.filter(f => f.salida.estado === 'sin_salida').length;

  const BotonAgregar = ({ id, onClick, proyectoId }) => {
    const sinGps = !tieneGps(proyectoId);
    return (
      <button onClick={() => correr(id, onClick)} disabled={!destino || ocupado === id || sinGps}
        title={sinGps ? 'La obra no tiene ubicación GPS — asígnala en el proyecto' : !destino ? 'Abre o crea una ruta primero' : `Agregar a la ruta de ${destino}`}
        className="shrink-0 text-[11px] font-black bg-cyan-700 hover:bg-cyan-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-2 py-1.5 rounded-card flex items-center gap-1">
        {ocupado === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {sinGps ? 'Sin GPS' : 'Agregar'}
      </button>
    );
  };

  const Codigo = ({ r }) => r.codigo
    ? <span className="text-base font-black tracking-tight tabular-nums leading-none">{r.codigo}</span>
    : <span className="text-sm font-black text-zinc-400 leading-none" title="Pedido sin número (anterior a los números REQ)">Pedido {formatFechaCorta((r.createdAt || '').slice(0, 10))}</span>;
  const Urgente = ({ r }) => r.urgente ? <span className="text-[10px] font-black uppercase bg-red-600/20 text-red-400 px-1.5 py-0.5 rounded-card leading-none">Urgente</span> : null;
  const Edad = ({ edad }) => edad.texto ? <span className={`text-[11px] whitespace-nowrap ${edad.vieja ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>{edad.texto}</span> : null;
  const ObraCliente = ({ f }) => (
    <div className="min-w-0">
      <div className="text-xs font-bold leading-snug break-words">{f.pedido.tipo === 'despacho' && <span className="text-zinc-500 font-semibold">Despacho · </span>}{f.datos.obra}</div>
      {(f.datos.cliente || f.datos.referencia) && (
        <div className="text-[11px] text-zinc-400 leading-snug break-words">{[f.datos.cliente, f.datos.referencia].filter(Boolean).join(' · ')}</div>
      )}
    </div>
  );

  // Las "filas" son funciones que se LLAMAN ({FilaAngosta({ f })}), no componentes: así no se
  // vuelven a montar en cada render (el title no parpadea y el botón no pierde el foco).
  // Fila angosta (columna izquierda de Rutas): todo en bloque, nada cortado salvo los artículos (con title).
  const FilaAngosta = ({ f }) => {
    const r = f.pedido;
    return (
      <div className={`bg-zinc-950 border rounded-card px-2.5 py-2 space-y-1 ${r.urgente ? 'border-red-800/70' : 'border-zinc-800'}`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {Codigo({ r })}{Urgente({ r })}
          <span className="ml-auto">{Edad({ edad: f.edad })}</span>
        </div>
        <div><SalidaOdooChip vista={f.salida} codigo={r.codigo} error={salidas?.error} max={1} /></div>
        {ObraCliente({ f })}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-[11px] text-zinc-500 truncate" title={f.items.completo}>{f.items.corto}</div>
          {BotonAgregar({ id: r.id, proyectoId: r.proyectoId, onClick: () => onMontarRequisicion(r) })}
        </div>
      </div>
    );
  };

  // Fila ancha (panel ampliado): columnas.
  const FilaAncha = ({ f }) => {
    const r = f.pedido;
    return (
      <div className={`bg-zinc-900 border rounded-card px-3 py-2.5 grid grid-cols-[120px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-start ${r.urgente ? 'border-red-800/70' : 'border-zinc-800'}`}>
        <div className="space-y-1">
          {Codigo({ r })}
          <div className="flex flex-col items-start gap-1">{Urgente({ r })}{Edad({ edad: f.edad })}</div>
        </div>
        {ObraCliente({ f })}
        <div className="text-[11px] text-zinc-400 whitespace-pre-line" title={f.items.completo}>{f.items.completo || 'Sin artículos'}</div>
        <div><SalidaOdooChip vista={f.salida} codigo={r.codigo} error={salidas?.error} detalle /></div>
        {BotonAgregar({ id: r.id, proyectoId: r.proyectoId, onClick: () => onMontarRequisicion(r) })}
      </div>
    );
  };

  const FilaRetiro = ({ d }) => (
    <div className="bg-zinc-950 border border-red-900/50 rounded-card px-2.5 py-2 flex items-center gap-2">
      {d.fotoUrl && <a href={d.fotoUrl} target="_blank" rel="noreferrer" className="shrink-0"><img src={d.fotoUrl} alt="" className="w-9 h-9 object-cover rounded-card border border-zinc-800" /></a>}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold leading-snug break-words">♻ Retiro de sobrante · {nombreObra(d.proyectoId)}</div>
        <div className="text-[11px] text-zinc-500 truncate" title={d.descripcion || ''}>{(d.descripcion || '').split('\n').join(' · ')}</div>
        <div className="text-[10px] text-zinc-500">{formatFechaCorta((d.createdAt || '').slice(0, 10))}{d.creadoPorNombre ? ` · ${d.creadoPorNombre}` : ''}</div>
      </div>
      {BotonAgregar({ id: d.id, proyectoId: d.proyectoId, onClick: () => onMontarDiligencia(d) })}
    </div>
  );

  const herramientas = (ancha = false) => total > 0 ? (
    <div className={`flex gap-1.5 ${ancha ? 'items-center' : 'flex-col'}`}>
      <label className={`flex items-center gap-1.5 bg-zinc-950 border border-zinc-700 rounded-card px-2 ${ancha ? 'flex-1' : ''}`}>
        <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar REQ, obra, cliente, artículo…"
          className="bg-transparent border-0 outline-none text-xs py-1.5 w-full min-w-0" />
        {buscar && <button onClick={() => setBuscar('')} className="text-zinc-500 hover:text-white" title="Limpiar"><X className="w-3.5 h-3.5" /></button>}
      </label>
      <select value={orden} onChange={e => cambiarOrden(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-xs">
        {ORDENES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  ) : null;

  const AvisoOdoo = () => salidas?.error
    ? <div className="text-[11px] text-amber-400/90">No pude leer las salidas de Odoo ahora. <button onClick={salidas.recargar} className="underline font-bold">Reintentar</button></div>
    : null;

  const nadaQueVer = buscar && visibles.length === 0 && dilVisibles.length === 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wider text-orange-300">Por montar {total > 0 && <span className="text-zinc-400">({total})</span>}</div>
        <div className="flex items-center gap-1">
          {salidas?.recargar && listas.length > 0 && (
            <button onClick={salidas.recargar} className="p-1 text-zinc-500 hover:text-white" title="Volver a buscar las salidas en Odoo">
              <RefreshCw className={`w-3.5 h-3.5 ${salidas.cargando ? 'animate-spin' : ''}`} />
            </button>
          )}
          {total > 0 && (
            <button onClick={() => setAmplia(true)} className="text-[11px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 px-1.5 py-1 rounded-card border border-zinc-700" title="Ver la bandeja en un panel ancho">
              <Maximize2 className="w-3.5 h-3.5" /> Ampliar
            </button>
          )}
        </div>
      </div>
      {destino && total > 0 && <div className="text-[11px] text-zinc-500">Se agrega a la ruta de <b className="text-zinc-300">{destino}</b></div>}
      {total === 0 && <div className="text-xs text-zinc-500">Nada esperando camión.</div>}
      {total > 0 && !destino && <div className="text-[11px] text-amber-300/90">Abre o crea una ruta (arriba) para montar esto.</div>}
      {(sinSalida > 0 || soloSinSalida) && (
        <button onClick={() => setSoloSinSalida(v => !v)} className="text-[11px] text-amber-400 text-left hover:underline" title={soloSinSalida ? 'Ver todos los pedidos' : 'Ver solo esos pedidos'}>
          {soloSinSalida ? 'Viendo solo los pedidos sin salida en Odoo · ver todos' : `${sinSalida} ${sinSalida === 1 ? 'pedido' : 'pedidos'} sin salida en Odoo todavía · ver solo ${sinSalida === 1 ? 'ese' : 'esos'}`}
        </button>
      )}
      {AvisoOdoo()}
      {herramientas(false)}
      {nadaQueVer && <div className="text-xs text-zinc-500">Nada coincide con «{buscar}».</div>}

      {visibles.map(f => <React.Fragment key={f.pedido.id}>{FilaAngosta({ f })}</React.Fragment>)}
      {dilVisibles.map(d => <React.Fragment key={d.id}>{FilaRetiro({ d })}</React.Fragment>)}

      {enAlmacen.length > 0 && (
        <div className="border-t border-zinc-800 pt-2">
          <button onClick={() => setVerAlmacen(!verAlmacen)} className="w-full flex items-center justify-between text-left">
            <span className="text-[11px] font-bold text-amber-400">Preparándose en almacén: {enAlmacen.length}</span>
            <span className="text-zinc-500 text-xs">{verAlmacen ? '▲' : '▼'}</span>
          </button>
          {verAlmacen && (
            <div className="mt-1.5 space-y-1">
              {enAlmacen.map(r => (
                <div key={r.id} className="text-[11px] text-zinc-400 leading-snug">
                  {r.estado === 'preparando' ? '🔧' : '📥'} {r.codigo && <b className="text-zinc-300">{r.codigo} </b>}{nombreObra(r.proyectoId) || r.clienteNombre || 'Sin obra'}{r.urgente ? ' · urgente' : ''} — {(r.items || []).filter(i => i.despachado).length}/{(r.items || []).length} despachados
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Panel ancho ===== */}
      {amplia && (
        <div className="fixed inset-0 z-40" onClick={() => setAmplia(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute left-0 top-0 h-full w-[min(1100px,100vw)] bg-zinc-950 border-r border-zinc-800 p-4 overflow-y-auto shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-lg font-black text-orange-300">Por montar <span className="text-zinc-400">({total})</span></div>
                <div className="text-[11px] text-zinc-500">{destino ? <>«Agregar» lo monta en la ruta de <b className="text-zinc-300">{destino}</b>.</> : 'Abre o crea una ruta para poder agregar.'} La salida de Odoo con «≈» se encontró por la cotización de la obra, no por el número del pedido.</div>
              </div>
              <button onClick={() => setAmplia(false)} className="text-zinc-500 hover:text-white" title="Cerrar (Esc)"><X className="w-5 h-5" /></button>
            </div>
            {AvisoOdoo()}
            {herramientas(true)}
            {visibles.length > 0 && (
              <div className="grid grid-cols-[120px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <span>Pedido</span><span>Obra · cliente</span><span>Artículos</span><span>Salida en Odoo</span><span />
              </div>
            )}
            <div className="space-y-1.5">
              {visibles.map(f => <React.Fragment key={f.pedido.id}>{FilaAncha({ f })}</React.Fragment>)}
            </div>
            {nadaQueVer && <div className="text-xs text-zinc-500">Nada coincide con «{buscar}».</div>}
            {dilVisibles.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 pt-2">Retiros de sobrante</div>
                {dilVisibles.map(d => <React.Fragment key={d.id}>{FilaRetiro({ d })}</React.Fragment>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
