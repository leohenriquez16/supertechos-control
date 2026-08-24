'use client';

// v8.35.3: Inspecciones mensuales del vehículo — captura guiada de 6 fotos fijas,
// autorización remota (solo Jhonathan), historial y comparación por AI.

import React, { useState, useEffect } from 'react';
import { Loader2, X, Camera, Check, Sparkles, ShieldCheck, History, AlertTriangle, ChevronLeft } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagenABlob } from '../../lib/imports';

const ANGULOS = db.ANGULOS_INSPECCION; // [{ k, label }]
const ESTADOS = [
  { k: 'bueno', label: 'Bueno', c: 'bg-green-900/30 text-green-400 border-green-800' },
  { k: 'regular', label: 'Regular', c: 'bg-amber-900/30 text-amber-300 border-amber-700' },
  { k: 'malo', label: 'Malo', c: 'bg-red-900/40 text-red-300 border-red-700' },
];
const fmt = (iso) => { try { return new Date(iso + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return iso; } };

export default function ModalInspecciones({ vehiculo, usuario, onCerrar }) {
  const [tab, setTab] = useState('historial'); // historial | nueva | comparar
  const [inspecciones, setInspecciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autorizacion, setAutorizacion] = useState(null);

  const esInspector = !!usuario?.inspeccionesHabilitada; // Jhonathan
  const soyChoferAutorizado = !!autorizacion && (autorizacion.autorizado_a_id === usuario?.id);
  const puedeCapturar = esInspector || soyChoferAutorizado;
  const nombre = `${vehiculo.marca || ''} ${vehiculo.modelo || ''}`.trim() || vehiculo.placa || 'Vehículo';

  const cargar = async () => {
    setLoading(true);
    try {
      setInspecciones(await db.listarInspecciones(vehiculo.id));
      const auths = await db.listarAutorizacionesInspeccion({ vehiculoId: vehiculo.id });
      setAutorizacion(auths[0] || null);
    } catch (e) { console.warn('cargar inspecciones:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [vehiculo.id]); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-3xl h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <div className="min-w-0">
            <div className="text-sm font-black text-white flex items-center gap-2"><Camera className="w-4 h-4 text-red-500" /> Inspecciones · {nombre}</div>
            <div className="text-[11px] text-zinc-500">{esInspector ? 'Inspector de oficina (Jhonathan)' : soyChoferAutorizado ? 'Inspección autorizada para ti' : 'Solo lectura'}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-zinc-800 bg-zinc-950/50">
          <TabBtn activo={tab === 'historial'} onClick={() => setTab('historial')} icon={<History className="w-3.5 h-3.5" />}>Historial {inspecciones.length > 0 && `(${inspecciones.length})`}</TabBtn>
          {puedeCapturar && <TabBtn activo={tab === 'nueva'} onClick={() => setTab('nueva')} icon={<Camera className="w-3.5 h-3.5" />}>Nueva inspección</TabBtn>}
          {inspecciones.length >= 2 && <TabBtn activo={tab === 'comparar'} onClick={() => setTab('comparar')} icon={<Sparkles className="w-3.5 h-3.5" />}>Comparar (AI)</TabBtn>}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
          ) : tab === 'nueva' && puedeCapturar ? (
            <CapturaInspeccion vehiculo={vehiculo} usuario={usuario} autorizacion={soyChoferAutorizado ? autorizacion : null}
              onListo={() => { setTab('historial'); cargar(); }} />
          ) : tab === 'comparar' ? (
            <CompararAI inspecciones={inspecciones} />
          ) : (
            <Historial inspecciones={inspecciones} esInspector={esInspector} autorizacion={autorizacion} vehiculo={vehiculo} usuario={usuario} onCambio={cargar} onNueva={() => setTab('nueva')} puedeCapturar={puedeCapturar} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ activo, onClick, icon, children }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-card text-xs font-bold ${activo ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>{icon}{children}</button>
  );
}

// ---- Historial + autorización ----
function Historial({ inspecciones, esInspector, autorizacion, vehiculo, usuario, onCambio, onNueva, puedeCapturar }) {
  const [autorizando, setAutorizando] = useState(false);
  const choferId = vehiculo.responsableId || '';

  const autorizarRemota = async () => {
    if (!choferId) { toast.warning('El vehículo no tiene chofer/responsable asignado. Asígnalo primero en la ficha.'); return; }
    setAutorizando(true);
    try {
      await db.autorizarInspeccionRemota({
        vehiculoId: vehiculo.id, autorizadoAId: choferId,
        autorizadaPorId: usuario?.id, autorizadaPorNombre: usuario?.nombre,
      });
      toast.success('Inspección remota autorizada al chofer.');
      onCambio();
    } catch (e) { toast.error('Error: ' + (e?.message || e)); }
    setAutorizando(false);
  };
  const revocar = async () => {
    try { await db.revocarAutorizacionInspeccion(autorizacion.id); toast.success('Autorización revocada.'); onCambio(); }
    catch (e) { toast.error('Error: ' + (e?.message || e)); }
  };

  return (
    <div className="space-y-3">
      {esInspector && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-zinc-400 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> ¿El vehículo no puede ir a la oficina? Autoriza al chofer a hacerla desde su teléfono.</div>
          {autorizacion
            ? <div className="flex items-center gap-2"><span className="text-[11px] text-emerald-400 font-bold">Autorizada a {autorizacion.autorizado_a_nombre || 'chofer'}</span><button onClick={revocar} className="text-[11px] text-zinc-400 hover:text-red-400 underline">revocar</button></div>
            : <button onClick={autorizarRemota} disabled={autorizando} className="bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-card flex items-center gap-1">{autorizando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Autorizar inspección remota</button>}
        </div>
      )}
      {puedeCapturar && <button onClick={onNueva} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wider py-2.5 rounded-card flex items-center justify-center gap-2 text-sm"><Camera className="w-4 h-4" /> Nueva inspección</button>}

      {inspecciones.length === 0 ? (
        <div className="text-center text-zinc-500 text-sm py-8">Sin inspecciones todavía.</div>
      ) : (
        <div className="space-y-2">
          {inspecciones.map((ins) => <FilaInspeccion key={ins.id} ins={ins} />)}
        </div>
      )}
    </div>
  );
}

function FilaInspeccion({ ins }) {
  const [abierto, setAbierto] = useState(false);
  const [urls, setUrls] = useState(null);
  const est = ESTADOS.find((e) => e.k === ins.estadoGeneral);
  const abrir = async () => {
    if (!abierto && !urls) {
      const arr = await Promise.all((ins.fotos || []).map(async (f) => ({ angulo: f.angulo, url: await db.obtenerUrlFotoInspeccion(f.path).catch(() => null) })));
      setUrls(arr.filter((x) => x.url));
    }
    setAbierto((v) => !v);
  };
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-card overflow-hidden">
      <button onClick={abrir} className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-800/40">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white">{fmt(ins.fecha)} {est && <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full border ${est.c}`}>{est.label}</span>}</div>
          <div className="text-[11px] text-zinc-500">{ins.realizadaPorNombre || '—'} · {ins.tipo === 'remota_autorizada' ? 'remota autorizada' : 'oficina'}{ins.odometroKm != null ? ` · ${ins.odometroKm.toLocaleString()} km` : ''} · {(ins.fotos || []).length}/6 fotos</div>
        </div>
        <span className="text-zinc-500 text-xs">{abierto ? 'ocultar' : 'ver fotos'}</span>
      </button>
      {abierto && (
        <div className="p-3 pt-0">
          {ins.notas && <div className="text-[11px] text-zinc-400 mb-2 whitespace-pre-wrap">📝 {ins.notas}</div>}
          <div className="grid grid-cols-3 gap-1.5">
            {(urls || []).map((u, i) => (
              <a key={i} href={u.url} target="_blank" rel="noreferrer" className="block">
                <img src={u.url} alt={u.angulo} className="w-full h-20 object-cover rounded border border-zinc-800" />
                <div className="text-[9px] text-zinc-500 text-center mt-0.5 capitalize">{(ANGULOS.find((a) => a.k === u.angulo)?.label) || u.angulo}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Captura guiada de las 6 fotos ----
function CapturaInspeccion({ vehiculo, usuario, autorizacion, onListo }) {
  const [fotos, setFotos] = useState({}); // angulo -> { blob, preview }
  const [odometro, setOdometro] = useState('');
  const [estado, setEstado] = useState('bueno');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const capturar = async (angulo, file) => {
    if (!file) return;
    try {
      const blob = (file.type || '').startsWith('image/') ? await comprimirImagenABlob(file, 1600, 0.7) : file;
      const preview = URL.createObjectURL(blob);
      setFotos((f) => ({ ...f, [angulo]: { blob, preview } }));
    } catch (e) { toast.error('Error con la foto: ' + (e?.message || e)); }
  };
  const faltan = ANGULOS.filter((a) => !fotos[a.k]);

  const guardar = async () => {
    if (faltan.length) { toast.warning(`Faltan fotos: ${faltan.map((a) => a.label).join(', ')}`); return; }
    setGuardando(true);
    try {
      const ins = await db.crearInspeccion({
        vehiculoId: vehiculo.id, realizadaPorId: usuario?.id, realizadaPorNombre: usuario?.nombre,
        tipo: autorizacion ? 'remota_autorizada' : 'oficina',
        autorizadaPorId: autorizacion?.autorizada_por_id || null, autorizadaPorNombre: autorizacion?.autorizada_por_nombre || null,
        odometroKm: odometro, estadoGeneral: estado, notas,
      });
      for (const a of ANGULOS) {
        await db.subirFotoInspeccion({ file: fotos[a.k].blob, inspeccionId: ins.id, angulo: a.k });
      }
      if (autorizacion) { try { await db.marcarAutorizacionUsada(autorizacion.id, ins.id); } catch {} }
      toast.success('Inspección guardada.');
      onListo();
    } catch (e) { toast.error('Error guardando: ' + (e?.message || e)); setGuardando(false); }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-400">Toma las <b>6 fotos</b> desde los mismos ángulos de siempre. Todas son obligatorias.</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ANGULOS.map((a, i) => {
          const f = fotos[a.k];
          return (
            <label key={a.k} className={`relative block rounded-card border-2 overflow-hidden cursor-pointer aspect-[4/3] ${f ? 'border-emerald-600' : 'border-dashed border-zinc-700 hover:border-red-600'}`}>
              {f ? (
                <>
                  <img src={f.preview} alt={a.label} className="w-full h-full object-cover" />
                  <div className="absolute top-1 right-1 bg-emerald-600 rounded-full p-0.5"><Check className="w-3 h-3 text-white" /></div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-1">
                  <Camera className="w-6 h-6" />
                  <span className="text-[10px] font-bold text-center px-1">{i + 1}. {a.label}</span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] font-bold text-center py-0.5">{a.label}{f ? ' · retomar' : ''}</div>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => capturar(a.k, e.target.files?.[0])} />
            </label>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Odómetro (km)</div>
          <input type="number" value={odometro} onChange={(e) => setOdometro(e.target.value)} placeholder="85000" className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none rounded-card px-3 py-2 text-white text-sm" />
        </div>
        <div>
          <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Estado general</div>
          <div className="flex gap-1">
            {ESTADOS.map((e) => (
              <button key={e.k} onClick={() => setEstado(e.k)} className={`flex-1 text-[11px] font-bold py-2 rounded-card border ${estado === e.k ? e.c : 'border-zinc-800 text-zinc-500 hover:text-white'}`}>{e.label}</button>
            ))}
          </div>
        </div>
      </div>
      <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Notas / observaciones (opcional)…" className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none rounded-card px-3 py-2 text-white text-sm resize-y" />

      <button onClick={guardar} disabled={guardando || faltan.length > 0} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider py-2.5 rounded-card flex items-center justify-center gap-2 text-sm">
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {faltan.length ? `Faltan ${faltan.length} foto(s)` : 'Guardar inspección'}
      </button>
    </div>
  );
}

// ---- Comparación por AI ----
function CompararAI({ inspecciones }) {
  const [idxA, setIdxA] = useState(1); // anterior (más vieja de las 2 recientes)
  const [idxB, setIdxB] = useState(0); // actual (más reciente)
  const [cargando, setCargando] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);

  const comparar = async () => {
    setCargando(true); setRes(null); setError(null);
    try {
      const build = async (ins) => ({
        fecha: ins.fecha, odometroKm: ins.odometroKm,
        fotos: (await Promise.all((ins.fotos || []).map(async (f) => ({ angulo: f.angulo, url: await db.obtenerUrlFotoInspeccion(f.path).catch(() => null) })))).filter((x) => x.url),
      });
      const anterior = await build(inspecciones[idxA]);
      const actual = await build(inspecciones[idxB]);
      const r = await fetch('/api/vehiculos/comparar-inspecciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anterior, actual }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Error comparando');
      setRes(j.resultado);
    } catch (e) { setError(e?.message || String(e)); }
    setCargando(false);
  };

  const sevColor = (s) => s === 'grave' ? 'text-red-400 border-red-700 bg-red-900/30' : s === 'moderado' ? 'text-amber-300 border-amber-700 bg-amber-900/30' : 'text-zinc-300 border-zinc-700 bg-zinc-800/50';

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-400">La AI compara dos inspecciones y detecta daños nuevos, limpieza y kilometraje.</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Anterior</div>
          <select value={idxA} onChange={(e) => setIdxA(Number(e.target.value))} className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-card px-2 py-2 text-white text-sm">
            {inspecciones.map((ins, i) => <option key={ins.id} value={i}>{fmt(ins.fecha)}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Actual</div>
          <select value={idxB} onChange={(e) => setIdxB(Number(e.target.value))} className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-card px-2 py-2 text-white text-sm">
            {inspecciones.map((ins, i) => <option key={ins.id} value={i}>{fmt(ins.fecha)}</option>)}
          </select>
        </div>
      </div>
      <button onClick={comparar} disabled={cargando || idxA === idxB} className="w-full bg-purple-700 hover:bg-purple-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider py-2.5 rounded-card flex items-center justify-center gap-2 text-sm">
        {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {cargando ? 'Analizando fotos…' : 'Comparar con AI'}
      </button>

      {error && <div className="bg-red-900/20 border border-red-700 rounded-card text-red-300 p-3 text-sm flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" /> {error}</div>}
      {res && (
        <div className="space-y-2">
          <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
            <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Resumen</div>
            <div className="text-sm text-white">{res.resumen || '—'}</div>
            {res.km_recorridos != null && <div className="text-[11px] text-zinc-400 mt-1">Kilómetros recorridos: <b>{Number(res.km_recorridos).toLocaleString()} km</b></div>}
          </div>
          {res.sin_cambios ? (
            <div className="bg-green-900/20 border border-green-800 rounded-card text-green-400 p-3 text-sm flex items-center gap-2"><Check className="w-4 h-4" /> Sin cambios relevantes entre las dos inspecciones.</div>
          ) : (
            <div className="space-y-1.5">
              {(res.diferencias || []).map((d, i) => (
                <div key={i} className={`rounded-card border p-2.5 text-sm ${sevColor(d.severidad)}`}>
                  <span className="text-[10px] uppercase font-black mr-2">{d.angulo}</span>{d.cambio}
                  <span className="text-[9px] uppercase ml-2 opacity-70">({d.severidad})</span>
                </div>
              ))}
            </div>
          )}
          {(res.recomendaciones || []).length > 0 && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Recomendaciones</div>
              <ul className="list-disc list-inside text-sm text-zinc-300 space-y-0.5">{res.recomendaciones.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          <div className="text-[10px] text-zinc-600">Análisis por IA — revisa siempre las fotos. No sustituye la inspección física.</div>
        </div>
      )}
    </div>
  );
}
