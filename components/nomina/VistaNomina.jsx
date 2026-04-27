'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, FileText, Loader2, Plus, Save, Trash2, X, Wallet } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFecha, formatFechaCorta, formatNum } from '../../lib/helpers/formato';
import { getM2Reporte } from '../../lib/helpers/calculos';
import Campo from '../common/Campo';
import Input from '../common/Input';

// Helpers locales (también están en page.jsx)
const tieneRol = (p, r) => p?.roles?.includes(r);
const getPersona = (personal, id) => personal.find(p => p.id === id);
const labelProyecto = (p) => {
  if (!p) return '';
  const ref = p.referenciaOdoo || '';
  const nombre = p.cliente || p.nombre || '';
  return ref ? `${ref} · ${nombre}` : nombre;
};

function imprimirReciboNomina(d, corte, data) {
  const proyecto = data.proyectos.find(p => p.id === d.proyectoId);
  const label = proyecto ? (proyecto.referenciaOdoo ? `${proyecto.referenciaOdoo} · ${proyecto.cliente}` : proyecto.cliente) : d.proyectoNombre || '';
  const persona = data.personal.find(p => p.id === d.personaId);
  const rol = persona?.roles?.includes('maestro') ? 'Maestro' : persona?.roles?.includes('supervisor') ? 'Supervisor' : 'Ayudante';
  const hoy = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmt = (n) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const formatFecha = (s) => {
    if (!s) return '';
    const d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Recibo ${d.personaNombre}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 0; font-size: 12px; }
  .letterhead { border-bottom: 3px solid #CC0000; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .logo { font-size: 22px; font-weight: 900; color: #CC0000; letter-spacing: -0.5px; }
  .logo-sub { font-size: 9px; color: #555; letter-spacing: 1px; text-transform: uppercase; }
  .company-data { font-size: 9px; color: #555; text-align: right; line-height: 1.4; }
  h1 { font-size: 16px; margin: 0 0 5px; }
  .meta { color: #555; font-size: 10px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td, th { padding: 6px 8px; text-align: left; border-bottom: 1px solid #ddd; font-size: 11px; }
  th { background: #f5f5f5; font-weight: bold; text-transform: uppercase; font-size: 10px; }
  .right { text-align: right; }
  .total-row { background: #000; color: #fff; font-weight: bold; font-size: 13px; }
  .total-row td { color: #fff; padding: 10px 8px; }
  .minus { color: #CC0000; }
  .signature { margin-top: 60px; border-top: 1px solid #000; padding-top: 8px; width: 250px; font-size: 10px; color: #555; }
  .footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #eee; font-size: 9px; color: #888; text-align: center; }
</style></head><body>
<div class="letterhead">
  <div>
    <div class="logo">SUPER TECHOS</div>
    <div class="logo-sub">Sistema de Impermeabilización</div>
  </div>
  <div class="company-data">
    C/ Arena #1, Mar Azul, Santo Domingo R.D.<br>
    Tel. 809-535-9293 · www.supertechos.com.do<br>
    RNC: 130-77433-1
  </div>
</div>
<h1>Recibo de Nómina</h1>
<div class="meta">
  Corte: ${formatFecha(corte.fechaInicio)} → ${formatFecha(corte.fechaFin)} · Impreso: ${hoy}
</div>
<table>
  <tr><th style="width: 30%;">Persona</th><td><b>${d.personaNombre}</b> <span style="color:#888">(${rol})</span></td></tr>
  <tr><th>Proyecto</th><td>${label}</td></tr>
  <tr><th>Modo de pago</th><td style="text-transform:capitalize;">${d.modoPago === 'dia' ? `Por día · ${d.diasTrabajados} días${d.diasDobles ? ` (${d.diasDobles} doble)` : ''}` : d.modoPago === 'm2' ? `Por m² · ${fmt(d.m2Producidos)} m²` : d.modoPago === 'm2_fijo' ? `m² fijo sistema · ${fmt(d.m2Producidos)} m²` : d.modoPago === 'tarea' ? `Por tarea · ${fmt(d.m2Producidos)} m²` : 'Ajuste'}</td></tr>
</table>
<table style="margin-top: 20px;">
  <tr><th style="width: 40%;">Concepto</th><th class="right">Monto RD$</th></tr>
  <tr><td>Pago base</td><td class="right">${fmt(d.montoBase)}</td></tr>
  ${d.montoDieta ? `<tr><td>Dieta</td><td class="right">${fmt(d.montoDieta)}</td></tr>` : ''}
  ${d.montoOtros ? `<tr><td>Otros conceptos</td><td class="right">${fmt(d.montoOtros)}</td></tr>` : ''}
  ${d.montoApoyo ? `<tr><td>Apoyo del proyecto${d.notaApoyo ? ' — ' + d.notaApoyo : ''}</td><td class="right">${fmt(d.montoApoyo)}</td></tr>` : ''}
  ${d.montoAdelantos ? `<tr><td>Adelantos / descuentos</td><td class="right minus">-${fmt(d.montoAdelantos)}</td></tr>` : ''}
  <tr class="total-row"><td>TOTAL A PAGAR</td><td class="right">RD$ ${fmt(d.montoTotal)}</td></tr>
</table>
<div class="signature">
  Firma · ${d.personaNombre}
</div>
<div class="footer">
  Generado por Super Techos ERP · ${hoy}
</div>
<script>window.onload = function(){ window.print(); }</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Bloqueador de popups activo. Permite popups para imprimir.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}


export default function VistaNomina({ usuario, data, onVolver }) {
  const [cortes, setCortes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [corteVisto, setCorteVisto] = useState(null);
  const [crearModal, setCrearModal] = useState(false);
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [borrandoCorteId, setBorrandoCorteId] = useState(null);

  const recargar = async () => {
    setLoading(true);
    try { setCortes(await db.listarCortes()); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, []);

  if (corteVisto) return <DetalleCorte corte={corteVisto} data={data} usuario={usuario} onVolver={() => { setCorteVisto(null); recargar(); }} />;

  const eliminarCorte = async (corteId) => {
    if (!confirm('¿Eliminar este corte de nómina? Se borrarán también todos los recibos asociados. Esta acción es irreversible.')) return;
    setBorrandoCorteId(corteId);
    try {
      await db.eliminarCorteNomina(corteId);
      await recargar();
    } catch (e) {
      alert('Error eliminando: ' + (e.message || e));
    } finally {
      setBorrandoCorteId(null);
    }
  };

  // Filtrar cortes
  const aniosDisponibles = [...new Set(cortes.map(c => new Date(c.fechaInicio).getFullYear()))].sort((a, b) => b - a);
  const cortesFiltrados = cortes.filter(c => {
    if (filtroAnio && new Date(c.fechaInicio).getFullYear() !== parseInt(filtroAnio)) return false;
    if (filtroBusqueda) {
      const q = filtroBusqueda.toLowerCase();
      const matchFecha = formatFechaCorta(c.fechaInicio).toLowerCase().includes(q) || formatFechaCorta(c.fechaFin).toLowerCase().includes(q);
      const matchNotas = (c.notas || '').toLowerCase().includes(q);
      if (!matchFecha && !matchNotas) return false;
    }
    return true;
  });

  // Totales
  const totalHistorico = cortes.reduce((s, c) => s + (c.totalMonto || 0), 0);
  const totalFiltrado = cortesFiltrados.reduce((s, c) => s + (c.totalMonto || 0), 0);

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black tracking-tight">Nómina</h1>
        <button onClick={() => setCrearModal(true)} className="bg-red-600 text-white font-black uppercase px-4 py-2 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Nuevo corte</button>
      </div>

      {/* Resumen histórico */}
      {cortes.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Cortes totales</div>
            <div className="text-xl font-black text-white mt-1">{cortes.length}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Total histórico</div>
            <div className="text-xl font-black text-green-400 mt-1">{formatRD(totalHistorico)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Años</div>
            <div className="text-xl font-black text-white mt-1">{aniosDisponibles.length}</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      {cortes.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-3 flex gap-2 items-center flex-wrap">
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Filtrar:</div>
          <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs text-white">
            <option value="">Todos los años</option>
            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="text" placeholder="Buscar fecha o nota..." value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs text-white flex-1 min-w-[150px]" />
          {(filtroAnio || filtroBusqueda) && <button onClick={() => { setFiltroAnio(''); setFiltroBusqueda(''); }} className="text-xs text-red-500">Limpiar</button>}
          {cortesFiltrados.length !== cortes.length && <div className="text-[10px] text-zinc-500 ml-auto">{cortesFiltrados.length} de {cortes.length} · {formatRD(totalFiltrado)}</div>}
        </div>
      )}

      {loading && <div className="text-center py-6"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && cortesFiltrados.length === 0 && cortes.length > 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin resultados con los filtros actuales.</div>}
      {!loading && cortes.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin cortes aún.</div>}

      <div className="space-y-2">{cortesFiltrados.map(c => (
        <div key={c.id} className="bg-zinc-900 border border-zinc-800 hover:border-red-600 flex">
          <button onClick={() => setCorteVisto(c)} className="flex-1 p-4 text-left">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-sm">{formatFechaCorta(c.fechaInicio)} → {formatFechaCorta(c.fechaFin)}</div>
                <div className="text-[10px] text-zinc-500 uppercase">{c.estado}{c.notas && ` · ${c.notas.substring(0, 40)}${c.notas.length > 40 ? '...' : ''}`}</div>
              </div>
              <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(c.totalMonto)}</div></div>
            </div>
          </button>
          {tieneRol(usuario, 'admin') && (
            <button
              onClick={() => eliminarCorte(c.id)}
              disabled={borrandoCorteId === c.id}
              className="px-3 text-zinc-500 hover:text-red-400 border-l border-zinc-800"
              title="Eliminar corte"
            >
              {borrandoCorteId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      ))}</div>
      {crearModal && <ModalCrearCorte ultimoCorte={cortes.filter(c => c.estado === 'cerrado' || c.estado === 'pagado')[0]} onCerrar={() => setCrearModal(false)} onCrear={async (c) => { await db.crearCorte(c); setCrearModal(false); recargar(); }} />}
    </div>
  );
}

function ModalCrearCorte({ onCerrar, onCrear, ultimoCorte }) {
  // v8.4: Quincenal (sábado sí, sábado no)
  // Por defecto: desde el domingo siguiente al último corte cerrado
  // hasta el sábado de 13 días después (14 días = quincena)
  const calcularRango = () => {
    const hoy = new Date();
    let inicio;
    if (ultimoCorte && ultimoCorte.fechaFin) {
      // Desde el día siguiente al último corte
      inicio = new Date(ultimoCorte.fechaFin);
      inicio.setDate(inicio.getDate() + 1);
    } else {
      // Si no hay corte anterior: desde hace 13 días
      inicio = new Date(hoy);
      inicio.setDate(hoy.getDate() - 13);
    }
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 13); // 14 días total
    return { fi: inicio.toISOString().split('T')[0], ff: fin.toISOString().split('T')[0] };
  };
  const rango = calcularRango();
  const [fi, setFi] = useState(rango.fi);
  const [ff, setFf] = useState(rango.ff);
  const [notas, setNotas] = useState('');

  // Calcular cuántos días tiene el rango para mostrar info
  const dias = (() => {
    try { return Math.round((new Date(ff) - new Date(fi)) / 86400000) + 1; }
    catch { return 0; }
  })();

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo corte de nómina</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <div className="text-[10px] text-zinc-500">
          {ultimoCorte ? `Último corte cerró el ${formatFechaCorta(ultimoCorte.fechaFin)}` : 'Primer corte registrado'}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Inicio"><Input type="date" value={fi} onChange={setFi} /></Campo>
          <Campo label="Fin"><Input type="date" value={ff} onChange={setFf} /></Campo>
        </div>
        <div className="text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 p-2">
          📅 {dias} días · {dias === 14 ? 'Quincena completa' : dias === 7 ? 'Semana' : 'Rango personalizado'}
        </div>
        <Campo label="Notas (opcional)"><Input value={notas} onChange={setNotas} /></Campo>
        <div className="flex gap-2 pt-1"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={() => onCrear({ id: 'c_' + Date.now(), fechaInicio: fi, fechaFin: ff, notas })} className="flex-1 bg-red-600 text-white text-xs font-black uppercase py-3"><Save className="w-3 h-3 inline mr-1" /> Crear</button></div>
      </div>
    </div>
  );
}

function DetalleCorte({ corte, data, usuario, onVolver }) {
  const [detalle, setDetalle] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jornadasCorte, setJornadasCorte] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [ajusteModal, setAjusteModal] = useState(null);
  const [vistaDetalle, setVistaDetalle] = useState('persona'); // persona | proyecto | recibos
  const [soloMaestros, setSoloMaestros] = useState(true); // v8.6: default solo maestros

  // v8.6: Detalle filtrado por modo "solo maestros"
  const detalleFiltrado = React.useMemo(() => {
    if (!soloMaestros) return detalle;
    return detalle.filter(r => {
      const persona = data.personal.find(p => p.id === r.personaId);
      return persona?.roles?.includes('maestro');
    });
  }, [detalle, soloMaestros, data.personal]);

  // Agrupaciones derivadas del detalle (recibos persona×proyecto)
  const resumenPersonas = React.useMemo(() => {
    const g = {};
    detalleFiltrado.forEach(r => {
      if (!g[r.personaId]) g[r.personaId] = { personaId: r.personaId, personaNombre: r.personaNombre, proyectos: [], total: 0, totalDias: 0, totalM2: 0 };
      g[r.personaId].proyectos.push(r);
      g[r.personaId].total += r.montoTotal;
      g[r.personaId].totalDias += r.diasTrabajados || 0;
      g[r.personaId].totalM2 += r.m2Producidos || 0;
    });
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [detalleFiltrado]);

  const resumenProyectos = React.useMemo(() => {
    const g = {};
    detalleFiltrado.forEach(r => {
      const key = r.proyectoId || 'sin';
      if (!g[key]) g[key] = { proyectoId: r.proyectoId, proyectoNombre: r.proyectoNombre, personas: [], total: 0 };
      g[key].personas.push(r);
      g[key].total += r.montoTotal;
    });
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [detalleFiltrado]);

  const cargar = async () => {
    setLoading(true);
    try {
      const [det, aj] = await Promise.all([db.obtenerDetalleCorte(corte.id), db.listarAjustes({ sinCorte: corte.estado === 'abierto' })]);
      setAjustes(aj.filter(a => a.fecha >= corte.fechaInicio && a.fecha <= corte.fechaFin));
      // Jornadas del periodo
      const todasJornadas = [];
      for (const p of data.proyectos) {
        try {
          const lista = await db.listarJornadasProyecto(p.id);
          lista.forEach(j => {
            if (j.fecha >= corte.fechaInicio && j.fecha <= corte.fechaFin) todasJornadas.push({ ...j, proyecto: p });
          });
        } catch (e) {}
      }
      setJornadasCorte(todasJornadas);
      // Si no hay detalle guardado, calcular preview
      if (det.length === 0 && corte.estado === 'abierto') {
        setDetalle(await calcularDetalle(todasJornadas, data, corte, aj));
      } else {
        setDetalle(det);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const calcularDetalle = async (jornadas, data, corte, ajustesLista) => {
    // Agrupamos por persona × proyecto
    const buckets = {}; // key: `${personaId}__${proyectoId}`
    const getK = (pid, proyId) => `${pid}__${proyId}`;
    const getBucket = (pid, proyId) => {
      const k = getK(pid, proyId);
      if (!buckets[k]) buckets[k] = { personaId: pid, proyectoId: proyId, dias: new Set(), diasDobles: new Set(), m2: 0 };
      return buckets[k];
    };
    // Días trabajados por jornada
    jornadas.forEach(j => {
      (j.personasPresentesIds || []).forEach(pid => {
        const b = getBucket(pid, j.proyectoId);
        b.dias.add(j.fecha);
        if (j.diaDoble) b.diasDobles.add(j.fecha);
      });
    });
    // m² del maestro en cada proyecto - respeta maestroAreaId si está asignado
    data.reportes.filter(r => r.fecha >= corte.fechaInicio && r.fecha <= corte.fechaFin).forEach(r => {
      const proy = data.proyectos.find(p => p.id === r.proyectoId);
      if (!proy) return;
      const sistema = data.sistemas[proy.sistema];
      if (!sistema) return;
      const m2 = getM2Reporte(r, sistema);
      // Determinar qué maestro cobra este reporte: el de su área o el principal del proyecto
      const area = (proy.areas || []).find(a => a.id === r.areaId);
      const maestroId = area?.maestroAreaId || proy.maestroId;
      if (!maestroId) return;
      const b = getBucket(maestroId, proy.id);
      b.m2 += m2;
      b.tareaReportes = b.tareaReportes || {};
      b.tareaReportes[r.tareaId] = (b.tareaReportes[r.tareaId] || 0) + m2;
    });

    // Cargar costos de día para los proyectos involucrados
    const proyectosInvolucrados = [...new Set(Object.values(buckets).map(b => b.proyectoId))];
    const costosDiaMap = {}; // { [proyId]: { [personaId]: costoDia } }
    for (const pid of proyectosInvolucrados) {
      try {
        const lista = await db.listarCostosDia(pid);
        costosDiaMap[pid] = {};
        lista.forEach(c => { costosDiaMap[pid][c.personaId] = c.costoDia; });
      } catch {}
    }

    // Generar una fila por bucket (recibo persona × proyecto)
    const filas = [];
    Object.values(buckets).forEach(b => {
      const p = data.personal.find(x => x.id === b.personaId);
      const proy = data.proyectos.find(x => x.id === b.proyectoId);
      if (!p || !proy) return;
      const diasN = b.dias.size;
      const dobles = b.diasDobles.size;
      const diasEfectivos = diasN + dobles; // doble cuenta como 2
      let montoBase = 0;

      if (proy.modoPagoManoObra === 'dia') {
        const costoDia = costosDiaMap[proy.id]?.[b.personaId] || 0;
        montoBase = diasEfectivos * costoDia;
      } else if (proy.modoPagoManoObra === 'm2_fijo') {
        // v8.6: Precio fijo por m² total ejecutado (sin distinguir tarea)
        const precioFijo = proy.precioM2FijoMaestro || 0;
        montoBase = b.m2 * precioFijo;
      } else if (proy.modoPagoManoObra === 'm2') {
        // Pago por m² según precio por tarea del proyecto (o 0 si no configurado)
        const precios = proy.preciosTareasM2 || {};
        if (b.tareaReportes) {
          Object.entries(b.tareaReportes).forEach(([tid, m2]) => {
            montoBase += m2 * (precios[tid] || 0);
          });
        }
      } else if (proy.modoPagoManoObra === 'tarea') {
        // v8.5: Pago al maestro por tarea - cada tarea tiene su precio al maestro
        const preciosMO = proy.preciosManoObraTareas || {};
        if (b.tareaReportes) {
          Object.entries(b.tareaReportes).forEach(([tid, m2]) => {
            montoBase += m2 * (preciosMO[tid] || 0);
          });
        }
      }

      filas.push({
        id: 'd_' + corte.id + '_' + b.personaId + '_' + b.proyectoId,
        corteId: corte.id, personaId: b.personaId, personaNombre: p.nombre,
        proyectoId: b.proyectoId, proyectoNombre: labelProyecto(proy),
        modoPago: proy.modoPagoManoObra || 'dia',
        diasTrabajados: diasN, diasDobles: dobles, m2Producidos: b.m2,
        montoBase, montoDieta: 0, montoAdelantos: 0, montoOtros: 0,
        montoApoyo: 0, // v8.5: ajuste manual admin
        notaApoyo: '', // v8.5: motivo del ajuste
        montoTotal: montoBase,
      });
    });

    // Ajustes a nivel persona — los sumamos al bucket con más días de esa persona
    const personasConAjuste = [...new Set(ajustesLista.map(a => a.personaId))];
    personasConAjuste.forEach(pid => {
      const filasP = filas.filter(f => f.personaId === pid);
      if (filasP.length === 0) {
        // La persona tiene ajustes pero no trabajó en ningún proyecto — crear fila sin proyecto
        const p = data.personal.find(x => x.id === pid);
        if (!p) return;
        filas.push({
          id: 'd_' + corte.id + '_' + pid + '_ajuste',
          corteId: corte.id, personaId: pid, personaNombre: p.nombre,
          proyectoId: null, proyectoNombre: '(Ajustes)',
          modoPago: 'ajuste', diasTrabajados: 0, m2Producidos: 0,
          montoBase: 0, montoDieta: 0, montoAdelantos: 0, montoOtros: 0, montoTotal: 0,
        });
      }
    });
    // Distribuir ajustes a la fila con más días de cada persona
    ajustesLista.forEach(a => {
      const filasP = filas.filter(f => f.personaId === a.personaId);
      if (filasP.length === 0) return;
      const principal = filasP.sort((x, y) => y.diasTrabajados - x.diasTrabajados)[0];
      if (a.tipo === 'adelanto') principal.montoAdelantos += a.monto;
      else if (a.tipo === 'descuento') principal.montoOtros -= a.monto;
      else principal.montoOtros += a.monto; // bono, dieta_extra
    });
    // Recalcular montoTotal
    filas.forEach(f => { f.montoTotal = f.montoBase + f.montoOtros - f.montoAdelantos; });
    return filas;
  };

  const totalCorte = detalle.reduce((s, d) => s + (d.montoTotal || 0), 0);

  const guardarDetalle = async () => {
    await db.guardarDetalleCorte(detalle);
    alert('Detalle guardado');
  };
  const cerrar = async () => {
    if (!confirm('¿Cerrar el corte? Los ajustes del periodo quedarán asociados.')) return;
    await db.guardarDetalleCorte(detalle);
    await db.cerrarCorte(corte.id, usuario.id, totalCorte);
    alert('Corte cerrado');
    onVolver();
  };
  const marcarPagado = async () => {
    if (!confirm('¿Marcar como pagado?')) return;
    await db.marcarCortePagado(corte.id);
    alert('Marcado pagado');
    onVolver();
  };

  // v8.5: Reabrir corte cerrado o pagado
  const reabrirCorte = async () => {
    const msg = corte.estado === 'pagado'
      ? '⚠️ Este corte ya está PAGADO. Reabrirlo permitirá editarlo de nuevo, pero el registro de pago se perderá. ¿Confirmas?'
      : '¿Reabrir este corte? Volverá a ser editable y los adelantos del periodo se liberarán.';
    if (!confirm(msg)) return;
    if (corte.estado === 'pagado') {
      // Doble confirmación para pagados
      if (!confirm('Última confirmación: ¿DE VERDAD reabrir este corte pagado?')) return;
    }
    try {
      await db.reabrirCorte(corte.id);
      alert('Corte reabierto');
      onVolver();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  const crearAjuste = async (aj) => {
    await db.crearAjuste({ ...aj, id: 'a_' + Date.now(), creadoPorId: usuario.id });
    setAjusteModal(null);
    cargar();
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div>
        <div className="text-[10px] tracking-widest uppercase text-red-500 font-bold">Corte {corte.estado}</div>
        <h1 className="text-2xl font-black">{formatFechaCorta(corte.fechaInicio)} → {formatFechaCorta(corte.fechaFin)}</h1>
        <div className="text-3xl font-black text-green-400 mt-2">{formatRD(totalCorte)}</div>
      </div>

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 p-1">
        <button onClick={() => setVistaDetalle('persona')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'persona' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Persona</button>
        <button onClick={() => setVistaDetalle('proyecto')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'proyecto' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Proyecto</button>
        <button onClick={() => setVistaDetalle('recibos')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'recibos' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Recibos</button>
      </div>

      {/* v8.6: Toggle solo maestros */}
      <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2">
        <label className="flex items-center gap-2 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={soloMaestros}
            onChange={e => setSoloMaestros(e.target.checked)}
            className="w-4 h-4 accent-red-600"
          />
          <div className="text-xs">
            <span className="font-bold">Solo maestros</span>
            <span className="text-zinc-500 ml-2">({soloMaestros ? 'Ocultando supervisores y ayudantes' : 'Mostrando todos'})</span>
          </div>
        </label>
        <div className="text-[10px] text-zinc-500">
          {detalle.length - detalleFiltrado.length} ocultos
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">{vistaDetalle === 'persona' ? `Personal (${resumenPersonas.length})` : vistaDetalle === 'proyecto' ? `Proyectos (${resumenProyectos.length})` : `Recibos (${detalleFiltrado.length})`}</div>
          <button onClick={() => setAjusteModal({})} className="text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Ajuste</button>
        </div>

        {vistaDetalle === 'persona' && resumenPersonas.map(rp => (
          <div key={rp.personaId} className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="flex justify-between items-start">
              <div><div className="font-bold text-sm">{rp.personaNombre}</div><div className="text-[10px] text-zinc-500 uppercase">{rp.proyectos.length} proyecto{rp.proyectos.length !== 1 ? 's' : ''} · {rp.totalDias} días{rp.totalM2 > 0 ? ` · ${formatNum(rp.totalM2)} m²` : ''}</div></div>
              <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(rp.total)}</div></div>
            </div>
            <div className="mt-2 space-y-1">{rp.proyectos.map(r => (
              <div key={r.id} className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] flex justify-between items-center">
                <div className="flex-1 min-w-0"><div className="font-bold truncate">{r.proyectoNombre}</div><div className="text-zinc-500 uppercase">{r.modoPago === 'dia' ? `${r.diasTrabajados} días${r.diasDobles ? ` (${r.diasDobles} dobles)` : ''}` : r.modoPago === 'm2' ? `${formatNum(r.m2Producidos)} m²` : 'Ajuste'}</div></div>
                <div className="text-green-400 font-bold">{formatRD(r.montoTotal)}</div>
              </div>
            ))}</div>
          </div>
        ))}

        {vistaDetalle === 'proyecto' && resumenProyectos.map(rp => (
          <div key={rp.proyectoId || 'sin'} className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="flex justify-between items-start">
              <div><div className="font-bold text-sm">{rp.proyectoNombre}</div><div className="text-[10px] text-zinc-500 uppercase">{rp.personas.length} persona{rp.personas.length !== 1 ? 's' : ''}</div></div>
              <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(rp.total)}</div></div>
            </div>
            <div className="mt-2 space-y-1">{rp.personas.map(r => (
              <div key={r.id} className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] flex justify-between items-center">
                <div className="flex-1 min-w-0"><div className="font-bold truncate">{r.personaNombre}</div><div className="text-zinc-500 uppercase">{r.modoPago === 'dia' ? `${r.diasTrabajados} días` : r.modoPago === 'm2' ? `${formatNum(r.m2Producidos)} m²` : 'Ajuste'}</div></div>
                <div className="text-green-400 font-bold">{formatRD(r.montoTotal)}</div>
              </div>
            ))}</div>
          </div>
        ))}

        {vistaDetalle === 'recibos' && detalleFiltrado.map(d => (
          <div key={d.id} className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-sm">{d.personaNombre}</div>
                <div className="text-[10px] text-red-400 uppercase">{d.proyectoNombre}</div>
                <div className="text-[10px] text-zinc-500 uppercase">{d.modoPago === 'dia' ? `${d.diasTrabajados} días${d.diasDobles ? ` (${d.diasDobles} doble)` : ''}` : d.modoPago === 'm2' ? `${formatNum(d.m2Producidos)} m²` : 'Ajuste'}</div>
              </div>
              <div className="flex items-start gap-2">
                <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(d.montoTotal)}</div></div>
                <button
                  onClick={() => imprimirReciboNomina(d, corte, data)}
                  className="text-zinc-500 hover:text-white p-1"
                  title="Imprimir/descargar PDF"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
                {corte.estado === 'abierto' && tieneRol(usuario, 'admin') && (
                  <button
                    onClick={async () => {
                      if (!confirm(`¿Eliminar el recibo de ${d.personaNombre} en ${d.proyectoNombre}?`)) return;
                      try {
                        await db.eliminarReciboNomina(d.id);
                        await recargar();
                      } catch (e) {
                        alert('Error: ' + (e.message || e));
                      }
                    }}
                    className="text-zinc-500 hover:text-red-400 p-1"
                    title="Eliminar este recibo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px] mt-2">
              <div><div className="text-zinc-500 uppercase">Base</div><div className="font-bold">{formatRD(d.montoBase)}</div></div>
              <div><div className="text-zinc-500 uppercase">Otros</div><div className="font-bold">{formatRD(d.montoOtros)}</div></div>
              <div><div className="text-zinc-500 uppercase">Adelantos</div><div className="font-bold text-red-400">-{formatRD(d.montoAdelantos)}</div></div>
              <div><div className="text-zinc-500 uppercase">Total</div><div className="font-bold">{formatRD(d.montoTotal)}</div></div>
            </div>
            {/* v8.5: Apoyo al maestro - solo si es maestro y corte abierto */}
            {(() => {
              const persona = data.personal.find(p => p.id === d.personaId);
              const esMaestro = persona?.roles?.includes('maestro');
              if (!esMaestro) return null;
              if (corte.estado !== 'abierto' && !d.montoApoyo) return null;
              return (
                <div className="border-t border-zinc-800 mt-2 pt-2">
                  <div className="text-[10px] tracking-widest uppercase text-green-500 font-bold mb-1">💰 Apoyo del proyecto (quincena)</div>
                  {corte.estado === 'abierto' ? (
                    <div className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] text-zinc-500">RD$</span>
                        <input
                          type="number"
                          value={d.montoApoyo || ''}
                          onChange={e => {
                            const nuevoApoyo = parseFloat(e.target.value) || 0;
                            setDetalle(prev => prev.map(x => {
                              if (x.id !== d.id) return x;
                              const nuevoTotal = (x.montoBase || 0) + (x.montoDieta || 0) + (x.montoOtros || 0) + nuevoApoyo - (x.montoAdelantos || 0);
                              return { ...x, montoApoyo: nuevoApoyo, montoTotal: nuevoTotal };
                            }));
                          }}
                          placeholder="0"
                          className="flex-1 bg-zinc-950 border border-green-800 px-2 py-1 text-green-400 text-xs font-bold"
                        />
                      </div>
                      <input
                        type="text"
                        value={d.notaApoyo || ''}
                        onChange={e => {
                          const nueva = e.target.value;
                          setDetalle(prev => prev.map(x => x.id === d.id ? { ...x, notaApoyo: nueva } : x));
                        }}
                        placeholder="Motivo del apoyo (ej: lluvia, apoyo ayudantes)"
                        className="w-full bg-zinc-950 border border-zinc-800 px-2 py-1 text-zinc-300 text-[10px]"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="text-[10px] text-green-400 font-bold">+{formatRD(d.montoApoyo || 0)}</div>
                      {d.notaApoyo && <div className="text-[10px] text-zinc-500 italic">"{d.notaApoyo}"</div>}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      {ajustes.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Ajustes del periodo</div>
          <div className="space-y-1">{ajustes.map(a => { const p = data.personal.find(x => x.id === a.personaId); return (<div key={a.id} className="text-xs flex justify-between"><span>{p?.nombre} · <span className="text-zinc-500">{a.tipo}</span> · {a.concepto}</span><span className={a.tipo === 'adelanto' || a.tipo === 'descuento' ? 'text-red-400' : 'text-green-400'}>{(a.tipo === 'adelanto' || a.tipo === 'descuento') ? '-' : '+'}{formatRD(a.monto)}</span></div>); })}</div>
        </div>
      )}

      {corte.estado === 'abierto' && (
        <div className="flex gap-2">
          <button onClick={guardarDetalle} className="flex-1 bg-zinc-800 text-zinc-300 font-bold uppercase py-3 text-xs"><Save className="w-3 h-3 inline mr-1" /> Guardar</button>
          <button onClick={cerrar} className="flex-1 bg-red-600 text-white font-black uppercase py-3 text-xs">Cerrar corte</button>
        </div>
      )}
      {corte.estado === 'cerrado' && (
        <div className="flex gap-2">
          {tieneRol(usuario, 'admin') && (
            <button onClick={reabrirCorte} className="px-4 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-yellow-400 hover:border-yellow-500 font-bold uppercase py-3 text-xs flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Reabrir
            </button>
          )}
          <button onClick={marcarPagado} className="flex-1 bg-green-600 text-white font-black uppercase py-3 text-xs">Marcar pagado</button>
        </div>
      )}
      {corte.estado === 'pagado' && tieneRol(usuario, 'admin') && (
        <button onClick={reabrirCorte} className="w-full bg-zinc-900 border-2 border-yellow-700 text-yellow-400 hover:bg-yellow-900/20 font-bold uppercase py-3 text-xs flex items-center justify-center gap-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Reabrir corte pagado
        </button>
      )}

      {ajusteModal && <ModalAjuste personal={data.personal} onCerrar={() => setAjusteModal(null)} onCrear={crearAjuste} fechaMin={corte.fechaInicio} fechaMax={corte.fechaFin} />}
    </div>
  );
}

function ModalAjuste({ personal, onCerrar, onCrear, fechaMin, fechaMax }) {
  const [personaId, setPersonaId] = useState('');
  const [tipo, setTipo] = useState('adelanto');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const elegibles = personal.filter(p => tieneRol(p, 'maestro') || tieneRol(p, 'ayudante') || tieneRol(p, 'supervisor'));
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo ajuste</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <Campo label="Persona"><select value={personaId} onChange={e => setPersonaId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Seleccionar...</option>{elegibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo label="Tipo"><select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="adelanto">Adelanto</option><option value="bono">Bono</option><option value="descuento">Descuento</option><option value="dieta_extra">Dieta extra</option></select></Campo>
        <Campo label="Monto (RD$)"><Input type="number" value={monto} onChange={setMonto} /></Campo>
        <Campo label="Concepto"><Input value={concepto} onChange={setConcepto} placeholder="Descripción breve" /></Campo>
        <Campo label="Fecha"><Input type="date" value={fecha} onChange={setFecha} /></Campo>
        <div className="flex gap-2"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={() => personaId && monto && onCrear({ personaId, tipo, monto: parseFloat(monto), concepto, fecha })} disabled={!personaId || !monto} className="flex-1 bg-red-600 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3"><Save className="w-3 h-3 inline mr-1" /> Registrar</button></div>
      </div>
    </div>
  );
}

