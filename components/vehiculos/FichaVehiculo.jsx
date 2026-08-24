'use client';

// v8.44.0: FICHA COMPLETA del vehículo — TODA la información explícita y legible
// (identificación, documentos con vencimientos, chofer y licencia, garantía,
// GPS, odómetro y mantenimiento) con accesos a editar, log, rutas e inspección.

import React, { useState, useEffect } from 'react';
import { X, Car, Edit2, MapPin, Loader2 } from 'lucide-react';
import { formatFechaCorta } from '../../lib/helpers/formato';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const dias = (f) => f ? Math.round((new Date(f + 'T00:00:00') - new Date(hoyRD() + 'T00:00:00')) / 86400000) : null;

const Vence = ({ fecha }) => {
  if (!fecha) return <span className="text-zinc-500">—</span>;
  const d = dias(fecha);
  const c = d < 0 ? 'text-red-400' : d <= 30 ? 'text-amber-400' : 'text-green-400';
  return <span className={`font-bold ${c}`}>{formatFechaCorta(fecha)} {d < 0 ? `(vencido ${-d}d)` : `(${d}d)`}</span>;
};

const Fila = ({ label, children }) => (
  <div className="flex justify-between gap-3 py-1.5 border-b border-zinc-800/60 text-sm">
    <span className="text-zinc-400 shrink-0">{label}</span>
    <span className="text-right text-zinc-100 min-w-0">{children ?? <span className="text-zinc-500">—</span>}</span>
  </div>
);
const Seccion = ({ titulo, children }) => (
  <div>
    <div className="text-[11px] tracking-widest uppercase text-zinc-300 font-bold mb-1 mt-4 first:mt-0">{titulo}</div>
    {children}
  </div>
);

export default function FichaVehiculo({ vehiculo: v, personal = [], licencia = null, puedeEditar, onCerrar, onEditar, onLog, onRutas, onInspecciones, onGps }) {
  const resp = personal.find(p => p.id === v.responsableId);
  const [gpsViva, setGpsViva] = useState(null);
  useEffect(() => {
    if (v.gpsDeviceId) {
      fetch('/api/gps/posiciones').then(r => r.json())
        .then(d => setGpsViva((d.dispositivos || []).find(u => String(u.id) === String(v.gpsDeviceId)) || null))
        .catch(() => {});
    }
  }, [v.gpsDeviceId]);

  // Garantía vigente = fecha futura Y (sin límite de km, o el odómetro no lo pasó)
  const garFecha = v.garantiaVence && dias(v.garantiaVence) >= 0;
  const garKm = v.garantiaKm == null || v.odometroKm == null || Number(v.odometroKm) < Number(v.garantiaKm);
  const enGarantia = v.garantiaVence ? (garFecha && garKm) : false;

  const Btn = ({ onClick, children, tono = 'zinc' }) => (
    <button onClick={onClick} className={`text-[10px] font-black uppercase px-2.5 py-2 rounded-card border ${tono === 'red' ? 'bg-red-600 border-red-600 text-white hover:bg-red-700' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}>{children}</button>
  );

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card max-w-2xl w-full p-6 my-8 space-y-1" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="min-w-0">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Ficha del vehículo</div>
            <div className="text-xl font-black flex items-center gap-2"><Car className="w-5 h-5 text-red-500" /> {[v.marca, v.modelo, v.anio].filter(Boolean).join(' ')}</div>
            <div className="flex gap-2 flex-wrap mt-1">
              {enGarantia && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300 border border-emerald-700/60">🛡 EN GARANTÍA — mantenimiento en {v.garantiaCasa || 'la casa'}</span>}
              {v.garantiaVence && !enGarantia && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">🛡 Garantía vencida</span>}
              {gpsViva && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-600/15 text-cyan-300 border border-cyan-800/60">🛰 {gpsViva.online === 'offline' ? 'sin señal' : `${gpsViva.velocidad} km/h`}</span>}
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-1.5 flex-wrap pb-2">
          {puedeEditar && <Btn tono="red" onClick={onEditar}><Edit2 className="w-3 h-3 inline -mt-0.5" /> Editar</Btn>}
          {(v.gpsUrl || v.gpsDeviceId) && <Btn onClick={onGps}><MapPin className="w-3 h-3 inline -mt-0.5" /> GPS en vivo</Btn>}
          <Btn onClick={onLog}>📋 Historial</Btn>
          <Btn onClick={onRutas}>🚚 Rutas</Btn>
          {onInspecciones && <Btn onClick={onInspecciones}>📷 Inspecciones</Btn>}
        </div>

        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <Seccion titulo="Identificación">
              <Fila label="Placa">{v.placa ? <span className="font-mono font-bold">{v.placa}</span> : null}</Fila>
              <Fila label="Chasis / VIN">{v.chasis ? <span className="font-mono text-xs">{v.chasis}</span> : null}</Fila>
              <Fila label="Color">{v.color || null}</Fila>
              <Fila label="Tipo">{v.tipo || null}</Fila>
              <Fila label="Empresa">{v.empresa === 'prouco' ? 'Prouco' : v.empresa === 'super_techos' ? 'Super Techos' : null}</Fila>
              <Fila label="Estado">{v.estadoOperativo || 'activo'}</Fila>
            </Seccion>
            <Seccion titulo="Chofer / responsable">
              <Fila label="Responsable">{resp?.nombre || null}</Fila>
              <Fila label="Licencia">{licencia?.licenciaCategoria || licencia?.categoria || null}</Fila>
              <Fila label="Licencia vence">{(licencia?.licenciaVence || licencia?.vence) ? <Vence fecha={licencia.licenciaVence || licencia.vence} /> : null}</Fila>
            </Seccion>
            <Seccion titulo="Uso y mantenimiento">
              <Fila label="Odómetro">{v.odometroKm ? `${Number(v.odometroKm).toLocaleString()} km${v.odometroFecha ? ` (${formatFechaCorta(v.odometroFecha)})` : ''}` : null}</Fila>
              <Fila label="Próx. mantenimiento">{v.proximoMantFecha ? <Vence fecha={v.proximoMantFecha} /> : v.proximoMantKm ? `${Number(v.proximoMantKm).toLocaleString()} km` : null}</Fila>
              <Fila label="Combustible">{v.combustible || null}</Fila>
              <Fila label="Capacidad">{v.capacidadCargaKg ? `${Number(v.capacidadCargaKg).toLocaleString()} kg` : null}</Fila>
            </Seccion>
          </div>
          <div>
            <Seccion titulo="Documentos">
              <Fila label="Matrícula">{v.matriculaPath ? '📄 Cargada' : 'sin documento'}</Fila>
              <Fila label="Placa/marbete vence">{v.matriculaVence ? <Vence fecha={v.matriculaVence} /> : null}</Fila>
              <Fila label="Seguro">{v.seguroAseguradora || (v.seguroPath ? '📄 Cargado' : null)}</Fila>
              <Fila label="Seguro vence">{v.seguroVence ? <Vence fecha={v.seguroVence} /> : null}</Fila>
              <Fila label="Revisión vence">{v.revisionVence ? <Vence fecha={v.revisionVence} /> : null}</Fila>
              <Fila label="Tag peaje">{v.tagPeaje || null}</Fila>
            </Seccion>
            <Seccion titulo="🛡 Garantía">
              <Fila label="Vigente">{v.garantiaVence ? (enGarantia ? <span className="text-emerald-400 font-bold">Sí ✓</span> : <span className="text-red-400 font-bold">No</span>) : 'sin registrar'}</Fila>
              <Fila label="Vence">{v.garantiaVence ? <Vence fecha={v.garantiaVence} /> : null}</Fila>
              <Fila label="Límite de km">{v.garantiaKm ? `${Number(v.garantiaKm).toLocaleString()} km${v.odometroKm ? ` (va ${Number(v.odometroKm).toLocaleString()})` : ''}` : null}</Fila>
              <Fila label="Casa / dealer">{v.garantiaCasa || null}</Fila>
              {v.garantiaNotas ? <div className="text-xs text-zinc-400 pt-1.5">{v.garantiaNotas}</div> : null}
              {enGarantia && <div className="text-[11px] text-emerald-300 pt-1.5">⚠ Mantenimientos y reparaciones en {v.garantiaCasa || 'la casa'} para no perder la garantía.</div>}
            </Seccion>
            <Seccion titulo="🛰 GPS">
              <Fila label="Unidad amarrada">{v.gpsDeviceId ? (gpsViva?.nombre || `#${v.gpsDeviceId}`) : 'sin amarrar'}</Fila>
              <Fila label="Ahora">{gpsViva ? `${gpsViva.velocidad} km/h · ${gpsViva.online === 'offline' ? 'sin señal' : gpsViva.velocidad > 2 ? 'en movimiento' : 'detenido'}` : null}</Fila>
              <Fila label="Última señal">{gpsViva?.hora || null}</Fila>
            </Seccion>
          </div>
        </div>
        {v.notas && <div className="text-xs text-zinc-400 border-t border-zinc-800 mt-3 pt-2">📝 {v.notas}</div>}
      </div>
    </div>
  );
}
