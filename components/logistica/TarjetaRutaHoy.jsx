'use client';

// Tarjeta "Tu ruta de hoy" para quien NO es chofer puro (supervisor, maestro,
// almacén…) pero tiene viajes asignados (chofer_id = él). Si no tiene viajes de
// hoy ni viejos sin cerrar, no pinta nada. Al tocarla abre su ruta completa
// (InicioChofer) ahí mismo. El resumen se recalcula cada vez que InicioChofer
// recarga (por ejemplo, al finalizar una parada dentro de la tarjeta).

import React, { useEffect, useState, useCallback } from 'react';
import { Truck, ChevronDown, ChevronUp } from 'lucide-react';
import * as db from '../../lib/db';
import { resumenRutaChofer } from '../../lib/helpers/rutasChofer';
import InicioChofer from './InicioChofer';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const restarDias = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

export default function TarjetaRutaHoy({ usuario, data, envoltura = '' }) {
  const [resumen, setResumen] = useState(null);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!usuario?.id) return;
    let vivo = true;
    const hoy = hoyRD();
    db.listarViajes({ desde: restarDias(hoy, 60), hasta: hoy, choferId: usuario.id })
      .then(lista => { if (vivo) setResumen(resumenRutaChofer(lista, hoy)); })
      .catch(() => { /* sin ruta no se muestra nada */ });
    return () => { vivo = false; };
  }, [usuario?.id]);

  // InicioChofer embebido avisa con su lista cada vez que recarga.
  const alRecargar = useCallback((lista) => setResumen(resumenRutaChofer(lista, hoyRD())), []);

  // Abierta no se esconde aunque ya no quede nada (ej. acaba de cerrar su último viaje viejo).
  if (!resumen || (resumen.viajesHoy === 0 && resumen.viejos === 0 && !abierta)) return null;

  const linea = resumen.viajesHoy > 0
    ? `${resumen.total} parada${resumen.total !== 1 ? 's' : ''} · ${resumen.hechas} hecha${resumen.hechas !== 1 ? 's' : ''}${resumen.enCurso ? ' · en curso' : ''}`
    : 'Sin ruta hoy';

  return (
    <div className={envoltura}>
    <div className="bg-zinc-900 border border-cyan-700/70 rounded-card overflow-hidden">
      <button onClick={() => setAbierta(!abierta)} className="w-full p-3 flex items-center gap-3 text-left">
        <span className="w-11 h-11 rounded-full bg-cyan-600/20 text-cyan-400 flex items-center justify-center shrink-0"><Truck className="w-5 h-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-black">Tu ruta de hoy</span>
          <span className="block text-xs text-zinc-400">{linea}{resumen.viejos > 0 ? ` · ${resumen.viejos} viaje${resumen.viejos !== 1 ? 's' : ''} viejo${resumen.viejos !== 1 ? 's' : ''} sin cerrar` : ''}</span>
        </span>
        <span className="text-[11px] font-black uppercase text-cyan-400 flex items-center gap-1 shrink-0">{abierta ? 'Cerrar' : 'Abrir'} {abierta ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>
      {abierta && (
        <div className="border-t border-zinc-800 p-3">
          <InicioChofer usuario={usuario} data={data} embebido onViajes={alRecargar} />
        </div>
      )}
    </div>
    </div>
  );
}
