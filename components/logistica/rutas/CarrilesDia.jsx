'use client';

// v8.75: columna izquierda — un "carril" por ruta del día (chofer + vehículo,
// paradas hechas, lo que vio el GPS) y el botón para crear una ruta nueva.

import React, { useState } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { resumenRuta } from '../../../lib/helpers/rutasOficina';
import { formatFechaCorta } from '../../../lib/helpers/formato';

const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

export const tituloViaje = (v) => v.tipoEnvio === 'pagado' ? `📮 Envío pagado${v.vehiculo ? ` · ${v.vehiculo}` : ''}`
  : v.tipoEnvio === 'subcontratado' ? `🚚 Sub-contratado${v.vehiculo ? ` · ${v.vehiculo}` : ''}`
  : `🚛 ${v.choferNombre || 'Sin chofer'}`;

export function estadoViaje(v) {
  if (v.estado === 'cancelado') return { texto: 'Cancelada', clase: 'bg-zinc-800 text-zinc-400', borde: 'border-l-zinc-600' };
  if (v.estado === 'completado') return { texto: `Terminó ${hora(v.horaFin)}`, clase: 'bg-green-900/50 text-green-300', borde: 'border-l-green-500' };
  if (v.estado === 'en_curso') return { texto: `En la calle desde ${hora(v.horaInicio)}`, clase: 'bg-cyan-900/50 text-cyan-300', borde: 'border-l-cyan-400' };
  return { texto: 'Por salir', clase: 'bg-zinc-800 text-zinc-300', borde: 'border-l-zinc-500' };
}

export default function CarrilesDia({ viajes, viajeSel, onElegir, mostrarFecha, creando, setCreando, nuevo, setNuevo, vehiculos, personal, choferes, viajesDelDia, onCrear, onBorrarVacio, fecha, filtro }) {
  return (
    <div className="space-y-2">
      {viajes.map(v => {
        const r = resumenRuta(v);
        const est = estadoViaje(v);
        const sel = v.id === viajeSel;
        const pct = r.total ? Math.round((r.hechas / r.total) * 100) : 0;
        return (
          <button key={v.id} onClick={() => onElegir(v.id)}
            className={`w-full text-left rounded-card border border-l-4 ${est.borde} px-3 py-2.5 transition-colors ${sel ? 'bg-zinc-800 border-cyan-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{tituloViaje(v)}</div>
                {v.tipoEnvio === 'camion' && v.vehiculo && <div className="text-[11px] text-zinc-500 truncate">{v.vehiculo}</div>}
                {mostrarFecha && <div className="text-[11px] text-zinc-500">{formatFechaCorta(v.fecha)}</div>}
              </div>
              {v.estado === 'planificado' && v.paradas.length === 0 && (
                <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onBorrarVacio(v); }} className="text-zinc-600 hover:text-red-400 shrink-0" title="Borrar ruta vacía"><Trash2 className="w-3.5 h-3.5" /></span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${est.clase}`}>{est.texto}</span>
              <span className="text-[11px] text-zinc-400 ml-auto whitespace-nowrap">{r.total === 0 ? 'sin paradas' : `${r.hechas}/${r.total} hechas`}{r.gps > 0 ? ` · 🛰 ${r.gps}` : ''}</span>
            </div>
            {r.total > 0 && (
              <div className="h-1 bg-zinc-800 rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
            )}
          </button>
        );
      })}

      {viajes.length === 0 && (
        <div className="border border-dashed border-zinc-700 rounded-card p-4 text-center">
          <div className="text-sm font-bold text-zinc-300">{filtro === 'viejos' ? 'No hay rutas viejas sin cerrar' : filtro === 'cancelados' ? 'No hay rutas canceladas' : 'No hay rutas para este día'}</div>
          {filtro === 'dia' && <div className="text-xs text-zinc-500 mt-1">Crea una con el botón de abajo.</div>}
        </div>
      )}

      {filtro === 'dia' && (!creando ? (
        <button onClick={() => setCreando(true)} className="w-full bg-cyan-700 hover:bg-cyan-600 text-white font-black py-3 text-sm flex items-center justify-center gap-1.5 rounded-card">
          <Plus className="w-4 h-4" /> Nueva ruta
        </button>
      ) : (
        <NuevaRuta nuevo={nuevo} setNuevo={setNuevo} vehiculos={vehiculos} personal={personal} choferes={choferes} viajesDelDia={viajesDelDia}
          onCrear={onCrear} onCerrar={() => setCreando(false)} fecha={fecha} />
      ))}
    </div>
  );
}

// Elegir el vehículo y listo: el chofer responsable entra solo.
function NuevaRuta({ nuevo, setNuevo, vehiculos, personal, choferes, viajesDelDia, onCrear, onCerrar, fecha }) {
  const [guardando, setGuardando] = useState(false);
  const flota = (vehiculos || []).filter(v => v.activo !== false);
  const disponible = (v) => v.estadoOperativo !== 'fuera_servicio' && v.estadoOperativo !== 'en_taller';
  const conRuta = (v) => viajesDelDia.some(x => x.vehiculoId === v.id);
  const resp = (v) => (personal || []).find(p => p.id === v.responsableId);
  const textoVeh = (v) => `${v.marca || ''} ${v.modelo || ''}${v.placa ? ` · ${v.placa}` : ''}`.trim();

  const elegirVehiculo = (v) => {
    const r = resp(v);
    setNuevo({ tipoEnvio: 'camion', vehiculoId: v.id, vehiculo: textoVeh(v), choferId: r ? r.id : '', cambiarChofer: !r });
  };
  const crear = async () => { setGuardando(true); await onCrear(); setGuardando(false); };
  const listo = nuevo.tipoEnvio === 'camion' ? !!nuevo.choferId : !!(nuevo.vehiculo || '').trim();

  const ordenada = [...flota].sort((a, b) => (disponible(b) - disponible(a)) || (conRuta(a) - conRuta(b)));
  return (
    <div className="bg-zinc-900 border-2 border-cyan-700 rounded-card p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-cyan-400">Nueva ruta · {formatFechaCorta(fecha)}</span>
        <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="text-[11px] text-zinc-400">¿Qué vehículo sale? El chofer se pone solo.</div>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {ordenada.map(v => {
          const r = resp(v);
          const ok = disponible(v);
          const sel = nuevo.tipoEnvio === 'camion' && nuevo.vehiculoId === v.id;
          return (
            <button key={v.id} disabled={!ok} onClick={() => elegirVehiculo(v)}
              className={`w-full text-left px-2.5 py-2 rounded-card border flex items-center gap-2 ${sel ? 'border-cyan-500 bg-cyan-950/40' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'} disabled:opacity-40`}>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold truncate">{[v.marca, v.modelo].filter(Boolean).join(' ') || v.placa}</span>
                <span className="block text-[11px] text-zinc-500 truncate">{v.placa || ''}{r ? ` · ${r.nombre}` : ' · sin chofer asignado'}</span>
              </span>
              {!ok ? <span className="text-[10px] text-red-400 shrink-0">{v.estadoOperativo === 'en_taller' ? 'en taller' : 'fuera de servicio'}</span>
                : conRuta(v) ? <span className="text-[10px] text-amber-400 shrink-0">ya tiene ruta</span> : null}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {[['subcontratado', '🚚 Sub-contratado'], ['pagado', '📮 Envío pagado'], ['otro', 'Otro camión']].map(([k, l]) => {
          const sel = k === 'otro' ? (nuevo.tipoEnvio === 'camion' && !nuevo.vehiculoId && nuevo.otro) : nuevo.tipoEnvio === k;
          return (
            <button key={k} onClick={() => setNuevo(k === 'otro' ? { tipoEnvio: 'camion', vehiculoId: '', vehiculo: '', choferId: '', cambiarChofer: true, otro: true } : { tipoEnvio: k, vehiculoId: '', vehiculo: '', choferId: '' })}
              className={`text-[11px] font-bold px-2 py-1.5 rounded-card border ${sel ? 'bg-cyan-700 border-cyan-700 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>{l}</button>
          );
        })}
      </div>
      {(nuevo.tipoEnvio !== 'camion' || nuevo.otro) && (
        <input autoFocus value={nuevo.vehiculo || ''} onChange={e => setNuevo({ ...nuevo, vehiculo: e.target.value })}
          placeholder={nuevo.tipoEnvio === 'pagado' ? 'Mensajería / quién lo lleva' : nuevo.tipoEnvio === 'subcontratado' ? 'Empresa o persona del transporte' : 'Camión (texto libre)'}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2.5 py-2 text-sm" />
      )}
      {nuevo.tipoEnvio === 'camion' && (nuevo.vehiculoId || nuevo.otro) && (nuevo.choferId && !nuevo.cambiarChofer ? (
        <div className="text-xs text-zinc-300 flex items-center gap-2">
          <span>👤 <b>{(choferes.find(c => c.id === nuevo.choferId) || personal.find(p => p.id === nuevo.choferId) || {}).nombre || '—'}</b></span>
          <button onClick={() => setNuevo({ ...nuevo, cambiarChofer: true })} className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300">cambiar</button>
        </div>
      ) : (
        <select value={nuevo.choferId || ''} onChange={e => setNuevo({ ...nuevo, choferId: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm">
          <option value="">{choferes.length === 0 ? 'Chofer… (asigna el rol Chofer en Personal)' : 'Elige el chofer…'}</option>
          {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      ))}
      {(nuevo.vehiculoId || nuevo.tipoEnvio !== 'camion' || nuevo.otro) && (
        <button onClick={crear} disabled={!listo || guardando} className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm font-black py-2.5 rounded-card">
          {guardando ? 'Creando…' : 'Crear ruta'}
        </button>
      )}
    </div>
  );
}
