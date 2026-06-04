'use client';

// v8.25.24: Editor de CITA de un levantamiento — fecha, tipo/modalidad, hora,
// escalera y confirmación. Lo usa Edwin (oficina) tanto en la pantalla "Citas"
// como en el detalle del levantamiento.

import React, { useState } from 'react';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { TIPO_CITA, ESCALERA, setCitaSurvey, confirmarCitaSurvey, setRequiereEscaleraSurvey } from '../../lib/surveys';

export default function EditorCita({ levantamiento: l, usuario, onCerrar, onGuardado }) {
  const [fecha, setFecha] = useState(l.fecha_visita_programada ? l.fecha_visita_programada.slice(0, 10) : '');
  const [tipo, setTipo] = useState(l.tipo_cita || '');
  const [hora, setHora] = useState(l.hora_visita || '');
  const [restriccion, setRestriccion] = useState(l.cita_restriccion || '');
  const [escalera, setEscalera] = useState(l.requiere_escalera || '');
  const [confirmada, setConfirmada] = useState(!!l.cita_confirmada);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const horaFinal = tipo === 'hora_fija' ? hora : '';
      const restFinal = tipo === 'restringida' ? restriccion : '';
      await setCitaSurvey(l.id, { fecha, hora: horaFinal, tipo, restriccion: restFinal });
      if ((escalera || '') !== (l.requiere_escalera || '')) await setRequiereEscaleraSurvey(l.id, escalera || null);
      if (!!confirmada !== !!l.cita_confirmada) await confirmarCitaSurvey(l.id, usuario, confirmada);
      await onGuardado?.({
        fecha_visita_programada: fecha || null,
        hora_visita: horaFinal || null,
        tipo_cita: tipo || null,
        cita_restriccion: restFinal || null,
        requiere_escalera: escalera || null,
        cita_confirmada: !!confirmada,
      });
      onCerrar?.();
    } catch (e) { alert('No se pudo guardar la cita: ' + (e?.message || e)); }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-blue-600 rounded-card max-w-md w-full p-5 space-y-4 my-8 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-blue-400 font-bold">📅 Cita</div>
            <h2 className="text-lg font-black leading-tight">{l.client_name || '(sin cliente)'}</h2>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Fecha */}
        <div>
          <label className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full mt-1 bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-blue-600 outline-none px-3 py-2.5 text-white" />
        </div>

        {/* Tipo de cita */}
        <div>
          <label className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Tipo de cita</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {Object.entries(TIPO_CITA).map(([k, t]) => (
              <button key={k} onClick={() => setTipo(k)} className="px-2 py-2 border-2 rounded-card text-left text-xs font-bold" style={tipo === k ? { backgroundColor: t.color + '22', borderColor: t.color, color: t.color } : { borderColor: '#3f3f46', color: '#a1a1aa' }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hora (solo hora fija) */}
        {tipo === 'hora_fija' && (
          <div>
            <label className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Hora</label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} className="w-full mt-1 bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-blue-600 outline-none px-3 py-2.5 text-white" />
          </div>
        )}

        {/* Restricción (solo restringida) */}
        {tipo === 'restringida' && (
          <div>
            <label className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Días/horas permitidos</label>
            <input value={restriccion} onChange={e => setRestriccion(e.target.value)} placeholder="Ej: solo lun y mié, 9–11 am" className="w-full mt-1 bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-blue-600 outline-none px-3 py-2.5 text-white placeholder-zinc-600" />
          </div>
        )}

        {/* Escalera */}
        <div>
          <label className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">🪜 Escalera</label>
          <div className="flex gap-2 mt-1">
            {Object.entries(ESCALERA).map(([k, e]) => (
              <button key={k} onClick={() => setEscalera(k)} className="flex-1 px-2 py-2 border-2 rounded-card text-xs font-bold" style={escalera === k ? { backgroundColor: e.color + '22', borderColor: e.color, color: e.color } : { borderColor: '#3f3f46', color: '#a1a1aa' }}>
                {e.short}
              </button>
            ))}
          </div>
        </div>

        {/* Confirmar */}
        <button onClick={() => setConfirmada(v => !v)} className={`w-full py-3 rounded-card font-black uppercase text-sm flex items-center justify-center gap-2 border-2 ${confirmada ? 'bg-green-600/20 border-green-600 text-green-300' : 'bg-zinc-950 border-zinc-700 text-zinc-300'}`}>
          <CheckCircle2 className="w-4 h-4" /> {confirmada ? 'Cita confirmada' : 'Marcar como confirmada'}
        </button>

        <div className="flex gap-2">
          <button onClick={onCerrar} className="flex-1 bg-zinc-800 text-zinc-300 font-bold uppercase py-3 text-sm rounded-card">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-black uppercase py-3 text-sm rounded-card flex items-center justify-center gap-2">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
