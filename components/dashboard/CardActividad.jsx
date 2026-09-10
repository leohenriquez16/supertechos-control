'use client';

// v8.51.6: KPI de actividad para el Dashboard — cuántos levantamientos se hicieron
// y cuántas reclamaciones se atendieron, con toggle Hoy / Semana / Mes. Datos
// derivados (metricasActividad): NUNCA reportes manuales.

import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Wrench } from 'lucide-react';
import * as db from '../../lib/db';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

export default function CardActividad() {
  const [datos, setDatos] = useState(null);
  const [rango, setRango] = useState('dia'); // dia | semana | mes

  useEffect(() => {
    let cancel = false;
    db.metricasActividad().then(d => { if (!cancel) setDatos(d); }).catch(() => { if (!cancel) setDatos({ sites: [], reclamaciones: [] }); });
    return () => { cancel = true; };
  }, []);

  const { levant, recl } = useMemo(() => {
    if (!datos) return { levant: null, recl: null };
    const hoy = hoyRD();
    let desde = hoy;
    if (rango === 'semana') { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - 6); desde = d.toISOString().slice(0, 10); }
    else if (rango === 'mes') { desde = hoy.slice(0, 8) + '01'; }
    const enRango = (iso) => { const f = (iso || '').slice(0, 10); return f >= desde && f <= hoy; };
    const levant = (datos.sites || []).filter(s => ['completed', 'validated'].includes(s.survey_status) && enRango(s.updated_at)).length;
    const recl = (datos.reclamaciones || []).filter(r => ['en_proceso', 'resuelta', 'cerrada'].includes(r.estado) && enRango(r.updated_at)).length;
    return { levant, recl };
  }, [datos, rango]);

  const Btn = ({ v, children }) => (
    <button onClick={() => setRango(v)}
      className={`text-[10px] font-bold uppercase px-2 py-1 rounded-card ${rango === v ? 'bg-red-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'}`}>{children}</button>
  );

  const Num = ({ valor, icon: Icon, color, label }) => (
    <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 flex items-center gap-3">
      <Icon className={`w-6 h-6 ${color} shrink-0`} />
      <div className="min-w-0">
        <div className="text-2xl font-black leading-none">{valor == null ? '—' : valor}</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mt-1">{label}</div>
      </div>
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Actividad {rango === 'dia' ? 'de hoy' : rango === 'semana' ? 'de la semana' : 'del mes'}</div>
        <div className="flex gap-1"><Btn v="dia">Hoy</Btn><Btn v="semana">Semana</Btn><Btn v="mes">Mes</Btn></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Num valor={levant} icon={MapPin} color="text-sky-400" label="Levantamientos hechos" />
        <Num valor={recl} icon={Wrench} color="text-amber-400" label="Reclamaciones atendidas" />
      </div>
    </div>
  );
}
