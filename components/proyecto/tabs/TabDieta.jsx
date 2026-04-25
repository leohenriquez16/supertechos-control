'use client';

import React, { useState } from 'react';
import { Edit2, Save, Utensils } from 'lucide-react';
import { formatRD } from '../../../lib/helpers/formato';
import { calcDieta } from '../../../lib/helpers/calculos';
import Campo from '../../common/Campo';
import Input from '../../common/Input';

// Helper local (también está en page.jsx)
const getPersona = (personal, id) => personal.find(p => p.id === id);

export default function TabDieta({ proyecto, reportes, personal, onActualizarProyecto }) {
  const [editando, setEditando] = useState(false);
  const [dietaEdit, setDietaEdit] = useState(proyecto.dieta || { habilitada: true, tarifa_dia_persona: 800, dias_hombre_presupuestados: 0, personasIds: [] });
  const dieta = calcDieta(proyecto, reportes);
  if (!dieta) return <div className="text-zinc-500">Dieta no habilitada.</div>;
  const personasElegibles = [proyecto.maestroId, ...(proyecto.ayudantesIds || [])].filter(Boolean).map(id => getPersona(personal, id)).filter(Boolean);
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-orange-900/40 to-zinc-950 border border-orange-900/50 p-4">
        <div className="text-[11px] tracking-widest uppercase text-orange-300 font-bold mb-3 flex items-center gap-1"><Utensils className="w-3 h-3" /> Presupuesto Dieta</div>
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-[10px] text-zinc-500 uppercase">Presupuestado</div><div className="text-xl font-black">{formatRD(dieta.montoPresupuestado)}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Consumido</div><div className={`text-xl font-black ${dieta.pctConsumido > 100 ? 'text-red-400' : dieta.pctConsumido > 80 ? 'text-yellow-400' : 'text-green-400'}`}>{formatRD(dieta.montoConsumido)}</div><div className="text-[10px] text-zinc-600">{dieta.pctConsumido.toFixed(1)}%</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Disponible</div><div className={`text-xl font-black ${dieta.disponible < 0 ? 'text-red-400' : ''}`}>{formatRD(dieta.disponible)}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Tarifa</div><div className="text-xl font-black">{formatRD(dieta.tarifa)}</div></div>
        </div>
        <div className="h-3 bg-zinc-800 overflow-hidden mt-3"><div className={`h-full ${dieta.pctConsumido > 100 ? 'bg-red-500' : dieta.pctConsumido > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(dieta.pctConsumido, 100)}%` }} /></div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex justify-between items-center"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Configuración</div>{editando ? <div className="flex gap-1"><button onClick={() => { setEditando(false); setDietaEdit(proyecto.dieta); }} className="text-xs text-zinc-500">Cancelar</button><button onClick={() => { onActualizarProyecto({ ...proyecto, dieta: { ...dietaEdit, tarifa_dia_persona: parseFloat(dietaEdit.tarifa_dia_persona) || 0, dias_hombre_presupuestados: parseFloat(dietaEdit.dias_hombre_presupuestados) || 0 } }); setEditando(false); }} className="text-xs text-red-500 font-bold flex items-center gap-1"><Save className="w-3 h-3" /> Guardar</button></div> : <button onClick={() => setEditando(true)} className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1"><Edit2 className="w-3 h-3" /> Editar</button>}</div>
        {editando && (<div className="space-y-3"><div className="grid grid-cols-2 gap-2"><Campo label="Tarifa"><Input type="number" value={dietaEdit.tarifa_dia_persona} onChange={v => setDietaEdit({ ...dietaEdit, tarifa_dia_persona: v })} /></Campo><Campo label="Días-hombre"><Input type="number" value={dietaEdit.dias_hombre_presupuestados} onChange={v => setDietaEdit({ ...dietaEdit, dias_hombre_presupuestados: v })} /></Campo></div><Campo label="Personas"><div className="space-y-1">{personasElegibles.map(p => <label key={p.id} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2 cursor-pointer"><input type="checkbox" checked={dietaEdit.personasIds.includes(p.id)} onChange={e => { const n = e.target.checked ? [...dietaEdit.personasIds, p.id] : dietaEdit.personasIds.filter(x => x !== p.id); setDietaEdit({ ...dietaEdit, personasIds: n }); }} className="w-4 h-4 accent-red-600" /><span className="text-sm">{p.nombre}</span></label>)}</div></Campo></div>)}
      </div>
    </div>
  );
}
