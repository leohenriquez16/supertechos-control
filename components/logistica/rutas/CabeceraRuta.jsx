'use client';

// v8.75: cabecera de la ruta abierta — chofer, vehículo y fecha editables ahí
// mismo, resumen (paradas / hechas / vistas por GPS), duplicar para otro día y
// cancelar con motivo (v8.68.0, sin borrar nada).

import React, { useState } from 'react';
import { Loader2, Copy, Ban } from 'lucide-react';
import { planCancelacionViaje, puedeCancelarViaje, esViajeCancelado } from '../../../lib/helpers/rutas';
import { resumenRuta, formatKm, sumarDias, resumenDuplicar } from '../../../lib/helpers/rutasOficina';
import { tituloViaje, estadoViaje } from './CarrilesDia';

const campo = 'bg-zinc-950 border border-zinc-700 hover:border-zinc-500 focus:border-cyan-600 outline-none rounded-card px-2 py-1.5 text-sm min-w-0';

export default function CabeceraRuta({ viaje: v, choferes, vehiculos, totalM, onEditar, onCambiarVehiculo, onDuplicar, onCancelar }) {
  const [duplicando, setDuplicando] = useState(null);   // { fecha, guardando }
  const [cancelando, setCancelando] = useState(null);   // { motivo, guardando }
  const r = resumenRuta(v);
  const est = estadoViaje(v);
  const editable = v.estado !== 'completado' && !esViajeCancelado(v);
  const flota = (vehiculos || []).filter(x => x.activo !== false);
  const esCamion = v.tipoEnvio === 'camion';

  const plan = cancelando ? planCancelacionViaje(v) : null;
  const dup = duplicando ? resumenDuplicar(v.paradas) : null;
  const s = (n) => n !== 1 ? 's' : '';

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-base font-black truncate">{tituloViaje(v)}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${est.clase}`}>{est.texto}</span>
            <span className="text-xs text-zinc-400">
              {r.total} parada{s(r.total)} · {r.hechas} hecha{s(r.hechas)} · {r.gps} vista{s(r.gps)} por GPS
              {totalM > 0 && <span className="text-zinc-500" title="En línea recta, solo orientativo"> · ≈ {formatKm(totalM)}</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Editar en línea: chofer / vehículo / fecha */}
      {editable && (
        <div className="grid grid-cols-2 gap-1.5">
          {esCamion ? (
            <>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Vehículo</span>
                <select value={v.vehiculoId || ''} onChange={e => onCambiarVehiculo(e.target.value)} className={campo}>
                  <option value="">{v.vehiculo && !v.vehiculoId ? v.vehiculo : 'Sin vehículo de la flota'}</option>
                  {flota.map(x => <option key={x.id} value={x.id} disabled={x.estadoOperativo === 'fuera_servicio' || x.estadoOperativo === 'en_taller'}>{[x.marca, x.modelo, x.placa].filter(Boolean).join(' ')}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Chofer</span>
                <select value={v.choferId || ''} onChange={e => { const c = choferes.find(x => x.id === e.target.value); onEditar({ choferId: e.target.value || null, choferNombre: c?.nombre || '' }); }} className={campo}>
                  <option value="">Sin chofer</option>
                  {v.choferId && !choferes.some(c => c.id === v.choferId) && <option value={v.choferId}>{v.choferNombre}</option>}
                  {[...new Set(choferes.map(c => c.grupo || 'Choferes'))].map(g => (
                    <optgroup key={g} label={g}>{choferes.filter(c => (c.grupo || 'Choferes') === g).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</optgroup>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-0.5 col-span-1">
              <span className="text-[10px] uppercase font-bold text-zinc-500">{v.tipoEnvio === 'pagado' ? 'Quién lo lleva' : 'Transporte'}</span>
              <input defaultValue={v.vehiculo} key={v.id + v.vehiculo} onBlur={e => { if (e.target.value !== v.vehiculo) onEditar({ vehiculo: e.target.value }); }} className={campo} />
            </label>
          )}
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Fecha</span>
            <input type="date" value={v.fecha} disabled={v.estado !== 'planificado'} onChange={e => e.target.value && e.target.value !== v.fecha && onEditar({ fecha: e.target.value })}
              className={`${campo} disabled:opacity-50`} title={v.estado !== 'planificado' ? 'La ruta ya salió: no se puede mover de día' : 'Mover la ruta a otro día'} />
          </label>
        </div>
      )}

      {/* Acciones */}
      {!duplicando && !cancelando && (
        <div className="flex gap-1.5 flex-wrap">
          {!esViajeCancelado(v) && (
            <button onClick={() => setDuplicando({ fecha: sumarDias(v.fecha, 1) })} className="text-xs font-bold border border-zinc-700 hover:border-cyan-600 text-zinc-300 px-2.5 py-1.5 rounded-card flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5" /> Duplicar para otro día
            </button>
          )}
          {puedeCancelarViaje(v) && v.paradas.length > 0 && (
            <button onClick={() => setCancelando({ motivo: '' })} className="text-xs font-bold border border-zinc-700 hover:border-red-600 text-zinc-400 hover:text-red-300 px-2.5 py-1.5 rounded-card flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5" /> Cancelar ruta
            </button>
          )}
        </div>
      )}

      {duplicando && (
        <div className="bg-zinc-950 border border-cyan-800/60 rounded-card p-2.5 space-y-2">
          <div className="text-xs font-bold text-cyan-300">Copiar esta ruta para otro día (mismas paradas libres; las requisiciones y retiros no se copian):</div>
          <div className="text-[11px] text-zinc-400">
            Se copian <b className="text-zinc-200">{dup.copia} parada{s(dup.copia)}</b> pendiente{s(dup.copia)}.
            {dup.montadas > 0 && ` ${dup.montadas} de requisición o retiro no se copia${dup.montadas !== 1 ? 'n' : ''} (se montan desde «Por montar»).`}
            {dup.hechas > 0 && ` ${dup.hechas} ya hecha${s(dup.hechas)} no se copia${dup.hechas !== 1 ? 'n' : ''}.`}
            {dup.copia === 0 && ' La ruta nueva saldrá vacía, con el mismo chofer y vehículo.'}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[1, 2, 7].map(n => { const f = sumarDias(v.fecha, n); return (
              <button key={n} onClick={() => setDuplicando({ ...duplicando, fecha: f })} className={`text-[11px] font-bold px-2 py-1 rounded-card border ${duplicando.fecha === f ? 'bg-cyan-700 border-cyan-700 text-white' : 'border-zinc-700 text-zinc-400'}`}>
                {n === 1 ? 'Mañana' : n === 2 ? 'Pasado mañana' : 'En una semana'}
              </button>); })}
            <input type="date" value={duplicando.fecha} onChange={e => setDuplicando({ ...duplicando, fecha: e.target.value })} className={campo} />
          </div>
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => setDuplicando(null)} disabled={duplicando.guardando} className="text-xs font-bold border border-zinc-700 text-zinc-400 px-2.5 py-1.5 rounded-card">Volver</button>
            <button disabled={!duplicando.fecha || duplicando.guardando} onClick={async () => { setDuplicando({ ...duplicando, guardando: true }); const ok = await onDuplicar(duplicando.fecha); setDuplicando(ok ? null : { ...duplicando, guardando: false }); }}
              className="text-xs font-black bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-card flex items-center gap-1">
              {duplicando.guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Duplicar
            </button>
          </div>
        </div>
      )}

      {/* v8.68.0: cancelar con motivo obligatorio, no borra nada */}
      {cancelando && (
        <div className="bg-red-950/30 border border-red-800/60 rounded-card p-2.5 space-y-1.5">
          <div className="text-xs font-bold text-red-300">Cancelar esta ruta</div>
          <div className="text-[11px] text-zinc-400">
            {plan.paradasACancelar.length} parada{s(plan.paradasACancelar.length)} pendiente{s(plan.paradasACancelar.length)} quedará{plan.paradasACancelar.length !== 1 ? 'n' : ''} cancelada{s(plan.paradasACancelar.length)}
            {plan.requisicionesADevolver.length > 0 && ` · ${plan.requisicionesADevolver.length} requisición(es) vuelven a «Por montar»`}
            {plan.diligenciasADevolver.length > 0 && ` · ${plan.diligenciasADevolver.length} retiro(s) vuelven a «Por montar»`}
            . No se borra nada.
          </div>
          <textarea autoFocus value={cancelando.motivo} onChange={e => setCancelando({ ...cancelando, motivo: e.target.value })} rows={2}
            placeholder="Motivo (obligatorio): ej. nunca salió, se pasó a otra ruta…" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1.5 text-sm" />
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => setCancelando(null)} disabled={cancelando.guardando} className="text-xs font-bold border border-zinc-700 text-zinc-400 px-2.5 py-1.5 rounded-card">Volver</button>
            <button onClick={async () => { setCancelando({ ...cancelando, guardando: true }); const ok = await onCancelar(cancelando.motivo.trim()); setCancelando(ok ? null : { ...cancelando, guardando: false }); }}
              disabled={!cancelando.motivo.trim() || cancelando.guardando}
              className="text-xs font-black bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-card flex items-center gap-1">
              {cancelando.guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar cancelación
            </button>
          </div>
        </div>
      )}
      {esViajeCancelado(v) && v.notas && <div className="text-[11px] text-red-300/80 whitespace-pre-line">{v.notas}</div>}
    </div>
  );
}
