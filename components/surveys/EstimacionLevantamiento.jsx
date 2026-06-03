'use client';

// v8.19.83: [Levantamientos · Fase 4] estimación / cotización preliminar.
// Toma el m² de las áreas + puntos singulares y arma un rango de precio
// (m² x precio/m² + mano de obra). Guarda monto_estimado_min/max. Aditivo.

import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Save, Calculator } from 'lucide-react';
import {
  listarVisitasDeSite, listarAreasDeVisita, listarPuntosSingulares,
  estimarMaterialesPuntos, PRECIOS_REF_M2, setEstimacionProyecto, SERVICE_LINES,
} from '../../lib/surveys';
import { formatRD, formatNum } from '../../lib/helpers/formato';

export default function EstimacionLevantamiento({ site, proyecto, onCerrar, onGuardado }) {
  const [loading, setLoading] = useState(true);
  const [m2, setM2] = useState(0);
  const [puntos, setPuntos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const ref = PRECIOS_REF_M2[proyecto?.service_line] || PRECIOS_REF_M2.other;
  const [precioMin, setPrecioMin] = useState(ref[0]);
  const [precioMax, setPrecioMax] = useState(ref[1]);
  const [dias, setDias] = useState('');
  const [tarifaDia, setTarifaDia] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const visits = await listarVisitasDeSite(site.id);
        const v = visits[visits.length - 1] || visits[0];
        if (v) {
          const [areas, ps] = await Promise.all([listarAreasDeVisita(v.id), listarPuntosSingulares(v.id)]);
          if (cancel) return;
          const total = (areas || []).reduce((a, ar) => a + (Number(ar.net_area_m2) || Number(ar.gross_area_m2) || 0), 0);
          setM2(total); setPuntos(ps);
        } else if (v == null && proyecto?.area_total_m2) { setM2(Number(proyecto.area_total_m2) || 0); }
      } catch (e) { console.warn('Estimacion:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [site.id]);

  const manoObra = (parseFloat(dias) || 0) * (parseFloat(tarifaDia) || 0);
  const montoMin = m2 * (parseFloat(precioMin) || 0) + manoObra;
  const montoMax = m2 * (parseFloat(precioMax) || 0) + manoObra;
  const materiales = useMemo(() => estimarMaterialesPuntos(puntos), [puntos]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await setEstimacionProyecto(proyecto.id, {
        min: Math.round(montoMin), max: Math.round(montoMax),
        detalle: { m2, precioMin: Number(precioMin) || 0, precioMax: Number(precioMax) || 0, dias: Number(dias) || 0, tarifaDia: Number(tarifaDia) || 0, manoObra, materiales, notas: notas || null },
      });
      onGuardado?.({ min: Math.round(montoMin), max: Math.round(montoMax) });
      onCerrar();
    } catch (e) { alert('Error: ' + (e.message || e)); setGuardando(false); }
  };

  const Row = ({ label, value }) => (
    <div className="flex items-center justify-between text-xs py-0.5"><span className="text-zinc-400">{label}</span><span className="font-bold tabular-nums">{value}</span></div>
  );

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] overflow-y-auto" onClick={onCerrar}>
      <div className="min-h-full p-2 sm:p-4">
        <div className="bg-zinc-950 border-2 border-red-600 rounded-card max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <div className="font-black text-sm flex items-center gap-2"><Calculator className="w-4 h-4 text-red-500" /> Estimación preliminar</div>
            <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-zinc-500 py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="text-[11px] text-zinc-500">{SERVICE_LINES[proyecto?.service_line]?.label || ''} · <b className="text-zinc-300">{formatNum(m2)} m²</b> medidos en {puntos.length ? `${puntos.length} punto(s) singular(es)` : 'las áreas'}.</div>

              {/* Precio por m² */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Precio por m² (RD$)</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-[10px] text-zinc-500 mb-1">Mínimo</div><input type="number" value={precioMin} onChange={e => setPrecioMin(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm text-right" /></div>
                  <div><div className="text-[10px] text-zinc-500 mb-1">Máximo</div><input type="number" value={precioMax} onChange={e => setPrecioMax(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm text-right" /></div>
                </div>
              </div>

              {/* Mano de obra */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Mano de obra (opcional)</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-[10px] text-zinc-500 mb-1">Días estimados</div><input type="number" value={dias} onChange={e => setDias(e.target.value)} placeholder="0" className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm text-right" /></div>
                  <div><div className="text-[10px] text-zinc-500 mb-1">RD$/día</div><input type="number" value={tarifaDia} onChange={e => setTarifaDia(e.target.value)} placeholder="0" className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm text-right" /></div>
                </div>
              </div>

              {/* Materiales adicionales */}
              {materiales.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Materiales adicionales (de puntos singulares)</div>
                  {materiales.map((m, i) => <Row key={i} label={m.material} value={`${m.cantidad} ${m.unidad}`} />)}
                </div>
              )}

              {/* Resultado */}
              <div className="bg-zinc-950 border border-green-800/60 rounded-card p-3">
                <Row label={`${formatNum(m2)} m² × precio`} value={`${formatRD(m2 * (parseFloat(precioMin) || 0))} – ${formatRD(m2 * (parseFloat(precioMax) || 0))}`} />
                {manoObra > 0 && <Row label="Mano de obra" value={formatRD(manoObra)} />}
                <div className="border-t border-zinc-800 mt-2 pt-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-green-400 font-bold">Rango estimado</span>
                  <span className="font-black text-green-300">{formatRD(montoMin)} – {formatRD(montoMax)}</span>
                </div>
              </div>

              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Notas de la estimación (opcional)…" className="w-full bg-zinc-900 border border-zinc-800 rounded-card px-2 py-1.5 text-white text-sm outline-none focus:border-red-600" />

              <div className="flex gap-2">
                <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5 rounded-card">Cancelar</button>
                <button onClick={guardar} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-1">{guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Guardar estimación</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
