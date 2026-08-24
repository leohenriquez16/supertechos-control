'use client';

// v8.33.0: "Mi vehículo" — la vista del RESPONSABLE del vehículo.
// Ve su ficha (placa, vencimientos con alerta, odómetro) y desde ahí mismo
// reporta TODO: fallas mecánicas, choques, daños, mantenimientos, gomas.
// Cada reporte queda en el log del vehículo que administra Jonathan (Vehículos).

import React, { useEffect, useState } from 'react';
import { Car, Loader2, Plus, X, AlertTriangle, Wrench } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFechaCorta } from '../../lib/helpers/formato';

export const TIPOS_EVENTO = {
  falla_mecanica: { label: 'Falla mecánica', icon: '🔧' },
  choque: { label: 'Choque / incidente', icon: '💥' },
  dano: { label: 'Daño (cristal, carrocería…)', icon: '🔨' },
  gomas: { label: 'Gomas', icon: '🛞' },
  mantenimiento: { label: 'Mantenimiento (aceite, filtros…)', icon: '🛢️' },
  inspeccion: { label: 'Inspección / chequeo', icon: '🔎' },
  otro: { label: 'Otro', icon: '📝' },
};
export const ESTADOS_EVENTO = {
  abierto: { label: 'Abierto', color: 'bg-red-600/20 text-red-400' },
  en_taller: { label: 'En taller', color: 'bg-amber-600/20 text-amber-400' },
  resuelto: { label: 'Resuelto ✓', color: 'bg-green-600/20 text-green-400' },
};

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const diasPara = (f) => f ? Math.round((new Date(f + 'T00:00:00') - new Date(hoyRD() + 'T00:00:00')) / 86400000) : null;

function BadgeVence({ label, fecha }) {
  const d = diasPara(fecha);
  if (d == null) return <span className="text-[10px] px-2 py-0.5 rounded-full border bg-zinc-800 border-zinc-700 text-zinc-500">{label}: sin fecha</span>;
  const c = d < 0 ? 'bg-red-900/50 text-red-300 border-red-700' : d <= 30 ? 'bg-amber-900/40 text-amber-300 border-amber-700' : 'bg-green-900/30 text-green-400 border-green-800';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${c}`}>{label}: {d < 0 ? `vencido ${-d}d` : `${d}d`} ({fecha})</span>;
}

export default function MiVehiculo({ usuario, data, onRecargar }) {
  const vehiculo = (data.vehiculos || []).find(v => v.responsableId === usuario.id && v.activo !== false);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportando, setReportando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ tipo: 'falla_mecanica', descripcion: '', km: '', fecha: hoyRD() });

  const cargar = async () => {
    if (!vehiculo) { setLoading(false); return; }
    setLoading(true);
    try { setEventos(await db.listarEventosVehiculo({ vehiculoId: vehiculo.id })); }
    catch (e) { console.warn('MiVehiculo:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [vehiculo?.id]);

  if (!vehiculo) {
    return <div className="p-6 text-center text-zinc-500 text-sm"><Car className="w-8 h-8 mx-auto mb-2 opacity-50" />No tienes un vehículo asignado como responsable.</div>;
  }

  const reportar = async () => {
    if (!(form.descripcion || '').trim()) { alert('Describe qué pasó.'); return; }
    setGuardando(true);
    try {
      await db.crearEventoVehiculo({
        vehiculoId: vehiculo.id, tipo: form.tipo, fecha: form.fecha,
        km: form.km, descripcion: form.descripcion.trim(),
        reportadoPorId: usuario.id, reportadoPorNombre: usuario.nombre,
        estado: form.tipo === 'mantenimiento' || form.tipo === 'inspeccion' ? 'resuelto' : 'abierto',
      });
      setReportando(false); setForm({ tipo: 'falla_mecanica', descripcion: '', km: '', fecha: hoyRD() });
      await cargar(); onRecargar?.();
      alert('Reportado ✓ — el encargado de flota lo verá al momento.');
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setGuardando(false);
  };

  const abiertos = eventos.filter(e => e.estado !== 'resuelto');

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Mi vehículo</div>
        <h1 className="text-2xl font-black flex items-center gap-2"><Car className="w-6 h-6 text-red-500" /> {vehiculo.marca} {vehiculo.modelo} {vehiculo.anio ? `· ${vehiculo.anio}` : ''}</h1>
        <div className="text-[11px] text-zinc-500">Placa <b className="font-mono text-zinc-300">{vehiculo.placa || '—'}</b>{vehiculo.color ? ` · ${vehiculo.color}` : ''}{vehiculo.odometroKm ? ` · ${vehiculo.odometroKm.toLocaleString()} km` : ''}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <BadgeVence label="Seguro" fecha={vehiculo.seguroVence} />
        <BadgeVence label="Matrícula/placa" fecha={vehiculo.matriculaVence} />
        {vehiculo.revisionVence && <BadgeVence label="Revisión" fecha={vehiculo.revisionVence} />}
        {vehiculo.proximoMantFecha && <BadgeVence label="Próx. mantenimiento" fecha={vehiculo.proximoMantFecha} />}
      </div>

      {!reportando ? (
        <button onClick={() => setReportando(true)} className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Reportar algo del vehículo
        </button>
      ) : (
        <div className="bg-zinc-900 border-2 border-red-600 rounded-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] tracking-widest uppercase font-bold text-red-500">¿Qué pasó?</span>
            <button onClick={() => setReportando(false)} className="text-zinc-500"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(TIPOS_EVENTO).map(([v, t]) => (
              <button key={v} onClick={() => setForm({ ...form, tipo: v })}
                className={`text-left text-xs font-bold px-2.5 py-2 rounded-card border ${form.tipo === v ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-700 text-zinc-300'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={3}
            placeholder="Describe qué pasó, dónde y desde cuándo…" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-1.5">
            <input type="number" value={form.km} onChange={e => setForm({ ...form, km: e.target.value })} placeholder="Kilometraje actual" className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
            <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
          </div>
          <button onClick={reportar} disabled={guardando} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1.5">
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />} Enviar reporte
          </button>
        </div>
      )}

      {loading ? <div className="text-center py-6"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div> : (
        <>
          {abiertos.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-card p-2.5 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {abiertos.length} reporte{abiertos.length !== 1 ? 's' : ''} pendiente{abiertos.length !== 1 ? 's' : ''} de resolver
            </div>
          )}
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1.5">Historial del vehículo ({eventos.length})</div>
            <div className="space-y-1.5">
              {eventos.length === 0 && <div className="text-xs text-zinc-600 italic">Sin eventos registrados todavía.</div>}
              {eventos.map(e => {
                const t = TIPOS_EVENTO[e.tipo] || TIPOS_EVENTO.otro;
                const est = ESTADOS_EVENTO[e.estado] || ESTADOS_EVENTO.abierto;
                return (
                  <div key={e.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold">{t.icon} {t.label}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-card ${est.color}`}>{est.label}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{e.descripcion}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{formatFechaCorta(e.fecha)}{e.km ? ` · ${e.km.toLocaleString()} km` : ''}{e.costoRd ? ` · ${formatRD(e.costoRd)}` : ''}{e.taller ? ` · ${e.taller}` : ''}{e.resueltoNota ? ` · ${e.resueltoNota}` : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
