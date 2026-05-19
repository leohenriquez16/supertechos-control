'use client';

// v8.17.82: Componente reutilizable para mostrar el desglose de gastos del
// titular por empresa receptora. Soporta dos modos:
//   - "bruto"        → solo el total imputado a cada empresa (sin descontar entregas)
//   - "proporcional" → además, cuánto le tocaría poner a cada empresa para
//                      el monto de entrega indicado (proporcional a sus gastos)
// Usado en el modal de Entregar Caja Chica, en la vista Por Persona expandida,
// y en el PDF de cuadre.

import React from 'react';
import { formatRD } from '../../lib/helpers/formato';
import { calcDesgloseEmpresa } from '../../lib/helpers/cuadreCajaChica';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';

const ORDEN = ['super_techos', 'prouco', 'sin_asignar'];
const LABEL = {
  super_techos: 'Super Techos',
  prouco: 'Prouco',
  sin_asignar: 'Sin empresa',
};
const COLOR = {
  super_techos: 'text-red-400',
  prouco: 'text-lime-400',
  sin_asignar: 'text-zinc-400',
};

export default function DesgloseEmpresaReembolso({ movimientos, montoEntrega = null, fechaInicio = null, fechaFin = null, compacto = false, titulo = null }) {
  const { bruto, proporcional, pct, totalGastos } = calcDesgloseEmpresa({
    movimientos, montoEntrega, fechaInicio, fechaFin,
  });

  if (totalGastos === 0) {
    return null;
  }

  return (
    <div className={`bg-zinc-950 border border-zinc-800 ${compacto ? 'p-2' : 'p-3'} text-[11px]`}>
      <div className={`${compacto ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-widest text-zinc-500 font-bold mb-1.5`}>
        {titulo || 'Desglose por empresa'}
      </div>
      <div className="space-y-1">
        {ORDEN.map(key => {
          const monto = bruto[key];
          if (monto === 0 && key === 'sin_asignar') return null;
          const prop = proporcional[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <div className={`flex-1 min-w-0 ${COLOR[key]} ${compacto ? 'text-[10px]' : ''}`}>
                {LABEL[key]}
                <span className="text-zinc-600 ml-1">({pct[key].toFixed(0)}%)</span>
              </div>
              <div className="text-right">
                <div className={`font-bold ${COLOR[key]} tabular-nums`}>{formatRD(monto)}</div>
                {montoEntrega != null && prop > 0 && (
                  <div className="text-[9px] text-zinc-500 tabular-nums">→ aporta {formatRD(prop)}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-zinc-800">
        <span className="text-zinc-500">Total imputado:</span>
        <span className="font-black text-orange-400 tabular-nums">{formatRD(totalGastos)}</span>
      </div>
      {montoEntrega != null && (
        <div className="flex justify-between items-center mt-1">
          <span className="text-zinc-500">Reembolso a entregar:</span>
          <span className="font-bold text-green-400 tabular-nums">{formatRD(montoEntrega)}</span>
        </div>
      )}
    </div>
  );
}
