'use client';

// v8.51.1: ⛽ Bombas para el CHOFER — la misma vista de estaciones TotalEnergies
// (tarjeta flotilla, ordenadas por cercanía, Waze directo) en un overlay que se
// abre desde Mi Vehículo, la vista Flota y el inicio del chofer. Antes solo se
// veía dentro del módulo Vehículos (admin/almacén) y el que andaba en la calle
// con la tarjeta no tenía cómo consultarla.

import React from 'react';
import { X } from 'lucide-react';
import VistaBombas from './VistaBombas';

export default function ModalBombas({ onCerrar }) {
  return (
    <div className="fixed inset-0 bg-zinc-950 z-50 overflow-y-auto">
      <div className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between z-10">
        <div className="text-sm font-black">⛽ Bombas — tarjeta flotilla TotalEnergies</div>
        <button onClick={onCerrar} className="text-zinc-400 hover:text-white p-1.5 bg-zinc-900 border border-zinc-700 rounded-card"><X className="w-4 h-4" /></button>
      </div>
      <VistaBombas />
    </div>
  );
}
