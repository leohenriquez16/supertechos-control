'use client';

// v8.34.0: TAREAS RECURRENTES — el calendario de obligaciones (impuestos, pagos,
// cierres). Cada regla abre sola su tarea N días antes de la fecha, asignada a su
// responsable. Atajos con el calendario fiscal RD para armar el de Finanzas rápido.

import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X, Save, Trash2, RefreshCw } from 'lucide-react';
import * as db from '../../lib/db';
import { descFrecuencia, DIAS_SEMANA } from '../../lib/helpers/recurrentes';
import Campo from '../common/Campo';
import Input from '../common/Input';

const tieneRol = (p, r) => p?.roles?.includes(r);

// Prellenan el formulario (no crean directo): el responsable se confirma a mano.
const ATAJOS_FISCALES = [
  { titulo: 'Pagar TSS del mes', frecuencia: 'mensual', diaMes: 3, diasAviso: 3, prioridad: 'alta', area: 'Finanzas' },
  { titulo: 'Cierre contable del mes anterior', frecuencia: 'mensual', diaMes: 5, diasAviso: 3, area: 'Finanzas' },
  { titulo: 'Declarar y pagar IR-17 (retenciones)', frecuencia: 'mensual', diaMes: 10, diasAviso: 4, prioridad: 'alta', area: 'Finanzas' },
  { titulo: 'Enviar formatos 606/607/608 a DGII', frecuencia: 'mensual', diaMes: 15, diasAviso: 5, prioridad: 'alta', area: 'Finanzas' },
  { titulo: 'Declarar y pagar IT-1 (ITBIS)', frecuencia: 'mensual', diaMes: 20, diasAviso: 5, prioridad: 'alta', area: 'Finanzas' },
  { titulo: 'Preparar nómina de la quincena', frecuencia: 'quincenal', diaMes: 13, diaMes2: 28, diasAviso: 2, prioridad: 'alta', area: 'Finanzas' },
  { titulo: 'Actualizar flujo de caja semanal', frecuencia: 'semanal', diaSemana: 1, diasAviso: 0, area: 'Finanzas' },
];

const FORM_VACIO = { titulo: '', descripcion: '', area: 'Finanzas', proyectoInternoId: '', responsableId: '', supervisorId: '', prioridad: 'normal', frecuencia: 'mensual', diaMes: 1, diaMes2: 15, diaSemana: 1, diasAviso: 3 };

export default function ModalRecurrentes({ usuario, data, internos = [], onCerrar, onGenerado }) {
  const [recurrentes, setRecurrentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const asignables = (data.personal || []).filter(p => ['admin', 'supervisor', 'facturas', 'almacen', 'chofer'].some(r => tieneRol(p, r)))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const cargar = async () => {
    setLoading(true);
    try { setRecurrentes(await db.listarTareasRecurrentes()); } catch (e) { console.warn(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async () => {
    if (!form.titulo.trim() || !form.responsableId) { alert('Título y responsable son obligatorios.'); return; }
    setGuardando(true);
    try {
      const resp = asignables.find(p => p.id === form.responsableId);
      const sup = asignables.find(p => p.id === form.supervisorId);
      await db.crearTareaRecurrente({
        id: 'rec_' + Date.now(), titulo: form.titulo.trim(), descripcion: form.descripcion.trim() || null,
        area: form.area || null, proyectoInternoId: form.proyectoInternoId || null,
        responsableId: form.responsableId, responsableNombre: resp?.nombre || null,
        supervisorId: form.supervisorId || null, supervisorNombre: sup?.nombre || null,
        prioridad: form.prioridad, frecuencia: form.frecuencia,
        diaMes: Number(form.diaMes) || 1, diaMes2: form.frecuencia === 'quincenal' ? (Number(form.diaMes2) || 15) : null,
        diaSemana: form.frecuencia === 'semanal' ? Number(form.diaSemana) : null,
        diasAviso: Number(form.diasAviso) || 0,
        creadoPorId: usuario.id, creadoPorNombre: usuario.nombre,
      });
      // Genera al momento las que ya tocan (ej. si la fecha es esta semana).
      const g = await db.generarTareasRecurrentes().catch(() => null);
      setCreando(false); setForm(FORM_VACIO);
      await cargar();
      if (g?.generadas) onGenerado?.();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setGuardando(false);
  };

  const toggleActivo = async (r) => { await db.actualizarTareaRecurrente(r.id, { activo: !r.activo }); await cargar(); };
  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar la recurrente "${r.titulo}"? Las tareas ya creadas se quedan.`)) return;
    await db.eliminarTareaRecurrente(r.id); await cargar();
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-amber-600 rounded-card max-w-2xl w-full p-5 space-y-3 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="text-xs tracking-widest uppercase text-amber-500 font-bold">🔁 Tareas recurrentes</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Impuestos, pagos y cierres con fecha fija: la tarea se abre sola días antes y le llega a su responsable.</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {!creando ? (
          <button onClick={() => setCreando(true)} className="w-full bg-amber-600 hover:bg-amber-500 text-black text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nueva recurrente
          </button>
        ) : (
          <div className="bg-zinc-950 border border-amber-800/50 rounded-card p-3 space-y-2.5">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">Atajos · calendario fiscal RD</div>
              <div className="flex flex-wrap gap-1">
                {ATAJOS_FISCALES.map((a, i) => (
                  <button key={i} onClick={() => setForm({ ...FORM_VACIO, ...a, responsableId: form.responsableId, supervisorId: form.supervisorId })}
                    className="text-[10px] font-bold px-2 py-1 rounded-card border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-amber-600">
                    {a.titulo}
                  </button>
                ))}
              </div>
            </div>
            <Campo label="Título"><Input value={form.titulo} onChange={v => setForm({ ...form, titulo: v })} /></Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Frecuencia">
                <select value={form.frecuencia} onChange={e => setForm({ ...form, frecuencia: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-amber-600 outline-none px-3 py-3 text-white">
                  <option value="mensual">Mensual</option><option value="quincenal">Quincenal (2 días/mes)</option><option value="semanal">Semanal</option>
                </select>
              </Campo>
              {form.frecuencia === 'semanal' ? (
                <Campo label="Día de la semana">
                  <select value={form.diaSemana} onChange={e => setForm({ ...form, diaSemana: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-amber-600 outline-none px-3 py-3 text-white">
                    {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </Campo>
              ) : (
                <Campo label={form.frecuencia === 'quincenal' ? 'Días del mes' : 'Día del mes'}>
                  <div className="flex gap-1.5 items-center">
                    <Input type="number" value={form.diaMes} onChange={v => setForm({ ...form, diaMes: v })} />
                    {form.frecuencia === 'quincenal' && <><span className="text-zinc-500 text-xs">y</span><Input type="number" value={form.diaMes2} onChange={v => setForm({ ...form, diaMes2: v })} /></>}
                  </div>
                </Campo>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Responsable">
                <select value={form.responsableId} onChange={e => setForm({ ...form, responsableId: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-amber-600 outline-none px-3 py-3 text-white">
                  <option value="">Elegir…</option>
                  {asignables.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Supervisor (opcional)">
                <select value={form.supervisorId} onChange={e => setForm({ ...form, supervisorId: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-amber-600 outline-none px-3 py-3 text-white">
                  <option value="">Sin supervisor</option>
                  {asignables.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Campo>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Campo label="Prioridad">
                <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-amber-600 outline-none px-3 py-3 text-white">
                  <option value="alta">🔥 Alta</option><option value="normal">Normal</option><option value="baja">▽ Baja</option>
                </select>
              </Campo>
              <Campo label="Abrir días antes"><Input type="number" value={form.diasAviso} onChange={v => setForm({ ...form, diasAviso: v })} /></Campo>
              <Campo label="Espacio (opcional)">
                <select value={form.proyectoInternoId} onChange={e => setForm({ ...form, proyectoInternoId: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-amber-600 outline-none px-3 py-3 text-white">
                  <option value="">Ninguno</option>
                  {internos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
              </Campo>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setCreando(false); setForm(FORM_VACIO); }} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5 rounded-card">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !form.titulo.trim() || !form.responsableId} className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-1.5">
                {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar recurrente
              </button>
            </div>
          </div>
        )}

        {loading ? <div className="text-center py-6"><Loader2 className="w-5 h-5 text-amber-500 animate-spin mx-auto" /></div> : (
          <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
            {recurrentes.length === 0 && <div className="text-xs text-zinc-600 italic text-center py-4">Sin recurrentes todavía. Usa los atajos fiscales para arrancar. 👆</div>}
            {recurrentes.map(r => (
              <div key={r.id} className={`bg-zinc-950 border rounded-card px-3 py-2 flex items-center gap-2.5 ${r.activo ? 'border-zinc-800' : 'border-zinc-900 opacity-50'}`}>
                <button onClick={() => toggleActivo(r)} title={r.activo ? 'Pausar' : 'Reactivar'}
                  className={`shrink-0 w-8 h-5 rounded-full border relative transition-colors ${r.activo ? 'bg-amber-600 border-amber-600' : 'bg-zinc-800 border-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${r.activo ? 'left-4' : 'left-0.5'}`} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{r.prioridad === 'alta' ? '🔥 ' : ''}{r.titulo}</div>
                  <div className="text-[10px] text-zinc-500">{descFrecuencia(r)} · 👤 {r.responsableNombre || 'sin responsable'}{r.diasAviso ? ` · abre ${r.diasAviso}d antes` : ''}{r.ultimaGenerada ? ` · última: ${r.ultimaGenerada}` : ''}</div>
                </div>
                <button onClick={() => eliminar(r)} className="shrink-0 p-1.5 text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <button onClick={async () => { const g = await db.generarTareasRecurrentes().catch(e => { alert('Error: ' + e.message); return null; }); if (g) { alert(g.generadas ? `${g.generadas} tarea(s) abierta(s) ✓` : 'Nada que abrir todavía — todo al día.'); if (g.generadas) onGenerado?.(); } }}
          className="w-full text-[10px] font-bold uppercase py-2 rounded-card border border-zinc-800 text-zinc-500 hover:text-white flex items-center justify-center gap-1.5">
          <RefreshCw className="w-3 h-3" /> Abrir ahora las que tocan (también corre solo cada día)
        </button>
      </div>
    </div>
  );
}
