'use client';

// v8.59.2 — FICHA DE UNA SUCURSAL del programa (lado ERP).
// Todo de una locación en un solo lugar: en qué etapa está y desde cuándo, la línea de
// tiempo con la fecha de entrada a cada etapa, la coordinación de la visita, el supervisor
// del cliente y los documentos (OC, cotización, autorización, informe, garantía).
// Los documentos se pueden marcar visibles u ocultos para el cliente en el portal.

import React, { useEffect, useState } from 'react';
import { X, Loader2, Upload, Eye, EyeOff, Trash2, FileText, ExternalLink, CalendarDays } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD } from '../../lib/helpers/formato';
import { ETAPAS, ETAPA, COLOR_ETAPA, TIPOS_DOCUMENTO, turnoDe, textoCoordinacion } from '../../lib/helpers/programaSites';

const fmtF = (f) => { if (!f) return ''; try { return new Date(String(f).length === 10 ? f + 'T12:00:00' : f).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const etiquetaTipo = Object.fromEntries(TIPOS_DOCUMENTO.map(t => [t.id, t.label]));

export default function FichaLocacion({ locacion: l, usuario, onCerrar, onCambio, onAbrirProyecto }) {
  const [docs, setDocs] = useState(null);
  const [tipo, setTipo] = useState('oc');
  const [visible, setVisible] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [fecha, setFecha] = useState(l.fechaVisita ? String(l.fechaVisita).slice(0, 10) : '');
  const [hora, setHora] = useState(l.horaVisita || '');
  const [guardando, setGuardando] = useState(false);

  const cargarDocs = async () => {
    try { setDocs(await db.listarDocumentosLocacion(l.id)); } catch (e) { console.warn(e); setDocs([]); }
  };
  useEffect(() => { cargarDocs(); /* eslint-disable-next-line */ }, [l.id]);

  const idx = ETAPAS.findIndex(e => e.id === l.etapa);
  const color = COLOR_ETAPA[l.etapa];

  const subir = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    try { await db.subirDocumentoLocacion({ locacion: l, tipo, file, usuario, visibleCliente: visible }); await cargarDocs(); }
    catch (err) { alert('No se pudo subir: ' + (err.message || err)); }
    setSubiendo(false);
  };

  const guardarCoordinacion = async () => {
    if (!fecha) { alert('Pon el día coordinado con el propietario.'); return; }
    setGuardando(true);
    try {
      await db.actualizarLocacionPrograma(l.id, {
        luzVerde: true, luzVerdeAt: l.luzVerdeAt || new Date().toISOString(),
        luzVerdePor: `${usuario?.nombre || 'ERP'} (ERP)`, fechaVisita: fecha, horaVisita: hora || null,
      });
      await onCambio?.();
    } catch (err) { alert('Error: ' + (err.message || err)); }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-3 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
        {/* Cabecera */}
        <div className="flex items-start gap-3 p-4 border-b border-zinc-800" style={{ borderTop: `4px solid ${color}` }}>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-black leading-tight">{l.nombre}</div>
            <div className="text-[11px] text-zinc-500">{l.codigoUt}{l.direccion ? ` · ${l.direccion}` : ''}</div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: `${color}26`, color }}>{ETAPA[l.etapa]?.label}</span>
              {l.etapaDesde && (
                <span className="text-[11px] text-zinc-300">
                  desde el <b>{fmtF(l.etapaDesde)}</b>{l.diasEnEtapa != null ? ` · ${l.diasEnEtapa} día${l.diasEnEtapa === 1 ? '' : 's'}` : ''}
                </span>
              )}
              <span className={`text-[10px] font-bold uppercase ${ETAPA[l.etapa]?.deQuien === 'cliente' ? 'text-amber-400' : 'text-sky-400'}`}>{turnoDe(l.etapa)}</span>
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 grid gap-4 md:grid-cols-2">
          {/* Línea de tiempo con fechas */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
            <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-2">Etapas</div>
            {ETAPAS.map((e, i) => {
              const hecho = i < idx, actual = i === idx;
              const f = l.fechasEtapas?.[e.id];
              return (
                <div key={e.id} className={`flex items-center gap-2 py-1 text-[12px] ${i > idx ? 'text-zinc-600' : 'text-zinc-200'} ${actual ? 'font-black' : ''}`}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: hecho || actual ? COLOR_ETAPA[e.id] : 'transparent', border: `2px solid ${hecho || actual ? COLOR_ETAPA[e.id] : '#3f3f46'}` }} />
                  <span className="flex-1">{e.label}</span>
                  <span className="text-[11px] text-zinc-500">{i <= idx && f ? fmtF(f) : ''}</span>
                </div>
              );
            })}
          </div>

          {/* Datos y coordinación */}
          <div className="space-y-3">
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-1.5 text-[12px]">
              <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold mb-1">Datos</div>
              <div><span className="text-zinc-500">Cotización:</span> {l.cotizacionRef ? `${l.cotizacionRef}${l.cotizacionMonto ? ` · ${formatRD(l.cotizacionMonto)}` : ''}${l.cotizacionAprobada ? ' · aprobada' : ' · por aprobar'}` : 'pendiente'}</div>
              <div><span className="text-zinc-500">Supervisor del cliente:</span> {l.supervisorClienteNombre ? `${l.supervisorClienteNombre}${l.supervisorClienteTelefono ? ` · ${l.supervisorClienteTelefono}` : ''}` : 'sin asignar'}</div>
              <div><span className="text-zinc-500">Tipo de trabajo:</span> {l.tipoTrabajo === 'pintura' ? 'Pintura' : l.tipoTrabajo === 'ambos' ? 'Techo y pintura' : 'Impermeabilización'}</div>
              <div className="flex gap-3 flex-wrap pt-1">
                {l.lat && l.lng && <a href={`https://www.google.com/maps?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer" className="underline text-zinc-400 hover:text-white inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Mapa</a>}
                {l.proyectoId && onAbrirProyecto && <button onClick={() => onAbrirProyecto(l.proyectoId)} className="underline text-zinc-400 hover:text-white">Ver la obra</button>}
              </div>
            </div>

            {!l.levantadoAt && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Visita de levantamiento</div>
                {l.fechaVisita && <div className="text-[12px] text-zinc-200">Coordinada: <b>{textoCoordinacion(l.fechaVisita, l.horaVisita)}</b>{l.luzVerdePor ? <span className="text-zinc-500"> · {l.luzVerdePor}</span> : null}</div>}
                <div className="flex gap-2">
                  <input id="ficha-fecha-visita" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs text-white" />
                  <input id="ficha-hora-visita" type="time" value={hora} onChange={e => setHora(e.target.value)} className="w-28 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs text-white" />
                </div>
                <button onClick={guardarCoordinacion} disabled={guardando}
                  className="w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-bold uppercase py-2 text-[11px] rounded-card">
                  {guardando ? 'Guardando…' : l.fechaVisita ? 'Cambiar la fecha' : 'Marcar coordinado'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Documentos */}
        <div className="px-4 pb-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">Documentos</div>
              <div className="flex items-center gap-2 flex-wrap">
                <select id="ficha-tipo-doc" value={tipo} onChange={e => setTipo(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1 text-[11px] text-white">
                  {TIPOS_DOCUMENTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <label className="text-[11px] text-zinc-400 flex items-center gap-1">
                  <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} className="accent-red-600" /> Lo ve el cliente
                </label>
                <label className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-card cursor-pointer flex items-center gap-1 ${subiendo ? 'bg-zinc-800 text-zinc-500' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
                  {subiendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Subir
                  <input type="file" className="hidden" disabled={subiendo} onChange={subir} accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc" />
                </label>
              </div>
            </div>
            {docs === null && <div className="text-[11px] text-zinc-500 py-2"><Loader2 className="w-3 h-3 animate-spin inline" /> Cargando…</div>}
            {docs?.length === 0 && <div className="text-[11px] text-zinc-600 py-2">Sin documentos. Sube aquí la OC del cliente cuando llegue.</div>}
            {docs?.map(d => (
              <div key={d.id} className="flex items-center gap-2 py-1.5 border-t border-zinc-800 first:border-t-0 text-[12px]">
                <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-zinc-100 hover:underline truncate block">{d.nombre}</a> : <span className="truncate block">{d.nombre}</span>}
                  <div className="text-[10px] text-zinc-500">{etiquetaTipo[d.tipo] || d.tipo} · {fmtF(d.fecha)} · {d.subidoPor}{d.origen === 'cliente' ? ' · lo subió el cliente' : ''}</div>
                </div>
                <button title={d.visibleCliente ? 'El cliente lo ve — ocultar' : 'Oculto al cliente — mostrar'}
                  onClick={async () => { await db.cambiarVisibilidadDocumento(d.id, !d.visibleCliente); cargarDocs(); }}
                  className={`p-1 rounded ${d.visibleCliente ? 'text-green-400' : 'text-zinc-600'} hover:bg-zinc-800`}>
                  {d.visibleCliente ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button title="Borrar" onClick={async () => { if (confirm(`¿Borrar ${d.nombre}?`)) { await db.borrarDocumentoLocacion(d); cargarDocs(); } }}
                  className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
