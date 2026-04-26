'use client';

import React, { useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import Campo from '../../common/Campo';
import Input from '../../common/Input';



// v8.9.29: Modal para editar un reporte existente (solo admin)
export default function ModalEditarReporte({ reporte, proyecto, data, sistema, sistemas, onCerrar, onGuardar }) {
  // Resolver sistema del área actual del reporte
  const areaActual = (proyecto.areas || []).find(a => a.id === reporte.areaId);
  const sistemaIdArea = areaActual?.sistemaId || proyecto.sistema;
  const sistemaArea = (sistemas && sistemas[sistemaIdArea]) || sistema;

  const [form, setForm] = useState({
    areaId: reporte.areaId || '',
    tareaId: reporte.tareaId || '',
    fecha: reporte.fecha || '',
    m2: reporte.m2 ?? '',
    rollos: reporte.rollos ?? '',
    cubetas: reporte.cubetas ?? '',
    nota: reporte.nota || '',
    supervisor: reporte.supervisor || '',
    supervisorId: reporte.supervisorId || '',
  });
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Recalcular sistemaArea cuando cambia el área
  const areaElegida = (proyecto.areas || []).find(a => a.id === form.areaId);
  const sistemaIdAreaElegida = areaElegida?.sistemaId || proyecto.sistema;
  const sistemaAreaElegida = (sistemas && sistemas[sistemaIdAreaElegida]) || sistema;

  // Lista de personal con login que podrían aparecer como "supervisor" del reporte
  const personalPosible = (data?.personal || []).filter(p => p.nombre);

  const guardar = async () => {
    if (!motivo || !motivo.trim()) {
      alert('Debes escribir un motivo para el cambio.');
      return;
    }
    if (!form.areaId || !form.tareaId || !form.fecha) {
      alert('Área, tarea y fecha son obligatorios.');
      return;
    }
    // Construir reporte actualizado, preservando campos no editables
    const actualizado = {
      ...reporte,
      areaId: form.areaId,
      tareaId: form.tareaId,
      fecha: form.fecha,
      nota: form.nota,
      supervisor: form.supervisor,
      supervisorId: form.supervisorId,
    };
    // m2, rollos, cubetas según qué tenga valor
    const m2Val = form.m2 === '' ? null : parseFloat(form.m2);
    const rollosVal = form.rollos === '' ? null : parseFloat(form.rollos);
    const cubetasVal = form.cubetas === '' ? null : parseFloat(form.cubetas);
    if (m2Val !== null) actualizado.m2 = m2Val;
    else delete actualizado.m2;
    if (rollosVal !== null) actualizado.rollos = rollosVal;
    else delete actualizado.rollos;
    if (cubetasVal !== null) actualizado.cubetas = cubetasVal;
    else delete actualizado.cubetas;

    setGuardando(true);
    try {
      await onGuardar(actualizado, motivo.trim());
    } catch (e) {
      console.error(e);
      alert('Error al guardar: ' + (e?.message || 'intenta de nuevo'));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-xl w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Editar reporte</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">⚠️ Estás modificando un reporte registrado · Se pedirá motivo</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          <Campo label="Fecha">
            <Input type="date" value={form.fecha} onChange={v => setForm({ ...form, fecha: v })} />
          </Campo>

          <Campo label="Área">
            <select
              value={form.areaId}
              onChange={e => setForm({ ...form, areaId: e.target.value, tareaId: '' })}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"
            >
              <option value="">Seleccionar área...</option>
              {(proyecto.areas || []).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </Campo>

          <Campo label="Tarea">
            <select
              value={form.tareaId}
              onChange={e => setForm({ ...form, tareaId: e.target.value })}
              disabled={!form.areaId || !sistemaAreaElegida}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white disabled:opacity-50"
            >
              <option value="">Seleccionar tarea...</option>
              {(sistemaAreaElegida?.tareas || []).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </Campo>

          <div className="grid grid-cols-3 gap-2">
            <Campo label="m²">
              <Input type="number" value={form.m2} onChange={v => setForm({ ...form, m2: v })} />
            </Campo>
            <Campo label="Rollos">
              <Input type="number" value={form.rollos} onChange={v => setForm({ ...form, rollos: v })} />
            </Campo>
            <Campo label="Cubetas">
              <Input type="number" value={form.cubetas} onChange={v => setForm({ ...form, cubetas: v })} />
            </Campo>
          </div>

          <Campo label="Persona que reportó">
            <select
              value={form.supervisorId}
              onChange={e => {
                const p = personalPosible.find(x => x.id === e.target.value);
                setForm({ ...form, supervisorId: e.target.value, supervisor: p?.nombre || form.supervisor });
              }}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"
            >
              <option value="">— mantener: {form.supervisor || 'sin nombre'} —</option>
              {personalPosible.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>

          <Campo label="Nota">
            <textarea
              value={form.nota}
              onChange={e => setForm({ ...form, nota: e.target.value })}
              rows={2}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"
            />
          </Campo>

          <div className="border-t border-zinc-800 pt-3">
            <Campo label="Motivo del cambio (obligatorio)">
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ej: Maestro reportó mal, en realidad fueron 380 m²"
                className="w-full bg-zinc-950 border-2 border-yellow-700 focus:border-yellow-500 outline-none px-4 py-3 text-white"
              />
            </Campo>
          </div>
        </div>

        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-4 flex gap-2">
          <button onClick={onCerrar} disabled={guardando} className="px-6 bg-zinc-800 text-zinc-400 font-bold uppercase py-3 text-xs">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando || !motivo.trim() || !form.areaId || !form.tareaId || !form.fecha}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white font-black uppercase py-3 text-xs flex items-center justify-center gap-1"
          >
            {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> Guardar cambios</>}
          </button>
        </div>
      </div>
    </div>
  );
}
