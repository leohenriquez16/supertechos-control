'use client';

// v8.25.24: Pantalla "Citas" — Edwin agenda y confirma las citas de los
// levantamientos desde la oficina. Cola por confirmar / sin agendar / confirmadas.

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, RefreshCw, CalendarClock, CheckCircle2, AlertCircle } from 'lucide-react';
import { listarProyectosSurveys, listarTodosLosSitesSurvey, TIPO_CITA, ESCALERA, citaTextoHora, confirmarCitaSurvey } from '../../lib/surveys';
import EditorCita from './EditorCita';
import CitaRuta from './CitaRuta';

// Etapas donde aún tiene sentido agendar/confirmar (no cerradas/realizadas).
const ETAPAS_AGENDABLES = ['New', 'Contactado', 'Asignado', 'Agendado'];

function fmtFecha(s) { if (!s) return '—'; try { return new Date((s.length <= 10 ? s + 'T12:00:00' : s)).toLocaleDateString('es-DO', { weekday: 'short', day: '2-digit', month: 'short' }); } catch { return s; } }

function CitaCard({ l, onEditar, onConfirmarRapido }) {
  const t = TIPO_CITA[l.tipo_cita];
  const esc = ESCALERA[l.requiere_escalera];
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="font-bold text-sm truncate">{l.client_name || '(sin cliente)'}</div>
        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 flex-wrap mt-0.5">
          <span>{fmtFecha(l.fecha_visita_programada)}</span>
          {citaTextoHora(l) && <span className="text-white">· {citaTextoHora(l)}</span>}
          {t && <span style={{ color: t.color }}>· {t.icon} {t.short}</span>}
          {esc && l.requiere_escalera !== 'no' && <span style={{ color: esc.color }}>· 🪜 {l.requiere_escalera === 'larga' ? 'larga' : ''}</span>}
        </div>
        <div className="text-[10px] text-zinc-600 mt-0.5">{l.service_line || ''}{l.odoo_stage ? ` · ${l.odoo_stage}` : ''}{l.asignado_a_nombre ? ` · 👤 ${l.asignado_a_nombre}` : ''}</div>
        {l._coords && <CitaRuta lat={l._coords.lat} lng={l._coords.lng} />}
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        <button onClick={() => onEditar(l)} className="px-3 py-1.5 rounded-card bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black uppercase">Editar</button>
        {!l.cita_confirmada && l.fecha_visita_programada && <button onClick={() => onConfirmarRapido(l)} className="px-3 py-1.5 rounded-card border border-green-700 text-green-300 text-[11px] font-bold uppercase">Confirmar</button>}
      </div>
    </div>
  );
}

export default function VistaCitas({ usuario, onVolver, onRecargar }) {
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [levs, setLevs] = useState([]);
  const [editar, setEditar] = useState(null);

  const cargar = async ({ silent } = {}) => {
    if (silent) setRefrescando(true); else setLoading(true);
    try {
      const [sp, sites] = await Promise.all([listarProyectosSurveys(), listarTodosLosSitesSurvey()]);
      const dir = {}, coords = {};
      for (const s of sites) {
        if (!dir[s.project_id] && (s.address || s.name)) dir[s.project_id] = s.address || s.name;
        if (s.latitude != null && s.longitude != null && !coords[s.project_id]) coords[s.project_id] = { lat: Number(s.latitude), lng: Number(s.longitude) };
      }
      setLevs(sp.map(p => ({ ...p, _dir: dir[p.id] || '', _coords: coords[p.id] || null })));
    } catch (e) { console.warn('VistaCitas:', e?.message); }
    setLoading(false); setRefrescando(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);
  const refrescar = async () => { await Promise.all([cargar({ silent: true }), onRecargar?.()]); };

  const confirmarRapido = async (l) => {
    try { await confirmarCitaSurvey(l.id, usuario, true); await cargar({ silent: true }); } catch (e) { alert('No se pudo confirmar: ' + (e?.message || e)); }
  };

  const grupos = useMemo(() => {
    const agendables = levs.filter(l => ETAPAS_AGENDABLES.includes(l.odoo_stage || 'New') || l.fecha_visita_programada);
    const porConfirmar = agendables.filter(l => l.fecha_visita_programada && !l.cita_confirmada);
    const sinAgendar = agendables.filter(l => !l.fecha_visita_programada);
    const confirmadas = agendables.filter(l => l.fecha_visita_programada && l.cita_confirmada);
    const byFecha = (a, b) => (a.fecha_visita_programada || '').localeCompare(b.fecha_visita_programada || '');
    return {
      porConfirmar: porConfirmar.sort(byFecha),
      sinAgendar: sinAgendar.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || '')),
      confirmadas: confirmadas.sort(byFecha),
    };
  }, [levs]);

  if (loading) return <div className="flex items-center justify-center py-20 text-zinc-500 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Cargando citas…</div>;

  const Seccion = ({ icon: Icon, color, titulo, items, rapido }) => (
    <div>
      <div className="flex items-center gap-2 mb-2"><Icon className="w-4 h-4" style={{ color }} /><span className="text-[11px] tracking-widest uppercase font-bold" style={{ color }}>{titulo}</span><span className="text-[10px] text-zinc-500">({items.length})</span></div>
      {items.length === 0 ? <div className="text-xs text-zinc-600 mb-2">—</div> : <div className="space-y-2">{items.map(l => <CitaCard key={l.id} l={l} onEditar={setEditar} onConfirmarRapido={rapido ? confirmarRapido : () => {}} />)}</div>}
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {onVolver && <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight">📅 Citas</h1>
          <div className="text-xs text-zinc-500 mt-1">Agenda y confirma las citas de los levantamientos.</div>
        </div>
        <button onClick={refrescar} disabled={refrescando} className="flex-shrink-0 px-3 py-2 rounded-card text-xs font-bold uppercase flex items-center gap-1.5 border bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-blue-500 disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${refrescando ? 'animate-spin' : ''}`} /> {refrescando ? '…' : 'Refrescar'}
        </button>
      </div>

      <Seccion icon={AlertCircle} color="#f59e0b" titulo="Por confirmar" items={grupos.porConfirmar} rapido />
      <Seccion icon={CalendarClock} color="#a1a1aa" titulo="Sin agendar" items={grupos.sinAgendar} />
      <Seccion icon={CheckCircle2} color="#22c55e" titulo="Confirmadas" items={grupos.confirmadas} />

      {editar && <EditorCita levantamiento={editar} usuario={usuario} onCerrar={() => setEditar(null)} onGuardado={() => cargar({ silent: true })} />}
    </div>
  );
}
