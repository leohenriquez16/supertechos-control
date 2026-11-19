'use client';

// v8.76: la salida de almacén de Odoo (AL/OUT) de un pedido, como chips.
// vista = salidaDePedidoVista(...) de lib/helpers/porMontar.
//   exacta          🧾 AL/OUT/01650            (el origen trae el REQ del pedido)
//   por_cotización  ≈ AL/OUT/01650 · por cotización  (aproximado: revisar)
//   sin_salida      ⚠ sin salida en Odoo (ámbar) — o "aún sin salida en Odoo" en gris si alerta=false
// max: cuántas salidas mostrar como chip (las demás van en "+N" con la lista en el title).

import React from 'react';
import { ESTADO_SALIDA_ODOO } from '../../lib/helpers/porMontar';

const fechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' }) : '';
};

export default function SalidaOdooChip({ vista, codigo, error = null, detalle = false, alerta = true, max = null }) {
  if (!vista) return null;
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
    ? `Encontrada por la cotización de la obra, no por ${codigo || 'el número del pedido'}. Puede ser de otro pedido de la misma obra: revísala.`
    : `El Documento origen de la salida en Odoo trae ${codigo}.`;
  // Las más recientes primero cuando se recorta (la última es la que más interesa).
  const todas = vista.salidas || [];
  const recorta = max != null && todas.length > max;
  const visibles = recorta ? [...todas].reverse().slice(0, max) : todas;
  const ocultas = recorta ? todas.filter(x => !visibles.includes(x)) : [];
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {visibles.map(s => {
        const hecha = s.state === 'done';
        const prods = (s.productos || []).map(p => `• ${p.producto} ×${p.cantidad}${p.unidad ? ' ' + p.unidad : ''}`).join('\n');
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
    </span>
  );
}
