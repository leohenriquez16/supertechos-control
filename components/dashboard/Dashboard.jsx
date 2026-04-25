'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, CircleDashed } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFechaCorta } from '../../lib/helpers/formato';
import { getM2Reporte, getPrecioVentaArea, getPrecioTotalM2Area } from '../../lib/helpers/calculos';
import ModalDetalleEnEjecucion from './ModalDetalleEnEjecucion';
import ModalDetallePersonalAhora from './ModalDetallePersonalAhora';
import ModalDetalleProduccion from './ModalDetalleProduccion';
import ModalDetalleAprobados from './ModalDetalleAprobados';

export default function Dashboard({ data, onVerProyecto, onNuevoProyecto, tareas, onCompletarTarea, jornadasHoy, onCambiarEstadoRapido }) {
  const hoy = new Date().toISOString().split('T')[0];
  const [periodo, setPeriodo] = useState('dia');
  const [fechaRef, setFechaRef] = useState(hoy);
  // v8.9.30: cargar jornadas directamente aquí (como VistaEquipoGlobal que sí funciona)
  const [jornadasLocal, setJornadasLocal] = useState(jornadasHoy || []);
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const proms = data.proyectos.map(p => db.obtenerJornadaHoy(p.id, hoy));
        const res = (await Promise.all(proms)).filter(Boolean);
        if (!cancelado) setJornadasLocal(res);
      } catch (e) { console.warn('Dashboard jornadas:', e); }
    })();
    return () => { cancelado = true; };
  }, [data.proyectos.length, hoy]);

  // Calcular rango [desde, hasta] según periodo y fecha de referencia
  const calcRango = (p, fref) => {
    const d = new Date(fref + 'T12:00:00');
    if (p === 'dia') return { desde: fref, hasta: fref };
    if (p === 'semana') {
      const dow = d.getDay() || 7;
      const lun = new Date(d); lun.setDate(d.getDate() - dow + 1);
      const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
      return { desde: lun.toISOString().split('T')[0], hasta: dom.toISOString().split('T')[0] };
    }
    if (p === 'quincena') {
      const day = d.getDate();
      if (day <= 15) return { desde: `${fref.slice(0, 8)}01`, hasta: `${fref.slice(0, 8)}15` };
      const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return { desde: `${fref.slice(0, 8)}16`, hasta: `${fref.slice(0, 7)}-${String(ult).padStart(2, '0')}` };
    }
    if (p === 'mes') {
      const ini = `${fref.slice(0, 7)}-01`;
      const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return { desde: ini, hasta: `${fref.slice(0, 7)}-${String(ult).padStart(2, '0')}` };
    }
    if (p === 'trimestre') {
      const mes = d.getMonth(); const qIni = Math.floor(mes / 3) * 3;
      const desde = new Date(d.getFullYear(), qIni, 1);
      const hasta = new Date(d.getFullYear(), qIni + 3, 0);
      return { desde: desde.toISOString().split('T')[0], hasta: hasta.toISOString().split('T')[0] };
    }
    if (p === 'anio') return { desde: `${fref.slice(0, 4)}-01-01`, hasta: `${fref.slice(0, 4)}-12-31` };
    return { desde: fref, hasta: fref };
  };

  const rango = calcRango(periodo, fechaRef);
  // Rango del periodo anterior (misma duración, antes)
  const rangoAnt = (() => {
    const dIni = new Date(rango.desde + 'T12:00:00');
    const dFin = new Date(rango.hasta + 'T12:00:00');
    const diasMs = (dFin - dIni) + 86400000;
    const ini = new Date(dIni.getTime() - diasMs);
    const fin = new Date(dIni.getTime() - 86400000);
    return { desde: ini.toISOString().split('T')[0], hasta: fin.toISOString().split('T')[0] };
  })();

  // Producción en un rango
  const prodEnRango = (desde, hasta) => {
    let total = 0;
    data.reportes.forEach(r => {
      if (r.fecha < desde || r.fecha > hasta) return;
      const proy = data.proyectos.find(p => p.id === r.proyectoId);
      if (!proy) return;
      // v8.9.27: resolver área y su sistema/precio
      const area = (proy.areas || []).find(a => a.id === r.areaId);
      const sistemaIdUsado = (area && area.sistemaId) || proy.sistema;
      const sistema = data.sistemas[sistemaIdUsado];
      if (!sistema) return;
      const m2 = getM2Reporte(r, sistema);
      const tarea = sistema.tareas.find(t => t.id === r.tareaId);
      if (tarea) total += m2 * getPrecioVentaArea(area, sistema) * (tarea.peso / 100);
    });
    return total;
  };

  // Costo de materiales en un rango
  const costoMatEnRango = (desde, hasta) => {
    let total = 0;
    data.envios.forEach(e => {
      if (e.fecha < desde || e.fecha > hasta) return;
      if (e.costoTotal) { total += e.costoTotal; return; }
      const proy = data.proyectos.find(p => p.id === e.proyectoId);
      if (!proy) return;
      const sistema = data.sistemas[proy.sistema];
      if (!sistema) return;
      const mat = sistema.materiales?.find(m => m.id === e.materialId);
      if (mat) total += e.cantidad * (mat.costo_unidad || 0);
    });
    return total;
  };

  const prodPeriodo = prodEnRango(rango.desde, rango.hasta);
  const prodAnt = prodEnRango(rangoAnt.desde, rangoAnt.hasta);
  const deltaProd = prodAnt > 0 ? ((prodPeriodo - prodAnt) / prodAnt) * 100 : null;
  const costoMatPeriodo = costoMatEnRango(rango.desde, rango.hasta);
  const margenPeriodo = prodPeriodo - costoMatPeriodo;

  // Aprobados en el rango (fecha de aprobación o fecha_inicio si no)
  const aprobadosPeriodo = data.proyectos.filter(p => {
    const f = p.fechaAprobacion || p.fecha_inicio;
    return f >= rango.desde && f <= rango.hasta;
  });
  const montoAprobadosPeriodo = aprobadosPeriodo.reduce((s, p) => {
    const sistemaDef = data.sistemas[p.sistema];
    // v8.9.27: sumar por área respetando precio custom y sistema por área
    // v8.9.33: incluir suplementos
    const aporte = (p.areas || []).reduce((acc, a) => {
      const sisArea = data.sistemas[a.sistemaId] || sistemaDef;
      if (!sisArea) return acc;
      return acc + (a.m2 || 0) * getPrecioTotalM2Area(a, sisArea, data.sistemas);
    }, 0);
    return s + aporte;
  }, 0);

  // Proyectos activos y personas en obra HOY — v8.9.29: reemplaza concepto anterior
  const proyectosEjecutando = data.proyectos.filter(p => p.estado === 'en_ejecucion');
  // Jornadas abiertas = check-in hecho, check-out aún no — v8.9.30: usar jornadasLocal (cargado directo aquí)
  const jornadasAbiertas = (jornadasLocal || []).filter(j => j && j.horaInicio && !j.horaFin);
  // Personal en obra AHORA = personas en jornadas abiertas
  const personalEnObraAhora = new Set();
  jornadasAbiertas.forEach(j => { (j.personasPresentesIds || []).forEach(id => personalEnObraAhora.add(id)); });
  // Detalle de personal por proyecto para el modal
  const personalPorProyecto = jornadasAbiertas
    .map(j => {
      const proy = data.proyectos.find(p => p.id === j.proyectoId);
      if (!proy) return null;
      const personas = (j.personasPresentesIds || [])
        .map(id => (data.personal || []).find(p => p.id === id))
        .filter(Boolean);
      return { proyecto: proy, personas, jornada: j };
    })
    .filter(Boolean)
    .filter(p => p.personas.length > 0)
    .sort((a, b) => b.personas.length - a.personas.length);

  const labelRango = () => {
    if (periodo === 'dia') return formatFechaCorta(rango.desde);
    if (periodo === 'anio') return rango.desde.slice(0, 4);
    return `${formatFechaCorta(rango.desde)} → ${formatFechaCorta(rango.hasta)}`;
  };

  const moverPeriodo = (direccion) => {
    const d = new Date(fechaRef + 'T12:00:00');
    if (periodo === 'dia') d.setDate(d.getDate() + direccion);
    else if (periodo === 'semana') d.setDate(d.getDate() + 7 * direccion);
    else if (periodo === 'quincena') d.setDate(d.getDate() + 15 * direccion);
    else if (periodo === 'mes') d.setMonth(d.getMonth() + direccion);
    else if (periodo === 'trimestre') d.setMonth(d.getMonth() + 3 * direccion);
    else if (periodo === 'anio') d.setFullYear(d.getFullYear() + direccion);
    setFechaRef(d.toISOString().split('T')[0]);
  };

  const tareasPendientes = (tareas || []).filter(t => !t.completada).slice(0, 5);

  // v8.9.21: Modales del dashboard (tarjetas interactivas)
  const [modalDetalle, setModalDetalle] = useState(null); // 'hoy' | 'produccion' | 'aprobados' | null

  // v8.9.14: Proyectos aprobados hace más de 7 días sin moverse a 'en_ejecucion'
  const proyectosAprobadosAtrasados = React.useMemo(() => {
    const ahora = new Date();
    return (data.proyectos || []).filter(p => {
      if (p.archivado) return false;
      if (p.estado !== 'aprobado') return false;
      // Calcular días desde creación o fecha_inicio (lo que sea menor)
      const fechaReferencia = p.fecha_inicio || p.createdAt;
      if (!fechaReferencia) return false;
      const fref = new Date(fechaReferencia);
      const dias = Math.floor((ahora - fref) / (1000 * 60 * 60 * 24));
      return dias > 7;
    }).map(p => {
      const fechaReferencia = p.fecha_inicio || p.createdAt;
      const fref = new Date(fechaReferencia);
      const dias = Math.floor((ahora - fref) / (1000 * 60 * 60 * 24));
      return { ...p, diasAtascado: dias };
    }).sort((a, b) => b.diasAtascado - a.diasAtascado);
  }, [data.proyectos]);

  return (
    <div className="space-y-6">
      {/* v8.9.14: Alerta de proyectos aprobados atascados */}
      {proyectosAprobadosAtrasados.length > 0 && (
        <div className="bg-yellow-900/20 border-2 border-yellow-700 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <div>
                <div className="text-sm font-black uppercase text-yellow-300">
                  {proyectosAprobadosAtrasados.length} proyecto{proyectosAprobadosAtrasados.length !== 1 ? 's' : ''} en Aprobado hace más de 7 días
                </div>
                <div className="text-[10px] text-yellow-200">¿Ya arrancaron? Muévelos a "En ejecución" o "Parado" según corresponda.</div>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {proyectosAprobadosAtrasados.slice(0, 5).map(p => (
              <button
                key={p.id}
                onClick={() => onVerProyecto(p)}
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-yellow-600 p-2 flex items-center justify-between text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">
                    {p.referenciaOdoo && <span className="text-zinc-500 mr-2">{p.referenciaOdoo}</span>}
                    {p.cliente || p.nombre}
                  </div>
                  <div className="text-[10px] text-zinc-500">{p.referenciaProyecto || ''}</div>
                </div>
                <div className="text-xs font-black text-yellow-400 whitespace-nowrap ml-2">
                  {p.diasAtascado} días
                </div>
              </button>
            ))}
            {proyectosAprobadosAtrasados.length > 5 && (
              <div className="text-[10px] text-zinc-500 text-center pt-1">
                + {proyectosAprobadosAtrasados.length - 5} más en el Kanban
              </div>
            )}
          </div>
        </div>
      )}
      {/* SELECTOR DE PERIODO */}
      <div className="bg-zinc-900 border border-zinc-800 p-3 space-y-2">
        <div className="flex flex-wrap gap-1">
          {[['dia','Día'],['semana','Semana'],['quincena','Quincena'],['mes','Mes'],['trimestre','Trim'],['anio','Año']].map(([v,t]) => (
            <button key={v} onClick={() => { setPeriodo(v); setFechaRef(hoy); }} className={`px-3 py-1.5 text-[10px] font-bold uppercase ${periodo === v ? 'bg-red-600 text-white' : 'bg-zinc-950 text-zinc-400 border border-zinc-800'}`}>{t}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => moverPeriodo(-1)} className="bg-zinc-950 border border-zinc-800 p-2 text-zinc-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex-1 text-center text-sm font-bold">{labelRango()}</div>
          <button onClick={() => moverPeriodo(1)} className="bg-zinc-950 border border-zinc-800 p-2 text-zinc-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setFechaRef(hoy)} className="bg-zinc-950 border border-zinc-800 px-3 py-2 text-[10px] font-bold uppercase text-zinc-400 hover:text-white">Hoy</button>
        </div>
      </div>

      {/* HERO: Métricas ejecutivas del periodo - v8.9.29: 4 tarjetas nuevas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button onClick={() => setModalDetalle('enEjecucion')} className="bg-gradient-to-br from-red-600 to-red-800 p-4 text-left hover:brightness-110 transition-all cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="text-[10px] tracking-widest uppercase text-red-200">En Ejecución</div>
            <ChevronRight className="w-3 h-3 text-red-200" />
          </div>
          <div className="text-3xl font-black mt-1">{proyectosEjecutando.length}</div>
          <div className="text-[10px] text-red-200">proyecto{proyectosEjecutando.length !== 1 ? 's' : ''} activo{proyectosEjecutando.length !== 1 ? 's' : ''}</div>
        </button>
        <button onClick={() => setModalDetalle('personalAhora')} className="bg-gradient-to-br from-blue-600 to-blue-800 p-4 text-left hover:brightness-110 transition-all cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="text-[10px] tracking-widest uppercase text-blue-200">Personal en Obra Ahora</div>
            <ChevronRight className="w-3 h-3 text-blue-200" />
          </div>
          <div className="text-3xl font-black mt-1">{personalEnObraAhora.size}</div>
          <div className="text-[10px] text-blue-200">persona{personalEnObraAhora.size !== 1 ? 's' : ''} · {personalPorProyecto.length} obra{personalPorProyecto.length !== 1 ? 's' : ''}</div>
        </button>
        <button onClick={() => setModalDetalle('produccion')} className="bg-zinc-900 border border-zinc-800 hover:border-green-600 p-4 text-left cursor-pointer transition-all">
          <div className="flex items-center justify-between">
            <div className="text-[10px] tracking-widest uppercase text-zinc-500">Producción</div>
            <ChevronRight className="w-3 h-3 text-zinc-600" />
          </div>
          <div className="text-2xl font-black text-green-400 mt-1">{formatRD(prodPeriodo)}</div>
          {deltaProd !== null && <div className={`text-[10px] ${deltaProd >= 0 ? 'text-green-500' : 'text-red-400'}`}>{deltaProd >= 0 ? '↑' : '↓'} {Math.abs(deltaProd).toFixed(0)}% vs anterior</div>}
          {deltaProd === null && <div className="text-[10px] text-zinc-600">{formatRD(prodAnt)} anterior</div>}
        </button>
        <button onClick={() => setModalDetalle('aprobados')} className="bg-zinc-900 border border-zinc-800 hover:border-cyan-600 p-4 text-left cursor-pointer transition-all">
          <div className="flex items-center justify-between">
            <div className="text-[10px] tracking-widest uppercase text-zinc-500">Aprobados</div>
            <ChevronRight className="w-3 h-3 text-zinc-600" />
          </div>
          <div className="text-2xl font-black text-cyan-400 mt-1">{formatRD(montoAprobadosPeriodo)}</div>
          <div className="text-[10px] text-zinc-600">{aprobadosPeriodo.length} proyecto{aprobadosPeriodo.length !== 1 ? 's' : ''}</div>
        </button>
      </div>

      {/* TAREAS PENDIENTES */}
      {tareasPendientes.length > 0 && (
        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Tareas pendientes</div>
          <div className="space-y-1">{tareasPendientes.map(t => {
            const proy = data.proyectos.find(p => p.id === t.proyectoId);
            return (
              <div key={t.id} className="bg-zinc-900 border-l-4 border-orange-500 p-2 flex items-center gap-2">
                <button onClick={() => onCompletarTarea(t.id)} className="text-zinc-500 hover:text-green-400"><CircleDashed className="w-4 h-4" /></button>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{t.titulo}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{proy?.cliente} · {t.asignadaANombre}</div>
                </div>
              </div>
            );
          })}</div>
        </div>
      )}

      {/* v8.9.21: Modales del dashboard */}
      {modalDetalle === 'enEjecucion' && <ModalDetalleEnEjecucion proyectos={proyectosEjecutando} data={data} jornadasHoy={jornadasLocal} onCerrar={() => setModalDetalle(null)} onVerProyecto={(p) => { setModalDetalle(null); onVerProyecto(p); }} />}
      {modalDetalle === 'personalAhora' && <ModalDetallePersonalAhora personalPorProyecto={personalPorProyecto} totalPersonas={personalEnObraAhora.size} onCerrar={() => setModalDetalle(null)} onVerProyecto={(p) => { setModalDetalle(null); onVerProyecto(p); }} />}
      {modalDetalle === 'produccion' && <ModalDetalleProduccion data={data} rango={rango} prodPeriodo={prodPeriodo} onCerrar={() => setModalDetalle(null)} onVerProyecto={(p) => { setModalDetalle(null); onVerProyecto(p); }} />}
      {modalDetalle === 'aprobados' && <ModalDetalleAprobados aprobadosPeriodo={aprobadosPeriodo} montoTotal={montoAprobadosPeriodo} onCerrar={() => setModalDetalle(null)} onVerProyecto={(p) => { setModalDetalle(null); onVerProyecto(p); }} />}
    </div>
  );
}
