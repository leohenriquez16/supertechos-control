'use client';

// v8.77.0: "Metros ejecutados de más" en la Rentabilidad de la obra.
// Muestra por área lo reportado por encima de lo contratado (cotizado + órdenes de cambio
// aplicadas), cuánto es en RD$ al mismo precio por m², si ya tiene orden de cambio en
// trámite, y deja crear la orden de cambio en borrador con un clic (owner o rol
// 'ordenes_cambio'). La venta no sube sola: solo con la orden de cambio aplicada.

import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, FilePlus2, Loader2 } from 'lucide-react';
import * as db from '../../../lib/db';
import { formatRD, formatNum } from '../../../lib/helpers/formato';
import { lineasOcDesdeExceso, lineasOcDesdeFaltante, puedeGestionarOC, TOLERANCIA_EXCESO, FECHA_CORTE_EXCESO } from '../../../lib/helpers/excesoM2';

const ESTADO = {
  sin_oc:     { txt: 'Sin orden de cambio', cls: 'bg-red-600/20 text-red-300 border-red-700/60' },
  con_oc:     { txt: 'Orden de cambio en trámite', cls: 'bg-blue-600/20 text-blue-300 border-blue-700/60' },
  tolerancia: { txt: `Dentro del ${Math.round(TOLERANCIA_EXCESO * 100)}%`, cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  sin_m2:     { txt: 'Área sin m²: revisar la medida', cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/60' },
  de_menos:   { txt: 'Terminada con menos m²', cls: 'bg-sky-600/20 text-sky-300 border-sky-700/60' },
  de_menos_oc:{ txt: 'Rebaja en trámite', cls: 'bg-blue-600/20 text-blue-300 border-blue-700/60' },
  perdido:    { txt: 'Anterior · dado por perdido', cls: 'bg-zinc-800 text-zinc-500 border-zinc-700' },
  ok:         { txt: '', cls: '' },
};
const fechaCorteTxt = (() => { const [y, m, d] = FECHA_CORTE_EXCESO.split('-'); return `${d}/${m}/${y}`; })();

export default function ExcesoM2Card({ exceso, totales, proyecto, usuario, onCreada }) {
  const [creando, setCreando] = useState(null); // 'mas' | 'menos' | null
  const [abierto, setAbierto] = useState(false);
  if (!exceso || !exceso.areas?.length) return null;
  // Sin nada que hacer (solo lo dado por perdido o dentro del 5%): renglón gris plegado
  if (!exceso.pideAccion && !abierto) {
    const perdido = exceso.rdPerdido;
    return (
      <button onClick={() => setAbierto(true)} className="w-full text-left text-[11px] text-zinc-500 bg-zinc-900/60 border border-zinc-800 rounded-card px-3 py-2 flex items-center gap-2 hover:text-zinc-300">
        <ChevronDown className="w-3.5 h-3.5" />
        Metros de más: nada por cobrar{perdido > 0 ? ` · ${formatRD(perdido)} de antes del ${fechaCorteTxt} dado por perdido` : ''}. Ver detalle
      </button>
    );
  }
  const alerta = exceso.pideAccion;
  const modo = proyecto.modoPagoManoObra || 'dia';
  const textoCosto = ['m2', 'tarea'].includes(modo)
    ? 'El costo de esos metros ya está en el margen: se le pagan al maestro.'
    : 'En esta obra el maestro no cobra por m² reportado (modo de pago por día, paquete o precio fijo), así que estos metros no suben el costo de mano de obra.';
  const puede = puedeGestionarOC(usuario);
  const lineas = lineasOcDesdeExceso(exceso);
  const montoOc = lineas.reduce((s, l) => s + l.monto, 0);
  const lineasMenos = lineasOcDesdeFaltante(exceso);
  const montoMenos = lineasMenos.reduce((s, l) => s + l.monto, 0); // negativo
  const deMenos = totales.ventaDeMenos || 0;
  const conAjuste = exceso.areas.filter(a => a.ajusteManual > 0);

  const crearOC = async (tipo) => {
    const ls = tipo === 'menos' ? lineasMenos : lineas;
    const monto = tipo === 'menos' ? montoMenos : montoOc;
    if (!ls.length) return;
    const detalle = ls.map(l => `${l.nombreArea} ${l.m2 > 0 ? '+' : ''}${formatNum(l.m2)} m²`).join(', ');
    const que = tipo === 'menos' ? 'la orden de cambio de REBAJA' : 'la orden de cambio';
    if (!confirm(`Crear ${que} en borrador: ${detalle} = ${formatRD(monto)} sin ITBIS.\n\nQueda en la pestaña Cambios para enviarla al cliente.`)) return;
    setCreando(tipo);
    try {
      await db.crearOrdenCambio({
        proyectoId: proyecto.id, tipo: tipo === 'menos' ? 'disminucion' : 'aumento',
        motivo: tipo === 'menos'
          ? 'Área terminada con menos metros que lo cotizado (según avances de campo)'
          : 'Metros ejecutados por encima de lo cotizado (reportados en campo)',
        lineas: ls, montoTotal: monto,
        creadoPorId: usuario?.id, creadoPorNombre: usuario?.nombre,
      });
      await onCreada?.();
      alert('Orden de cambio creada en borrador. Búscala en la pestaña Cambios para enviarla al cliente.');
    } catch (e) { alert('No se pudo crear: ' + (e?.message || e)); }
    setCreando(null);
  };

  return (
    <div className={`bg-zinc-900 border rounded-card p-4 space-y-3 ${alerta ? 'border-orange-700/50' : 'border-zinc-800'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className={`text-[10px] tracking-widest uppercase font-bold flex items-center gap-1 ${alerta ? 'text-orange-400' : 'text-zinc-500'}`}>
            {alerta && <AlertTriangle className="w-3 h-3" />} {exceso.hayMenos && !exceso.hayExceso ? 'Metros ejecutados de menos' : exceso.hayMenos ? 'Metros de más y de menos' : 'Metros ejecutados de más'}
            {!alerta && <button onClick={() => setAbierto(false)} className="ml-2 normal-case tracking-normal text-zinc-600 hover:text-zinc-300">ocultar</button>}
          </div>
          {deMenos > 0 && (
            <div className="text-sm text-zinc-300 mt-1">
              <span className="text-xl font-black text-sky-300">−{formatRD(deMenos)}</span> de venta que no se puede facturar: áreas terminadas con menos m² que lo cotizado
              {exceso.rdMenosConOc > 0 && <span className="text-zinc-500"> ({formatRD(exceso.rdMenosConOc)} ya en orden de cambio)</span>}.
            </div>
          )}
          {totales.ventaPorCobrarExceso > 0 ? (
            <div className="text-sm text-zinc-300 mt-1">
              <span className="text-xl font-black text-orange-300">{formatRD(totales.ventaPorCobrarExceso)}</span> de venta sin cobrar
              {exceso.rdConOc > 0 && <span className="text-zinc-500"> ({formatRD(exceso.rdConOc)} ya en orden de cambio)</span>}.
              {' '}{deMenos > 0 ? 'Con los metros reales (cobrando lo de más y sin facturar lo de menos), el margen queda en' : 'Si se cobra, el margen queda en'} <span className="font-bold text-white">{formatRD(totales.margenSiSeCobra)}</span> ({(totales.margenPctSiSeCobra || 0).toFixed(1)}%).
            </div>
          ) : (
            deMenos > 0 ? null : <div className="text-sm text-zinc-400 mt-1">Nada por cobrar ahora mismo.</div>
          )}
          {deMenos > 0 && !(totales.ventaPorCobrarExceso > 0) && (
            <div className="text-sm text-zinc-400 mt-1">Con los metros reales, el margen queda en <span className="font-bold text-white">{formatRD(totales.margenSiSeCobra)}</span> ({(totales.margenPctSiSeCobra || 0).toFixed(1)}%).</div>
          )}
          <div className="text-[11px] text-zinc-500 mt-1">
            {textoCosto} Si lo de más es hasta {Math.round(TOLERANCIA_EXCESO * 100)}% del área no se cobra; si pasa, se cobra todo lo de más. Lo ejecutado antes del {fechaCorteTxt} se dio por perdido.
            {totales.ventaOcAplicadas > 0 && <> La venta ya incluye {formatRD(totales.ventaOcAplicadas)} de órdenes de cambio aplicadas.</>}
          </div>
        </div>
        {puede && (lineas.length > 0 || lineasMenos.length > 0) && (
          <div className="flex flex-col gap-2">
            {lineas.length > 0 && (
              <button onClick={() => crearOC('mas')} disabled={!!creando}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white rounded-card">
                {creando === 'mas' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
                Cobrar metros de más · {formatRD(montoOc)}
              </button>
            )}
            {lineasMenos.length > 0 && (
              <button onClick={() => crearOC('menos')} disabled={!!creando}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 border border-sky-700 text-sky-300 hover:bg-sky-900/30 disabled:opacity-60 rounded-card">
                {creando === 'menos' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
                Orden de rebaja · {formatRD(montoMenos)}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-zinc-500 uppercase tracking-wider text-[9px] border-b border-zinc-800">
              <th className="text-left py-1.5 font-bold">Área</th>
              <th className="text-right py-1.5 pl-3 font-bold">Contratado</th>
              <th className="text-right py-1.5 pl-3 font-bold">Reportado</th>
              <th className="text-right py-1.5 pl-3 font-bold">Diferencia</th>
              <th className="text-right py-1.5 pl-3 font-bold">Venta</th>
              <th className="text-left py-1.5 pl-3 font-bold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {exceso.areas.map(a => {
              const est = ESTADO[a.estado] || ESTADO.ok;
              const porCobrar = a.rdSinOc + a.rdConOc;
              const menos = a.rdMenosSinOc + a.rdMenosConOc;
              return (
                <tr key={a.areaId} className="border-b border-zinc-800/60 align-top">
                  <td className="py-1.5">
                    <div className="text-zinc-200 font-bold">{a.nombre}</div>
                    {a.duplicados > 0 && <div className="text-[10px] text-yellow-400">{a.duplicados} reporte{a.duplicados > 1 ? 's' : ''} igual{a.duplicados > 1 ? 'es' : ''} el mismo día: revisar si es duplicado</div>}
                    {a.ajusteManual > 0 && <div className="text-[10px] text-yellow-400">El área se subió {formatNum(a.ajusteManual)} m² a mano, sin orden de cambio</div>}
                  </td>
                  <td className="text-right tabular-nums py-1.5 pl-3 text-zinc-400">{formatNum(a.contratado)} m²</td>
                  <td className="text-right tabular-nums py-1.5 pl-3 text-zinc-300">
                    {a.maxTarea ? <>{formatNum(a.maxTarea.m2)} m²<div className="text-[9px] text-zinc-500">{a.maxTarea.nombre}</div></> : '—'}
                  </td>
                  <td className="text-right tabular-nums py-1.5 pl-3 text-zinc-200">
                    {a.m2Exceso > 0 ? <>+{formatNum(a.m2Exceso)} m²<div className="text-[9px] text-zinc-500">{(a.pct * 100).toFixed(1)}%{a.m2Perdido > 0 && a.m2Nuevo > 0 ? ` · ${formatNum(a.m2Perdido)} m² perdidos` : ''}</div></>
                      : a.m2Faltante > 0 ? <span className="text-sky-300">−{formatNum(a.m2Faltante)} m²<div className="text-[9px] text-zinc-500">{(a.pctMenos * 100).toFixed(1)}% · terminada</div></span> : '—'}
                  </td>
                  <td className="text-right tabular-nums py-1.5 pl-3 font-bold text-orange-300">{porCobrar > 0 ? formatRD(porCobrar) : menos > 0 ? <span className="text-sky-300">−{formatRD(menos)}</span> : <span className="text-zinc-600">—</span>}</td>
                  <td className="py-1.5 pl-3">{est.txt && <span className={`inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 border rounded ${est.cls}`}>{est.txt}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-zinc-500">
        "Reportado" es la tarea que más m² lleva en el área (las demás llegarán ahí). Revisa que no sean reportes cargados dos veces antes de cobrar.
        {conAjuste.length > 0 && ' Si un área se subió a mano, ese aumento no se está cobrando: hazlo con una orden de cambio.'}
        {exceso.hayMenos && ' "De menos" solo se mide en áreas terminadas (obra finalizada o área marcada Completada); mientras la obra avanza es normal llevar menos.'}
        {!puede && (lineas.length > 0 || lineasMenos.length > 0) && ' La orden de cambio la crean el owner, Miguel o Erisdania.'}
      </div>
    </div>
  );
}
