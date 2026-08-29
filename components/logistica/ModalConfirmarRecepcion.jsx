'use client';

// v8.49.4: DOBLE CONFIRMACIÓN de recepción de materiales.
// El chofer ya capturó la prueba al entregar (foto + firma + quién recibió — v8.42.0).
// Este modal cierra el ciclo: el MAESTRO en obra (origen 'obra') o la OFICINA
// (Erisdania, origen 'oficina') confirman el recibido en el ERP CORROBORANDO
// contra esa firma/foto, que se muestra aquí mismo. Queda registrado quién y desde dónde.

import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import * as db from '../../lib/db';

export default function ModalConfirmarRecepcion({ req, etiqueta, usuario, origen, onCerrar, onConfirmado }) {
  const [prueba, setPrueba] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let p = await db.obtenerPruebaEntrega(req.id);
        // Los retiros en almacén llevan su propia firma (v8.48.0)
        if (!p && (req.retiroFirmaUrl || req.retiroPorNombre)) {
          p = { fotoUrl: req.retiroFotoUrl, firmaUrl: req.retiroFirmaUrl, recibidoPorNombre: req.retiroPorNombre, completadaAt: req.retiradaAt, choferNombre: null, esRetiro: true };
        }
        setPrueba(p);
      } catch (e) { console.warn('prueba entrega:', e?.message); }
      setCargando(false);
    })();
  }, [req.id]);

  const confirmar = async () => {
    setGuardando(true);
    try {
      await db.confirmarRecepcionRequisicion(req.id, { porId: usuario?.id || null, porNombre: usuario?.nombre || null, origen });
      await onConfirmado();
    } catch (e) { alert('Error: ' + (e?.message || e)); setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">✅ Confirmar recibido</h2>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-xs text-zinc-400">{etiqueta}</div>
        <div className="text-[11px] text-zinc-500">
          {origen === 'oficina'
            ? 'Estás confirmando DE OFICINA que la obra recibió este material. Corrobora con la firma que dejó el chofer antes de confirmar.'
            : 'Confirma que recibiste este material en la obra. Abajo está la prueba que tomó el chofer al entregarlo.'}
        </div>

        {cargando ? (
          <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-500" /></div>
        ) : prueba ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">{prueba.esRetiro ? '🙋 Prueba del retiro en almacén' : '🚚 Prueba de entrega del chofer'}</div>
            <div className="text-xs text-zinc-300">
              Firmó: <b>{prueba.recibidoPorNombre || '—'}</b>
              {prueba.choferNombre ? <> · entregó el chofer <b>{prueba.choferNombre}</b></> : null}
              {prueba.completadaAt ? <span className="text-zinc-500"> · {new Date(prueba.completadaAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {prueba.firmaUrl && (
                <div>
                  <div className="text-[9px] text-zinc-500 uppercase mb-0.5">Firma</div>
                  <img src={prueba.firmaUrl} alt="Firma" className="w-full rounded-card bg-white" />
                </div>
              )}
              {prueba.fotoUrl && (
                <div>
                  <div className="text-[9px] text-zinc-500 uppercase mb-0.5">Foto</div>
                  <a href={prueba.fotoUrl} target="_blank" rel="noreferrer"><img src={prueba.fotoUrl} alt="Entrega" className="w-full rounded-card object-cover max-h-40" /></a>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-amber-950/40 border border-amber-800/50 rounded-card p-3 text-[11px] text-amber-300">
            ⚠ No hay firma del chofer registrada para esta entrega. Puedes confirmar igual, pero quedará sin corroboración — verifica con el chofer.
          </div>
        )}

        <button onClick={confirmar} disabled={guardando || cargando}
          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-2">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : '✓'} {origen === 'oficina' ? 'Confirmar de oficina (corroborado)' : 'Sí, lo recibimos en la obra'}
        </button>
      </div>
    </div>
  );
}
