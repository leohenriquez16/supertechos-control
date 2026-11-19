'use client';

// v8.76: "Pedir al almacén" desde la pestaña Materiales del proyecto (solo oficina: admin).
// La oficina arma el pedido con la lista de materiales de la obra a la vista:
//   Requiere (presupuesto aprobado o, si no hay, el sistema: m² ÷ rendimiento)
//   Ya salió (salidas de almacén de Odoo) · Ya pedido (pedidos abiertos) · Pedir ahora (sugerido, editable).
// Crea UNA requisición tipo 'obra' con origen 'oficina_materiales' en estado pendiente.
// Supervisores y maestros siguen pidiendo en la pestaña Pedidos como siempre.
// Lógica pura en lib/helpers/pedirAlmacen.js (tests/pedirAlmacen.test.mjs).

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Plus, Trash2, Truck, AlertTriangle } from 'lucide-react';
import * as db from '../../lib/db';
import { formatNum } from '../../lib/helpers/formato';
import { fetchConSesion } from '../../lib/fetchConSesion';
import {
  baseDesdePresupuesto, baseDesdeSistema, salioDetallePorRenglon, pedidosConSalida, pedidoPorRenglon,
  armarRenglones, avisoYaPedido, avisoYaSalio, avisoDudaOdoo, avisoOtraUnidad, detalleSalioTexto,
  itemsParaRequisicion, desdePedidosAbiertos,
} from '../../lib/helpers/pedirAlmacen';
import { ESTADOS_PEDIDO_ABIERTO } from '../../lib/helpers/requisiciones';
import { conPrefijo } from '../../lib/helpers/porMontar';

const libreVacio = () => ({ descripcion: '', cantidad: '', unidad: '' });
const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
// Unidad junto al número: 1 rollo / 20 rollos
const uDe = (r, n) => (Math.round((Number(n) || 0) * 100) / 100 === 1 ? r.unidad : (r.unidadPlural || r.unidad)) || '';

// salidasOdoo: { estado: 'cargando' | 'ok' | 'error' | 'sin_ref', productos: [{ producto, cantidad }] }
export default function ModalPedirAlmacen({ usuario, proyecto, sistemas, grupos, salidasOdoo, onCerrar, onEnviado }) {
  const [cargando, setCargando] = useState(true);
  const [presupuesto, setPresupuesto] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [respPedidos, setRespPedidos] = useState(null);     // /api/odoo/salidas-pedidos
  const [estadoPedidosOdoo, setEstadoPedidosOdoo] = useState('nada'); // nada | cargando | ok | error
  const [edits, setEdits] = useState({});                   // { [clave]: { pedir?, marcado? } }
  const [libres, setLibres] = useState([]);
  const [filtro, setFiltro] = useState('');                 // '' | 's:<sistemaId>' | 'a:<areaId>'
  const [urgente, setUrgente] = useState(false);
  const [fechaNecesaria, setFechaNecesaria] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Presupuesto aprobado + pedidos del proyecto
  useEffect(() => {
    let cancel = false;
    (async () => {
      setCargando(true);
      try {
        const [pps, rs] = await Promise.all([
          db.listarPresupuestosObra(proyecto.id).catch(() => []),
          db.listarRequisiciones({ proyectoId: proyecto.id }).catch(() => []),
        ]);
        if (cancel) return;
        setPresupuesto((pps || []).find(p => p.estado === 'aprobado') || null);
        setReqs(rs || []);
      } catch (e) { if (!cancel) setError('No se pudieron leer los datos de la obra: ' + (e?.message || e)); }
      if (!cancel) setCargando(false);
    })();
    return () => { cancel = true; };
  }, [proyecto.id]);

  // ¿Qué pedidos abiertos ya salieron según Odoo? (por código REQ o por la cotización de la obra)
  const abiertos = useMemo(() => reqs.filter(r => ESTADOS_PEDIDO_ABIERTO.includes(r.estado)), [reqs]);
  useEffect(() => {
    let cancel = false;
    // Solo una cotización con prefijo ST/PG: un número suelto amarraría salidas de otra empresa.
    const ref = conPrefijo(proyecto.referenciaOdoo);
    const codigos = abiertos.map(r => r.codigo).filter(Boolean);
    if (!abiertos.length || (!ref && !codigos.length)) { setRespPedidos(null); setEstadoPedidosOdoo('nada'); return; }
    setEstadoPedidosOdoo('cargando');
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (ref) qs.set('refs', ref);
        if (codigos.length) qs.set('codigos', codigos.join(','));
        const desde = desdePedidosAbiertos(abiertos);
        if (desde) qs.set('desde', desde);
        const res = await fetchConSesion(`/api/odoo/salidas-pedidos?${qs.toString()}`);
        const json = await res.json();
        if (cancel) return;
        if (res.ok) { setRespPedidos(json); setEstadoPedidosOdoo('ok'); } else setEstadoPedidosOdoo('error');
      } catch { if (!cancel) setEstadoPedidosOdoo('error'); }
    })();
    return () => { cancel = true; };
  }, [abiertos, proyecto.referenciaOdoo]);

  // Fuente de lo requerido: presupuesto aprobado; si no hay (o no trae materiales), el sistema.
  const basePpto = useMemo(() => (presupuesto ? baseDesdePresupuesto(presupuesto, sistemas) : []), [presupuesto, sistemas]);
  const usaPresupuesto = basePpto.length > 0;
  const base = useMemo(() => (usaPresupuesto ? basePpto : baseDesdeSistema(grupos)), [usaPresupuesto, basePpto, grupos]);

  const odooOk = salidasOdoo?.estado === 'ok';
  const salioDet = useMemo(() => (odooOk ? salioDetallePorRenglon(base, salidasOdoo.productos || []) : { cantidades: {}, detalle: {}, otraUnidad: {} }), [odooOk, base, salidasOdoo]);
  const salio = salioDet.cantidades;
  const referencia = conPrefijo(proyecto.referenciaOdoo);
  const conSalida = useMemo(() => pedidosConSalida(reqs, respPedidos, referencia, base), [reqs, respPedidos, referencia, base]);
  const ped = useMemo(() => pedidoPorRenglon(base, reqs, conSalida), [base, reqs, conSalida]);
  const renglones = useMemo(() => armarRenglones({ base, salio, pedido: ped.cantidades })
    .map(r => ({ ...r, ...(edits[r.clave] || {}) })), [base, salio, ped, edits]);

  // Filtro por sistema o área (el área filtra por su sistema)
  const opcionesFiltro = useMemo(() => {
    const sis = [...new Map(base.filter(b => b.sistemaId).map(b => [b.sistemaId, b.sistemaNombre || b.sistemaId])).entries()];
    const areas = (proyecto.areas || []).map(a => ({ id: a.id, nombre: a.nombre, sistemaId: a.sistemaId || proyecto.sistema }))
      .filter(a => sis.some(([sid]) => sid === a.sistemaId));
    return { sis, areas };
  }, [base, proyecto.areas, proyecto.sistema]);
  const sistemaFiltro = filtro.startsWith('s:') ? filtro.slice(2)
    : filtro.startsWith('a:') ? (opcionesFiltro.areas.find(a => a.id === filtro.slice(2))?.sistemaId || null) : null;
  const visibles = renglones.filter(r => !sistemaFiltro || r.sistemaId === sistemaFiltro);

  const setRenglon = (clave, cambios) => setEdits(e => ({ ...e, [clave]: { ...(e[clave] || {}), ...cambios } }));
  const setLibre = (i, campo, v) => setLibres(ls => ls.map((l, n) => (n === i ? { ...l, [campo]: v } : l)));

  const items = itemsParaRequisicion(renglones, libres);
  // Mientras Odoo carga, "Ya salió" y "Ya pedido" no son reales: no se deja enviar.
  const leyendoOdoo = salidasOdoo?.estado === 'cargando' || estadoPedidosOdoo === 'cargando';
  const marcados = renglones.filter(r => r.marcado && Number(r.pedir) > 0).length;
  const ocultosMarcados = renglones.filter(r => r.marcado && Number(r.pedir) > 0 && sistemaFiltro && r.sistemaId !== sistemaFiltro).length;

  const enviar = async () => {
    if (leyendoOdoo) return;
    if (!items.length) { setError('Marca al menos un material con cantidad, o agrega un renglón libre.'); return; }
    setEnviando(true); setError('');
    try {
      const id = await db.crearRequisicion({
        proyectoId: proyecto.id, tipo: 'obra', origen: 'oficina_materiales',
        solicitadoPorId: usuario?.id || null, solicitadoPorNombre: usuario?.nombre || null,
        urgente, notas: notas.trim() || null, fechaNecesaria: fechaNecesaria || null, items,
      });
      let codigo = null;
      try {
        const rs = await db.listarRequisiciones({ proyectoId: proyecto.id });
        codigo = (rs || []).find(r => r.id === id)?.codigo || null;
      } catch { /* el pedido ya se creó; solo falta el número */ }
      onEnviado?.({ id, codigo });
    } catch (e) {
      setError('No se pudo enviar el pedido: ' + (e?.message || e));
      setEnviando(false);
    }
  };

  const th = 'py-2 px-2 text-[10px] uppercase tracking-wider text-zinc-500 font-bold';
  const fuente = usaPresupuesto
    ? `"Requiere" según el presupuesto aprobado (versión ${presupuesto?.version || 1}).`
    : '"Requiere" calculado por el sistema: m² de la obra ÷ lo que rinde cada material (la obra no tiene presupuesto aprobado).';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      {/* Sin cerrar al tocar fuera: no se pierde un pedido a medio armar */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-card w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800">
          <div className="min-w-0">
            <div className="text-[11px] tracking-widest uppercase text-zinc-500 font-bold">Pedir al almacén</div>
            <div className="font-black text-lg text-white truncate">{proyecto.nombre}{proyecto.referenciaOdoo ? <span className="text-zinc-500 font-normal text-sm"> · {proyecto.referenciaOdoo}</span> : null}</div>
            {!cargando && <div className="text-xs text-zinc-400 mt-0.5">{fuente}</div>}
            {!cargando && <div className="text-xs text-zinc-500 mt-0.5">Pedir ahora = Requiere − Ya salió − Ya pedido, redondeado hacia arriba. Puedes cambiarlo.</div>}
          </div>
          <button onClick={onCerrar} disabled={enviando} className="text-zinc-500 hover:text-white p-1" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {cargando ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
        ) : (
          <>
            {/* Avisos de fuentes */}
            <div className="px-5 pt-3 space-y-2">
              {leyendoOdoo && (
                <div className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 p-2 inline-flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Leyendo Odoo… espera a que cargue "Ya salió" y "Ya pedido" antes de enviar.</div>
              )}
              {salidasOdoo?.estado === 'sin_ref' && (
                <div className="text-xs bg-yellow-900/20 border border-yellow-700 text-yellow-300 p-2">La obra no tiene cotización de Odoo: no se puede saber qué ya salió del almacén. "Ya salió" queda en 0.</div>
              )}
              {salidasOdoo?.estado === 'error' && (
                <div className="text-xs bg-yellow-900/20 border border-yellow-700 text-yellow-300 p-2">No se pudo leer Odoo ahora mismo. "Ya salió" queda en 0: revisa las cantidades antes de pedir.</div>
              )}
              {estadoPedidosOdoo === 'error' && (
                <div className="text-xs bg-yellow-900/20 border border-yellow-700 text-yellow-300 p-2">No se pudo confirmar en Odoo cuáles pedidos abiertos ya salieron: todos los pedidos abiertos cuentan como "Ya pedido".</div>
              )}
              {base.length === 0 && (
                <div className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 p-2">Esta obra no tiene materiales en su presupuesto ni en su sistema. Puedes pedir con renglones libres.</div>
              )}
            </div>

            {/* Filtros */}
            {base.length > 0 && (
              <div className="px-5 pt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-500">Ver:</span>
                <select value={filtro} onChange={e => setFiltro(e.target.value)} className="bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-white">
                  <option value="">Todos los materiales</option>
                  {opcionesFiltro.sis.length > 1 && <optgroup label="Sistema">
                    {opcionesFiltro.sis.map(([id, nombre]) => <option key={id} value={`s:${id}`}>{nombre}</option>)}
                  </optgroup>}
                  {opcionesFiltro.areas.length > 0 && <optgroup label="Área">
                    {opcionesFiltro.areas.map(a => <option key={a.id} value={`a:${a.id}`}>{a.nombre}</option>)}
                  </optgroup>}
                </select>
                {filtro.startsWith('a:') && <span className="text-zinc-500">(se muestran los materiales del sistema de esa área, para toda la obra)</span>}
                <span className="ml-auto text-zinc-500">{marcados} {marcados === 1 ? 'marcado' : 'marcados'}</span>
              </div>
            )}

            {/* Tabla */}
            <div className="flex-1 overflow-auto px-5 py-3">
              {base.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-10">
                    <tr>
                      <th className={`${th} w-8`} />
                      <th className={`${th} text-left`}>Material</th>
                      <th className={`${th} text-right`}>Requiere</th>
                      <th className={`${th} text-right`}>Ya salió</th>
                      <th className={`${th} text-right`}>Ya pedido</th>
                      <th className={`${th} text-right w-36`}>Pedir ahora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map(r => {
                      const avisoP = avisoYaPedido(ped.detalle[r.clave], r.unidad, r.unidadPlural);
                      const avisoD = avisoDudaOdoo(ped.detalle[r.clave]);
                      const avisoS = avisoYaSalio(ped.salidos[r.clave], r.unidad, r.unidadPlural);
                      const avisoU = avisoOtraUnidad(salioDet.otraUnidad[r.clave], r.unidadPlural || r.unidad);
                      const tituloSalio = odooOk ? detalleSalioTexto(salioDet.detalle[r.clave], salioDet.otraUnidad[r.clave]) : undefined;
                      const tituloPedido = (ped.detalle[r.clave] || []).map(d => `• ${d.etiqueta}: ${formatNum(d.cantidad)} ${uDe(r, d.cantidad)}`).join('\n') || undefined;
                      return (
                        <tr key={r.clave} className={`border-b border-zinc-800 align-top ${r.marcado ? '' : 'opacity-60'}`}>
                          <td className="py-2 px-2">
                            <input type="checkbox" checked={!!r.marcado} onChange={e => setRenglon(r.clave, { marcado: e.target.checked })} className="w-4 h-4 accent-red-600 mt-1" aria-label={`Pedir ${r.nombre}`} />
                          </td>
                          <td className="py-2 px-2">
                            <div className="font-bold text-white">{r.nombre}</div>
                            <div className="text-[10px] text-zinc-500 uppercase">{r.sistemaNombre}</div>
                            {avisoP && <div className="text-[11px] text-amber-400 mt-1 flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{avisoP}</div>}
                            {avisoD && <div className="text-[11px] text-amber-400 mt-1">{avisoD}</div>}
                            {avisoU && <div className="text-[11px] text-amber-400 mt-1 flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{avisoU}</div>}
                            {avisoS && <div className="text-[11px] text-zinc-400 mt-1">{avisoS}</div>}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums font-bold text-white whitespace-nowrap">{formatNum(r.requerido)} <span className="text-[10px] text-zinc-500 font-normal">{uDe(r, r.requerido)}</span></td>
                          <td className="py-2 px-2 text-right tabular-nums text-blue-400 whitespace-nowrap" title={tituloSalio}>
                            {salidasOdoo?.estado === 'cargando' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <span className={tituloSalio ? 'underline decoration-dotted cursor-help' : ''}>{formatNum(r.yaSalio)} <span className="text-[10px] text-zinc-500">{uDe(r, r.yaSalio)}</span></span>}
                          </td>
                          <td className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${r.yaPedido > 0 ? 'text-amber-400' : 'text-zinc-500'}`} title={tituloPedido}>
                            {estadoPedidosOdoo === 'cargando' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <>{formatNum(r.yaPedido)} <span className="text-[10px] text-zinc-500">{uDe(r, r.yaPedido)}</span></>}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number" min="0" step="any" value={r.pedir}
                              onChange={e => setRenglon(r.clave, { pedir: e.target.value, marcado: Number(e.target.value) > 0 })}
                              className="w-24 bg-zinc-900 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1 text-right text-white tabular-nums"
                            />
                            {Number(r.pedir) !== r.sugerido && <div className="text-[10px] text-zinc-500 mt-0.5">sugerido {formatNum(r.sugerido)}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Renglones libres */}
              <div className="mt-4">
                <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Otros (brochas, motas, herramientas…)</div>
                <div className="space-y-2">
                  {libres.map((l, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={l.descripcion} onChange={e => setLibre(i, 'descripcion', e.target.value)} placeholder="Qué se necesita" className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-sm" />
                      <input type="number" min="0" step="any" value={l.cantidad} onChange={e => setLibre(i, 'cantidad', e.target.value)} placeholder="Cant." className="w-24 bg-zinc-900 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-right text-white text-sm" />
                      <input value={l.unidad} onChange={e => setLibre(i, 'unidad', e.target.value)} placeholder="Unidad" className="w-28 bg-zinc-900 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white text-sm" />
                      <button onClick={() => setLibres(ls => ls.filter((_, n) => n !== i))} className="text-zinc-500 hover:text-red-400 p-1" aria-label="Quitar renglón"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <button onClick={() => setLibres(ls => [...ls, libreVacio()])} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 font-bold uppercase inline-flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Agregar renglón
                  </button>
                </div>
              </div>
            </div>

            {/* Pie: urgente, fecha, nota, enviar */}
            <div className="border-t border-zinc-800 px-5 py-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[auto_auto_1fr] gap-3 items-end">
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                  <input type="checkbox" checked={urgente} onChange={e => setUrgente(e.target.checked)} className="w-4 h-4 accent-red-600" /> Urgente
                </label>
                <label className="text-xs text-zinc-400">
                  <div className="mb-1">¿Para cuándo se necesita?</div>
                  <input type="date" min={hoyRD()} value={fechaNecesaria} onChange={e => setFechaNecesaria(e.target.value)} className="bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-white" />
                </label>
                <label className="text-xs text-zinc-400">
                  <div className="mb-1">Nota para el almacén</div>
                  <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" className="w-full bg-zinc-900 border border-zinc-700 focus:border-red-600 outline-none px-2 py-1.5 text-white" />
                </label>
              </div>
              {error && <div className="text-xs bg-red-900/20 border border-red-700 text-red-300 p-2">{error}</div>}
              <div className="flex items-center gap-3">
                <div className="text-xs text-zinc-500 flex-1">
                  Se {items.length === 1 ? 'enviará' : 'enviarán'} {items.length} {items.length === 1 ? 'renglón' : 'renglones'} al almacén
                  {ocultosMarcados > 0 ? ` (${ocultosMarcados} no se ven por el filtro)` : ''}.
                </div>
                <button onClick={onCerrar} disabled={enviando} className="px-4 py-2 bg-zinc-800 text-zinc-300 text-xs font-bold uppercase">Cancelar</button>
                <button onClick={enviar} disabled={enviando || leyendoOdoo || !items.length} title={leyendoOdoo ? 'Leyendo Odoo…' : undefined} className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase inline-flex items-center gap-2">
                  {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} Enviar al almacén
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
