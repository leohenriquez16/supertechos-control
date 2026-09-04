'use client';

// v8.50.0 — PEAJES (Paso Rápido) dentro del módulo de Vehículos.
//
// Se sube el .xlsx tal como lo bota el portal. El import no rechaza nada: todo
// pase entra. Lo que sí hace es OBLIGAR a identificar: cada tag sin vehículo
// queda en rojo arriba hasta que se resuelve (asignar / crear / fuera de flota).
// Sin esa disciplina el total del ERP nunca cuadra con el de la cuenta.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, Loader2, AlertTriangle, Check, X, Car, Link2, Ban,
  TrendingUp, TrendingDown, Calendar, Receipt,
} from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { leerArchivo } from '../../lib/imports';

const rd = (n) => `RD$${Math.round(Number(n) || 0).toLocaleString('es-DO')}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesCorto = (m) => { const [a, x] = String(m).split('-'); return `${MESES[Number(x) - 1]} ${a.slice(2)}`; };
const normPlaca = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export default function VistaPeajes({ usuario, data, onRecargar }) {
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [tags, setTags] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [consumoMes, setConsumoMes] = useState({});
  const [mesSel, setMesSel] = useState(null);
  const [resolver, setResolver] = useState(null); // tag que se está identificando
  const [ultimoImport, setUltimoImport] = useState(null);

  const vehiculos = data?.vehiculos || [];

  const cargar = useCallback(async (mes = null) => {
    setCargando(true);
    try {
      const [t, r, p] = await Promise.all([
        db.listarPeajeTags(), db.resumenPeajeMeses(), db.listarPeajePeriodos(),
      ]);
      setTags(t); setResumen(r); setPeriodos(p);
      const m = mes || r[0]?.mes || null;
      setMesSel(m);
      if (m) setConsumoMes(await db.consumoPeajeDelMes(m));
    } catch (e) {
      toast.error(e.message || 'No se pudo cargar el consumo de peajes');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarMes = async (m) => {
    setMesSel(m);
    setConsumoMes(await db.consumoPeajeDelMes(m));
  };

  // --- subir el archivo del portal ---
  const subir = async (file) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const { hojas } = await leerArchivo(file);
      const filas = hojas['Operaciones'] || Object.values(hojas)[0] || [];
      if (!filas.length) throw new Error('El archivo no tiene filas.');
      const res = await db.importarPeajes({ filas, archivo: file.name, usuario });
      setUltimoImport(res);
      toast.success(`${res.pases.toLocaleString()} pases importados · ${res.meses.length} mes(es)`);
      await cargar(res.meses[res.meses.length - 1]);
      onRecargar?.();
    } catch (e) {
      toast.error(e.message || 'No se pudo importar el archivo');
    } finally {
      setSubiendo(false);
    }
  };

  // --- pendientes: lo que obliga a actuar ---
  const pendientes = tags.filter(t => t.estado === 'pendiente');
  const resMes = resumen.find(r => r.mes === mesSel);

  // Conflicto de placa: el tag trae una placa que no está en el ERP, pero hay un
  // vehículo con la misma marca/modelo. Es la misma guagua con dos placas.
  const conflictos = useMemo(() => {
    const placasErp = new Set(vehiculos.map(v => normPlaca(v.placa)).filter(Boolean));
    return pendientes
      .map(t => {
        if (!t.placaPortal || placasErp.has(normPlaca(t.placaPortal))) return null;
        const cand = db.sugerirVehiculoParaTag(t, vehiculos);
        return cand.length ? { tag: t, candidato: cand[0] } : null;
      })
      .filter(Boolean);
  }, [pendientes, vehiculos]);

  const conflictoDe = (tag) => conflictos.find(c => c.tag.tag === tag)?.candidato || null;

  if (cargando) {
    return <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;
  }

  return (
    <div>
      {/* ---------- subir ---------- */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 mb-4 flex flex-wrap items-center gap-3">
        <label className={`inline-flex items-center gap-2 text-xs font-black uppercase px-4 py-2.5 cursor-pointer ${subiendo ? 'bg-zinc-700 text-zinc-400' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
          {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {subiendo ? 'Importando…' : 'Subir movimientos'}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={subiendo}
            onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <div className="text-[11px] text-zinc-500 leading-snug">
          El export de Paso Rápido tal como lo bajas del portal. Puede traer meses ya subidos:
          se reemplazan, no se duplican.
        </div>
      </div>

      {ultimoImport && (
        <div className="bg-emerald-950/40 border border-emerald-800 rounded-card p-3 mb-4 text-xs text-emerald-200 flex items-start gap-2">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <b>{ultimoImport.pases.toLocaleString()} pases</b> · {ultimoImport.meses.map(mesCorto).join(', ')} · {rd(ultimoImport.total)}
            {ultimoImport.autoasignados > 0 && <> · <b>{ultimoImport.autoasignados}</b> tag(s) enganchados solos por placa</>}
            {ultimoImport.tagsNuevos.length > 0 && <> · <b className="text-amber-300">{ultimoImport.tagsNuevos.length} tag(s) nuevos</b></>}
          </div>
          <button onClick={() => setUltimoImport(null)} className="ml-auto text-emerald-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ---------- pendientes: bloquea la vista hasta resolver ---------- */}
      {pendientes.length > 0 && (
        <div className="bg-red-950/50 border-2 border-red-700 rounded-card p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <div className="text-sm font-black text-red-300">
              {pendientes.length} tag{pendientes.length > 1 ? 's' : ''} sin identificar
            </div>
          </div>
          <div className="text-[11px] text-red-200/80 mb-3">
            Mientras estén aquí, su consumo no aparece en ninguna ficha de vehículo y el total no cuadra.
            Cada uno hay que resolverlo: asignarlo a un vehículo, crearlo, o marcarlo fuera de flota.
          </div>
          <div className="grid gap-2">
            {pendientes.map(t => {
              const cand = conflictoDe(t.tag);
              return (
                <div key={t.tag} className="bg-zinc-900/80 border border-red-900 rounded-card p-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{t.nombrePortal || `Tag ${t.tag}`}</div>
                    <div className="text-[11px] text-zinc-500">
                      Tag {t.tag}{t.placaPortal ? ` · placa ${t.placaPortal} (según el portal)` : ' · sin placa en el portal'}
                    </div>
                    {cand && (
                      <div className="text-[11px] text-amber-300 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Puede ser <b>{cand.marca} {cand.modelo}</b>, que en el ERP tiene placa <b>{cand.placa || 'vacía'}</b>. Hay que unificar.
                      </div>
                    )}
                  </div>
                  <button onClick={() => setResolver(t)}
                    className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase px-3 py-2 rounded-card shrink-0">
                    Identificar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- cuadre del mes ---------- */}
      {resMes && (
        <div className="grid gap-3 sm:grid-cols-3 mb-4">
          <Tile titulo="Total del mes" valor={rd(resMes.total)} pie={`${resMes.pases.toLocaleString()} pases · ${resMes.tags} tags`} />
          <Tile titulo="Asignado a vehículos" valor={rd(resMes.asignado)}
            pie={`${resMes.total ? Math.round(resMes.asignado / resMes.total * 100) : 0}% del total`} ok />
          <Tile titulo="Sin vehículo" valor={rd(resMes.sinAsignar)}
            pie={`${resMes.tagsSinVehiculo} tag(s) sin identificar`} alerta={resMes.sinAsignar > 0} />
        </div>
      )}

      {/* ---------- selector de mes ---------- */}
      {resumen.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {resumen.slice(0, 14).map(r => (
            <button key={r.mes} onClick={() => cambiarMes(r.mes)}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-card whitespace-nowrap ${r.mes === mesSel ? 'bg-red-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'}`}>
              {mesCorto(r.mes)}
            </button>
          ))}
        </div>
      )}

      {/* ---------- consumo por vehículo ---------- */}
      <TablaConsumo mesSel={mesSel} tags={tags} vehiculos={vehiculos} consumoMes={consumoMes}
        onResolver={setResolver} />

      {/* ---------- historial de subidas ---------- */}
      {periodos.length > 0 && (
        <div className="mt-6">
          <div className="text-[11px] font-black uppercase text-zinc-500 mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Archivos subidos
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-card divide-y divide-zinc-800">
            {periodos.slice(0, 6).map(p => (
              <div key={p.id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-[11px]">
                <b className="text-zinc-300 w-16">{mesCorto(p.mes)}</b>
                <span className="text-zinc-500">{p.filas} pases · {rd(p.total)}</span>
                <span className="text-zinc-600 truncate">{p.archivo}</span>
                {p.subido_por && <span className="text-zinc-600 ml-auto">subió {p.subido_por}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {resolver && (
        <ModalIdentificar
          tagInfo={resolver}
          vehiculos={vehiculos}
          sugerido={conflictoDe(resolver.tag)}
          usuario={usuario}
          onCerrar={() => setResolver(null)}
          onListo={async () => { setResolver(null); await cargar(mesSel); onRecargar?.(); }}
        />
      )}
    </div>
  );
}

function Tile({ titulo, valor, pie, ok, alerta }) {
  return (
    <div className={`rounded-card p-3 border ${alerta ? 'bg-amber-950/30 border-amber-800' : 'bg-zinc-900 border-zinc-800'}`}>
      <div className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{titulo}</div>
      <div className={`text-2xl font-black mt-0.5 ${alerta ? 'text-amber-300' : ok ? 'text-emerald-400' : 'text-white'}`}>{valor}</div>
      <div className="text-[11px] text-zinc-500">{pie}</div>
    </div>
  );
}

// Consumo del mes por tag, con el vehículo al que está enganchado.
function TablaConsumo({ mesSel, tags, vehiculos, consumoMes, onResolver }) {
  const [pases, setPases] = useState(null); // tag cuyo detalle se está viendo

  const filas = tags.map(t => {
    const v = t.vehiculoId ? vehiculos.find(x => x.id === t.vehiculoId) : null;
    const c = t.vehiculoId ? consumoMes[t.vehiculoId] : null;
    return { ...t, veh: v, monto: c?.monto || 0, pases: c?.pases || 0 };
  }).sort((a, b) => b.monto - a.monto);

  const conConsumo = filas.filter(f => f.monto > 0 || f.estado === 'pendiente');
  if (!conConsumo.length) {
    return (
      <div className="py-12 text-center text-zinc-600">
        <Receipt className="w-9 h-9 mx-auto mb-2 opacity-40" />
        <div className="text-sm">Todavía no hay movimientos. Sube el archivo de Paso Rápido para empezar.</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-zinc-950/60 text-zinc-500">
              <th className="text-left font-black uppercase text-[10px] px-3 py-2">Vehículo</th>
              <th className="text-left font-black uppercase text-[10px] px-3 py-2">Tag</th>
              <th className="text-right font-black uppercase text-[10px] px-3 py-2">Pases</th>
              <th className="text-right font-black uppercase text-[10px] px-3 py-2">Consumo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {conConsumo.map(f => (
              <tr key={f.tag} className={f.estado === 'pendiente' ? 'bg-red-950/20' : ''}>
                <td className="px-3 py-2">
                  {f.veh ? (
                    <>
                      <div className="font-bold text-zinc-200">{f.veh.marca} {f.veh.modelo}</div>
                      <div className="text-[10px] text-zinc-500">{f.veh.placa || 'sin placa'}</div>
                    </>
                  ) : f.estado === 'fuera_flota' ? (
                    <>
                      <div className="text-zinc-400">{f.nombrePortal || `Tag ${f.tag}`}</div>
                      <div className="text-[10px] text-zinc-600 flex items-center gap-1"><Ban className="w-3 h-3" /> Fuera de flota</div>
                    </>
                  ) : (
                    <>
                      <div className="text-red-300 font-bold">{f.nombrePortal || `Tag ${f.tag}`}</div>
                      <div className="text-[10px] text-red-400">Sin identificar</div>
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-500 tabular-nums">{f.tag}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{f.pases || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{f.monto ? rd(f.monto) : '—'}</td>
                <td className="px-3 py-2 text-right">
                  {f.estado === 'pendiente'
                    ? <button onClick={() => onResolver(f)} className="text-[10px] font-black uppercase text-red-400 hover:text-red-300">Identificar</button>
                    : <button onClick={() => setPases(pases === f.tag ? null : f.tag)} className="text-[10px] text-zinc-500 hover:text-white">Ver pases</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pases && <DetallePases tag={pases} mes={mesSel} onCerrar={() => setPases(null)} />}
    </div>
  );
}

function DetallePases({ tag, mes, onCerrar }) {
  const [filas, setFilas] = useState(null);
  useEffect(() => {
    let vivo = true;
    db.pasesPeajeTag(tag, 300).then(r => { if (vivo) setFilas(r.filter(x => !mes || x.mes === mes)); })
      .catch(() => setFilas([]));
    return () => { vivo = false; };
  }, [tag, mes]);

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-black uppercase text-zinc-500">Pases del tag {tag}</div>
        <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
      </div>
      {filas === null ? <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
        : filas.length === 0 ? <div className="text-[11px] text-zinc-600">Sin pases en este mes.</div>
        : (
          <div className="max-h-64 overflow-y-auto grid gap-1">
            {filas.map(f => {
              const d = new Date(f.fecha);
              const finde = [0, 6].includes(d.getDay());
              const noche = d.getHours() < 6 || d.getHours() >= 20;
              return (
                <div key={f.id} className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="tabular-nums text-zinc-500 w-24">{d.toLocaleDateString('es-DO')}</span>
                  <span className="tabular-nums text-zinc-600 w-12">{d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="flex-1 truncate">{f.caseta}</span>
                  {finde && <span className="text-[9px] font-bold text-amber-400">FINDE</span>}
                  {noche && <span className="text-[9px] font-bold text-sky-400">NOCHE</span>}
                  <span className="tabular-nums font-bold text-zinc-300">{rd(f.monto)}</span>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ------------------------------------------------------------
// Identificar un tag. Tres salidas, ninguna es "después".
// ------------------------------------------------------------
function ModalIdentificar({ tagInfo, vehiculos, sugerido, usuario, onCerrar, onListo }) {
  const [modo, setModo] = useState(sugerido ? 'unificar' : 'asignar');
  const [vehiculoId, setVehiculoId] = useState(sugerido?.id || '');
  const [placaFinal, setPlacaFinal] = useState(tagInfo.placaPortal || '');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const veh = vehiculos.find(v => v.id === vehiculoId);

  const guardar = async () => {
    setGuardando(true);
    try {
      if (modo === 'fuera') {
        await db.marcarTagFueraDeFlota(tagInfo.tag, nota, usuario);
        toast.success('Marcado fuera de flota');
      } else if (modo === 'unificar') {
        if (!vehiculoId) throw new Error('Elige el vehículo.');
        if (!placaFinal.trim()) throw new Error('Falta la placa que se queda.');
        await db.unificarPlacaVehiculo({ tag: tagInfo.tag, vehiculoId, placaFinal: placaFinal.trim().toUpperCase(), usuario });
        toast.success('Placa unificada y tag enganchado');
      } else {
        if (!vehiculoId) throw new Error('Elige el vehículo.');
        await db.asignarTagAVehiculo(tagInfo.tag, vehiculoId, usuario);
        toast.success('Tag asignado');
      }
      onListo();
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-black">{tagInfo.nombrePortal || `Tag ${tagInfo.tag}`}</div>
            <div className="text-[11px] text-zinc-500">
              Tag {tagInfo.tag}{tagInfo.placaPortal ? ` · el portal dice placa ${tagInfo.placaPortal}` : ''}
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 grid gap-3">
          {sugerido && (
            <Opcion activo={modo === 'unificar'} onClick={() => { setModo('unificar'); setVehiculoId(sugerido.id); }}
              icono={<Link2 className="w-4 h-4" />} titulo="Es un vehículo del ERP con otra placa"
              sub={`${sugerido.marca} ${sugerido.modelo} — en el ERP tiene ${sugerido.placa || 'la placa vacía'}`}>
              <div className="text-[11px] text-zinc-400 mb-2">
                Las dos placas no pueden quedarse. Elige la correcta: se graba en el ERP y la otra hay que
                corregirla en el portal de Paso Rápido.
              </div>
              <div className="flex flex-wrap gap-2">
                {[tagInfo.placaPortal, sugerido.placa].filter(Boolean).map(p => (
                  <button key={p} type="button" onClick={() => setPlacaFinal(p)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-card border ${normPlaca(placaFinal) === normPlaca(p) ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-950 border-zinc-700 text-zinc-300'}`}>
                    {p}
                    <span className="block text-[9px] font-normal opacity-70">
                      {p === tagInfo.placaPortal ? 'la del portal' : 'la del ERP'}
                    </span>
                  </button>
                ))}
              </div>
            </Opcion>
          )}

          <Opcion activo={modo === 'asignar'} onClick={() => setModo('asignar')}
            icono={<Car className="w-4 h-4" />} titulo="Asignar a un vehículo del ERP"
            sub="Su consumo pasa a la ficha, incluido el historial de meses anteriores">
            <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-3 py-2 text-sm">
              <option value="">— elegir vehículo —</option>
              {vehiculos.map(v => (
                <option key={v.id} value={v.id} disabled={!!v.tagPeaje && v.tagPeaje !== tagInfo.tag}>
                  {v.marca} {v.modelo} {v.placa ? `· ${v.placa}` : ''}{v.tagPeaje && v.tagPeaje !== tagInfo.tag ? ' (ya tiene tag)' : ''}
                </option>
              ))}
            </select>
            {veh && modo === 'asignar' && normPlaca(veh.placa) !== normPlaca(tagInfo.placaPortal) && tagInfo.placaPortal && (
              <div className="text-[11px] text-amber-300 mt-2 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                Ojo: ese vehículo tiene placa <b>{veh.placa || 'vacía'}</b> y el tag dice <b>{tagInfo.placaPortal}</b>.
                Si es el mismo, usa la opción de unificar para que quede una sola placa.
              </div>
            )}
          </Opcion>

          <Opcion activo={modo === 'fuera'} onClick={() => setModo('fuera')}
            icono={<Ban className="w-4 h-4" />} titulo="No es un vehículo de la flota"
            sub="Deja de pedir identificación, pero sigue sumando al total de la cuenta">
            <input value={nota} onChange={e => setNota(e.target.value)} maxLength={120}
              placeholder="¿Por qué? Ej: vehículo particular de la familia"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-3 py-2 text-sm" />
          </Opcion>
        </div>

        <div className="p-4 border-t border-zinc-800 flex justify-end gap-2">
          <button onClick={onCerrar} className="text-xs font-bold text-zinc-400 hover:text-white px-4 py-2.5">Cancelar</button>
          <button onClick={guardar} disabled={guardando}
            className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white text-xs font-black uppercase px-5 py-2.5 flex items-center gap-1.5">
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Opcion({ activo, onClick, icono, titulo, sub, children }) {
  return (
    <div onClick={onClick}
      className={`rounded-card border p-3 cursor-pointer ${activo ? 'bg-zinc-950 border-red-600' : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'}`}>
      <div className="flex items-start gap-2">
        <div className={activo ? 'text-red-400' : 'text-zinc-500'}>{icono}</div>
        <div className="min-w-0">
          <div className={`text-sm font-bold ${activo ? 'text-white' : 'text-zinc-300'}`}>{titulo}</div>
          <div className="text-[11px] text-zinc-500">{sub}</div>
        </div>
      </div>
      {activo && <div className="mt-3">{children}</div>}
    </div>
  );
}
