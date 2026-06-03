'use client';

// v8.19.82: [Levantamientos · Fase 3] marcado de puntos singulares sobre la foto.
// Click en la foto → coloca un pin (tipo activo). Leyenda con conteo + estimación
// automática de materiales adicionales. Aditivo (modal independiente).

import React, { useEffect, useState } from 'react';
import { X, Loader2, Trash2, MapPin } from 'lucide-react';
import {
  listarVisitasDeSite, listarFotosVisita, getSignedUrlFotoSurvey,
  PUNTOS_SINGULARES, listarPuntosSingulares, crearPuntoSingular, actualizarPuntoSingular, eliminarPuntoSingular, estimarMaterialesPuntos,
} from '../../lib/surveys';

const TIPOS = Object.entries(PUNTOS_SINGULARES); // [key, {label,icon,color}]

export default function PuntosSingulares({ site, onCerrar }) {
  const [loading, setLoading] = useState(true);
  const [fotos, setFotos] = useState([]);       // [{id, url}]
  const [fotoSel, setFotoSel] = useState(null);
  const [visitId, setVisitId] = useState(null);
  const [puntos, setPuntos] = useState([]);
  const [tipoActivo, setTipoActivo] = useState('bache');
  const [selPunto, setSelPunto] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const visits = await listarVisitasDeSite(site.id);
        const v = visits[visits.length - 1] || visits[0];
        if (!v) { if (!cancel) { setFotos([]); setLoading(false); } return; }
        if (cancel) return;
        setVisitId(v.id);
        const [fs, ps] = await Promise.all([listarFotosVisita(v.id), listarPuntosSingulares(v.id)]);
        const conUrl = await Promise.all((fs || []).map(async f => ({ id: f.id, url: await getSignedUrlFotoSurvey(f.storage_path) })));
        if (cancel) return;
        setFotos(conUrl.filter(f => f.url));
        setFotoSel(conUrl.find(f => f.url)?.id || null);
        setPuntos(ps);
      } catch (e) { console.warn('PuntosSingulares:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [site.id]);

  const puntosFoto = puntos.filter(p => p.photo_id === fotoSel);

  const agregarPin = async (e) => {
    if (!fotoSel || !visitId || guardando) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setGuardando(true);
    try {
      const nuevo = await crearPuntoSingular({ visitId, photoId: fotoSel, tipo: tipoActivo, xRelativa: x, yRelativa: y });
      setPuntos(prev => [...prev, nuevo]);
      setSelPunto(nuevo);
    } catch (err) { alert('Error: ' + (err.message || err)); }
    setGuardando(false);
  };

  const editar = async (id, campos) => {
    setPuntos(prev => prev.map(p => p.id === id ? { ...p, ...mapEdit(campos) } : p));
    setSelPunto(prev => prev && prev.id === id ? { ...prev, ...mapEdit(campos) } : prev);
    try { await actualizarPuntoSingular(id, campos); } catch (e) { console.warn(e?.message); }
  };
  const borrar = async (id) => {
    setPuntos(prev => prev.filter(p => p.id !== id)); setSelPunto(null);
    try { await eliminarPuntoSingular(id); } catch (e) { console.warn(e?.message); }
  };

  const conteo = {};
  for (const p of puntos) conteo[p.tipo] = (conteo[p.tipo] || 0) + (Number(p.cantidad) || 1);
  const materiales = estimarMaterialesPuntos(puntos);

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] overflow-y-auto" onClick={onCerrar}>
      <div className="min-h-full p-2 sm:p-4">
        <div className="bg-zinc-950 border-2 border-red-600 rounded-card max-w-4xl mx-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 bg-zinc-950 border-b-2 border-red-600 px-4 py-3 flex items-center justify-between z-10">
            <div className="font-black text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-red-500" /> Puntos singulares — {site.name}</div>
            <button onClick={onCerrar} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500 py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
          ) : fotos.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">Este levantamiento aún no tiene fotos. Sube fotos en la captura para poder marcar puntos singulares sobre ellas.</div>
          ) : (
            <div className="p-4 space-y-3">
              {/* Paleta de tipos */}
              <div className="flex flex-wrap gap-1">
                {TIPOS.map(([k, t]) => (
                  <button key={k} onClick={() => setTipoActivo(k)} className="px-2 py-1 text-[11px] rounded-card border font-bold"
                    style={tipoActivo === k ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' } : { borderColor: '#3f3f46', color: '#a1a1aa' }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500">Toca la foto para colocar un <b style={{ color: PUNTOS_SINGULARES[tipoActivo].color }}>{PUNTOS_SINGULARES[tipoActivo].label}</b>. Toca un pin para editarlo.</div>

              {/* Selector de fotos */}
              {fotos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {fotos.map(f => (
                    <button key={f.id} onClick={() => { setFotoSel(f.id); setSelPunto(null); }} className={`w-16 h-16 rounded-card overflow-hidden border-2 flex-shrink-0 ${fotoSel === f.id ? 'border-red-600' : 'border-zinc-800'}`}>
                      <img src={f.url} className="w-full h-full object-cover" alt="" />
                    </button>
                  ))}
                </div>
              )}

              {/* Foto con pins */}
              <div className="relative select-none rounded-card overflow-hidden border border-zinc-800" style={{ cursor: 'crosshair' }} onClick={agregarPin}>
                <img src={fotos.find(f => f.id === fotoSel)?.url} className="w-full block" alt="" draggable={false} />
                {puntosFoto.map(p => {
                  const t = PUNTOS_SINGULARES[p.tipo] || {};
                  return (
                    <button key={p.id} onClick={(e) => { e.stopPropagation(); setSelPunto(p); }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white text-[11px] flex items-center justify-center shadow"
                      style={{ left: `${(p.x_relativa || 0) * 100}%`, top: `${(p.y_relativa || 0) * 100}%`, backgroundColor: t.color || '#666' }}
                      title={t.label}>
                      {t.icon}
                    </button>
                  );
                })}
              </div>

              {/* Leyenda + materiales */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Leyenda ({puntos.length})</div>
                  {Object.keys(conteo).length === 0 ? <div className="text-xs text-zinc-600">Sin puntos aún.</div> :
                    <div className="space-y-1">{Object.entries(conteo).map(([k, n]) => (
                      <div key={k} className="flex items-center justify-between text-xs"><span>{PUNTOS_SINGULARES[k]?.icon} {PUNTOS_SINGULARES[k]?.label || k}</span><span className="font-bold tabular-nums">{n}</span></div>
                    ))}</div>}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Materiales adicionales estimados</div>
                  {materiales.length === 0 ? <div className="text-xs text-zinc-600">—</div> :
                    <div className="space-y-1">{materiales.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs"><span className="text-zinc-300">{m.material} <span className="text-[10px] text-zinc-600">({m.detalle})</span></span><span className="font-bold tabular-nums whitespace-nowrap">{m.cantidad} {m.unidad}</span></div>
                    ))}</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Panel de edición de un pin */}
      {selPunto && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-end sm:items-center justify-center p-3" onClick={() => setSelPunto(null)}>
          <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <div className="text-sm font-bold">{PUNTOS_SINGULARES[selPunto.tipo]?.icon} {PUNTOS_SINGULARES[selPunto.tipo]?.label}</div>
              <button onClick={() => setSelPunto(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-2 text-xs">
              <div>
                <div className="text-[10px] uppercase text-zinc-500 mb-1">Tipo</div>
                <select value={selPunto.tipo} onChange={e => editar(selPunto.id, { tipo: e.target.value })} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-white outline-none focus:border-red-600">
                  {TIPOS.map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-[10px] uppercase text-zinc-500 mb-1">Cantidad</div><input type="number" value={selPunto.cantidad || 1} onChange={e => editar(selPunto.id, { cantidad: parseInt(e.target.value) || 1 })} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-white" /></div>
                <div><div className="text-[10px] uppercase text-zinc-500 mb-1">Dimensión</div><input value={selPunto.dimension || ''} onChange={e => editar(selPunto.id, { dimension: e.target.value })} placeholder="ej. 30cm, 2m" className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-white" /></div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-zinc-500 mb-1">Severidad</div>
                <div className="flex gap-1">{['baja', 'media', 'alta'].map(s => <button key={s} onClick={() => editar(selPunto.id, { severidad: s })} className={`flex-1 px-2 py-1 rounded-card border text-[10px] font-bold uppercase ${selPunto.severidad === s ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>{s}</button>)}</div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!selPunto.requiere_tratamiento_especial} onChange={e => editar(selPunto.id, { requiereTratamientoEspecial: e.target.checked })} className="w-4 h-4 accent-red-600" /><span>Requiere tratamiento especial</span></label>
              <div><div className="text-[10px] uppercase text-zinc-500 mb-1">Notas</div><textarea value={selPunto.notas || ''} onChange={e => editar(selPunto.id, { notas: e.target.value })} rows={2} className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-white" /></div>
              <button onClick={() => borrar(selPunto.id)} className="w-full bg-zinc-900 hover:bg-red-950/40 border border-zinc-800 hover:border-red-700 text-red-400 rounded-card py-2 text-[11px] font-bold uppercase flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar punto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function mapEdit(c) {
  const o = {};
  if (c.tipo !== undefined) o.tipo = c.tipo;
  if (c.cantidad !== undefined) o.cantidad = c.cantidad;
  if (c.dimension !== undefined) o.dimension = c.dimension;
  if (c.severidad !== undefined) o.severidad = c.severidad;
  if (c.requiereTratamientoEspecial !== undefined) o.requiere_tratamiento_especial = c.requiereTratamientoEspecial;
  if (c.notas !== undefined) o.notas = c.notas;
  return o;
}
