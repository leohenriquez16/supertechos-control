'use client';

// v8.29.0: Vista "Rutas" — planificación de viajes de camiones (adiós Excel).
// Un viaje = un chofer (o envío pagado) en una fecha, con paradas ordenadas:
//  - entregas de requisiciones LISTAS del almacén a sus obras
//  - recogidas/entregas libres (puertos, almacenes fiscales, suplidores, entre almacenes)
// El chofer ve su ruta en su teléfono y marca cada parada; sus horas de inicio/fin
// del viaje alimentan el cálculo de horas extras (resumen abajo).

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Truck, Plus, RefreshCw, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
const tieneRol = (p, r) => p?.roles?.includes(r);

export default function VistaRutas({ usuario, data, onVolver }) {
  const [fecha, setFecha] = useState(hoyRD());
  const [viajes, setViajes] = useState([]);
  const [listas, setListas] = useState([]);       // requisiciones listas sin viaje
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ choferId: '', vehiculo: '', tipoEnvio: 'camion' });
  const [paradaLibre, setParadaLibre] = useState(null); // { viajeId, tipo, lugar, descripcion }

  const choferes = useMemo(() => (data.personal || []).filter(p => tieneRol(p, 'chofer')), [data.personal]);

  const recargar = async () => {
    setLoading(true);
    try {
      const [vs, reqs] = await Promise.all([
        db.listarViajes({ fecha }),
        db.listarRequisiciones({ estados: ['lista'] }),
      ]);
      const asignadas = new Set(vs.flatMap(v => v.paradas.map(p => p.requisicionId).filter(Boolean)));
      // también excluir requisiciones ya montadas en viajes de OTRAS fechas
      const otras = await db.listarViajes({ desde: hoyRD().slice(0, 8) + '01' }).catch(() => []);
      otras.forEach(v => v.paradas.forEach(p => { if (p.requisicionId) asignadas.add(p.requisicionId); }));
      setViajes(vs);
      setListas(reqs.filter(r => !asignadas.has(r.id)));
    } catch (e) { console.warn('Rutas:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [fecha]);

  const nombreObra = (pid) => { const p = (data.proyectos || []).find(x => x.id === pid); return p ? (p.cliente || p.nombre || p.referenciaOdoo) : pid; };

  const crearViaje = async () => {
    if (nuevo.tipoEnvio === 'camion' && !nuevo.choferId) { alert('Elige el chofer.'); return; }
    const chofer = choferes.find(c => c.id === nuevo.choferId);
    try {
      await db.crearViaje({
        fecha, choferId: nuevo.tipoEnvio === 'camion' ? nuevo.choferId : null,
        choferNombre: nuevo.tipoEnvio === 'camion' ? (chofer?.nombre || '') : 'Envío pagado',
        vehiculo: nuevo.vehiculo, tipoEnvio: nuevo.tipoEnvio, creadoPorId: usuario.id,
      });
      setCreando(false); setNuevo({ choferId: '', vehiculo: '', tipoEnvio: 'camion' });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const montarRequisicion = async (viaje, req) => {
    try {
      await db.agregarParada({
        viajeId: viaje.id, orden: viaje.paradas.length + 1, tipo: 'entrega',
        proyectoId: req.proyectoId, requisicionId: req.id,
        descripcion: `Entregar materiales en ${nombreObra(req.proyectoId)}`,
      });
      // el viaje "pagado" entrega directo; el camión la lleva cuando el chofer arranca
      if (viaje.tipoEnvio === 'pagado' || viaje.estado === 'en_curso') await db.actualizarRequisicion(req.id, { estado: 'en_ruta' });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const agregarLibre = async () => {
    const p = paradaLibre;
    if (!p?.lugar?.trim()) { alert('Escribe el lugar.'); return; }
    const viaje = viajes.find(v => v.id === p.viajeId);
    try {
      await db.agregarParada({
        viajeId: p.viajeId, orden: (viaje?.paradas.length || 0) + 1,
        tipo: p.tipo, lugar: p.lugar.trim(), descripcion: p.descripcion || '',
      });
      setParadaLibre(null);
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const mover = async (viaje, parada, dir) => {
    const orden = [...viaje.paradas].sort((a, b) => a.orden - b.orden);
    const i = orden.findIndex(p => p.id === parada.id);
    const j = i + dir;
    if (j < 0 || j >= orden.length) return;
    try {
      await db.actualizarParada(orden[i].id, { orden: orden[j].orden });
      await db.actualizarParada(orden[j].id, { orden: orden[i].orden });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const quitarParada = async (viaje, parada) => {
    if (!confirm('¿Quitar esta parada?')) return;
    try {
      await db.eliminarParada(parada.id);
      if (parada.requisicionId) await db.actualizarRequisicion(parada.requisicionId, { estado: 'lista' });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  const borrarViaje = async (v) => {
    if (v.paradas.some(p => p.requisicionId)) { alert('Quita primero las requisiciones montadas.'); return; }
    if (!confirm('¿Eliminar este viaje?')) return;
    try { await db.eliminarViaje(v.id); await recargar(); } catch (e) { alert('Error: ' + (e?.message || e)); }
  };

  // Horas del día por chofer (para horas extras: jornada estándar de 8h)
  const horasChofer = useMemo(() => viajes.filter(v => v.choferId && v.horaInicio).map(v => {
    const fin = v.horaFin ? new Date(v.horaFin) : null;
    const horasTot = fin ? (fin - new Date(v.horaInicio)) / 3600000 : null;
    return { v, horasTot, extras: horasTot != null ? Math.max(0, horasTot - 8) : null };
  }), [viajes]);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Truck className="w-6 h-6 text-cyan-400" /> Rutas</h1>
            <div className="text-[11px] text-zinc-500">Viajes de camiones y envíos · almacén ↔ obras ↔ puertos/fiscales</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-sm" />
          <button onClick={recargar} className="text-zinc-500 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Requisiciones listas esperando viaje */}
          <div className="bg-zinc-900 border border-purple-800/50 rounded-card p-3">
            <div className="text-[11px] tracking-widest uppercase text-purple-400 font-bold mb-1.5">📦 Listas para envío sin viaje ({listas.length})</div>
            {listas.length === 0 ? <div className="text-xs text-zinc-500">Nada esperando.</div> : (
              <div className="space-y-1.5">
                {listas.map(r => (
                  <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{nombreObra(r.proyectoId)} {r.urgente && '🔥'}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{r.items.map(i => i.descripcion).join(', ')}</div>
                    </div>
                    {viajes.length > 0 && (
                      <select defaultValue="" onChange={e => { const v = viajes.find(x => x.id === e.target.value); if (v) montarRequisicion(v, r); e.target.value = ''; }}
                        className="bg-zinc-900 border border-zinc-700 rounded-card px-1.5 py-1.5 text-[11px] shrink-0">
                        <option value="" disabled>Montar en…</option>
                        {viajes.map(v => <option key={v.id} value={v.id}>{v.choferNombre || v.vehiculo || v.id}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Viajes del día */}
          {viajes.map(v => (
            <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold text-sm">{v.tipoEnvio === 'pagado' ? '📮 Envío pagado' : `🚛 ${v.choferNombre || 'Sin chofer'}`}{v.vehiculo ? ` · ${v.vehiculo}` : ''}</div>
                  <div className="text-[10px] text-zinc-500">
                    {v.estado === 'planificado' ? 'Planificado' : v.estado === 'en_curso' ? `En curso desde ${hora(v.horaInicio)}` : `Completado · ${hora(v.horaInicio)} → ${hora(v.horaFin)}`}
                    {' · '}{v.paradas.filter(p => p.estado === 'completada').length}/{v.paradas.length} paradas
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setParadaLibre({ viajeId: v.id, tipo: 'recogida', lugar: '', descripcion: '' })} className="text-[10px] uppercase font-bold border border-zinc-700 hover:border-cyan-500 text-zinc-300 px-2 py-1.5 rounded-card">+ Parada</button>
                  {v.estado === 'planificado' && v.paradas.length === 0 && <button onClick={() => borrarViaje(v)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>

              {paradaLibre?.viajeId === v.id && (
                <div className="bg-zinc-950 border border-cyan-800/50 rounded-card p-2 space-y-1.5">
                  <div className="flex items-center justify-between"><span className="text-[10px] uppercase font-bold text-cyan-400">Parada libre</span><button onClick={() => setParadaLibre(null)} className="text-zinc-500"><X className="w-3.5 h-3.5" /></button></div>
                  <div className="flex gap-1.5 flex-wrap">
                    <select value={paradaLibre.tipo} onChange={e => setParadaLibre({ ...paradaLibre, tipo: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-card px-1.5 py-1.5 text-xs">
                      <option value="recogida">Recoger en</option>
                      <option value="entrega">Entregar en</option>
                    </select>
                    <input value={paradaLibre.lugar} onChange={e => setParadaLibre({ ...paradaLibre, lugar: e.target.value })} placeholder="Puerto / almacén fiscal / suplidor / obra…" className="flex-1 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs min-w-[140px]" />
                  </div>
                  <input value={paradaLibre.descripcion} onChange={e => setParadaLibre({ ...paradaLibre, descripcion: e.target.value })} placeholder="Qué (ej. contenedor MSKU123, 40 sacos)" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs" />
                  <button onClick={agregarLibre} className="w-full bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-black uppercase py-2 rounded-card">Agregar al viaje</button>
                </div>
              )}

              <div className="space-y-1">
                {v.paradas.map((p, i) => (
                  <div key={p.id} className={`bg-zinc-950 border rounded-card px-2 py-1.5 flex items-center gap-2 ${p.estado === 'completada' ? 'border-green-900/50' : 'border-zinc-800'}`}>
                    <span className="text-[10px] font-black text-zinc-600 w-4 text-center shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-bold truncate ${p.estado === 'completada' ? 'text-green-400' : ''}`}>
                        {p.tipo === 'recogida' ? '↑ Recoger' : '↓ Entregar'} · {p.proyectoId ? nombreObra(p.proyectoId) : p.lugar}
                        {p.estado === 'completada' && ` ✓ ${hora(p.completadaAt)}`}
                      </div>
                      {p.descripcion && <div className="text-[10px] text-zinc-500 truncate">{p.descripcion}</div>}
                    </div>
                    {v.estado !== 'completado' && p.estado !== 'completada' && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => mover(v, p, -1)} className="text-zinc-600 hover:text-white"><ChevronUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => mover(v, p, 1)} className="text-zinc-600 hover:text-white"><ChevronDown className="w-3.5 h-3.5" /></button>
                        <button onClick={() => quitarParada(v, p)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
                {v.paradas.length === 0 && <div className="text-[11px] text-zinc-600 italic">Sin paradas — monta requisiciones listas o agrega una parada libre.</div>}
              </div>
            </div>
          ))}

          {/* Crear viaje */}
          {!creando ? (
            <button onClick={() => setCreando(true)} className="w-full bg-cyan-700 hover:bg-cyan-600 text-white font-black uppercase py-2.5 text-xs flex items-center justify-center gap-1.5 rounded-card">
              <Plus className="w-3.5 h-3.5" /> Nuevo viaje / envío del {formatFechaCorta(fecha)}
            </button>
          ) : (
            <div className="bg-zinc-900 border-2 border-cyan-700 rounded-card p-3 space-y-2">
              <div className="flex items-center justify-between"><span className="text-[11px] uppercase font-bold text-cyan-400">Nuevo viaje</span><button onClick={() => setCreando(false)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>
              <div className="flex gap-1.5 flex-wrap">
                <select value={nuevo.tipoEnvio} onChange={e => setNuevo({ ...nuevo, tipoEnvio: e.target.value })} className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm">
                  <option value="camion">Camión propio</option>
                  <option value="pagado">Envío pagado</option>
                </select>
                {nuevo.tipoEnvio === 'camion' && (
                  <select value={nuevo.choferId} onChange={e => setNuevo({ ...nuevo, choferId: e.target.value })} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm min-w-[140px]">
                    <option value="">Chofer… {choferes.length === 0 ? '(asigna el rol Chofer en Personal)' : ''}</option>
                    {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                )}
                <input value={nuevo.vehiculo} onChange={e => setNuevo({ ...nuevo, vehiculo: e.target.value })} placeholder={nuevo.tipoEnvio === 'pagado' ? 'Mensajería / quién lleva' : 'Camión (ej. Daihatsu blanco)'} className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm min-w-[140px]" />
              </div>
              <button onClick={crearViaje} className="w-full bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-black uppercase py-2.5 rounded-card">Crear viaje</button>
            </div>
          )}

          {/* Horas de choferes del día */}
          {horasChofer.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">⏱ Jornada de choferes · {formatFechaCorta(fecha)} (extras sobre 8h)</div>
              {horasChofer.map(({ v, horasTot, extras }) => (
                <div key={v.id} className="flex items-center justify-between text-xs border-t border-zinc-800 py-1.5">
                  <span className="font-bold">{v.choferNombre}</span>
                  <span className="text-zinc-400">{hora(v.horaInicio)} → {hora(v.horaFin)}</span>
                  <span className="text-zinc-300 font-variant-numeric tabular-nums">{horasTot != null ? horasTot.toFixed(1) + ' h' : 'en curso'}</span>
                  <span className={`font-bold ${extras > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>{extras != null ? (extras > 0 ? `+${extras.toFixed(1)} h extra` : 'sin extras') : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
