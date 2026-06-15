'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ChevronDown, FileText, Loader2, Plus, Save, Trash2, X, Wallet } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFecha, formatFechaCorta, formatNum } from '../../lib/helpers/formato';
import { getM2Reporte, calcAvanceProyecto } from '../../lib/helpers/calculos';
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

// v8.19.23: edición inline del "precio acordado". Solo el owner puede tocarlo.
//   - m²_fijo: actualiza proyecto.precioM2FijoMaestro.
//   - día:    upsert en costos_dia_proyecto por (proyectoId, personaId).
//   - m² / tarea / ajuste: no editable inline (precios viven por paso).
function PrecioEditable({ proyecto, personaId, fila, esOwner, onSaved }) {
  const [editing, setEditing] = React.useState(false);
  const [valor, setValor] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);

  // v8.26.7: el modo efectivo es el de la FILA (puede ser un override por persona),
  // y el precio m² fijo se edita POR PERSONA (override en costos_dia_proyecto) — para
  // obras con 2 maestros con sistemas/precios distintos.
  const modo = fila?.modoPago || proyecto?.modoPagoManoObra;
  let precioActual = 0;
  if (modo === 'm2_fijo') {
    // Mostrar el precio realmente aplicado (override de la persona o el del proyecto)
    precioActual = (fila?.m2Efectivo > 0) ? (fila.montoBase / fila.m2Efectivo) : Number(proyecto.precioM2FijoMaestro || 0);
  } else if (modo === 'dia') {
    const div = Math.max(1, (fila?.diasTrabajados || 0) + (fila?.diasDobles || 0));
    precioActual = (fila?.montoBase || 0) / div;
  }
  const unidad = modo === 'm2_fijo' ? '/m²' : modo === 'dia' ? '/día' : '';
  const editable = !!esOwner && (modo === 'm2_fijo' || modo === 'dia');

  const guardar = async () => {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0) { alert('Precio inválido'); return; }
    setGuardando(true);
    try {
      if (modo === 'm2_fijo') {
        // v8.26.7: override por PERSONA (no toca el precio general del proyecto).
        await db.guardarPagoPersonaProyecto(proyecto.id, personaId, { precioM2: n });
      } else if (modo === 'dia') {
        await db.guardarCostoDia(proyecto.id, personaId, n);
      }
      if (onSaved) await onSaved();
      setEditing(false);
    } catch (err) {
      alert('Error guardando precio: ' + (err.message || err));
    }
    setGuardando(false);
  };

  if (!editable) {
    if (modo === 'm2_fijo' || modo === 'dia') return <>{formatRD(precioActual)} <span className="text-zinc-500">{unidad}</span></>;
    if (modo === 'm2' || modo === 'tarea') return <span className="text-zinc-500 italic">por paso</span>;
    return <>—</>;
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 justify-end">
        <input
          type="number"
          step="0.01"
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardar(); else if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="bg-zinc-950 border-2 border-red-600 px-1.5 py-0.5 text-right w-20 text-xs tabular-nums text-white outline-none"
          disabled={guardando}
        />
        <span className="text-[9px] text-zinc-500">{unidad}</span>
        {guardando ? <Loader2 className="w-3 h-3 animate-spin text-zinc-400" /> : (
          <button onClick={guardar} className="text-[9px] text-green-400 hover:text-green-300" title="Guardar (Enter)">✓</button>
        )}
        <button onClick={() => setEditing(false)} className="text-[9px] text-zinc-500 hover:text-red-400" title="Cancelar (Esc)" disabled={guardando}>✗</button>
      </span>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setValor(String(precioActual)); setEditing(true); }}
      className="text-right group inline-flex items-center gap-1 hover:bg-zinc-800/60 px-1 py-0.5"
      title="Editar precio (solo owner)"
    >
      <span>{formatRD(precioActual)} <span className="text-zinc-500">{unidad}</span></span>
      <span className="text-[9px] text-red-400 opacity-30 group-hover:opacity-100">✎</span>
    </button>
  );
}

// v8.19.18: helpers visuales reusables para densificar la nómina.
const MODO_BADGE = {
  dia:     { label: 'Día',      cls: 'bg-emerald-900/40 border-emerald-700 text-emerald-300' },
  m2:      { label: 'm²',       cls: 'bg-sky-900/40 border-sky-700 text-sky-300' },
  m2_fijo: { label: 'm² fijo',  cls: 'bg-purple-900/40 border-purple-700 text-purple-300' },
  tarea:   { label: 'Tarea',    cls: 'bg-orange-900/40 border-orange-700 text-orange-300' },
  ajuste:  { label: 'Ajuste',   cls: 'bg-zinc-800 border-zinc-700 text-zinc-400' },
};
function ModoBadge({ modo }) {
  const m = MODO_BADGE[modo] || MODO_BADGE.ajuste;
  return <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${m.cls}`}>{m.label}</span>;
}
const ESTADO_BADGE = {
  abierto: 'bg-orange-900/40 border-orange-700 text-orange-300',
  cerrado: 'bg-yellow-900/40 border-yellow-700 text-yellow-300',
  pagado:  'bg-green-900/40 border-green-700 text-green-300',
};
function EstadoBadge({ estado }) {
  const cls = ESTADO_BADGE[estado] || 'bg-zinc-800 border-zinc-700 text-zinc-400';
  return <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${cls}`}>{estado}</span>;
}
function MiniBar({ value, max, color = 'bg-green-500/50' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="w-full h-1 bg-zinc-800 mt-1 overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: pct + '%' }} />
    </div>
  );
}
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1;

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

// Imprimir el CORTE COMPLETO agrupado según la vista activa (persona / proyecto / supervisor / recibos).
// Usa los resumenes ya calculados — no recalcula nada.
function imprimirCorteCompleto({ corte, vistaDetalle, resumenPersonas, resumenProyectos, resumenSupervisores, detalleFiltrado, totalCorte, soloMaestros, data }) {
  const fmt = (n) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const fmtNum = (n) => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 1 }).format(Number(n) || 0);
  const fmtFecha = (s) => {
    if (!s) return '';
    const d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const hoy = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });
  const tituloVista = {
    persona: 'Por Persona',
    proyecto: 'Por Proyecto',
    supervisor: 'Por Supervisor',
    recibos: 'Recibos',
  }[vistaDetalle] || 'Detalle';

  const desglosePago = (r) =>
    r.modoPago === 'dia' ? `${r.diasTrabajados} día${r.diasTrabajados !== 1 ? 's' : ''}${r.diasDobles ? ` (${r.diasDobles} dobles)` : ''}`
    : (r.modoPago === 'm2' || r.modoPago === 'm2_fijo' || r.modoPago === 'tarea') ? `${fmtNum(r.m2Producidos)} m²`
    : 'Ajuste';

  let cuerpo = '';

  if (vistaDetalle === 'persona') {
    cuerpo = resumenPersonas.map(rp => `
      <div class="grupo">
        <div class="grupo-head">
          <div><b>${rp.personaNombre}</b><span class="meta-sub">${rp.proyectos.length} proyecto${rp.proyectos.length !== 1 ? 's' : ''} · ${rp.totalDias} días${rp.totalM2 > 0 ? ` · ${fmtNum(rp.totalM2)} m²` : ''}</span></div>
          <div class="grupo-total">RD$ ${fmt(rp.total)}</div>
        </div>
        <table>
          <tr><th>Proyecto</th><th>Detalle</th><th class="right">Monto</th></tr>
          ${rp.proyectos.map(r => `<tr><td>${r.proyectoNombre || '—'}</td><td>${desglosePago(r)}</td><td class="right">RD$ ${fmt(r.montoTotal)}</td></tr>`).join('')}
        </table>
      </div>
    `).join('');
  } else if (vistaDetalle === 'proyecto') {
    cuerpo = resumenProyectos.map(rp => `
      <div class="grupo">
        <div class="grupo-head">
          <div><b>${rp.proyectoNombre || 'Sin proyecto'}</b><span class="meta-sub">${rp.personas.length} persona${rp.personas.length !== 1 ? 's' : ''}</span></div>
          <div class="grupo-total">RD$ ${fmt(rp.total)}</div>
        </div>
        <table>
          <tr><th>Persona</th><th>Detalle</th><th class="right">Monto</th></tr>
          ${rp.personas.map(r => `<tr><td>${r.personaNombre}</td><td>${desglosePago(r)}</td><td class="right">RD$ ${fmt(r.montoTotal)}</td></tr>`).join('')}
        </table>
      </div>
    `).join('');
  } else if (vistaDetalle === 'supervisor') {
    cuerpo = resumenSupervisores.map(rs => {
      // Reagrupar por proyecto dentro de cada supervisor
      const porProy = {};
      rs.recibos.forEach(r => {
        const k = r.proyectoId || 'sin';
        if (!porProy[k]) porProy[k] = { proyectoNombre: r.proyectoNombre || 'Sin proyecto', recibos: [], total: 0 };
        porProy[k].recibos.push(r);
        porProy[k].total += r.montoTotal;
      });
      const proys = Object.values(porProy).sort((a, b) => b.total - a.total);
      return `
        <div class="grupo">
          <div class="grupo-head">
            <div><b>👔 ${rs.supervisorNombre}</b><span class="meta-sub">${rs.proyectos.length} proyecto${rs.proyectos.length !== 1 ? 's' : ''} · ${rs.personas.length} persona${rs.personas.length !== 1 ? 's' : ''}</span></div>
            <div class="grupo-total">RD$ ${fmt(rs.total)}</div>
          </div>
          ${proys.map(pg => `
            <div class="subgrupo">
              <div class="subgrupo-head">
                <div>${pg.proyectoNombre}</div>
                <div>RD$ ${fmt(pg.total)}</div>
              </div>
              <table>
                <tr><th>Persona</th><th>Detalle</th><th class="right">Monto</th></tr>
                ${pg.recibos.map(r => `<tr><td>${r.personaNombre}</td><td>${desglosePago(r)}</td><td class="right">RD$ ${fmt(r.montoTotal)}</td></tr>`).join('')}
              </table>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  } else {
    // recibos: tabla plana
    cuerpo = `
      <table class="full">
        <tr><th>Persona</th><th>Proyecto</th><th>Detalle</th><th class="right">Monto</th></tr>
        ${detalleFiltrado.map(r => `<tr><td>${r.personaNombre}</td><td>${r.proyectoNombre || '—'}</td><td>${desglosePago(r)}</td><td class="right">RD$ ${fmt(r.montoTotal)}</td></tr>`).join('')}
      </table>
    `;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Corte ${fmtFecha(corte.fechaInicio)} → ${fmtFecha(corte.fechaFin)} · ${tituloVista}</title>
<style>
  @page { size: letter; margin: 0.45in; }
  body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 0; font-size: 11px; }
  .letterhead { border-bottom: 3px solid #CC0000; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
  .logo { font-size: 22px; font-weight: 900; color: #CC0000; letter-spacing: -0.5px; }
  .logo-sub { font-size: 9px; color: #555; letter-spacing: 1px; text-transform: uppercase; }
  .company-data { font-size: 9px; color: #555; text-align: right; line-height: 1.4; }
  h1 { font-size: 16px; margin: 0; }
  .corte-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 14px; border-bottom: 1px solid #ddd; margin-bottom: 16px; }
  .corte-meta { font-size: 11px; color: #555; }
  .corte-total { text-align: right; }
  .corte-total .label { font-size: 9px; text-transform: uppercase; color: #888; letter-spacing: 1px; }
  .corte-total .monto { font-size: 22px; font-weight: 900; color: #2a8a2a; }
  .filtros { font-size: 9px; color: #888; margin-top: 4px; }
  .grupo { margin-bottom: 16px; page-break-inside: avoid; }
  .grupo-head { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 8px; background: #f5f5f5; border-left: 4px solid #CC0000; }
  .grupo-head b { font-size: 13px; }
  .grupo-total { font-weight: 900; font-size: 14px; color: #2a8a2a; }
  .meta-sub { display: block; font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px; }
  .subgrupo { margin-top: 8px; margin-left: 12px; }
  .subgrupo-head { display: flex; justify-content: space-between; padding: 4px 6px; background: #fafafa; border-bottom: 1px solid #ddd; font-size: 10px; font-weight: bold; color: #555; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #eee; font-size: 10px; }
  th { background: #fafafa; font-weight: bold; text-transform: uppercase; font-size: 9px; color: #666; }
  .right { text-align: right; }
  .full { margin-top: 0; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #eee; font-size: 9px; color: #888; text-align: center; }
  .vista-badge { display: inline-block; padding: 2px 8px; background: #CC0000; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 4px; }
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
<div class="corte-header">
  <div>
    <div class="vista-badge">${tituloVista}</div>
    <h1>Corte de Nómina</h1>
    <div class="corte-meta">${fmtFecha(corte.fechaInicio)} → ${fmtFecha(corte.fechaFin)} · Estado: ${corte.estado}</div>
    <div class="filtros">${soloMaestros ? 'Filtro: solo maestros' : 'Mostrando todos'} · Impreso: ${hoy}</div>
  </div>
  <div class="corte-total">
    <div class="label">Total del corte</div>
    <div class="monto">RD$ ${fmt(totalCorte)}</div>
  </div>
</div>
${cuerpo}
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


export default function VistaNomina({ usuario, data, onVolver, onRecargarGlobal, onVerProyecto }) {
  const [cortes, setCortes] = useState([]);
  const [todosDetalles, setTodosDetalles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [corteVisto, setCorteVisto] = useState(null);
  const [initialExpandedId, setInitialExpandedId] = useState(null); // v8.19.30: pre-expandir una fila al entrar a DetalleCorte
  const abrirCorteConPersona = (corte, personaId) => {
    setInitialExpandedId(personaId ? 'p_' + personaId : null);
    setCorteVisto(corte);
  };
  const [crearModal, setCrearModal] = useState(false);
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [borrandoCorteId, setBorrandoCorteId] = useState(null);
  const [guardandoMiProd, setGuardandoMiProd] = useState(false);

  // v8.19.16: live totals por corte abierto (se acumula con cada día de avance,
  // sin esperar a "cerrar"). Recomputa cuando cambian los cortes o la data.
  const [liveTotals, setLiveTotals] = useState({}); // { [corteId]: number }
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveBreakdown, setLiveBreakdown] = useState({}); // { [corteId]: { porMaestro: [], porProyecto: [], proyectosSinCosto: [] } }
  const [historicoAbierto, setHistoricoAbierto] = useState(false);
  const [filtroRapido, setFiltroRapido] = useState('todo'); // 'corte' | 'mes' | 'ano' | 'todo'
  // v8.19.26: cuáles banners "sin costos" están expandidos para listar todos los proyectos.
  const [bannerCostosExpandido, setBannerCostosExpandido] = useState(new Set());

  const recargar = async () => {
    setLoading(true);
    try {
      const [ct, det] = await Promise.all([
        db.listarCortes(),
        db.listarTodosDetalles().catch(() => []),
      ]);
      setCortes(ct);
      setTodosDetalles(det);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { recargar(); }, []);

  // Calcula el live total de cada corte abierto:
  //   jornadas en rango + ajustes pendientes/del periodo → calcularDetalle → suma.
  useEffect(() => {
    const abiertos = cortes.filter(c => c.estado === 'abierto');
    if (abiertos.length === 0) { setLiveTotals({}); setLiveBreakdown({}); return; }
    let cancel = false;
    (async () => {
      setLiveLoading(true);
      const totals = {};
      const breakdown = {};
      for (const corte of abiertos) {
        try {
          const [jornadas, ajustes] = await Promise.all([
            db.listarJornadasEnRango(corte.fechaInicio, corte.fechaFin),
            db.listarAjustes({ sinCorte: true }).catch(() => []),
          ]);
          const ajustesPeriodo = (ajustes || []).filter(a => a.fecha >= corte.fechaInicio && a.fecha <= corte.fechaFin);
          const filas = await calcularDetalle(jornadas, data, corte, ajustesPeriodo);
          totals[corte.id] = filas.reduce((s, f) => s + (f.montoTotal || 0), 0);
          // Desglose
          const porMaestro = {};
          const porProyecto = {};
          const proyectosSinCosto = new Set();
          filas.forEach(f => {
            const pm = porMaestro[f.personaId] = porMaestro[f.personaId] || { id: f.personaId, nombre: f.personaNombre, monto: 0, dias: 0 };
            pm.monto += f.montoTotal || 0; pm.dias += f.diasTrabajados || 0;
            if (f.proyectoId) {
              const pp = porProyecto[f.proyectoId] = porProyecto[f.proyectoId] || { id: f.proyectoId, nombre: f.proyectoNombre, modo: f.modoPago, monto: 0, m2: 0, personas: new Set() };
              pp.monto += f.montoTotal || 0; pp.m2 += f.m2Producidos || 0; pp.personas.add(f.personaId);
              if (f.montoTotal === 0 && f.diasTrabajados > 0 && (f.modoPago === 'dia')) proyectosSinCosto.add(f.proyectoId);
            }
          });
          breakdown[corte.id] = {
            porMaestro: Object.values(porMaestro).sort((a, b) => b.monto - a.monto),
            porProyecto: Object.values(porProyecto).map(p => ({ ...p, personas: p.personas.size })).sort((a, b) => b.monto - a.monto),
            proyectosSinCosto: [...proyectosSinCosto].map(id => {
              const proy = data.proyectos.find(p => p.id === id);
              return { id, nombre: proy ? labelProyecto(proy) : id };
            }),
          };
        } catch (e) { console.warn('liveTotal:', corte.id, e?.message); totals[corte.id] = 0; breakdown[corte.id] = { porMaestro: [], porProyecto: [], proyectosSinCosto: [] }; }
      }
      if (!cancel) { setLiveTotals(totals); setLiveBreakdown(breakdown); setLiveLoading(false); }
    })();
    return () => { cancel = true; };
  }, [cortes, data.reportes, data.proyectos, data.personal]);

  // v8.19.16: el early return se movió DESPUÉS de todos los useMemo (más abajo,
  // justo antes del return JSX) para no violar las reglas de hooks de React.

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
    // v8.19.18: filtros rápidos
    if (filtroRapido === 'corte') return c.estado === 'abierto';
    if (filtroRapido === 'mes') {
      const hoy = new Date(); const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
      return c.fechaFin >= desde;
    }
    if (filtroRapido === 'ano') {
      return new Date(c.fechaInicio).getFullYear() === new Date().getFullYear();
    }
    return true;
  });

  // Totales
  const totalHistorico = cortes.reduce((s, c) => s + (c.totalMonto || 0), 0);
  const totalFiltrado = cortesFiltrados.reduce((s, c) => s + (c.totalMonto || 0), 0);

  // Dashboard global
  const ahora = new Date();
  const hace30dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const cortesUlt30 = cortes.filter(c => c.fechaFin >= hace30dias);
  const totalUlt30 = cortesUlt30.reduce((s, c) => s + (c.totalMonto || 0), 0);
  const cortesAbiertos = cortes.filter(c => c.estado === 'abierto');
  const cortesPorPagar = cortes.filter(c => c.estado === 'cerrado'); // cerrados pero no pagados aún

  // Top maestros y proyectos por monto histórico (de todosDetalles)
  const topMaestros = React.useMemo(() => {
    const m = {};
    todosDetalles.forEach(d => {
      if (!m[d.personaId]) m[d.personaId] = { personaId: d.personaId, nombre: d.personaNombre, total: 0, recibos: 0 };
      m[d.personaId].total += d.montoTotal || 0;
      m[d.personaId].recibos += 1;
    });
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [todosDetalles]);

  const topProyectos = React.useMemo(() => {
    const m = {};
    todosDetalles.forEach(d => {
      if (!d.proyectoId) return;
      const proy = data.proyectos.find(p => p.id === d.proyectoId);
      const nombre = proy ? labelProyecto(proy) : d.proyectoId;
      if (!m[d.proyectoId]) m[d.proyectoId] = { proyectoId: d.proyectoId, nombre, total: 0 };
      m[d.proyectoId].total += d.montoTotal || 0;
    });
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [todosDetalles, data.proyectos]);

  // Histórico por sistema: cruza detalle × proyecto.sistema. Si un proyecto tiene varias áreas con sistemas
  // distintos, sumamos al sistema PRINCIPAL (proyecto.sistema). Es aproximación útil — refinable después.
  const topSistemas = React.useMemo(() => {
    const m = {};
    todosDetalles.forEach(d => {
      if (!d.proyectoId) return;
      const proy = data.proyectos.find(p => p.id === d.proyectoId);
      if (!proy?.sistema) return;
      const sis = data.sistemas[proy.sistema];
      const nombre = sis?.nombre || proy.sistema;
      if (!m[proy.sistema]) m[proy.sistema] = { sistemaId: proy.sistema, nombre, total: 0, proyectos: new Set() };
      m[proy.sistema].total += d.montoTotal || 0;
      m[proy.sistema].proyectos.add(d.proyectoId);
    });
    return Object.values(m)
      .map(s => ({ ...s, proyectos: s.proyectos.size }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [todosDetalles, data.proyectos, data.sistemas]);

  // Hooks ya ejecutados → ahora sí podemos hacer el early return.
  if (corteVisto) return <DetalleCorte corte={corteVisto} data={data} usuario={usuario} initialExpandedId={initialExpandedId} onRecargarGlobal={onRecargarGlobal} onVerProyecto={onVerProyecto} onVolver={() => { setCorteVisto(null); setInitialExpandedId(null); recargar(); }} />;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-3xl font-black tracking-tight">Nómina</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* v8.19.19: toggle global "Mostrar Mi Producción" en dashboard */}
          {tieneRol(usuario, 'admin') && (
            <label className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2 cursor-pointer hover:border-red-600">
              <input
                type="checkbox"
                checked={!!data.config?.mostrarMiProduccionNomina}
                disabled={guardandoMiProd}
                onChange={async (e) => {
                  setGuardandoMiProd(true);
                  try {
                    await db.guardarConfig({
                      costos_indirectos_pct: data.config?.costos_indirectos_pct ?? 15,
                      margen_objetivo_pct: data.config?.margen_objetivo_pct ?? 30,
                      mostrarMiProduccionNomina: e.target.checked,
                    });
                    if (onRecargarGlobal) await onRecargarGlobal();
                  } catch (err) { alert('Error guardando toggle: ' + (err.message || err)); }
                  setGuardandoMiProd(false);
                }}
                className="accent-red-600"
              />
              <div className="text-[10px]">
                <div className="font-bold uppercase tracking-wider text-zinc-300">Mostrar "Mi Producción"</div>
                <div className="text-zinc-500">en dashboard de maestros y admins</div>
              </div>
              {guardandoMiProd && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
            </label>
          )}
          <button onClick={() => setCrearModal(true)} className="bg-red-600 text-white font-black uppercase px-4 py-2 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Nuevo corte</button>
        </div>
      </div>

      {/* v8.19.18: Hero "Corte en curso" — panel grande con desglose en vivo */}
      {cortesAbiertos.map(corte => {
        const bd = liveBreakdown[corte.id] || { porMaestro: [], porProyecto: [], proyectosSinCosto: [] };
        const total = liveTotals[corte.id] || 0;
        const maxMaestro = Math.max(1, ...bd.porMaestro.map(m => m.monto));
        const maxProyecto = Math.max(1, ...bd.porProyecto.map(p => p.monto));
        const dias = diasEntre(corte.fechaInicio, corte.fechaFin);
        const hoy = new Date().toISOString().split('T')[0];
        const diasTranscurridos = Math.min(dias, Math.max(0, diasEntre(corte.fechaInicio, hoy < corte.fechaFin ? hoy : corte.fechaFin)));
        const pctPeriodo = dias > 0 ? Math.round((diasTranscurridos / dias) * 100) : 0;
        return (
          <div key={corte.id} className="bg-zinc-900 border-l-4 border-orange-500 p-4 lg:p-5 space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] tracking-widest uppercase text-orange-300 font-bold flex items-center gap-1">● Corte en curso</div>
                <div className="font-black text-lg sm:text-xl text-white mt-0.5 truncate">
                  {formatFechaCorta(corte.fechaInicio)} → {formatFechaCorta(corte.fechaFin)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Día {diasTranscurridos} de {dias} · {pctPeriodo}% del periodo</div>
                <div className="w-full h-1 bg-zinc-800 mt-1 max-w-xs"><div className="h-full bg-orange-500/60" style={{ width: pctPeriodo + '%' }} /></div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] tracking-widest uppercase text-zinc-500">Acumulado</div>
                <div className="text-3xl sm:text-4xl font-black text-orange-400 leading-tight">{formatRD(total)}</div>
                <div className="text-[10px] text-zinc-500">{liveLoading ? 'calculando…' : 'live · suma según avances'}</div>
              </div>
            </div>
            {/* Banner accionable si hay proyectos sin costo (#8) */}
            {bd.proyectosSinCosto.length > 0 && (() => {
              const expandido = bannerCostosExpandido.has(corte.id);
              const lista = expandido ? bd.proyectosSinCosto : bd.proyectosSinCosto.slice(0, 3);
              const restantes = bd.proyectosSinCosto.length - lista.length;
              const toggle = () => {
                const next = new Set(bannerCostosExpandido);
                if (next.has(corte.id)) next.delete(corte.id); else next.add(corte.id);
                setBannerCostosExpandido(next);
              };
              return (
                <div className="bg-yellow-900/20 border border-yellow-700 px-3 py-2 text-[11px] text-yellow-300">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">⚠</div>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={toggle}
                        className="font-bold text-yellow-200 hover:text-white inline-flex items-center gap-1"
                        title={expandido ? 'Colapsar' : 'Ver todos'}
                      >
                        <ChevronDown className={`w-3 h-3 transition-transform ${expandido ? 'rotate-180' : ''}`} />
                        {bd.proyectosSinCosto.length} proyecto{bd.proyectosSinCosto.length !== 1 ? 's' : ''} sin costos por día configurados
                      </button>
                      <div className="text-zinc-400 mt-0.5">
                        Configura sus costos en el tab "Mano de Obra" del proyecto para que se sumen aquí.
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {lista.map(p => (
                          <button
                            key={p.id}
                            onClick={() => {
                              if (onVerProyecto) {
                                const proy = data.proyectos.find(x => x.id === p.id);
                                if (proy) onVerProyecto(proy, 'mdo');
                              }
                            }}
                            className="bg-zinc-900 border border-yellow-700/60 hover:border-yellow-400 hover:bg-zinc-800 px-2 py-1 text-[10px] text-yellow-100 flex items-center gap-1 group"
                            title={`Abrir "${p.nombre}" en Mano de Obra`}
                          >
                            <span className="truncate max-w-[280px]">{p.nombre}</span>
                            <span className="text-yellow-400 opacity-50 group-hover:opacity-100">→</span>
                          </button>
                        ))}
                        {!expandido && restantes > 0 && (
                          <button
                            onClick={toggle}
                            className="text-[10px] text-yellow-400 hover:text-yellow-200 px-2 py-1 underline"
                          >
                            + {restantes} más
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* Desglose: top maestros y proyectos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">🥇 Maestros del corte ({bd.porMaestro.length})</div>
                {bd.porMaestro.length === 0 ? <div className="text-[11px] text-zinc-600 italic">Sin asistencia aún en este corte.</div> :
                  <div className="space-y-1">{bd.porMaestro.slice(0, 6).map(m => (
                    <button
                      key={m.id}
                      onClick={() => abrirCorteConPersona(corte, m.id)}
                      className="w-full text-left bg-zinc-950 border border-zinc-800 rounded-card hover:border-orange-500/60 hover:bg-zinc-900 px-2 py-1.5 group"
                      title="Ver detalle del corte por este maestro"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="font-bold truncate flex-1 group-hover:underline underline-offset-2">{m.nombre}</div>
                        <div className="text-zinc-500 text-[10px] shrink-0 ml-2">{m.dias}d</div>
                        <div className="font-bold text-orange-300 ml-2 shrink-0">{formatRD(m.monto)}</div>
                        <span className="text-[9px] text-orange-400 opacity-30 group-hover:opacity-100 ml-1">→</span>
                      </div>
                      <MiniBar value={m.monto} max={maxMaestro} color="bg-orange-500/50" />
                    </button>
                  ))}</div>}
              </div>
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-1">🏗️ Proyectos del corte ({bd.porProyecto.length})</div>
                {bd.porProyecto.length === 0 ? <div className="text-[11px] text-zinc-600 italic">Sin actividad asignada.</div> :
                  <div className="space-y-1">{bd.porProyecto.slice(0, 6).map(p => {
                    const proy = data.proyectos.find(x => x.id === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => { if (proy && onVerProyecto) onVerProyecto(proy, 'mdo'); }}
                        disabled={!proy || !onVerProyecto}
                        className="w-full text-left bg-zinc-950 border border-zinc-800 rounded-card hover:border-orange-500/60 hover:bg-zinc-900 disabled:hover:border-zinc-800 disabled:hover:bg-zinc-950 px-2 py-1.5 group"
                        title={proy ? 'Abrir proyecto en tab Mano de Obra' : 'Proyecto no encontrado'}
                      >
                        <div className="flex items-center justify-between text-[11px] gap-2">
                          <div className="font-bold truncate flex-1 group-hover:underline underline-offset-2">{p.nombre}</div>
                          <ModoBadge modo={p.modo} />
                          <div className="text-zinc-500 text-[10px] shrink-0">{p.personas}p</div>
                          <div className="font-bold text-orange-300 shrink-0">{formatRD(p.monto)}</div>
                          <span className="text-[9px] text-orange-400 opacity-30 group-hover:opacity-100">→</span>
                        </div>
                        <MiniBar value={p.monto} max={maxProyecto} color="bg-orange-500/50" />
                      </button>
                    );
                  })}</div>}
              </div>
            </div>
          </div>
        );
      })}

      {/* v8.19.18: Histórico plegable — los KPIs y "tops" pasan a un acordeón */}
      {cortes.length > 0 && (
        <div className="border border-zinc-800">
          <button onClick={() => setHistoricoAbierto(!historicoAbierto)} className="w-full bg-zinc-900 hover:bg-zinc-800/60 px-3 py-2 flex items-center justify-between text-left">
            <div className="flex items-center gap-2">
              <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${historicoAbierto ? 'rotate-180' : ''}`} />
              <span className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Histórico</span>
              <span className="text-[10px] text-zinc-500">{cortes.length} corte{cortes.length !== 1 ? 's' : ''} · {formatRD(totalHistorico)} total</span>
            </div>
            <span className="text-[10px] text-zinc-500">{historicoAbierto ? 'ocultar' : 'ver detalles'}</span>
          </button>
          {historicoAbierto && (
            <div className="p-3 border-t border-zinc-800 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Total histórico</div>
            <div className="text-lg sm:text-xl font-black text-green-400 mt-1">{formatRD(totalHistorico)}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{cortes.length} corte{cortes.length !== 1 ? 's' : ''} · {aniosDisponibles.length} año{aniosDisponibles.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Últimos 30 días</div>
            <div className="text-lg sm:text-xl font-black text-white mt-1">{formatRD(totalUlt30)}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{cortesUlt30.length} corte{cortesUlt30.length !== 1 ? 's' : ''}</div>
          </div>
          <div className={`p-3 border ${cortesAbiertos.length > 0 ? 'bg-zinc-950 border-orange-700/40' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Abiertos</div>
            <div className={`text-lg sm:text-xl font-black mt-1 ${cortesAbiertos.length > 0 ? 'text-orange-400' : 'text-zinc-300'}`}>{cortesAbiertos.length}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{formatRD(cortesAbiertos.reduce((s, c) => s + (liveTotals[c.id] || 0), 0))} acumulado</div>
          </div>
          <div className={`p-3 border ${cortesPorPagar.length > 0 ? 'bg-zinc-950 border-yellow-700/40' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Por pagar</div>
            <div className={`text-lg sm:text-xl font-black mt-1 ${cortesPorPagar.length > 0 ? 'text-yellow-400' : 'text-zinc-300'}`}>{cortesPorPagar.length}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{formatRD(cortesPorPagar.reduce((s, c) => s + (c.totalMonto || 0), 0))}</div>
          </div>
        </div>
              {(topMaestros.length > 0 || topProyectos.length > 0 || topSistemas.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">🥇 Top maestros (histórico)</div>
            {topMaestros.length === 0 ? (
              <div className="text-xs text-zinc-500 py-2">Sin datos aún. Cierra cortes con `proyecto_id` para ver el ranking.</div>
            ) : (
              <div className="space-y-1">
                {topMaestros.map((m, i) => (
                  <div key={m.personaId} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-card p-2">
                    <div className="text-[10px] w-5 font-black text-zinc-500">#{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{m.nombre}</div>
                      <div className="text-[10px] text-zinc-500">{m.recibos} recibo{m.recibos !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="text-sm font-bold text-green-400 shrink-0">{formatRD(m.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">🏗️ Top proyectos (histórico)</div>
            {topProyectos.length === 0 ? (
              <div className="text-xs text-zinc-500 py-2">Sin datos aún. Los recibos viejos no tienen `proyecto_id`.</div>
            ) : (
              <div className="space-y-1">
                {topProyectos.map((p, i) => (
                  <div key={p.proyectoId} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-card p-2">
                    <div className="text-[10px] w-5 font-black text-zinc-500">#{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{p.nombre}</div>
                    </div>
                    <div className="text-sm font-bold text-green-400 shrink-0">{formatRD(p.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">⚙️ Top sistemas (histórico)</div>
            {topSistemas.length === 0 ? (
              <div className="text-xs text-zinc-500 py-2">Sin datos aún.</div>
            ) : (
              <div className="space-y-1">
                {topSistemas.map((s, i) => (
                  <div key={s.sistemaId} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-card p-2">
                    <div className="text-[10px] w-5 font-black text-zinc-500">#{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{s.nombre}</div>
                      <div className="text-[10px] text-zinc-500">{s.proyectos} proyecto{s.proyectos !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="text-sm font-bold text-green-400 shrink-0">{formatRD(s.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
            </div>
          )}
        </div>
      )}

      {/* v8.19.18: Filtros — pills rápidos + búsqueda + select año */}
      {cortes.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex gap-2 items-center flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {[
              { id: 'todo', label: 'Todo' },
              { id: 'corte', label: 'Corte actual' },
              { id: 'mes', label: 'Mes' },
              { id: 'ano', label: 'Año' },
            ].map(o => (
              <button
                key={o.id}
                onClick={() => setFiltroRapido(o.id)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${filtroRapido === o.id ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-zinc-800 mx-1" />
          <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-xs text-white">
            <option value="">Todos los años</option>
            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="text" placeholder="Buscar fecha o nota..." value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-xs text-white flex-1 min-w-[150px]" />
          {(filtroAnio || filtroBusqueda || filtroRapido !== 'todo') && <button onClick={() => { setFiltroAnio(''); setFiltroBusqueda(''); setFiltroRapido('todo'); }} className="text-xs text-red-500">Limpiar</button>}
          {cortesFiltrados.length !== cortes.length && <div className="text-[10px] text-zinc-500 ml-auto">{cortesFiltrados.length} de {cortes.length} · {formatRD(totalFiltrado)}</div>}
        </div>
      )}

      {loading && <div className="text-center py-6"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div>}
      {!loading && cortesFiltrados.length === 0 && cortes.length > 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin resultados con los filtros actuales.</div>}
      {!loading && cortes.length === 0 && <div className="text-center py-10 text-zinc-500 text-sm">Sin cortes aún.</div>}

      {/* v8.19.18: Cards en móvil */}
      <div className="space-y-2 md:hidden">{cortesFiltrados.map(c => {
        const isOpen = c.estado === 'abierto';
        const monto = isOpen ? (liveTotals[c.id] || 0) : (c.totalMonto || 0);
        const maxMonto = Math.max(1, ...cortesFiltrados.map(x => x.estado === 'abierto' ? (liveTotals[x.id] || 0) : (x.totalMonto || 0)));
        return (
          <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600 flex">
            <button onClick={() => setCorteVisto(c)} className="flex-1 p-4 text-left">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-sm">{formatFechaCorta(c.fechaInicio)} → {formatFechaCorta(c.fechaFin)}</div>
                  <div className="text-[10px] text-zinc-500 uppercase mt-0.5 flex items-center gap-1"><EstadoBadge estado={c.estado} /> · {diasEntre(c.fechaInicio, c.fechaFin)}d{c.notas && ` · ${c.notas.substring(0, 30)}${c.notas.length > 30 ? '…' : ''}`}</div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-black ${isOpen ? 'text-orange-400' : 'text-green-400'}`}>{formatRD(monto)}</div>
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{isOpen ? (liveLoading ? 'calculando…' : 'live · acumulando') : c.estado}</div>
                </div>
              </div>
              <MiniBar value={monto} max={maxMonto} color={isOpen ? 'bg-orange-500/50' : 'bg-green-500/50'} />
            </button>
            {tieneRol(usuario, 'admin') && (
              <button onClick={() => eliminarCorte(c.id)} disabled={borrandoCorteId === c.id} className="px-3 text-zinc-500 hover:text-red-400 border-l border-zinc-800" title="Eliminar corte">
                {borrandoCorteId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        );
      })}</div>

      {/* v8.19.18: Tabla en desktop (md+) */}
      <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-card">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 border-b border-zinc-800">
            <tr className="text-[10px] uppercase tracking-widest text-zinc-500">
              <th className="text-left px-3 py-2 font-bold">Periodo</th>
              <th className="text-left px-3 py-2 font-bold">Estado</th>
              <th className="text-right px-3 py-2 font-bold">Días</th>
              <th className="text-left px-3 py-2 font-bold">Notas</th>
              <th className="text-right px-3 py-2 font-bold">Monto</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const maxMonto = Math.max(1, ...cortesFiltrados.map(x => x.estado === 'abierto' ? (liveTotals[x.id] || 0) : (x.totalMonto || 0)));
              return cortesFiltrados.map(c => {
                const isOpen = c.estado === 'abierto';
                const monto = isOpen ? (liveTotals[c.id] || 0) : (c.totalMonto || 0);
                return (
                  <tr key={c.id} className="border-b border-zinc-800 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setCorteVisto(c)}>
                    <td className="px-3 py-2 font-bold whitespace-nowrap">{formatFechaCorta(c.fechaInicio)} → {formatFechaCorta(c.fechaFin)}</td>
                    <td className="px-3 py-2"><EstadoBadge estado={c.estado} /></td>
                    <td className="text-right px-3 py-2 text-zinc-400 tabular-nums">{diasEntre(c.fechaInicio, c.fechaFin)}</td>
                    <td className="px-3 py-2 text-[11px] text-zinc-400 truncate max-w-[200px]">{c.notas || '—'}</td>
                    <td className="text-right px-3 py-2 min-w-[140px]">
                      <div className={`font-black tabular-nums ${isOpen ? 'text-orange-400' : 'text-green-400'}`}>{formatRD(monto)}</div>
                      <div className="text-[9px] text-zinc-500 uppercase">{isOpen ? (liveLoading ? 'calculando…' : 'live') : c.estado}</div>
                      <MiniBar value={monto} max={maxMonto} color={isOpen ? 'bg-orange-500/60' : 'bg-green-500/60'} />
                    </td>
                    <td className="px-2">
                      {tieneRol(usuario, 'admin') && (
                        <button onClick={(e) => { e.stopPropagation(); eliminarCorte(c.id); }} disabled={borrandoCorteId === c.id} className="text-zinc-500 hover:text-red-400 p-1" title="Eliminar corte">
                          {borrandoCorteId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
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
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo corte de nómina</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <div className="text-[10px] text-zinc-500">
          {ultimoCorte ? `Último corte cerró el ${formatFechaCorta(ultimoCorte.fechaFin)}` : 'Primer corte registrado'}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Inicio"><Input type="date" value={fi} onChange={setFi} /></Campo>
          <Campo label="Fin"><Input type="date" value={ff} onChange={setFf} /></Campo>
        </div>
        <div className="text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-card p-2">
          📅 {dias} días · {dias === 14 ? 'Quincena completa' : dias === 7 ? 'Semana' : 'Rango personalizado'}
        </div>
        <Campo label="Notas (opcional)"><Input value={notas} onChange={setNotas} /></Campo>
        <div className="flex gap-2 pt-1"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={() => onCrear({ id: 'c_' + Date.now(), fechaInicio: fi, fechaFin: ff, notas })} className="flex-1 bg-red-600 text-white text-xs font-black uppercase py-3"><Save className="w-3 h-3 inline mr-1" /> Crear</button></div>
      </div>
    </div>
  );
}

// v8.19.17: muestra el sistema aplicado al proyecto y sus pasos con el precio
// que se le paga al maestro (según modo de pago). Da transparencia de cómo se
// arma el monto del recibo.
function SistemaPasosBreakdown({ rp, data }) {
  const [abierto, setAbierto] = useState(false);
  const proy = data.proyectos.find(p => p.id === rp.proyectoId);
  const sis = proy ? data.sistemas[proy.sistema] : null;
  if (!proy || !sis) return null;
  const tareas = sis.tareas || [];
  const modoPago = proy.modoPagoManoObra || 'dia';
  const precioMaestroParaTarea = (tareaId) => {
    if (modoPago === 'tarea') return Number(proy.preciosManoObraTareas?.[tareaId] || 0);
    if (modoPago === 'm2') return Number(proy.preciosTareasM2?.[tareaId] || 0);
    if (modoPago === 'm2_fijo') return Number(proy.precioM2FijoMaestro || 0);
    return 0;
  };
  const modoLabel = modoPago === 'dia' ? 'por día' : modoPago === 'm2' ? 'por m² (cliente)' : modoPago === 'm2_fijo' ? 'm² fijo del sistema' : modoPago === 'tarea' ? 'por paso (m² del maestro)' : modoPago;

  return (
    <div className="mt-3 border-t border-zinc-800 pt-2">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full text-left text-[10px] uppercase tracking-widest text-zinc-400 font-bold flex items-center gap-1 hover:text-white"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${abierto ? 'rotate-180' : ''}`} />
        Sistema: <span className="text-red-400 normal-case tracking-normal">{sis.nombre}</span>
        <span className="text-zinc-600">· {tareas.length} paso{tareas.length !== 1 ? 's' : ''}</span>
        <span className="text-zinc-600 ml-auto normal-case tracking-normal">{modoLabel}</span>
      </button>
      {abierto && (
        <div className="mt-2 space-y-1">
          {tareas.length === 0 ? (
            <div className="text-[10px] text-zinc-500 italic px-1">Este sistema no tiene pasos definidos.</div>
          ) : tareas.map((t, i) => {
            const precio = precioMaestroParaTarea(t.id);
            return (
              <div key={t.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-[10px] flex items-center gap-2">
                <div className="w-5 text-zinc-500 font-black">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{t.nombre || '—'}</div>
                  <div className="text-zinc-500">
                    {t.peso ? `${t.peso}% del sistema` : ''}
                    {t.reporta ? `${t.peso ? ' · ' : ''}reporta en ${t.reporta}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {precio > 0 ? (
                    <>
                      <div className="font-bold text-green-400">RD$ {formatNum(precio)}</div>
                      <div className="text-[8px] text-zinc-600 uppercase">/m² al maestro</div>
                    </>
                  ) : modoPago === 'dia' ? (
                    <div className="text-[9px] text-zinc-600">paga por día</div>
                  ) : (
                    <div className="text-[9px] text-zinc-600">sin precio</div>
                  )}
                </div>
              </div>
            );
          })}
          {modoPago === 'm2_fijo' && (
            <div className="text-[10px] text-zinc-500 italic px-1 pt-1">
              <b className="text-zinc-300">m² fijo:</b> al maestro se le paga RD$ {formatNum(proy.precioM2FijoMaestro || 0)}/m² sobre el total ejecutado, sin importar el paso.
            </div>
          )}
          {modoPago === 'dia' && (
            <div className="text-[10px] text-zinc-500 italic px-1 pt-1">
              <b className="text-zinc-300">Por día:</b> el pago se calcula por días trabajados, no por paso. La lista de pasos es de referencia.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// v8.19.16: calcularDetalle a nivel de módulo. Se llama tanto desde DetalleCorte
// (preview/persistencia al abrir/cerrar) como desde el dashboard (live total
// del corte abierto). Pura — todas sus deps vienen por parámetro o por import.
export async function calcularDetalle(jornadas, data, corte, ajustesLista) {
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
  (data.reportes || []).filter(r => r.fecha >= corte.fechaInicio && r.fecha <= corte.fechaFin).forEach(r => {
    const proy = data.proyectos.find(p => p.id === r.proyectoId);
    if (!proy) return;
    const area = (proy.areas || []).find(a => a.id === r.areaId);
    // v8.26.8: multi-sistema — el sistema correcto es el del ÁREA reportada
    // (puede ser distinto al principal del proyecto, p.ej. cementicio en obra de lona).
    const sistema = data.sistemas[area?.sistemaId || proy.sistema];
    if (!sistema) return;
    const m2 = getM2Reporte(r, sistema);
    // v8.26.9: prioridad de atribución del m²: maestro DE LA TAREA (dos maestros
    // repartiéndose tareas en la misma área, caso Ayac Mercedes) > maestro del
    // área > maestro principal del proyecto.
    const maestroId = (proy.maestrosTareas || {})[r.tareaId] || area?.maestroAreaId || proy.maestroId;
    if (!maestroId) return;
    const b = getBucket(maestroId, proy.id);
    b.m2 += m2;
    b.tareaReportes = b.tareaReportes || {};
    b.tareaReportes[r.tareaId] = (b.tareaReportes[r.tareaId] || 0) + m2;
  });

  // Costos de día para los proyectos involucrados — v8.26.5: en PARALELO
  // (antes era 1 query por proyecto en serie, parte de la lentitud al abrir).
  const proyectosInvolucrados = [...new Set(Object.values(buckets).map(b => b.proyectoId))];
  const costosDiaMap = {};
  await Promise.all(proyectosInvolucrados.map(async (pid) => {
    try {
      const lista = await db.listarCostosDia(pid);
      costosDiaMap[pid] = {};
      // v8.26.7: guarda el override completo por persona (costoDia + precioM2 + modoPago)
      lista.forEach(c => { costosDiaMap[pid][c.personaId] = { costoDia: c.costoDia, precioM2: c.precioM2, modoPago: c.modoPago }; });
    } catch {}
  }));

  // v8.27.2 FIX: si una persona trabaja en 2+ obras el MISMO día y cobra POR DÍA,
  // debe cobrar UN solo día (no uno por proyecto). Deduplicamos las fechas entre
  // los buckets pago-por-día de cada persona: el proyecto con más días se queda la
  // fecha en conflicto y los demás la sueltan. (m²/tarea pagan por producción, no
  // por día, así que no se tocan.)
  const modoDeBucket = (b) => {
    const proy = data.proyectos.find(x => x.id === b.proyectoId);
    const ov = costosDiaMap[b.proyectoId]?.[b.personaId] || {};
    return ov.modoPago || proy?.modoPagoManoObra;
  };
  const bucketsDiaPorPersona = {};
  Object.values(buckets).forEach(b => {
    if (modoDeBucket(b) !== 'dia') return;
    (bucketsDiaPorPersona[b.personaId] = bucketsDiaPorPersona[b.personaId] || []).push(b);
  });
  Object.values(bucketsDiaPorPersona).forEach(lista => {
    if (lista.length < 2) return; // solo aplica si está por día en 2+ obras
    lista.sort((a, b) => b.dias.size - a.dias.size); // el proyecto con más días conserva las fechas
    const reclamadas = new Set();
    lista.forEach(b => {
      [...b.dias].forEach(fecha => {
        if (reclamadas.has(fecha)) { b.dias.delete(fecha); b.diasDobles.delete(fecha); }
        else reclamadas.add(fecha);
      });
    });
  });

  const filas = [];
  Object.values(buckets).forEach(b => {
    const p = data.personal.find(x => x.id === b.personaId);
    const proy = data.proyectos.find(x => x.id === b.proyectoId);
    if (!p || !proy) return;
    const diasN = b.dias.size;
    const dobles = b.diasDobles.size;
    const diasEfectivos = diasN + dobles;
    // v8.26.7: override por PERSONA dentro del proyecto (2 maestros con sistemas/
    // precios distintos en la misma obra): modo y precio m² propios si existen.
    const ov = costosDiaMap[proy.id]?.[b.personaId] || {};
    const modoPersona = ov.modoPago || proy.modoPagoManoObra;
    const precioFijoPersona = (ov.precioM2 != null && ov.precioM2 > 0) ? ov.precioM2 : (proy.precioM2FijoMaestro || 0);
    let montoBase = 0;
    if (modoPersona === 'dia') {
      const costoDia = ov.costoDia || 0;
      montoBase = diasEfectivos * costoDia;
    } else if (modoPersona === 'm2_fijo') {
      // v8.19.20: el precio fijo cubre el SISTEMA COMPLETO. Si un avance solo
      // reportó parte de las tareas, el maestro cobra el peso% de cada tarea
      // sobre el precio. Antes era b.m2 × precio (doble cobro al reportar
      // varios pasos sobre la misma área).
      const precioFijo = precioFijoPersona;
      // v8.26.8: multi-sistema — los pesos se buscan en TODOS los sistemas que
      // usa el proyecto (principal + el de cada área). Antes solo se miraba el
      // sistema principal: las tareas de un segundo sistema tenían peso 0 y el
      // maestro cobraba RD$0 aunque el avance estuviera reportado.
      const sistemaIds = [...new Set([proy.sistema, ...(proy.areas || []).map(a => a.sistemaId).filter(Boolean)])];
      const pesoMap = {};
      const tareasConPeso = new Set(); // tareas cuyo sistema SÍ tiene pesos configurados
      sistemaIds.forEach(sid => {
        const sis = data.sistemas[sid];
        const tareasSis = sis?.tareas || [];
        const totalPesoSis = tareasSis.reduce((s, t) => s + (Number(t.peso) || 0), 0);
        tareasSis.forEach(t => {
          if (pesoMap[t.id] === undefined) pesoMap[t.id] = Number(t.peso) || 0;
          if (totalPesoSis > 0) tareasConPeso.add(t.id);
        });
      });
      if (Object.keys(pesoMap).length > 0 && b.tareaReportes) {
        montoBase = 0;
        Object.entries(b.tareaReportes).forEach(([tid, m2]) => {
          if (tareasConPeso.has(tid)) {
            montoBase += m2 * precioFijo * ((pesoMap[tid] || 0) / 100);
          } else if (pesoMap[tid] !== undefined) {
            // Tarea de un sistema sin pesos definidos → comportamiento anterior (sin ponderar).
            montoBase += m2 * precioFijo;
          }
          // Tarea desconocida (no está en ningún sistema del proyecto) → no paga, igual que antes.
        });
      } else {
        // Fallback: ningún sistema con tareas definidas → comportamiento anterior.
        montoBase = b.m2 * precioFijo;
      }
    } else if (modoPersona === 'm2') {
      const precios = proy.preciosTareasM2 || {};
      if (b.tareaReportes) {
        Object.entries(b.tareaReportes).forEach(([tid, m2]) => { montoBase += m2 * (precios[tid] || 0); });
      }
    } else if (modoPersona === 'tarea') {
      const preciosMO = proy.preciosManoObraTareas || {};
      if (b.tareaReportes) {
        Object.entries(b.tareaReportes).forEach(([tid, m2]) => { montoBase += m2 * (preciosMO[tid] || 0); });
      }
    }
    // v8.19.20: m² efectivos = el área "real" que se está pagando.
    //   Para m²_fijo es montoBase / precioFijo (porque ya viene ponderado por peso).
    //   Para otros modos cae a la suma cruda. m2Producidos se conserva como la
    //   suma total reportada (puede ser mayor por reportes en múltiples pasos
    //   sobre la misma área).
    let m2Efectivo = b.m2;
    if (modoPersona === 'm2_fijo' && precioFijoPersona > 0) {
      m2Efectivo = montoBase / precioFijoPersona;
    }
    filas.push({
      id: 'd_' + corte.id + '_' + b.personaId + '_' + b.proyectoId,
      corteId: corte.id, personaId: b.personaId, personaNombre: p.nombre,
      proyectoId: b.proyectoId, proyectoNombre: labelProyecto(proy),
      modoPago: modoPersona || 'dia',
      diasTrabajados: diasN, diasDobles: dobles,
      m2Producidos: b.m2, m2Efectivo,
      montoBase, montoDieta: 0, montoAdelantos: 0, montoOtros: 0,
      montoApoyo: 0, notaApoyo: '',
      montoTotal: montoBase,
    });
  });

  // v8.27.3 FIX: distribución de ajustes con fila dedicada y VISIBLE.
  // Antes, un ajuste sin proyecto (o de un proyecto que NO está en el ERP, p.ej. un
  // pago de reclamación) se absorbía dentro de la fila de la obra con más días, así
  // que "no se reflejaba" como línea propia. Ahora cada ajuste que no corresponde a
  // una obra trabajada por la persona cae en una fila sintética visible por persona:
  // "Reclamaciones" si viene de una reclamación, o "(Ajustes)" en general.
  const filaSintetica = (pid, nombre, sufijo, etiqueta) => {
    const f = {
      id: 'd_' + corte.id + '_' + pid + '_' + sufijo,
      corteId: corte.id, personaId: pid, personaNombre: nombre,
      proyectoId: null, proyectoNombre: etiqueta, esSintetica: true,
      modoPago: 'ajuste', diasTrabajados: 0, m2Producidos: 0,
      montoBase: 0, montoDieta: 0, montoAdelantos: 0, montoOtros: 0, montoTotal: 0,
    };
    filas.push(f);
    return f;
  };
  ajustesLista.forEach(a => {
    const p = data.personal.find(x => x.id === a.personaId);
    if (!p) return;
    // ¿El ajuste corresponde a una obra que la persona realmente trabajó este corte?
    const filaProyecto = a.proyectoId
      ? filas.find(f => !f.esSintetica && f.proyectoId === a.proyectoId)
      : null;
    let target;
    if (filaProyecto) {
      target = filaProyecto;
    } else {
      // Suelto (sin proyecto o de una obra fuera del ERP) → fila dedicada visible.
      const etiqueta = a.reclamacionId ? 'Reclamaciones' : '(Ajustes)';
      const sufijo = a.reclamacionId ? 'recl' : 'ajuste';
      target = filas.find(f => f.personaId === a.personaId && f.esSintetica && f.proyectoNombre === etiqueta)
        || filaSintetica(a.personaId, p.nombre, sufijo, etiqueta);
    }
    if (a.tipo === 'adelanto') target.montoAdelantos += a.monto;
    else if (a.tipo === 'descuento') target.montoOtros -= a.monto;
    else target.montoOtros += a.monto;
  });
  filas.forEach(f => { f.montoTotal = f.montoBase + f.montoOtros - f.montoAdelantos; });
  return filas;
}

function DetalleCorte({ corte, data, usuario, onVolver, onRecargarGlobal, onVerProyecto, initialExpandedId }) {
  const esOwner = tieneRol(usuario, 'owner');
  const [vistaInicialAplicada, setVistaInicialAplicada] = useState(false);
  const [detalle, setDetalle] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jornadasCorte, setJornadasCorte] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [ajusteModal, setAjusteModal] = useState(null);
  const [vistaDetalle, setVistaDetalle] = useState('persona'); // persona | proyecto | supervisor | recibos
  const [soloMaestros, setSoloMaestros] = useState(true); // v8.6: default solo maestros
  const [expandedId, setExpandedId] = useState(initialExpandedId || null); // v8.19.18: filas expandidas en tabla desktop
  // v8.19.30: si vino del hero con una persona específica, asegura la vista 'persona'
  useEffect(() => {
    if (initialExpandedId && !vistaInicialAplicada) {
      setVistaDetalle('persona');
      setExpandedId(initialExpandedId);
      setVistaInicialAplicada(true);
    }
  }, [initialExpandedId, vistaInicialAplicada]);

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
      if (!g[r.personaId]) g[r.personaId] = { personaId: r.personaId, personaNombre: r.personaNombre, proyectos: [], total: 0, totalDias: 0, totalM2: 0, totalM2Efectivo: 0 };
      g[r.personaId].proyectos.push(r);
      g[r.personaId].total += r.montoTotal;
      g[r.personaId].totalDias += r.diasTrabajados || 0;
      g[r.personaId].totalM2 += r.m2Producidos || 0;
      g[r.personaId].totalM2Efectivo += (typeof r.m2Efectivo === 'number' ? r.m2Efectivo : (r.m2Producidos || 0));
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

  // Agrupación por supervisor: cada recibo se imputa al supervisor del proyecto donde se generó.
  // Si el proyecto no tiene supervisor asignado, va a un grupo "(sin supervisor)".
  const resumenSupervisores = React.useMemo(() => {
    const g = {};
    detalleFiltrado.forEach(r => {
      const proy = data.proyectos.find(p => p.id === r.proyectoId);
      const supId = proy?.supervisorId || null;
      const supNombre = supId ? (data.personal.find(p => p.id === supId)?.nombre || '—') : '(Sin supervisor)';
      const key = supId || '__none__';
      if (!g[key]) g[key] = { supervisorId: supId, supervisorNombre: supNombre, recibos: [], proyectos: new Set(), personas: new Set(), total: 0 };
      g[key].recibos.push(r);
      g[key].total += r.montoTotal;
      if (r.proyectoId) g[key].proyectos.add(r.proyectoId);
      if (r.personaId) g[key].personas.add(r.personaId);
    });
    return Object.values(g)
      .map(s => ({ ...s, proyectos: Array.from(s.proyectos), personas: Array.from(s.personas) }))
      .sort((a, b) => b.total - a.total);
  }, [detalleFiltrado, data.proyectos, data.personal]);

  const cargar = async () => {
    setLoading(true);
    try {
      const [det, aj] = await Promise.all([db.obtenerDetalleCorte(corte.id), db.listarAjustes({ sinCorte: corte.estado === 'abierto' })]);
      setAjustes(aj.filter(a => a.fecha >= corte.fechaInicio && a.fecha <= corte.fechaFin));
      // v8.26.5: jornadas del periodo en UNA sola query por rango de fechas.
      // Antes: 1 query POR PROYECTO en serie (70+ requests) trayendo TODO el
      // histórico y filtrando en el cliente → la nómina tardaba 15-30s en abrir.
      const proyectosPorId = new Map((data.proyectos || []).map(p => [p.id, p]));
      const enRango = await db.listarJornadasEnRango(corte.fechaInicio, corte.fechaFin);
      const todasJornadas = enRango
        .map(j => ({ ...j, proyecto: proyectosPorId.get(j.proyectoId) }))
        .filter(j => j.proyecto); // solo proyectos visibles (no archivados)
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

  // v8.19.23: tras editar un precio, refresca data global + recomputa el corte.
  const recargarTodo = async () => {
    if (onRecargarGlobal) await onRecargarGlobal();
    await cargar();
  };

  // v8.19.16: `calcularDetalle` se movió a nivel de módulo (más abajo) para
  // que el dashboard también pueda computar el live total del corte abierto.

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
    <div className="space-y-5 pb-16">
      {/* v8.19.18: sticky bottom bar con el total y acciones — siempre visible al scrollear */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t-2 border-red-600 px-3 py-2 z-40 flex items-center gap-3 shadow-lg">
        <div className="flex-1 min-w-0">
          <div className="text-[9px] tracking-widest uppercase text-zinc-500">{formatFechaCorta(corte.fechaInicio)} → {formatFechaCorta(corte.fechaFin)} · {corte.estado}</div>
          <div className="text-lg sm:text-xl font-black text-green-400 tabular-nums">{formatRD(totalCorte)}</div>
        </div>
        <button
          onClick={() => imprimirCorteCompleto({ corte, vistaDetalle, resumenPersonas, resumenProyectos, resumenSupervisores, detalleFiltrado, totalCorte, soloMaestros, data })}
          className="hidden sm:flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:text-red-400"
        >
          <FileText className="w-3 h-3" /> Imprimir
        </button>
      </div>

      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] tracking-widest uppercase text-red-500 font-bold">Corte {corte.estado}</div>
          <h1 className="text-2xl font-black">{formatFechaCorta(corte.fechaInicio)} → {formatFechaCorta(corte.fechaFin)}</h1>
          <div className="text-3xl font-black text-green-400 mt-2">{formatRD(totalCorte)}</div>
        </div>
        <button
          onClick={() => imprimirCorteCompleto({
            corte, vistaDetalle, resumenPersonas, resumenProyectos, resumenSupervisores,
            detalleFiltrado, totalCorte, soloMaestros, data,
          })}
          className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 hover:text-red-400"
          title={`Imprimir corte completo (vista actual: ${vistaDetalle})`}
        >
          <FileText className="w-3 h-3" /> Imprimir corte
        </button>
      </div>

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1">
        <button onClick={() => setVistaDetalle('persona')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'persona' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Persona</button>
        <button onClick={() => setVistaDetalle('proyecto')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'proyecto' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Proyecto</button>
        <button onClick={() => setVistaDetalle('supervisor')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'supervisor' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Por Supervisor</button>
        <button onClick={() => setVistaDetalle('recibos')} className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase ${vistaDetalle === 'recibos' ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>Recibos</button>
      </div>

      {/* v8.6: Toggle solo maestros */}
      <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-card p-2">
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
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">{vistaDetalle === 'persona' ? `Personal (${resumenPersonas.length})` : vistaDetalle === 'proyecto' ? `Proyectos (${resumenProyectos.length})` : vistaDetalle === 'supervisor' ? `Supervisores (${resumenSupervisores.length})` : `Recibos (${detalleFiltrado.length})`}</div>
          <button onClick={() => setAjusteModal({})} className="text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Ajuste</button>
        </div>

        {/* v8.19.18: Por persona — card en móvil, tabla densa en desktop */}
        {vistaDetalle === 'persona' && (
          <>
            <div className="md:hidden space-y-2">
              {(() => {
                const maxPers = Math.max(1, ...resumenPersonas.map(r => r.total));
                return resumenPersonas.map(rp => (
                  <div key={rp.personaId} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                    <div className="flex justify-between items-start">
                      <div><div className="font-bold text-sm">{rp.personaNombre}</div><div className="text-[10px] text-zinc-500 uppercase">{rp.proyectos.length} proyecto{rp.proyectos.length !== 1 ? 's' : ''} · {rp.totalDias} días{rp.totalM2 > 0 ? ` · ${formatNum(rp.totalM2)} m²` : ''}</div></div>
                      <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(rp.total)}</div></div>
                    </div>
                    <MiniBar value={rp.total} max={maxPers} color="bg-green-500/50" />
                    <div className="mt-2 space-y-1">{rp.proyectos.map(r => (
                      <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] flex justify-between items-center gap-2">
                        <div className="flex-1 min-w-0"><div className="font-bold truncate">{r.proyectoNombre}</div><div className="text-zinc-500 uppercase flex items-center gap-1 mt-0.5"><ModoBadge modo={r.modoPago} /> {r.modoPago === 'dia' ? `${r.diasTrabajados}d${r.diasDobles ? ` (${r.diasDobles}×2)` : ''}` : r.modoPago === 'm2' || r.modoPago === 'm2_fijo' || r.modoPago === 'tarea' ? `${formatNum(r.m2Producidos)} m²` : 'Ajuste'}</div></div>
                        <div className="text-green-400 font-bold">{formatRD(r.montoTotal)}</div>
                      </div>
                    ))}</div>
                  </div>
                ));
              })()}
            </div>
            <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-card">
              <table className="w-full text-sm">
                <thead className="bg-zinc-950 border-b border-zinc-800">
                  <tr className="text-[10px] uppercase tracking-widest text-zinc-500">
                    <th className="w-6"></th>
                    <th className="text-left px-3 py-2 font-bold">Persona</th>
                    <th className="text-right px-3 py-2 font-bold">Proyectos</th>
                    <th className="text-right px-3 py-2 font-bold">Días</th>
                    <th className="text-right px-3 py-2 font-bold">m²</th>
                    <th className="text-right px-3 py-2 font-bold">Otros</th>
                    <th className="text-right px-3 py-2 font-bold">Adelantos</th>
                    <th className="text-right px-3 py-2 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maxPers = Math.max(1, ...resumenPersonas.map(r => r.total));
                    return resumenPersonas.map(rp => {
                      const isOpen = expandedId === 'p_' + rp.personaId;
                      const otros = rp.proyectos.reduce((s, x) => s + (x.montoOtros || 0), 0);
                      const adelantos = rp.proyectos.reduce((s, x) => s + (x.montoAdelantos || 0), 0);
                      return (
                        <React.Fragment key={rp.personaId}>
                          <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : 'p_' + rp.personaId)}>
                            <td className="px-2"><ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></td>
                            <td className="px-3 py-2 font-bold">{rp.personaNombre}</td>
                            <td className="text-right px-3 py-2 tabular-nums text-zinc-400">{rp.proyectos.length}</td>
                            <td className="text-right px-3 py-2 tabular-nums text-zinc-400">{rp.totalDias}</td>
                            <td className="text-right px-3 py-2 tabular-nums text-zinc-400">
                              {rp.totalM2Efectivo > 0 ? (
                                <>
                                  {formatNum(rp.totalM2Efectivo)}
                                  {Math.abs(rp.totalM2 - rp.totalM2Efectivo) > 1 && (
                                    <div className="text-[8px] text-zinc-600">Σ {formatNum(rp.totalM2)} reportados</div>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td className="text-right px-3 py-2 tabular-nums text-zinc-400">{otros ? formatRD(otros) : '—'}</td>
                            <td className="text-right px-3 py-2 tabular-nums text-zinc-500">{adelantos ? `-${formatRD(adelantos)}` : '—'}</td>
                            <td className="text-right px-3 py-2 min-w-[140px]">
                              <div className="font-black text-green-400 tabular-nums">{formatRD(rp.total)}</div>
                              <MiniBar value={rp.total} max={maxPers} color="bg-green-500/50" />
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-zinc-950/60 border-b border-zinc-800">
                              <td></td>
                              <td colSpan={7} className="px-3 py-2">
                                <table className="w-full text-[11px]">
                                  <thead><tr className="text-[9px] uppercase tracking-wider text-zinc-600"><th className="text-left">Proyecto</th><th>Modo</th><th className="text-right">Días/m²</th><th className="text-right">% Av.</th><th className="text-right">Precio acordado</th><th className="text-right">Base</th><th className="text-right">Total</th></tr></thead>
                                  <tbody>
                                    {rp.proyectos.map(r => {
                                      const proy = data.proyectos.find(p => p.id === r.proyectoId);
                                      const sis = proy ? data.sistemas[proy.sistema] : null;
                                      return (
                                        <tr key={r.id} className="text-zinc-400">
                                          <td className="py-1 truncate max-w-[260px]">
                                            {proy && onVerProyecto ? (
                                              <button
                                                onClick={() => onVerProyecto(proy, 'avance')}
                                                className="text-left hover:text-white group inline-flex items-baseline gap-1"
                                                title={`Abrir "${proy.nombre || proy.cliente || r.proyectoNombre}"`}
                                              >
                                                <span className="font-bold underline-offset-2 group-hover:underline">{r.proyectoNombre}</span>
                                                <span className="text-[9px] text-red-400 opacity-30 group-hover:opacity-100">→</span>
                                              </button>
                                            ) : (
                                              <div className="font-bold">{r.proyectoNombre}</div>
                                            )}
                                            {sis?.nombre && <div className="text-[9px] text-zinc-500 truncate">Sistema: {sis.nombre}</div>}
                                          </td>
                                          <td className="text-center">
                                            <ModoBadge modo={r.modoPago} />
                                            {/* v8.26.7: modo de pago POR PERSONA en este proyecto (override; owner) */}
                                            {esOwner && proy && (
                                              <select
                                                value=""
                                                onClick={e => e.stopPropagation()}
                                                onChange={async (e) => {
                                                  const v = e.target.value; if (!v) return;
                                                  try {
                                                    await db.guardarPagoPersonaProyecto(proy.id, r.personaId, { modoPago: v === 'heredar' ? null : v });
                                                    await recargarTodo();
                                                  } catch (err) { alert('Error: ' + (err.message || err)); }
                                                }}
                                                className="block mx-auto mt-0.5 bg-transparent text-[8px] text-zinc-600 hover:text-zinc-300 outline-none cursor-pointer w-14"
                                                title="Cambiar el modo de pago de ESTA persona en este proyecto"
                                              >
                                                <option value="">cambiar…</option>
                                                <option value="heredar">— heredar del proyecto —</option>
                                                <option value="dia">Por día</option>
                                                <option value="m2_fijo">M² fijo</option>
                                                <option value="m2">Por m² por tarea</option>
                                                <option value="tarea">Por tarea</option>
                                              </select>
                                            )}
                                          </td>
                                          <td className="text-right tabular-nums">
                                            {r.modoPago === 'dia'
                                              ? `${r.diasTrabajados}d${r.diasDobles ? ` (${r.diasDobles}×2)` : ''}`
                                              : (() => {
                                                  const eff = typeof r.m2Efectivo === 'number' ? r.m2Efectivo : r.m2Producidos;
                                                  const raw = r.m2Producidos;
                                                  const diff = Math.abs((raw || 0) - (eff || 0)) > 1;
                                                  return (
                                                    <>
                                                      {formatNum(eff)} m²
                                                      {diff && <div className="text-[8px] text-zinc-600">Σ {formatNum(raw)} reportados</div>}
                                                    </>
                                                  );
                                                })()}
                                          </td>
                                          {/* v8.26.7: % de avance del proyecto — para informar al maestro con contexto */}
                                          <td className="text-right tabular-nums">
                                            {(() => {
                                              if (!proy) return '—';
                                              try {
                                                const { porcentaje } = calcAvanceProyecto(proy, data.reportes, sis, data.sistemas);
                                                const c = porcentaje >= 100 ? 'text-green-400' : porcentaje >= 50 ? 'text-amber-400' : 'text-zinc-400';
                                                return <span className={`font-bold ${c}`}>{porcentaje.toFixed(0)}%</span>;
                                              } catch { return '—'; }
                                            })()}
                                          </td>
                                          <td className="text-right tabular-nums text-zinc-300">
                                            <PrecioEditable proyecto={proy} personaId={r.personaId} fila={r} esOwner={esOwner} onSaved={recargarTodo} />
                                          </td>
                                          <td className="text-right tabular-nums">{formatRD(r.montoBase)}</td>
                                          <td className="text-right tabular-nums font-bold text-green-400">{formatRD(r.montoTotal)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
                {/* v8.19.39: footer de totales por columna (solo lectura) */}
                {resumenPersonas.length > 0 && (() => {
                  const sumDias = resumenPersonas.reduce((s, r) => s + (r.totalDias || 0), 0);
                  const sumM2 = resumenPersonas.reduce((s, r) => s + (r.totalM2Efectivo || 0), 0);
                  const sumOtros = resumenPersonas.reduce((s, r) => s + r.proyectos.reduce((a, x) => a + (x.montoOtros || 0), 0), 0);
                  const sumAdel = resumenPersonas.reduce((s, r) => s + r.proyectos.reduce((a, x) => a + (x.montoAdelantos || 0), 0), 0);
                  const sumTotal = resumenPersonas.reduce((s, r) => s + (r.total || 0), 0);
                  return (
                    <tfoot className="bg-zinc-950 border-t-2 border-zinc-700">
                      <tr className="tabular-nums">
                        <td></td>
                        <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-bold whitespace-nowrap">Total · {resumenPersonas.length} persona{resumenPersonas.length !== 1 ? 's' : ''}</td>
                        <td></td>
                        <td className="text-right px-3 py-2 text-zinc-400">{sumDias || '—'}</td>
                        <td className="text-right px-3 py-2 text-zinc-400">{sumM2 > 0 ? formatNum(sumM2) : '—'}</td>
                        <td className="text-right px-3 py-2 text-zinc-400">{sumOtros ? formatRD(sumOtros) : '—'}</td>
                        <td className="text-right px-3 py-2 text-zinc-500">{sumAdel ? `-${formatRD(sumAdel)}` : '—'}</td>
                        <td className="text-right px-3 py-2 font-black text-green-400">{formatRD(sumTotal)}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </>
        )}

        {/* v8.19.18: Por proyecto — card en móvil, tabla densa en desktop con sistema/pasos al expandir */}
        {vistaDetalle === 'proyecto' && (
          <>
            <div className="md:hidden space-y-2">
              {(() => {
                const maxProy = Math.max(1, ...resumenProyectos.map(r => r.total));
                return resumenProyectos.map(rp => (
                  <div key={rp.proyectoId || 'sin'} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                    <div className="flex justify-between items-start">
                      <div><div className="font-bold text-sm">{rp.proyectoNombre}</div><div className="text-[10px] text-zinc-500 uppercase">{rp.personas.length} persona{rp.personas.length !== 1 ? 's' : ''}</div></div>
                      <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(rp.total)}</div></div>
                    </div>
                    <MiniBar value={rp.total} max={maxProy} color="bg-green-500/50" />
                    <div className="mt-2 space-y-1">{rp.personas.map(r => (
                      <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] flex justify-between items-center">
                        <div className="flex-1 min-w-0"><div className="font-bold truncate">{r.personaNombre}</div><div className="text-zinc-500 uppercase">{r.modoPago === 'dia' ? `${r.diasTrabajados} días` : r.modoPago === 'm2' || r.modoPago === 'm2_fijo' || r.modoPago === 'tarea' ? `${formatNum(r.m2Producidos)} m²` : 'Ajuste'}</div></div>
                        <div className="text-green-400 font-bold">{formatRD(r.montoTotal)}</div>
                      </div>
                    ))}</div>
                    <SistemaPasosBreakdown rp={rp} data={data} />
                  </div>
                ));
              })()}
            </div>
            <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-card">
              <table className="w-full text-sm">
                <thead className="bg-zinc-950 border-b border-zinc-800">
                  <tr className="text-[10px] uppercase tracking-widest text-zinc-500">
                    <th className="w-6"></th>
                    <th className="text-left px-3 py-2 font-bold">Proyecto</th>
                    <th className="text-left px-3 py-2 font-bold">Sistema</th>
                    <th className="text-left px-3 py-2 font-bold">Modo</th>
                    <th className="text-right px-3 py-2 font-bold">Personas</th>
                    <th className="text-right px-3 py-2 font-bold">m²</th>
                    <th className="text-right px-3 py-2 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maxProy = Math.max(1, ...resumenProyectos.map(r => r.total));
                    return resumenProyectos.map(rp => {
                      const isOpen = expandedId === 'pr_' + (rp.proyectoId || 'sin');
                      const proy = data.proyectos.find(p => p.id === rp.proyectoId);
                      const sis = proy ? data.sistemas[proy.sistema] : null;
                      const modo = proy?.modoPagoManoObra || 'ajuste';
                      const m2Total = rp.personas.reduce((s, x) => s + (typeof x.m2Efectivo === 'number' ? x.m2Efectivo : (x.m2Producidos || 0)), 0);
                      const m2Reportado = rp.personas.reduce((s, x) => s + (x.m2Producidos || 0), 0);
                      return (
                        <React.Fragment key={rp.proyectoId || 'sin'}>
                          <tr className="border-b border-zinc-800 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : 'pr_' + (rp.proyectoId || 'sin'))}>
                            <td className="px-2"><ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></td>
                            <td className="px-3 py-2 font-bold truncate max-w-[280px]">
                              {proy && onVerProyecto ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onVerProyecto(proy, 'avance'); }}
                                  className="text-left hover:text-white group inline-flex items-baseline gap-1"
                                  title={`Abrir "${proy.nombre || proy.cliente || rp.proyectoNombre}"`}
                                >
                                  <span className="underline-offset-2 group-hover:underline">{rp.proyectoNombre}</span>
                                  <span className="text-[9px] text-red-400 opacity-30 group-hover:opacity-100">→</span>
                                </button>
                              ) : rp.proyectoNombre}
                            </td>
                            <td className="px-3 py-2 text-zinc-400 text-[11px] truncate max-w-[180px]">{sis?.nombre || '—'}</td>
                            <td className="px-3 py-2"><ModoBadge modo={modo} /></td>
                            <td className="text-right px-3 py-2 tabular-nums text-zinc-400">{rp.personas.length}</td>
                            <td className="text-right px-3 py-2 tabular-nums text-zinc-400">
                              {m2Total > 0 ? (
                                <>
                                  {formatNum(m2Total)}
                                  {Math.abs(m2Reportado - m2Total) > 1 && (
                                    <div className="text-[8px] text-zinc-600">Σ {formatNum(m2Reportado)} reportados</div>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td className="text-right px-3 py-2 min-w-[140px]">
                              <div className="font-black text-green-400 tabular-nums">{formatRD(rp.total)}</div>
                              <MiniBar value={rp.total} max={maxProy} color="bg-green-500/50" />
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-zinc-950/60 border-b border-zinc-800">
                              <td></td>
                              <td colSpan={6} className="px-3 py-3 space-y-3">
                                <div>
                                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Personas en este proyecto</div>
                                  <table className="w-full text-[11px]">
                                    <thead><tr className="text-[9px] uppercase tracking-wider text-zinc-600"><th className="text-left">Persona</th><th className="text-right">Días/m²</th><th className="text-right">Base</th><th className="text-right">Otros</th><th className="text-right">Adelantos</th><th className="text-right">Total</th></tr></thead>
                                    <tbody>
                                      {rp.personas.map(r => (
                                        <tr key={r.id} className="text-zinc-400">
                                          <td className="py-1 truncate max-w-[200px]">{r.personaNombre}</td>
                                          <td className="text-right tabular-nums">
                                            {r.modoPago === 'dia'
                                              ? `${r.diasTrabajados}d${r.diasDobles ? ` (${r.diasDobles}×2)` : ''}`
                                              : (() => {
                                                  const eff = typeof r.m2Efectivo === 'number' ? r.m2Efectivo : r.m2Producidos;
                                                  const raw = r.m2Producidos;
                                                  const diff = Math.abs((raw || 0) - (eff || 0)) > 1;
                                                  return (
                                                    <>
                                                      {formatNum(eff)} m²
                                                      {diff && <div className="text-[8px] text-zinc-600">Σ {formatNum(raw)} reportados</div>}
                                                    </>
                                                  );
                                                })()}
                                          </td>
                                          <td className="text-right tabular-nums">{formatRD(r.montoBase)}</td>
                                          <td className="text-right tabular-nums">{r.montoOtros ? formatRD(r.montoOtros) : '—'}</td>
                                          <td className="text-right tabular-nums text-zinc-500">{r.montoAdelantos ? `-${formatRD(r.montoAdelantos)}` : '—'}</td>
                                          <td className="text-right tabular-nums font-bold text-green-400">{formatRD(r.montoTotal)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <SistemaPasosBreakdown rp={rp} data={data} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
                {/* v8.19.39: footer de totales por columna (solo lectura) */}
                {resumenProyectos.length > 0 && (() => {
                  const sumPersonas = resumenProyectos.reduce((s, r) => s + r.personas.length, 0);
                  const sumM2 = resumenProyectos.reduce((s, r) => s + r.personas.reduce((a, x) => a + (typeof x.m2Efectivo === 'number' ? x.m2Efectivo : (x.m2Producidos || 0)), 0), 0);
                  const sumTotal = resumenProyectos.reduce((s, r) => s + (r.total || 0), 0);
                  return (
                    <tfoot className="bg-zinc-950 border-t-2 border-zinc-700">
                      <tr className="tabular-nums">
                        <td></td>
                        <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-bold whitespace-nowrap">Total · {resumenProyectos.length} proyecto{resumenProyectos.length !== 1 ? 's' : ''}</td>
                        <td></td>
                        <td></td>
                        <td className="text-right px-3 py-2 text-zinc-400">{sumPersonas}</td>
                        <td className="text-right px-3 py-2 text-zinc-400">{sumM2 > 0 ? formatNum(sumM2) : '—'}</td>
                        <td className="text-right px-3 py-2 font-black text-green-400">{formatRD(sumTotal)}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </>
        )}

        {vistaDetalle === 'supervisor' && resumenSupervisores.map(rs => {
          // Agrupar los recibos del supervisor por proyecto para una vista anidada más clara
          const porProyecto = {};
          rs.recibos.forEach(r => {
            const k = r.proyectoId || 'sin';
            if (!porProyecto[k]) porProyecto[k] = { proyectoId: r.proyectoId, proyectoNombre: r.proyectoNombre, recibos: [], total: 0 };
            porProyecto[k].recibos.push(r);
            porProyecto[k].total += r.montoTotal;
          });
          const proyectosArr = Object.values(porProyecto).sort((a, b) => b.total - a.total);
          return (
            <div key={rs.supervisorId || '__none__'} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-sm flex items-center gap-1">👔 {rs.supervisorNombre}</div>
                  <div className="text-[10px] text-zinc-500 uppercase">{rs.proyectos.length} proyecto{rs.proyectos.length !== 1 ? 's' : ''} · {rs.personas.length} persona{rs.personas.length !== 1 ? 's' : ''} · {rs.recibos.length} recibo{rs.recibos.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="text-right"><div className="text-lg font-black text-green-400">{formatRD(rs.total)}</div></div>
              </div>
              <div className="mt-2 space-y-2">
                {proyectosArr.map(pg => (
                  <div key={pg.proyectoId || 'sin'} className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
                    <div className="flex justify-between items-center mb-1">
                      <div className="text-[10px] font-bold text-red-400 uppercase truncate">{pg.proyectoNombre}</div>
                      <div className="text-[10px] font-bold text-green-400 shrink-0">{formatRD(pg.total)}</div>
                    </div>
                    <div className="space-y-1">
                      {pg.recibos.map(r => (
                        <div key={r.id} className="flex justify-between items-center text-[10px] border-t border-zinc-900 pt-1">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">{r.personaNombre}</div>
                            <div className="text-zinc-500 uppercase">{r.modoPago === 'dia' ? `${r.diasTrabajados} días${r.diasDobles ? ` (${r.diasDobles} dobles)` : ''}` : r.modoPago === 'm2' ? `${formatNum(r.m2Producidos)} m²` : 'Ajuste'}</div>
                          </div>
                          <div className="text-green-400 font-bold">{formatRD(r.montoTotal)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {vistaDetalle === 'recibos' && detalleFiltrado.map(d => (
          <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
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
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-zinc-300 text-[10px]"
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
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
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

      {ajusteModal && <ModalAjuste personal={data.personal} proyectos={data.proyectos} onCerrar={() => setAjusteModal(null)} onCrear={crearAjuste} fechaMin={corte.fechaInicio} fechaMax={corte.fechaFin} />}
    </div>
  );
}

function ModalAjuste({ personal, proyectos = [], onCerrar, onCrear, fechaMin, fechaMax }) {
  const [personaId, setPersonaId] = useState('');
  const [proyectoId, setProyectoId] = useState(''); // v8.26.11: a qué proyecto cargar el ajuste (opcional)
  const [tipo, setTipo] = useState('adelanto');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const elegibles = personal.filter(p => tieneRol(p, 'maestro') || tieneRol(p, 'ayudante') || tieneRol(p, 'supervisor'));
  const proyectosActivos = (proyectos || []).filter(p => !p.archivado).sort((a, b) => labelProyecto(a).localeCompare(labelProyecto(b)));
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo ajuste</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
        <Campo label="Persona"><select value={personaId} onChange={e => setPersonaId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Seleccionar...</option>{elegibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo label="Proyecto (opcional)"><select value={proyectoId} onChange={e => setProyectoId(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">— Sin proyecto (general) —</option>{proyectosActivos.map(p => <option key={p.id} value={p.id}>{labelProyecto(p)}</option>)}</select></Campo>
        <Campo label="Tipo"><select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="adelanto">Adelanto</option><option value="ajuste">Ajuste (suma al pago)</option><option value="bono">Bono</option><option value="descuento">Descuento</option><option value="dieta_extra">Dieta extra</option></select></Campo>
        <Campo label="Monto (RD$)"><Input type="number" value={monto} onChange={setMonto} /></Campo>
        <Campo label="Concepto"><Input value={concepto} onChange={setConcepto} placeholder="Descripción breve" /></Campo>
        <Campo label="Fecha"><Input type="date" value={fecha} onChange={setFecha} /></Campo>
        <div className="flex gap-2"><button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button><button onClick={() => personaId && monto && onCrear({ personaId, proyectoId: proyectoId || null, tipo, monto: parseFloat(monto), concepto, fecha })} disabled={!personaId || !monto} className="flex-1 bg-red-600 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3"><Save className="w-3 h-3 inline mr-1" /> Registrar</button></div>
      </div>
    </div>
  );
}

