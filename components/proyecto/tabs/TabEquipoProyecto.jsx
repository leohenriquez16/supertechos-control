'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, UserCircle } from 'lucide-react';
import * as db from '../../../lib/db';
import { formatRD, formatFechaCorta, formatNum } from '../../../lib/helpers/formato';
import { getM2Reporte } from '../../../lib/helpers/calculos';

// Helper local (también está en page.jsx)
const getPersona = (personal, id) => personal.find(p => p.id === id);

export default function TabEquipoProyecto({ proyecto, data, sistema }) {
  const [jornadas, setJornadas] = useState([]);
  const [costosDia, setCostosDia] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [js, cs] = await Promise.all([
          db.listarJornadasProyecto(proyecto.id),
          db.listarCostosDia(proyecto.id),
        ]);
        setJornadas(js);
        setCostosDia(cs);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [proyecto.id]);

  const supervisor = getPersona(data.personal, proyecto.supervisorId);
  const maestro = getPersona(data.personal, proyecto.maestroId);
  const ayudantes = (proyecto.ayudantesIds || []).map(id => getPersona(data.personal, id)).filter(Boolean);
  const miembros = [];
  if (supervisor) miembros.push({ persona: supervisor, rol: 'Supervisor' });
  if (maestro) miembros.push({ persona: maestro, rol: 'Maestro' });
  ayudantes.forEach(a => miembros.push({ persona: a, rol: 'Ayudante' }));

  const reportesProy = data.reportes.filter(r => r.proyectoId === proyecto.id);
  const m2Total = reportesProy.reduce((s, r) => s + getM2Reporte(r, sistema), 0);

  const calcMetricasPersona = (personaId) => {
    const diasTrabajados = new Set();
    jornadas.forEach(j => {
      if ((j.personasPresentesIds || []).includes(personaId)) diasTrabajados.add(j.fecha);
    });
    const costoDia = costosDia.find(c => c.personaId === personaId)?.costoDia || 0;
    const m2Persona = maestro?.id === personaId ? m2Total : 0; // solo maestro "produce" m²
    return { dias: diasTrabajados.size, costoDia, m2: m2Persona };
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-[10px] text-zinc-500 uppercase">Miembros</div><div className="text-xl font-black">{miembros.length}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Jornadas</div><div className="text-xl font-black">{jornadas.length}</div></div>
          <div><div className="text-[10px] text-zinc-500 uppercase">Modo pago</div><div className="text-xl font-black">{proyecto.modoPagoManoObra === 'm2' ? 'm²' : 'Día'}</div></div>
        </div>
      </div>
      <div className="space-y-2">
        {miembros.map(({ persona, rol }) => {
          const m = calcMetricasPersona(persona.id);
          return (
            <div key={persona.id} className="bg-zinc-900 border border-zinc-800 p-3 flex items-center gap-3">
              {persona.foto2x2 ? <img src={persona.foto2x2} className="w-10 h-10 object-cover border border-zinc-700" alt="" /> : <UserCircle className="w-10 h-10 text-zinc-500" />}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{persona.nombre}</div>
                <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider">{rol}</div>
                {persona.telefono && <div className="text-[10px] text-zinc-500">📞 {persona.telefono}</div>}
              </div>
              <div className="text-right text-[10px]">
                <div className="text-zinc-500 uppercase">Días</div><div className="font-bold text-sm">{m.dias}</div>
                {proyecto.modoPagoManoObra === 'dia' && m.costoDia > 0 && <><div className="text-green-400 mt-1">{formatRD(m.costoDia * m.dias)}</div></>}
                {proyecto.modoPagoManoObra === 'm2' && rol === 'Maestro' && <><div className="text-zinc-500 uppercase mt-1">m²</div><div className="font-bold">{formatNum(m.m2)}</div></>}
              </div>
            </div>
          );
        })}
      </div>
      {jornadas.length > 0 && (
        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Jornadas ({jornadas.length})</div>
          <div className="space-y-1">{jornadas.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10).map(j => (
            <div key={j.id} className="bg-zinc-900 border-l-2 border-red-600 p-2 text-xs flex justify-between items-center">
              <div><div className="font-bold">{formatFechaCorta(j.fecha)}</div><div className="text-[10px] text-zinc-500">{(j.personasPresentesIds || []).length} personas · {j.horaInicio}-{j.horaFin || '...'}{j.diaDoble && ' · DOBLE'}</div></div>
              {j.diaDoble && <div className="text-[9px] text-yellow-400 font-bold">×2</div>}
            </div>
          ))}</div>
        </div>
      )}

      {/* v8.9.26.1: Asignaciones programadas (del Gantt de Disponibilidad) */}
      {(() => {
        const asignacionesProyecto = (data.asignaciones || []).filter(a =>
          a.estado !== 'cancelada' && a.proyectoId === proyecto.id
        );
        if (asignacionesProyecto.length === 0) return null;
        return (
          <div>
            <div className="text-[11px] tracking-widest uppercase text-blue-400 font-bold mb-2">📅 Personal programado ({asignacionesProyecto.length})</div>
            <div className="space-y-1">{asignacionesProyecto.map(asig => {
              const persona = (data.personal || []).find(p => p.id === asig.personaId);
              const area = (proyecto.areas || []).find(a => a.id === asig.areaId);
              const rolIcon = asig.rol === 'maestro' ? '👷' : asig.rol === 'ayudante' ? '🔧' : '👁️';
              const estadoColor =
                asig.estado === 'en_curso' ? 'text-orange-400' :
                asig.estado === 'completada' ? 'text-green-400' :
                asig.estado === 'confirmada' ? 'text-cyan-400' :
                'text-blue-300';
              return (
                <div key={asig.id} className="bg-blue-900/10 border border-blue-800 border-l-2 border-l-blue-500 p-2 text-xs flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold flex items-center gap-1">
                      <span>{rolIcon}</span>
                      <span>{persona?.nombre || '?'}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {formatFechaCorta(asig.fechaDesde)} → {formatFechaCorta(asig.fechaHasta)}
                      {area && ` · ${area.nombre}`}
                      {!area && asig.areaId === null && ' · todo el proyecto'}
                      {' · '}<span className={estadoColor}>{asig.estado}</span>
                    </div>
                    {asig.notas && <div className="text-[9px] text-zinc-400 italic mt-1">{asig.notas}</div>}
                  </div>
                </div>
              );
            })}</div>
          </div>
        );
      })()}
    </div>
  );
}
