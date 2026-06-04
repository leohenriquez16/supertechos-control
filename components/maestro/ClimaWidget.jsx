'use client';

// v8.25.23: Clima del día. Usa Open-Meteo (gratis, sin API key) con el GPS del
// dispositivo (redondeado a ~1 km por privacidad) y respaldo a Santo Domingo.
//  - cerrable: muestra una X para cerrarlo (el control de cuándo reaparece vive en el padre).
//  - Probabilidad de lluvia POR HORA del día (expandible).

import React, { useEffect, useState } from 'react';
import { Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { obtenerUbicacion, geocodificarInverso } from '../../lib/geo';

const FALLBACK = { lat: 18.49, lng: -69.93, label: 'Santo Domingo' };

function describirClima(code) {
  const c = Number(code);
  if (c === 0) return { emoji: '☀️', texto: 'Despejado' };
  if (c === 1 || c === 2) return { emoji: '⛅', texto: 'Parcialmente nublado' };
  if (c === 3) return { emoji: '☁️', texto: 'Nublado' };
  if (c === 45 || c === 48) return { emoji: '🌫️', texto: 'Niebla' };
  if (c >= 51 && c <= 57) return { emoji: '🌦️', texto: 'Llovizna' };
  if (c >= 61 && c <= 67) return { emoji: '🌧️', texto: 'Lluvia' };
  if (c >= 71 && c <= 77) return { emoji: '🌨️', texto: 'Nieve' };
  if (c >= 80 && c <= 82) return { emoji: '🌧️', texto: 'Chubascos' };
  if (c === 85 || c === 86) return { emoji: '🌨️', texto: 'Chubascos de nieve' };
  if (c === 95) return { emoji: '⛈️', texto: 'Tormenta' };
  if (c >= 96) return { emoji: '⛈️', texto: 'Tormenta con granizo' };
  return { emoji: '🌡️', texto: 'Clima' };
}

export default function ClimaWidget({ cerrable = false, onClose }) {
  const [estado, setEstado] = useState('cargando'); // cargando | ok | error
  const [clima, setClima] = useState(null);
  const [lugar, setLugar] = useState('');
  const [verHoras, setVerHoras] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      let coords = FALLBACK; let esFallback = true;
      try {
        const u = await obtenerUbicacion();
        if (u && u.lat != null) { coords = { lat: u.lat, lng: u.lng }; esFallback = false; }
      } catch (e) { /* fallback */ }
      const lat = Math.round(coords.lat * 100) / 100;
      const lng = Math.round(coords.lng * 100) / 100;
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
          + `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m`
          + `&hourly=precipitation_probability,temperature_2m,weather_code`
          + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max`
          + `&timezone=auto&forecast_days=2`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('weather ' + r.status);
        const j = await r.json();
        if (cancelado) return;
        const cur = j.current || {};
        const day = j.daily || {};
        // Próximas 12 horas desde la hora actual (ventana rodante; cruza medianoche).
        const H = j.hourly || {};
        const ahora = Date.now();
        const horas = (H.time || []).map((t, i) => ({
          t, hora: Number((t.split('T')[1] || '0').slice(0, 2)),
          prob: (H.precipitation_probability || [])[i] ?? 0,
          temp: Math.round((H.temperature_2m || [])[i]),
          code: (H.weather_code || [])[i],
        })).filter(h => new Date(h.t).getTime() >= ahora - 3600000).slice(0, 12);
        setClima({
          temp: Math.round(cur.temperature_2m),
          sensacion: Math.round(cur.apparent_temperature),
          code: cur.weather_code,
          viento: Math.round(cur.wind_speed_10m),
          max: Math.round((day.temperature_2m_max || [])[0]),
          min: Math.round((day.temperature_2m_min || [])[0]),
          lluviaProb: (day.precipitation_probability_max || [])[0] ?? null,
          horas,
        });
        setEstado('ok');
      } catch (e) { if (!cancelado) setEstado('error'); }
      if (esFallback) { if (!cancelado) setLugar(FALLBACK.label); }
      else { try { const g = await geocodificarInverso(coords.lat, coords.lng); if (!cancelado && g) setLugar(g.ciudad || g.sector || g.provincia || ''); } catch (e) {} }
    })();
    return () => { cancelado = true; };
  }, []);

  const BotonCerrar = cerrable ? (
    <button onClick={onClose} className="text-zinc-500 hover:text-white flex-shrink-0 -mt-1 -mr-1"><X className="w-4 h-4" /></button>
  ) : null;

  if (estado === 'error') {
    if (!cerrable) return <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 text-xs text-zinc-500">No se pudo cargar el clima.</div>;
    return null;
  }

  if (estado === 'cargando') return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center justify-between gap-2 text-zinc-500 text-sm">
      <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando clima…</span>
      {BotonCerrar}
    </div>
  );

  const d = describirClima(clima.code);
  const lluviaAlta = clima.lluviaProb != null && clima.lluviaProb >= 50;
  const maxProbHoras = Math.max(1, ...clima.horas.map(h => h.prob));

  return (
    <div className={`rounded-card p-3 border ${lluviaAlta ? 'bg-blue-950/30 border-blue-800' : 'bg-zinc-900 border-zinc-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="text-3xl leading-none">{d.emoji}</div>
          <div>
            <div className="text-2xl font-black leading-none">{clima.temp}°<span className="text-sm font-bold text-zinc-400">C</span></div>
            <div className="text-xs text-zinc-400">{d.texto}{lugar && <span className="text-zinc-500"> · {lugar}</span>}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right text-[11px] text-zinc-400 leading-tight">
            <div>Máx {clima.max}° · Mín {clima.min}°</div>
            <div>Sensación {clima.sensacion}° · 💨 {clima.viento} km/h</div>
            {clima.lluviaProb != null && <div className={lluviaAlta ? 'text-blue-300 font-bold' : 'text-zinc-500'}>🌧️ {clima.lluviaProb}% lluvia</div>}
          </div>
          {BotonCerrar}
        </div>
      </div>

      {lluviaAlta && <div className="mt-2 text-[11px] text-blue-300 font-bold">⚠️ Alta probabilidad de lluvia hoy — considéralo al planificar.</div>}

      {/* Lluvia por hora */}
      {clima.horas.length > 0 && (
        <div className="mt-2 pt-2 border-t border-zinc-800">
          <button onClick={() => setVerHoras(v => !v)} className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-400 hover:text-white">
            <span>🌧️ Lluvia · próximas 12 h</span>
            {verHoras ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {verHoras && (
            <div className="mt-2 overflow-x-auto">
              <div className="flex gap-1 items-end" style={{ minWidth: 'min-content' }}>
                {clima.horas.map((h, idx) => {
                  const alta = h.prob >= 50;
                  const altura = 6 + Math.round((h.prob / maxProbHoras) * 40); // 6–46px
                  return (
                    <div key={h.t} className="flex flex-col items-center gap-0.5 w-9 flex-shrink-0">
                      <div className={`text-[9px] font-bold ${alta ? 'text-blue-300' : 'text-zinc-500'}`}>{h.prob}%</div>
                      <div className="w-3 bg-zinc-800 rounded-sm flex items-end" style={{ height: 46 }}>
                        <div className={`w-full rounded-sm ${alta ? 'bg-blue-400' : 'bg-zinc-500'}`} style={{ height: altura }} />
                      </div>
                      <div className={`text-[9px] ${idx === 0 ? 'text-white font-bold' : 'text-zinc-500'}`}>{idx === 0 ? 'ahora' : h.hora + 'h'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
