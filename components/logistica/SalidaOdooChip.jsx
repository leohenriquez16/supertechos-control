'use client';

// v8.76: la salida de almacén de Odoo (AL/OUT) de un pedido, como chips.
// vista = salidaDePedidoVista(...) de lib/helpers/porMontar.
//   exacta          🧾 AL/OUT/01650            (el origen trae el REQ del pedido)
//   por_cotización  ≈ AL/OUT/01650 · por cotización  (v8.84: amarrada sola por cotización + productos)
//   dudosa          ¿AL/OUT/01650? — puede ser de este pedido; la oficina elige (onElegir(salida) / onDescartar([salidas]))
//   sin_salida      ⚠ sin salida en Odoo (ámbar) — o "aún sin salida en Odoo" en gris si alerta=false
// max: cuántas salidas mostrar como chip (las demás van en "+N" con la lista en el title).

import React from 'react';
import { ESTADO_SALIDA_ODOO } from '../../lib/helpers/porMontar';
import { fechaDeSalida } from '../../lib/helpers/requisiciones';

const fechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' }) : '';
};

const textoProductos = (s) => (s.productos || []).map(p => `• ${p.producto} ×${p.cantidad}${p.unidad ? ' ' + p.unidad : ''}`).join('\n');

// v8.84.0: salidas de la obra que PUEDEN ser de este pedido (no se amarran solas).
function Dudas({ dudas, onElegir, onDescartar, ocupado, pie }) {
  if (!dudas?.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {dudas.map(({ salida: s, coincidencia, candidatos, conflicto }) => (
        <span key={s.id || s.name} className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-card border border-dashed border-amber-700/70 text-amber-300 bg-amber-950/30"
          title={`${s.name} · ${ESTADO_SALIDA_ODOO[s.state] || s.state}${s.fecha ? ' · ' + fechaCorta(fechaDeSalida(s)) : ''}\nDocumento origen: ${s.origin || '—'}\n`
            + (conflicto ? 'Esta salida está elegida también para otro pedido: quítala de uno de los dos'
              : `Salida de la cotización de la obra que puede ser de este pedido${candidatos > 1 ? ` (hay ${candidatos} pedidos abiertos en la obra)` : ''}`)
            + `${coincidencia != null ? `; ${Math.round(coincidencia * 100)}% de sus productos están en el pedido` : ''}.\n${textoProductos(s)}`}>
          ¿{s.name}?
          {onElegir && <button disabled={ocupado} onClick={() => onElegir(s)} className="ml-0.5 px-1 rounded bg-emerald-800/60 text-emerald-100 hover:bg-emerald-700 disabled:opacity-40">Es de este</button>}
          {onDescartar && <button disabled={ocupado} onClick={() => onDescartar([s])} className="px-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40">No</button>}
        </span>
      ))}
      {!onElegir && pie && <span className="text-[10px] text-amber-400/80">{pie}</span>}
    </span>
  );
}

export default function SalidaOdooChip({ vista, codigo, error = null, detalle = false, alerta = true, max = null, onElegir = null, onDescartar = null, ocupado = false, pieDuda = 'por confirmar en Almacén' }) {
  if (!vista) return null;
  const dudas = <Dudas dudas={vista.dudas} onElegir={onElegir} onDescartar={onDescartar} ocupado={ocupado} pie={pieDuda} />;
  if (vista.estado === 'dudosa') return dudas;
  if (vista.estado === 'cargando') return <span className="text-[11px] text-zinc-500">Buscando en Odoo…</span>;
  if (vista.estado === 'sin_datos') {
    if (error) return <span className="text-[11px] text-zinc-500" title={error}>Odoo no respondió</span>;
    return <span className="text-[11px] text-zinc-500" title="El pedido no tiene número REQ y la obra no tiene cotización ST/PG">no se puede buscar en Odoo (la obra no tiene cotización ST/PG)</span>;
  }
  if (vista.estado === 'sin_salida') {
    if (!alerta) return <span className="text-[11px] text-zinc-500">aún sin salida en Odoo</span>;
    return (
      <span className="text-[11px] font-bold text-amber-400"
        title={codigo ? `Ninguna salida de Odoo trae ${codigo} ni la cotización de la obra desde el día del pedido` : 'Ninguna salida de Odoo con la cotización de la obra desde el día del pedido'}>
        ⚠ sin salida en Odoo
      </span>
    );
  }
  const aprox = vista.estado === 'por_cotizacion';
  const ayuda = aprox
    ? `Amarrada por la cotización de la obra y sus productos (el Documento origen no trae ${codigo || 'el número del pedido'}). Si no es de este pedido, la oficina la quita en Almacén.`
    : (vista.salidas || []).some(x => x.via === 'fija') ? 'Elegida para este pedido.' : `El Documento origen de la salida en Odoo trae ${codigo}.`;
  // Las más recientes primero cuando se recorta (la última es la que más interesa).
  const todas = vista.salidas || [];
  const recorta = max != null && todas.length > max;
  const visibles = recorta ? [...todas].reverse().slice(0, max) : todas;
  const ocultas = recorta ? todas.filter(x => !visibles.includes(x)) : [];
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {visibles.map(s => {
        const hecha = s.state === 'done';
        const prods = textoProductos(s);
        return (
          <span key={s.id || s.name}
            title={`${s.name} · ${ESTADO_SALIDA_ODOO[s.state] || s.state}${s.fecha ? ' · ' + fechaCorta(s.fecha) : ''}\nDocumento origen: ${s.origin || '—'}\n${ayuda}${prods ? '\n' + prods : ''}`}
            className={`text-[11px] font-bold px-1.5 py-0.5 rounded-card border whitespace-nowrap ${aprox
              ? 'border-dashed border-sky-700/70 text-sky-300 bg-sky-950/30'
              : hecha ? 'border-green-800/60 text-green-300 bg-green-950/30' : 'border-sky-800/60 text-sky-300 bg-sky-950/30'}`}>
            {aprox ? '≈' : '🧾'} {s.name}{!hecha ? ` · ${ESTADO_SALIDA_ODOO[s.state] || s.state}` : ''}{detalle && s.fecha ? ` · ${fechaCorta(s.fecha)}` : ''}
          </span>
        );
      })}
      {ocultas.length > 0 && (
        <span className="text-[10px] font-bold text-sky-400/80 cursor-help"
          title={ocultas.map(x => `• ${x.name} · ${ESTADO_SALIDA_ODOO[x.state] || x.state}${x.fecha ? ' · ' + fechaCorta(x.fecha) : ''}`).join('\n')}>
          +{ocultas.length}
        </span>
      )}
      {aprox && <span className="text-[10px] text-sky-400/80" title={ayuda}>por cotización</span>}
      {aprox && onDescartar && (
        <button disabled={ocupado} onClick={() => onDescartar(vista.salidas.filter(x => x.via === 'cotizacion'))}
          className="text-[10px] font-bold text-zinc-400 hover:text-white disabled:opacity-40" title="Esta salida no es de este pedido">No es de este</button>
      )}
      {dudas}
    </span>
  );
}
