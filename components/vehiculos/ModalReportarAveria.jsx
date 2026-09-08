'use client';

// v8.51.0: 🚨 REPORTAR AVERÍA — flujo guiado desde el teléfono (caso disparador:
// un vehículo se sobrecalentó y no había proceso escrito). El ERP muestra PRIMERO
// el protocolo del síntoma (qué hacer / qué NO), y después captura el reporte con
// gravedad, odómetro, fotos y GPS. Avería crítica ⇒ el vehículo queda FUERA DE
// SERVICIO automático y se notifica por correo a flota/gerencia.

import React, { useState } from 'react';
import { X, Loader2, AlertTriangle, Camera, MapPin } from 'lucide-react';
import * as db from '../../lib/db';
import { SINTOMAS_AVERIA, sintomaDe } from '../../lib/protocolosAverias';
import { comprimirImagenABlob } from '../../lib/imports';
import { obtenerUbicacion } from '../../lib/geo';

export default function ModalReportarAveria({ vehiculo, usuario, onCerrar, onReportada }) {
  const [paso, setPaso] = useState(1);
  const [sintomaK, setSintomaK] = useState(null);
  const [puedeMoverse, setPuedeMoverse] = useState(null); // 'si' | 'no' | 'nose'
  const [descripcion, setDescripcion] = useState('');
  const [km, setKm] = useState('');
  const [fotos, setFotos] = useState([]); // [{blob, preview}]
  const [gps, setGps] = useState(null);
  const [gpsPidiendo, setGpsPidiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const sintoma = sintomaK ? sintomaDe(sintomaK) : null;

  const elegirSintoma = (k) => {
    setSintomaK(k);
    setPaso(2);
    // GPS en paralelo desde ya (el chofer está donde pasó).
    setGpsPidiendo(true);
    obtenerUbicacion().then(u => { setGps(u); setGpsPidiendo(false); }).catch(() => setGpsPidiendo(false));
  };

  const agregarFoto = async (file) => {
    if (!file) return;
    try {
      const blob = await comprimirImagenABlob(file, 1400, 0.7);
      setFotos(f => [...f, { blob, preview: URL.createObjectURL(blob) }]);
    } catch (e) { alert('No pude procesar la foto: ' + (e.message || e)); }
  };

  const gravedad = puedeMoverse === 'si' ? (sintoma?.criticoPorDefecto ? 'media' : 'leve') : 'critica';

  const guardar = async () => {
    if (!descripcion.trim()) { alert('Describe qué pasó (aunque sea corto).'); return; }
    setGuardando(true);
    try {
      const eventoId = await db.crearEventoVehiculo({
        vehiculoId: vehiculo.id, tipo: 'falla_mecanica',
        fecha: new Date().toISOString().slice(0, 10),
        km: km || null,
        descripcion: `${sintoma.icon} ${sintoma.label}: ${descripcion.trim()}`,
        reportadoPorId: usuario?.id || null, reportadoPorNombre: usuario?.nombre || null,
        sintoma: sintomaK, gravedad,
        lat: gps?.lat ?? null, lng: gps?.lng ?? null,
      });
      for (const f of fotos) {
        await db.subirFotoEventoVehiculo({ file: f.blob, eventoId }).catch(() => {});
      }
      // Notificación a flota/gerencia (+dueño). No bloquea el guardado.
      const veh = [vehiculo.marca, vehiculo.modelo, vehiculo.placa].filter(Boolean).join(' ');
      db.enviarCorreoReporte(
        ['mmartinez@supertechos.com.do'],
        `🚨 Avería ${gravedad === 'critica' ? 'CRÍTICA' : ''} — ${veh}: ${sintoma.label}`,
        `<div style="font-family:sans-serif">
          <h2 style="color:#D71920">🚨 Avería reportada${gravedad === 'critica' ? ' — VEHÍCULO FUERA DE SERVICIO' : ''}</h2>
          <p><b>Vehículo:</b> ${veh}<br/><b>Síntoma:</b> ${sintoma.icon} ${sintoma.label}<br/>
          <b>Gravedad:</b> ${gravedad === 'critica' ? '🔴 crítica (no debe moverse)' : gravedad === 'media' ? '🟡 media (taller pronto)' : '🟢 leve'}<br/>
          <b>Reportó:</b> ${usuario?.nombre || '—'}<br/>
          <b>Descripción:</b> ${descripcion.trim()}<br/>
          ${km ? `<b>Odómetro:</b> ${km} km<br/>` : ''}
          ${gps ? `<b>Ubicación:</b> <a href="https://maps.google.com/?q=${gps.lat},${gps.lng}">ver en el mapa</a><br/>` : ''}
          </p><p>El detalle y las fotos están en el ERP → Vehículos → historial del vehículo.</p></div>`,
        { cc: 'lhenriquez@supertechos.com.do' }
      );
      onReportada?.({ eventoId, gravedad });
    } catch (e) { alert('Error: ' + (e.message || e)); setGuardando(false); return; }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-4 my-6 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-black">🚨 Reportar avería</div>
            <div className="text-sm font-bold">{[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ')} {vehiculo.placa && <span className="font-mono text-zinc-400">· {vehiculo.placa}</span>}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0 p-1"><X className="w-4 h-4" /></button>
        </div>

        {/* PASO 1 · síntoma */}
        {paso === 1 && (
          <div className="space-y-2">
            <div className="text-[11px] text-zinc-400">¿Qué está pasando?</div>
            <div className="grid grid-cols-2 gap-2">
              {SINTOMAS_AVERIA.map(s => (
                <button key={s.k} onClick={() => elegirSintoma(s.k)}
                  className="bg-zinc-950 border-2 border-zinc-700 hover:border-red-600 rounded-card p-3 text-left">
                  <div className="text-xl">{s.icon}</div>
                  <div className="text-[11px] font-bold mt-1 leading-tight">{s.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 2 · PROTOCOLO primero — el ERP te dice qué hacer antes de pedirte datos */}
        {paso === 2 && sintoma && (
          <div className="space-y-2.5">
            <div className="text-sm font-black">{sintoma.icon} {sintoma.label}</div>
            <div className="bg-emerald-950/30 border border-emerald-800 rounded-card p-2.5">
              <div className="text-[10px] font-black uppercase text-emerald-400 mb-1">✅ Haz esto, en orden</div>
              <ol className="text-[11px] text-zinc-200 space-y-1 list-decimal pl-4">
                {sintoma.queHacer.map((x, i) => <li key={i}>{x}</li>)}
              </ol>
            </div>
            {sintoma.queNoHacer.length > 0 && (
              <div className="bg-red-950/30 border border-red-800 rounded-card p-2.5">
                <div className="text-[10px] font-black uppercase text-red-400 mb-1">⛔ NO hagas esto</div>
                <ul className="text-[11px] text-zinc-200 space-y-1 list-disc pl-4">
                  {sintoma.queNoHacer.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            )}
            {sintoma.grua && (
              <div className="bg-amber-950/30 border border-amber-800 rounded-card p-2.5 text-[11px] text-amber-200">
                <b>🚛 Grúa si:</b> {sintoma.grua}
              </div>
            )}
            <div className="pt-1">
              <div className="text-[11px] font-bold text-zinc-300 mb-1.5">¿El vehículo puede moverse con seguridad?</div>
              <div className="grid grid-cols-3 gap-1.5">
                {[['si', 'Sí'], ['no', 'NO'], ['nose', 'No sé']].map(([v, l]) => (
                  <button key={v} onClick={() => { setPuedeMoverse(v); setPaso(3); }}
                    className={`py-2.5 rounded-card text-xs font-black uppercase border-2 ${v === 'si' ? 'border-emerald-700 text-emerald-300 hover:bg-emerald-900/30' : 'border-red-700 text-red-300 hover:bg-red-900/30'}`}>{l}</button>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500 mt-1">"NO" o "No sé" = el vehículo queda fuera de servicio hasta que flota lo revise.</div>
            </div>
          </div>
        )}

        {/* PASO 3 · datos del reporte */}
        {paso === 3 && sintoma && (
          <div className="space-y-2.5">
            <div className={`text-[11px] font-bold px-2.5 py-1.5 rounded-card border ${gravedad === 'critica' ? 'bg-red-950/40 border-red-700 text-red-300' : 'bg-amber-950/30 border-amber-800 text-amber-300'}`}>
              {gravedad === 'critica' ? '🔴 Se registrará como CRÍTICA: el vehículo queda fuera de servicio y se avisa a la oficina.' : '🟡 El vehículo sigue operando pero debe pasar por taller.'}
            </div>
            <div>
              <div className="text-[10px] font-bold text-zinc-300 mb-1">¿Qué pasó? *</div>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
                placeholder="Ej: la aguja subió al máximo subiendo la Duarte, me orillé y apagué"
                className="w-full bg-zinc-950 border-2 border-zinc-700 focus:border-red-600 rounded-card px-3 py-2 text-sm outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-bold text-zinc-300 mb-1">Odómetro (km)</div>
                <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="0"
                  className="w-full bg-zinc-950 border-2 border-zinc-700 focus:border-red-600 rounded-card px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-zinc-300 mb-1">Ubicación</div>
                <div className={`text-[11px] px-2 py-2.5 rounded-card border ${gps ? 'border-emerald-800 text-emerald-300' : 'border-zinc-700 text-zinc-500'}`}>
                  <MapPin className="w-3 h-3 inline -mt-0.5" /> {gps ? 'GPS capturado ✓' : gpsPidiendo ? 'Buscando…' : 'Sin GPS'}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-zinc-300 mb-1">Fotos (tablero, fuga, daño…)</div>
              <div className="flex gap-1.5 flex-wrap">
                {fotos.map((f, i) => <img key={i} src={f.preview} alt="" className="w-14 h-14 object-cover rounded-card border border-zinc-700" />)}
                <label className="w-14 h-14 border-2 border-dashed border-zinc-700 hover:border-red-600 rounded-card flex items-center justify-center cursor-pointer">
                  <Camera className="w-5 h-5 text-zinc-500" />
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { agregarFoto(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
            </div>
            <button onClick={guardar} disabled={guardando}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-3 rounded-card flex items-center justify-center gap-1.5">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} Reportar avería
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
