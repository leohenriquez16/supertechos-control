'use client';

import React, { useState, useMemo } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Trash2, UserCircle } from 'lucide-react';
import * as db from '../../../lib/db';
import { obtenerUbicacion, distanciaMetros, formatDistancia } from '../../../lib/geo';
import { formatFecha } from '../../../lib/helpers/formato';
import { diasDePausaEnRango, pausaActiva, checkinsDelProyecto } from '../../../lib/helpers/calculos';

export default function TabAsistencia({ usuario, proyecto, personal, checkins, esAdmin, onActualizarProyecto, onRecargar, onEliminarJornada, TabJornada }) {
  const [vistaRango, setVistaRango] = useState('mes'); // 'dia' | 'mes' | 'año'
  const [fechaRef, setFechaRef] = useState(new Date());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const hoyStr = new Date().toISOString().split('T')[0];
  const checkinsProyecto = React.useMemo(() => checkinsDelProyecto(proyecto, checkins), [checkins, proyecto.id]);
  const miCheckinHoy = checkinsProyecto.find(c => c.personaId === usuario.id && c.fecha === hoyStr);
  const personasDelProyecto = React.useMemo(() => {
    const ids = new Set([proyecto.supervisorId, proyecto.maestroId, ...(proyecto.ayudantesIds || [])].filter(Boolean));
    return personal.filter(p => ids.has(p.id));
  }, [proyecto, personal]);

  const pausaActiv = pausaActiva(proyecto);

  const hacerCheckin = async () => {
    if (miCheckinHoy) return;
    setCargando(true); setError('');
    try {
      // Intentar obtener ubicación
      let lat = null, lng = null, dist = null;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, enableHighAccuracy: true });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          if (proyecto.ubicacionLat && proyecto.ubicacionLng) {
            dist = distanciaMetros(lat, lng, proyecto.ubicacionLat, proyecto.ubicacionLng);
          }
        } catch (geoErr) { console.warn('Sin geolocalización:', geoErr); }
      }
      await db.crearCheckin({
        id: 'chk_' + Date.now() + Math.random().toString(36).slice(2, 6),
        proyectoId: proyecto.id,
        personaId: usuario.id,
        fecha: hoyStr,
        hora: new Date().toISOString(),
        ubicacionLat: lat,
        ubicacionLng: lng,
        ubicacionDistanciaM: dist,
      });
      // v8.9.14: auto-mover a 'en_ejecucion' si está en 'aprobado'
      if (proyecto.estado === 'aprobado') {
        try {
          await db.cambiarEstadoProyecto(proyecto.id, 'en_ejecucion', usuario, 'Auto: primer check-in registrado');
        } catch (e) { console.warn('No se pudo auto-cambiar estado:', e); }
      }
      await onRecargar();
    } catch (e) {
      setError(e.message || 'Error registrando check-in');
    }
    setCargando(false);
  };

  // === Cálculos del rango ===
  const rangos = React.useMemo(() => {
    const y = fechaRef.getFullYear();
    const m = fechaRef.getMonth();
    const d = fechaRef.getDate();
    if (vistaRango === 'dia') {
      const iso = fechaRef.toISOString().split('T')[0];
      return { desde: iso, hasta: iso, titulo: formatFecha(iso) };
    }
    if (vistaRango === 'mes') {
      const primero = new Date(y, m, 1).toISOString().split('T')[0];
      const ultimo = new Date(y, m + 1, 0).toISOString().split('T')[0];
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return { desde: primero, hasta: ultimo, titulo: `${meses[m]} ${y}` };
    }
    // año
    const primero = `${y}-01-01`;
    const ultimo = `${y}-12-31`;
    return { desde: primero, hasta: ultimo, titulo: `${y}` };
  }, [fechaRef, vistaRango]);

  const checkinsRango = checkinsProyecto.filter(c => c.fecha >= rangos.desde && c.fecha <= rangos.hasta);

  // Días únicos con check-in en rango
  const diasConTrabajo = new Set(checkinsRango.map(c => c.fecha));
  const pausasRango = (proyecto.pausas || []).map(p => ({
    id: p.id,
    desde: p.fechaInicio,
    hasta: p.fechaFin || hoyStr,
    motivo: p.motivo,
  })).filter(p => !(p.hasta < rangos.desde || p.desde > rangos.hasta));

  const esFechaPausa = (iso) => {
    return pausasRango.some(p => iso >= p.desde && iso <= p.hasta);
  };

  const diasTotalesRango = Math.round((new Date(rangos.hasta + 'T12:00:00') - new Date(rangos.desde + 'T12:00:00')) / (1000 * 60 * 60 * 24)) + 1;
  const diasPausa = diasDePausaEnRango(proyecto, rangos.desde, rangos.hasta);

  const cambiarFecha = (delta) => {
    const nueva = new Date(fechaRef);
    if (vistaRango === 'dia') nueva.setDate(nueva.getDate() + delta);
    else if (vistaRango === 'mes') nueva.setMonth(nueva.getMonth() + delta);
    else nueva.setFullYear(nueva.getFullYear() + delta);
    setFechaRef(nueva);
  };

  // === Render ===
  return (
    <div className="space-y-4">
      {/* Banner pausa activa */}
      {pausaActiv && (
        <div className="bg-yellow-900/20 border-2 border-yellow-700 p-3 flex items-start gap-2">
          <div className="text-yellow-400 text-xl">⏸️</div>
          <div className="flex-1">
            <div className="text-xs font-black uppercase text-yellow-300">Proyecto en pausa</div>
            <div className="text-xs text-yellow-200 mt-0.5">Desde <strong>{formatFecha(pausaActiv.fechaInicio)}</strong>{pausaActiv.motivo ? ` · ${pausaActiv.motivo}` : ''}</div>
          </div>
        </div>
      )}

      {/* Botón check-in del usuario actual */}
      {personasDelProyecto.some(p => p.id === usuario.id) && (
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-2">Mi asistencia de hoy</div>
          {miCheckinHoy ? (
            <div className="bg-green-900/20 border border-green-700 p-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div className="flex-1">
                <div className="font-bold text-green-300">Check-in registrado</div>
                <div className="text-[10px] text-zinc-400">
                  {new Date(miCheckinHoy.hora).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                  {miCheckinHoy.ubicacionDistanciaM != null && (
                    <span> · {miCheckinHoy.ubicacionDistanciaM < 200 ? '✓' : '⚠️'} {miCheckinHoy.ubicacionDistanciaM}m de la obra</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={hacerCheckin}
              disabled={cargando || !!pausaActiv}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2"
            >
              {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {cargando ? 'Registrando...' : pausaActiv ? 'Proyecto en pausa' : '📍 Check-in ahora'}
            </button>
          )}
          {error && <div className="mt-2 text-[10px] text-red-400">{error}</div>}
        </div>
      )}

      {/* v8.9.16: Jornada grupal embebida */}
      <div className="border-t-2 border-zinc-800 pt-4">
        <div className="text-[11px] tracking-widest uppercase text-zinc-500 font-bold mb-3">📋 Jornada grupal del día</div>
        <TabJornada
          usuario={usuario}
          proyecto={proyecto}
          personal={personal}
          onActualizarUbicacion={(lat, lng, dir) => onActualizarProyecto({ ...proyecto, ubicacionLat: lat, ubicacionLng: lng, ubicacionDireccion: dir })}
          onEliminarJornada={onEliminarJornada}
        />
      </div>

      {/* Selector de vista */}
      <div className="flex border-b border-zinc-800 mt-6">
        <div className="text-[10px] text-zinc-500 uppercase tracking-widest px-4 py-2 mr-2">Historial:</div>
        {['dia', 'mes', 'año'].map(v => (
          <button
            key={v}
            onClick={() => setVistaRango(v)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${vistaRango === v ? 'text-red-500 border-b-2 border-red-600' : 'text-zinc-500 hover:text-white'}`}
          >
            {v === 'dia' ? 'Día' : v === 'mes' ? 'Mes' : 'Año'}
          </button>
        ))}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-3">
        <button onClick={() => cambiarFecha(-1)} className="text-zinc-400 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
        <div className="text-lg font-black uppercase tracking-wide">{rangos.titulo}</div>
        <button onClick={() => cambiarFecha(1)} className="text-zinc-400 hover:text-white"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Días trabajados</div>
          <div className="text-xl font-black text-green-400">{diasConTrabajo.size}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Días pausa</div>
          <div className="text-xl font-black text-yellow-400">{diasPausa}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Check-ins</div>
          <div className="text-xl font-black text-blue-400">{checkinsRango.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase">Total días</div>
          <div className="text-xl font-black">{diasTotalesRango}</div>
        </div>
      </div>

      {/* Vista según rango */}
      {vistaRango === 'mes' && <CalendarioMes fechaRef={fechaRef} diasConTrabajo={diasConTrabajo} esFechaPausa={esFechaPausa} checkinsRango={checkinsRango} personal={personal} />}
      {vistaRango === 'dia' && <VistaDiaCheckins fecha={rangos.desde} checkinsDelDia={checkinsRango} personasDelProyecto={personasDelProyecto} personal={personal} esPausa={esFechaPausa(rangos.desde)} esAdmin={esAdmin} onRecargar={onRecargar} />}
      {vistaRango === 'año' && <VistaAño año={fechaRef.getFullYear()} diasConTrabajo={diasConTrabajo} esFechaPausa={esFechaPausa} />}

      {/* Leyenda */}
      <div className="text-[10px] text-zinc-500 flex flex-wrap gap-3 border-t border-zinc-800 pt-3">
        <span><span className="inline-block w-3 h-3 bg-green-500 align-middle mr-1" /> Trabajaron</span>
        <span><span className="inline-block w-3 h-3 bg-yellow-500 align-middle mr-1" /> Pausa</span>
        <span><span className="inline-block w-3 h-3 bg-zinc-700 align-middle mr-1" /> Sin actividad</span>
        <span><span className="inline-block w-3 h-3 border-2 border-red-500 align-middle mr-1" /> Hoy</span>
      </div>
    </div>
  );
}

function CalendarioMes({ fechaRef, diasConTrabajo, esFechaPausa, checkinsRango, personal }) {
  const y = fechaRef.getFullYear();
  const m = fechaRef.getMonth();
  const primero = new Date(y, m, 1);
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  const diaSemanaInicio = (primero.getDay() + 6) % 7; // Lun=0
  const hoyStr = new Date().toISOString().split('T')[0];
  const dias = [];
  for (let i = 0; i < diaSemanaInicio; i++) dias.push(null);
  for (let d = 1; d <= ultimoDia; d++) {
    const iso = `${y}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    dias.push({ num: d, iso });
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-zinc-500 uppercase font-bold py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((dia, i) => {
          if (!dia) return <div key={i} />;
          const trabajo = diasConTrabajo.has(dia.iso);
          const pausa = esFechaPausa(dia.iso);
          const esHoy = dia.iso === hoyStr;
          const checkinsDia = checkinsRango.filter(c => c.fecha === dia.iso);
          let bg = 'bg-zinc-800 text-zinc-600';
          if (pausa) bg = 'bg-yellow-900/40 text-yellow-200 border border-yellow-700';
          else if (trabajo) bg = 'bg-green-900/40 text-green-200 border border-green-700';
          return (
            <div
              key={i}
              className={`${bg} ${esHoy ? 'ring-2 ring-red-500' : ''} aspect-square p-1 text-center relative`}
              title={`${formatFecha(dia.iso)}${checkinsDia.length ? ` · ${checkinsDia.length} check-in` : ''}`}
            >
              <div className="text-xs font-bold">{dia.num}</div>
              {checkinsDia.length > 0 && (
                <div className="text-[8px] text-green-300">{checkinsDia.length}👤</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VistaDiaCheckins({ fecha, checkinsDelDia, personasDelProyecto, personal, esPausa, esAdmin, onRecargar }) {
  const eliminarCheckin = async (id) => {
    if (!confirm('¿Eliminar este check-in?')) return;
    try {
      await db.eliminarCheckin(id);
      await onRecargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2">
      {esPausa && (
        <div className="bg-yellow-900/20 border border-yellow-700 p-2 text-[10px] text-yellow-300">
          ⏸️ Este día está en pausa del proyecto
        </div>
      )}
      <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">
        {checkinsDelDia.length > 0 ? `${checkinsDelDia.length} persona${checkinsDelDia.length !== 1 ? 's' : ''} en obra` : 'Sin check-ins'}
      </div>
      {checkinsDelDia.length === 0 ? (
        <div className="text-xs text-zinc-500 py-4 text-center">Nadie registró asistencia este día.</div>
      ) : (
        checkinsDelDia.sort((a, b) => (a.hora || '').localeCompare(b.hora || '')).map(c => {
          const persona = personal.find(p => p.id === c.personaId);
          const hora = c.hora ? new Date(c.hora).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '—';
          return (
            <div key={c.id} className="bg-zinc-950 border border-zinc-800 p-2 flex items-center gap-2">
              {persona?.foto2x2 ? <img src={persona.foto2x2} alt="" className="w-8 h-8 object-cover border border-zinc-700" /> : <UserCircle className="w-8 h-8 text-zinc-500" />}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{persona?.nombre || c.personaId}</div>
                <div className="text-[10px] text-zinc-500">
                  🕐 {hora}
                  {c.ubicacionDistanciaM != null && (
                    <span className={c.ubicacionDistanciaM < 200 ? ' text-green-400' : ' text-yellow-400'}> · {c.ubicacionDistanciaM}m</span>
                  )}
                </div>
              </div>
              {esAdmin && (
                <button onClick={() => eliminarCheckin(c.id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              )}
            </div>
          );
        })
      )}
      {personasDelProyecto.filter(p => !checkinsDelDia.some(c => c.personaId === p.id)).map(p => (
        <div key={p.id} className="bg-zinc-950 border border-zinc-900 p-2 flex items-center gap-2 opacity-50">
          {p.foto2x2 ? <img src={p.foto2x2} alt="" className="w-8 h-8 object-cover border border-zinc-800 grayscale" /> : <UserCircle className="w-8 h-8 text-zinc-700" />}
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate line-through">{p.nombre}</div>
            <div className="text-[9px] text-zinc-600">Sin check-in</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VistaAño({ año, diasConTrabajo, esFechaPausa }) {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2">
      {meses.map((nom, m) => {
        const primero = new Date(año, m, 1);
        const ultimoDia = new Date(año, m + 1, 0).getDate();
        let trabajados = 0;
        let pausa = 0;
        for (let d = 1; d <= ultimoDia; d++) {
          const iso = `${año}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
          if (diasConTrabajo.has(iso)) trabajados++;
          else if (esFechaPausa(iso)) pausa++;
        }
        return (
          <div key={m} className="flex items-center gap-2">
            <div className="w-10 text-[10px] font-bold uppercase text-zinc-400">{nom}</div>
            <div className="flex-1 flex gap-0.5">
              {Array.from({ length: ultimoDia }).map((_, i) => {
                const d = i + 1;
                const iso = `${año}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                let bg = 'bg-zinc-800';
                if (esFechaPausa(iso)) bg = 'bg-yellow-600';
                else if (diasConTrabajo.has(iso)) bg = 'bg-green-500';
                return <div key={i} className={`${bg} flex-1 h-4`} title={iso} />;
              })}
            </div>
            <div className="text-[10px] text-zinc-500 w-12 text-right">{trabajados}d</div>
          </div>
        );
      })}
    </div>
  );
}
