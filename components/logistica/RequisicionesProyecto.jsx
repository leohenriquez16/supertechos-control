'use client';

// v8.29.0: Tab "Materiales" del proyecto — requisiciones de materiales desde la obra.
// Reemplaza los pedidos por WhatsApp: el supervisor/maestro pide aquí, almacén lo ve
// al instante, y la obra ve el estado real (pendiente → preparando → lista → en ruta
// → entregada) sin preguntar en el grupo.

import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Package, X, Trash2, Camera } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';
import { comprimirImagenABlob } from '../../lib/imports';
import ModalConfirmarRecepcion from './ModalConfirmarRecepcion'; // v8.49.4

// v8.40.0: estados de una diligencia de retiro (material sobrante en obra).
export const ESTADOS_DILIGENCIA = {
  sin_planificar: { label: '📦 Esperando retiro', color: 'bg-red-600/20 text-red-300' },
  asignada:       { label: '🚚 En ruta de retiro', color: 'bg-cyan-600/20 text-cyan-300' },
  completada:     { label: '✓ Retirado', color: 'bg-green-600/20 text-green-400' },
  cancelada:      { label: 'Cancelada', color: 'bg-zinc-700/40 text-zinc-500' },
};

export const ESTADOS_REQ = {
  pendiente:  { label: 'Pendiente en almacén', color: 'bg-amber-600/20 text-amber-400' },
  preparando: { label: 'Preparando', color: 'bg-blue-600/20 text-blue-400' },
  lista:      { label: 'Lista para envío', color: 'bg-purple-600/20 text-purple-400' },
  en_ruta:    { label: 'En ruta 🚚', color: 'bg-cyan-600/20 text-cyan-400' },
  entregada:  { label: 'Entregada ✓', color: 'bg-green-600/20 text-green-400' },
  cancelada:  { label: 'Cancelada', color: 'bg-zinc-700/40 text-zinc-500' },
};

// v8.39.0: flujo de COMPRAS por renglón — lo que no está en stock.
export const ESTADOS_COMPRA = {
  solicitado:           { label: '🛒 Solicitado a compras', color: 'bg-orange-600/20 text-orange-300' },
  cotizado:             { label: '💲 Cotizado', color: 'bg-blue-600/20 text-blue-300' },
  esperando_aprobacion: { label: '⏳ Esperando aprobación', color: 'bg-amber-600/20 text-amber-300' },
  comprado:             { label: '✓ Comprado', color: 'bg-green-600/20 text-green-400' },
};

const itemVacio = () => ({ descripcion: '', cantidad: '', unidad: '' });

export default function RequisicionesProyecto({ usuario, proyecto, esAdmin }) {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [items, setItems] = useState([itemVacio()]);
  const [urgente, setUrgente] = useState(false);
  const [notas, setNotas] = useState('');
  const [esCompra, setEsCompra] = useState(false);        // v8.39.0
  const [cotizacionFile, setCotizacionFile] = useState(null);
  // v8.40.0: material sobrante — se reporta aquí, se retira por Rutas.
  const [sobrantes, setSobrantes] = useState([]);
  const [reportandoSobrante, setReportandoSobrante] = useState(false);
  const [sobranteListado, setSobranteListado] = useState('');
  const [sobranteFoto, setSobranteFoto] = useState(null);
  const [guardandoSobrante, setGuardandoSobrante] = useState(false);
  const [confirmandoReq, setConfirmandoReq] = useState(null); // v8.49.4: doble confirmación de recepción

  const recargar = async () => {
    setLoading(true);
    try {
      const [rs, dils] = await Promise.all([
        db.listarRequisiciones({ proyectoId: proyecto.id }),
        db.listarDiligencias({ proyectoId: proyecto.id }).catch(() => []),
      ]);
      setReqs(rs); setSobrantes(dils);
    }
    catch (e) { console.warn('Requisiciones:', e?.message); }
    setLoading(false);
  };

  const reportarSobrante = async () => {
    if (!sobranteListado.trim()) { alert('Escribe qué material sobró (el listado).'); return; }
    setGuardandoSobrante(true);
    try {
      const id = await db.crearDiligencia({
        tipo: 'retiro_sobrante', proyectoId: proyecto.id, descripcion: sobranteListado.trim(),
        creadoPorId: usuario.id, creadoPorNombre: usuario.nombre,
      });
      if (sobranteFoto) {
        try {
          const blob = await comprimirImagenABlob(sobranteFoto);
          const url = await db.subirFotoSobrante(blob, id);
          await db.actualizarFotoDiligencia(id, url);
        } catch (e2) { alert('El reporte se creó, pero la foto no subió: ' + (e2?.message || e2)); }
      }
      setReportandoSobrante(false); setSobranteListado(''); setSobranteFoto(null);
      await recargar();
      alert('Reportado ✓ — Rutas lo verá como retiro pendiente hasta que lo monte en un camión.');
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setGuardandoSobrante(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [proyecto.id]);

  const setItem = (i, campo, v) => setItems(items.map((x, n) => n === i ? { ...x, [campo]: v } : x));

  const guardar = async () => {
    const validos = items.filter(i => i.descripcion.trim());
    if (validos.length === 0) { alert('Agrega al menos un material.'); return; }
    setGuardando(true);
    try {
      const id = await db.crearRequisicion({
        proyectoId: proyecto.id,
        solicitadoPorId: usuario.id, solicitadoPorNombre: usuario.nombre,
        urgente, notas, items: validos, esCompra,
      });
      // v8.39.0: si es compra con cotización adjunta, subirla y amarrarla.
      if (esCompra && cotizacionFile) {
        try {
          const url = await db.subirCotizacionRequisicion(cotizacionFile, id);
          await db.actualizarRequisicion(id, { cotizacionUrl: url });
        } catch (e2) { alert('El pedido se creó, pero la cotización no se pudo subir: ' + (e2?.message || e2)); }
      }
      setCreando(false); setItems([itemVacio()]); setUrgente(false); setNotas(''); setEsCompra(false); setCotizacionFile(null);
      await recargar();
    } catch (e) { alert('Error creando la requisición: ' + (e?.message || e)); }
    setGuardando(false);
  };

  const cancelar = async (r) => {
    if (!confirm('¿Cancelar esta requisición?')) return;
    try { await db.actualizarRequisicion(r.id, { estado: 'cancelada' }); await recargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      {!creando ? (
        <button onClick={() => setCreando(true)} className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Pedir materiales al almacén
        </button>
      ) : (
        <div className="bg-zinc-900 border-2 border-red-600 rounded-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-widest uppercase font-bold text-red-500">Nueva requisición</div>
            <button onClick={() => setCreando(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)} placeholder="Material (ej. Lona SBS 3mm)" className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm min-w-0" />
              <input value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} placeholder="Cant." type="number" className="w-16 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
              <input value={it.unidad} onChange={e => setItem(i, 'unidad', e.target.value)} placeholder="Ud." className="w-16 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
              {items.length > 1 && <button onClick={() => setItems(items.filter((_, n) => n !== i))} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button onClick={() => setItems([...items, itemVacio()])} className="text-xs text-blue-400 hover:text-blue-300 font-bold">+ Otro material</button>
          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Nota para almacén (opcional)" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={urgente} onChange={e => setUrgente(e.target.checked)} className="w-3.5 h-3.5 accent-red-500" /> 🔥 Urgente — la obra está parada esperando esto
          </label>
          {/* v8.39.0: pedido que NO está en almacén = compra; puede traer cotización */}
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={esCompra} onChange={e => setEsCompra(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" /> 🛒 Es una compra — esto no está en el almacén
          </label>
          {esCompra && (
            <div className="bg-zinc-950 border border-orange-800/50 rounded-card p-2 space-y-1.5">
              <div className="text-[10px] text-zinc-400">¿Ya tienes una cotización del suplidor? Adjúntala (foto o PDF) — la IA la lee y prepara la orden de compra en borrador en Odoo.</div>
              <input type="file" accept="image/*,application/pdf" onChange={e => setCotizacionFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-zinc-400 file:bg-orange-700 file:text-white file:border-0 file:rounded-card file:px-2.5 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:mr-2" />
              {cotizacionFile && <div className="text-[10px] text-green-400">📎 {cotizacionFile.name}</div>}
            </div>
          )}
          <button onClick={guardar} disabled={guardando} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1.5">
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />} Enviar al almacén
          </button>
        </div>
      )}

      {reqs.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-5 text-center text-zinc-500 text-sm">
          Esta obra no ha pedido materiales todavía.
        </div>
      ) : (
        <div className="space-y-2">
          {reqs.map(r => {
            const est = ESTADOS_REQ[r.estado] || ESTADOS_REQ.pendiente;
            return (
              <div key={r.id} className={`bg-zinc-950 border rounded-card p-3 ${r.urgente && r.estado !== 'entregada' && r.estado !== 'cancelada' ? 'border-red-800/70' : 'border-zinc-800'}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-card ${est.color}`}>{est.label}</span>
                    {r.urgente && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-red-600/20 text-red-400">🔥 Urgente</span>}
                    {r.esCompra && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-orange-600/20 text-orange-300">🛒 Compra</span>}
                    {r.ocOdooName && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-purple-600/20 text-purple-300">📄 {r.ocOdooName} (borrador)</span>}
                    <span className="text-[10px] text-zinc-500">{formatFechaCorta((r.createdAt || '').slice(0, 10))} · {r.solicitadoPorNombre || ''}</span>
                  </div>
                  {(r.estado === 'pendiente') && (esAdmin || r.solicitadoPorId === usuario.id) && (
                    <button onClick={() => cancelar(r)} className="text-[10px] text-zinc-500 hover:text-red-400 uppercase font-bold">Cancelar</button>
                  )}
                </div>
                <div className="mt-1.5 space-y-0.5">
                  {r.items.map(it => (
                    <div key={it.id} className="text-xs text-zinc-300 flex items-center gap-1.5 flex-wrap">
                      <span className={it.despachado ? 'text-green-400' : 'text-zinc-600'}>{it.despachado ? '✓' : '•'}</span>
                      <span className={it.despachado ? 'line-through text-zinc-500' : ''}>{it.descripcion}{it.cantidad != null && it.cantidad !== '' ? ` — ${it.cantidad} ${it.unidad || ''}` : ''}</span>
                      {it.estadoCompra && ESTADOS_COMPRA[it.estadoCompra] && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-card ${ESTADOS_COMPRA[it.estadoCompra].color}`}>{ESTADOS_COMPRA[it.estadoCompra].label}</span>
                      )}
                    </div>
                  ))}
                </div>
                {r.cotizacionUrl && <a href={r.cotizacionUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline mt-1 inline-block">📎 Ver cotización adjunta</a>}
                {r.notas && <div className="text-[10px] text-zinc-500 mt-1">📝 {r.notas}</div>}
                {/* v8.49.4: doble confirmación — la obra confirma el recibido contra la firma del chofer */}
                {r.estado === 'entregada' && !r.recepcionConfirmadaAt && (
                  <button onClick={() => setConfirmandoReq(r)}
                    className="mt-2 w-full bg-green-700 hover:bg-green-600 text-white text-[10px] font-black uppercase py-2 rounded-card">
                    ✅ Confirmar que la recibimos
                  </button>
                )}
                {r.recepcionConfirmadaAt && (
                  <div className="text-[10px] text-green-500 mt-1.5">✅ Recibido confirmado por {r.recepcionConfirmadaPorNombre || '—'} ({r.recepcionOrigen === 'oficina' ? 'oficina' : 'obra'})</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmandoReq && (
        <ModalConfirmarRecepcion req={confirmandoReq} etiqueta={`Solicitud del ${formatFechaCorta((confirmandoReq.createdAt || '').slice(0, 10))} · ${confirmandoReq.items.length} renglones`}
          usuario={usuario} origen="obra"
          onCerrar={() => setConfirmandoReq(null)}
          onConfirmado={async () => { setConfirmandoReq(null); await recargar(); }} />
      )}

      {/* ============ v8.40.0: MATERIAL SOBRANTE (retiro por Rutas) ============ */}
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] tracking-widest uppercase font-bold text-zinc-400">📦 Material sobrante</div>
          {!reportandoSobrante && (
            <button onClick={() => setReportandoSobrante(true)} className="text-[10px] font-black uppercase px-2.5 py-1.5 rounded-card border border-amber-700/60 text-amber-400 hover:bg-amber-600 hover:text-black">
              + Reportar sobrante
            </button>
          )}
        </div>
        {reportandoSobrante && (
          <div className="bg-zinc-900 border-2 border-amber-600 rounded-card p-3 space-y-2">
            <div className="text-[10px] text-zinc-400">¿Sobró material en la obra? Repórtalo aquí (no al WhatsApp): Rutas lo verá como retiro pendiente hasta recogerlo.</div>
            <textarea value={sobranteListado} onChange={e => setSobranteListado(e.target.value)} rows={3}
              placeholder={'Listado de lo que sobró, un renglón por cosa:\n8 rollos lona SBS 3mm\n2 cubetas primer'}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <span className="bg-zinc-800 border border-zinc-700 rounded-card px-2.5 py-2 flex items-center gap-1.5 text-[11px] font-bold"><Camera className="w-3.5 h-3.5" /> {sobranteFoto ? 'Cambiar foto' : 'Foto del material'}</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setSobranteFoto(e.target.files?.[0] || null)} />
              {sobranteFoto && <span className="text-[10px] text-green-400">📷 lista</span>}
            </label>
            <div className="flex gap-1.5">
              <button onClick={() => { setReportandoSobrante(false); setSobranteFoto(null); }} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-2 rounded-card">Cancelar</button>
              <button onClick={reportarSobrante} disabled={guardandoSobrante} className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-black text-[10px] font-black uppercase py-2 rounded-card">
                {guardandoSobrante ? 'Subiendo…' : 'Reportar para retiro'}
              </button>
            </div>
          </div>
        )}
        {sobrantes.filter(s => s.estado !== 'cancelada').length === 0 && !reportandoSobrante && (
          <div className="text-[11px] text-zinc-600 italic">Sin sobrantes reportados.</div>
        )}
        {sobrantes.filter(s => s.estado !== 'cancelada').map(s => {
          const est = ESTADOS_DILIGENCIA[s.estado] || ESTADOS_DILIGENCIA.sin_planificar;
          return (
            <div key={s.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2.5 flex items-start gap-2.5">
              {s.fotoUrl && <a href={s.fotoUrl} target="_blank" rel="noreferrer" className="shrink-0"><img src={s.fotoUrl} alt="sobrante" className="w-12 h-12 object-cover rounded-card border border-zinc-800" /></a>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-card ${est.color}`}>{est.label}</span>
                  <span className="text-[10px] text-zinc-500">{formatFechaCorta((s.createdAt || '').slice(0, 10))} · {s.creadoPorNombre}</span>
                </div>
                <div className="text-xs text-zinc-300 mt-1 whitespace-pre-wrap">{s.descripcion}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
