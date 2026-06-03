'use client';

// v8.19.4: SurveyFieldRenderer — renderea un solo campo del template
// JSONB. Despacha sobre `field.type`. Tipos soportados en este PR (3B.4):
//   - text, textarea, number          → input simple
//   - single_select                   → radio buttons o dropdown
//   - multi_select                    → checkboxes
//   - boolean                         → toggle
//   - rating_1_5                      → 5 botones 1-5
//   - computed                        → label calculado (formula simple)
//   - photos                          → placeholder con # de fotos (real upload en PR 3B.5)
//   - measurement_table               → tabla con filas + auto cálculo m²
//   - openings_table                  → tabla de aperturas a descontar
//   - signature                       → placeholder
//
// Cada renderer recibe { field, value, onChange, allValues } donde:
//   - field: { id, label, type, required?, options?, columns?, formula?, show_if?, ... }
//   - value: valor actual del campo
//   - onChange(nuevoValor): callback
//   - allValues: objeto con todos los valores del bloque/sección (para show_if y computed)

import React, { useState, useRef } from 'react';
import { Star, Camera, Plus, Trash2, Calculator, X, Mic, Square, MapPin } from 'lucide-react';
import PhotoCapture from './PhotoCapture';
import MapaPickerModal from '../common/MapaPickerModal';
import MapaPoligonoModal from '../common/MapaPoligonoModal';

export default function SurveyFieldRenderer({ field, value, onChange, allValues = {}, context = {} }) {
  // Soporte de show_if simple: "field_id == valor" o "field_id == true"
  if (field.show_if && !evaluarShowIf(field.show_if, allValues)) {
    return null;
  }

  const label = (
    <div className="flex items-center gap-1 mb-1">
      <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label}</span>
      {field.required && <span className="text-red-500 text-[11px]">*</span>}
    </div>
  );

  switch (field.type) {
    case 'text':
      return (
        <div>
          {label}
          <input
            type="text"
            inputMode={field.numeric ? 'decimal' : undefined}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder || ''}
            className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white"
          />
          {Array.isArray(field.presets) && field.presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider self-center">Sugeridos:</span>
              {field.presets.map(p => (
                <button key={p} type="button" onClick={() => onChange(p)}
                  className={`text-xs px-2.5 py-1.5 border-2 ${value === p ? 'bg-red-600 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-red-600'}`}>{p}</button>
              ))}
            </div>
          )}
        </div>
      );

    case 'textarea':
      return (
        <div>
          {label}
          <textarea
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder || ''}
            rows={field.rows || 3}
            className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white resize-y"
          />
        </div>
      );

    case 'number':
      return (
        <div>
          {label}
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              value={value ?? ''}
              onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
              step={field.step || 'any'}
              min={field.min}
              max={field.max}
              placeholder={field.placeholder || ''}
              className="flex-1 bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white"
            />
            {field.unit && <span className="text-[11px] text-zinc-500">{field.unit}</span>}
          </div>
        </div>
      );

    case 'single_select': {
      const opts = field.options || [];
      const renderAsDropdown = opts.length > 5;
      if (renderAsDropdown) {
        return (
          <div>
            {label}
            <select
              value={value || ''}
              onChange={e => onChange(e.target.value || null)}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white"
            >
              <option value="">— Selecciona —</option>
              {opts.map(opt => {
                const v = typeof opt === 'string' ? opt : opt.value;
                const l = typeof opt === 'string' ? opt : (opt.label || opt.value);
                return <option key={v} value={v}>{l}</option>;
              })}
            </select>
          </div>
        );
      }
      return (
        <div>
          {label}
          <div className="flex flex-wrap gap-1.5">
            {opts.map(opt => {
              const v = typeof opt === 'string' ? opt : opt.value;
              const l = typeof opt === 'string' ? opt : (opt.label || opt.value);
              const activo = value === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange(activo ? null : v)}
                  className={`text-xs px-3 py-1.5 border-2 transition-colors ${
                    activo
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-red-600'
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case 'multi_select': {
      // v8.22.9: las opciones pueden tener show_if (ej. "Óxido" solo si metálico).
      const opts = (field.options || []).filter(opt => typeof opt === 'string' || !opt.show_if || evaluarShowIf(opt.show_if, allValues));
      const current = Array.isArray(value) ? value : [];
      const toggle = (v) => {
        if (current.includes(v)) onChange(current.filter(x => x !== v));
        else onChange([...current, v]);
      };
      return (
        <div>
          {label}
          <div className="flex flex-wrap gap-1.5">
            {opts.map(opt => {
              const v = typeof opt === 'string' ? opt : opt.value;
              const l = typeof opt === 'string' ? opt : (opt.label || opt.value);
              const activo = current.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggle(v)}
                  className={`text-xs px-3 py-1.5 border-2 transition-colors ${
                    activo
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-red-600'
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2">
          <span className="text-sm text-zinc-200">{field.label}</span>
          <button
            type="button"
            onClick={() => onChange(!value)}
            className={`relative inline-flex h-6 w-11 items-center transition-colors ${
              value ? 'bg-red-600' : 'bg-zinc-700'
            }`}
            aria-pressed={!!value}
          >
            <span
              className={`inline-block h-4 w-4 transform bg-white transition-transform ${
                value ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      );

    case 'rating_1_5': {
      const v = Number(value || 0);
      return (
        <div>
          {label}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n === v ? null : n)}
                className={`w-9 h-9 border-2 flex items-center justify-center text-sm font-bold ${
                  n <= v
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-red-600'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-2 text-[10px] text-zinc-500 hover:text-white"
              title="Limpiar"
            >
              ×
            </button>
          </div>
        </div>
      );
    }

    case 'computed': {
      const calculated = computeFormula(field.formula, allValues);
      return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1">
            <Calculator className="w-3 h-3" /> {field.label}
          </span>
          <span className="text-sm font-bold text-red-500">
            {calculated != null ? `${calculated}${field.unit ? ' ' + field.unit : ''}` : '—'}
          </span>
        </div>
      );
    }

    case 'photos':
      return (
        <PhotoCapture
          visitId={context.visitId}
          areaId={context.areaId || null}
          field={field}
          value={value}
          onChange={onChange}
        />
      );

    case 'counter': {
      const n = Math.max(0, Number(value) || 0);
      const set = (v) => onChange(Math.max(0, Math.round(v)));
      return (
        <div>
          {label}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => set(n - 1)} className="w-9 h-9 rounded-card bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-bold flex items-center justify-center">−</button>
            <input type="number" inputMode="numeric" value={n} onChange={e => set(Number(e.target.value) || 0)} className="w-16 text-center bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none py-2 text-sm text-white" />
            <button type="button" onClick={() => set(n + 1)} className="w-9 h-9 rounded-card bg-red-600 hover:bg-red-700 text-white text-lg font-bold flex items-center justify-center">+</button>
            {field.unidad && <span className="text-xs text-zinc-500">{field.unidad}</span>}
          </div>
        </div>
      );
    }

    case 'voice_note':
      return <VoiceNoteField field={field} value={value} onChange={onChange} />;

    case 'map_point':
      return <MapPointField field={field} value={value} onChange={onChange} context={context} />;

    case 'map_polygon':
      return <MapPolygonField field={field} value={value} onChange={onChange} context={context} />;

    case 'fotos_previas':
      return <FotosPreviasField field={field} value={value} onChange={onChange} context={context} />;

    case 'measurement_table':
      return <MeasurementTableField field={field} value={value} onChange={onChange} />;

    case 'ductos_table':
      return <DuctosTableField field={field} value={value} onChange={onChange} />;

    case 'openings_table':
      return <OpeningsTableField field={field} value={value} onChange={onChange} />;

    case 'signature':
      return (
        <div>
          {label}
          <div className="bg-zinc-900 border-2 border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
            Firma (placeholder — PR posterior)
          </div>
        </div>
      );

    default:
      return (
        <div className="bg-amber-900/20 border border-amber-700 text-amber-300 p-2 text-xs">
          Campo no soportado: <code>{field.type}</code> ({field.id})
        </div>
      );
  }
}

// ============================================================
// FotosPrevias — fotos tomadas antes de subir al techo (interiores). Al terminar,
// se clasifica cada foto a una sección y se puede marcar un punto estimado.
// Valor: array de fotos (PhotoCapture) + { areaId, areaNombre, punto } por foto.
// ============================================================
function FotosPreviasField({ field, value, onChange, context }) {
  const fotos = Array.isArray(value) ? value : [];
  const areas = context?.areas || [];
  const [mapaDe, setMapaDe] = useState(null);
  const setMeta = (id, patch) => onChange(fotos.map(f => (f.id === id ? { ...f, ...patch } : f)));
  const nombreArea = (a) => a?.name || a?.nombre || `Área ${a?.area_number ?? ''}`;
  const fotoMapa = fotos.find(f => f.id === mapaDe);
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label || 'Fotos previas / interiores'}</span>
      </div>
      <PhotoCapture visitId={context?.visitId} areaId={null} field={field} value={value} onChange={onChange} />
      {fotos.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold">Clasifica cada foto (al terminar el levantamiento)</div>
          {fotos.map(f => (
            <div key={f.id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-card p-1.5">
              {f.signedUrl ? <img src={f.signedUrl} alt="" className="w-10 h-10 object-cover rounded shrink-0" /> : <div className="w-10 h-10 bg-zinc-800 rounded shrink-0" />}
              <select value={f.areaId || ''} onChange={e => { const a = areas.find(x => x.id === e.target.value); setMeta(f.id, { areaId: e.target.value || null, areaNombre: a ? nombreArea(a) : null }); }} className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-xs text-white">
                <option value="">— ¿A qué sección? —</option>
                {areas.map(a => <option key={a.id} value={a.id}>{nombreArea(a)}</option>)}
              </select>
              <button type="button" onClick={() => setMapaDe(f.id)} className={`px-2 py-1 rounded-card border text-[10px] font-bold whitespace-nowrap ${f.punto ? 'border-green-600 text-green-300' : 'border-zinc-700 text-zinc-400'}`}>
                <MapPin className="w-3.5 h-3.5 inline" /> {f.punto ? 'punto ✓' : 'marcar'}
              </button>
            </div>
          ))}
        </div>
      )}
      {fotoMapa && (
        <MapaPickerModal
          initialLat={fotoMapa.punto?.lat ?? context?.siteLat}
          initialLng={fotoMapa.punto?.lng ?? context?.siteLng}
          onSelect={(la, ln) => { setMeta(mapaDe, { punto: { lat: la, lng: ln } }); setMapaDe(null); }}
          onCerrar={() => setMapaDe(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// MapPoint — marca la ubicación del área en el mapa (PIN). Valor: {lat, lng}.
// ============================================================
function MapPointField({ field, value, onChange, context }) {
  const [abierto, setAbierto] = useState(false);
  const v = value && value.lat != null ? value : null;
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label || 'Ubicación en el mapa'}</span>
        {field.required && <span className="text-red-500 text-[11px]">*</span>}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setAbierto(true)} className="flex items-center gap-1.5 bg-zinc-900 border-2 border-zinc-800 hover:border-red-600 rounded-card px-3 py-2 text-sm text-zinc-200">
          <MapPin className="w-4 h-4 text-red-500" /> {v ? 'Editar punto' : 'Marcar en el mapa'}
        </button>
        {v && (
          <>
            <span className="text-[11px] text-green-300">{Number(v.lat).toFixed(5)}, {Number(v.lng).toFixed(5)}</span>
            <button type="button" onClick={() => onChange(null)} className="text-zinc-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>
      {abierto && (
        <MapaPickerModal
          initialLat={v?.lat ?? context?.siteLat}
          initialLng={v?.lng ?? context?.siteLng}
          onSelect={(la, ln) => { onChange({ lat: la, lng: ln }); setAbierto(false); }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// MapPolygon — dibuja el polígono del área sobre el techo. Valor: {vertices, areaM2}.
// ============================================================
function MapPolygonField({ field, value, onChange, context }) {
  const [abierto, setAbierto] = useState(false);
  const verts = Array.isArray(value?.vertices) ? value.vertices : [];
  const areaM2 = value?.areaM2;
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label || 'Dibujar área en el mapa'}</span>
        {field.required && <span className="text-red-500 text-[11px]">*</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setAbierto(true)} className="flex items-center gap-1.5 bg-zinc-900 border-2 border-zinc-800 hover:border-red-600 rounded-card px-3 py-2 text-sm text-zinc-200">
          <MapPin className="w-4 h-4 text-red-500" /> {verts.length ? 'Editar polígono' : 'Dibujar área'}
        </button>
        {verts.length >= 3 && (
          <>
            <span className="text-[11px] text-green-300">{verts.length} pts · {areaM2 != null ? `${areaM2} m²` : ''}</span>
            <button type="button" onClick={() => onChange(null)} className="text-zinc-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>
      {abierto && (
        <MapaPoligonoModal
          initialLat={(verts[0] && verts[0][0]) ?? context?.siteLat}
          initialLng={(verts[0] && verts[0][1]) ?? context?.siteLng}
          value={value}
          onSelect={(res) => { onChange(res); setAbierto(false); }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// VoiceNote — nota escrita o de voz (dictado con Web Speech API, transcribe en vivo).
// El valor guardado es el texto (transcrito + editable).
// ============================================================
function VoiceNoteField({ field, value, onChange }) {
  const [grabando, setGrabando] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef(null);
  const valueRef = useRef(value || '');
  valueRef.current = value || '';
  const soportado = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggle = () => {
    if (grabando) { try { recRef.current?.stop(); } catch {} setGrabando(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'es-DO'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let intp = '', fin = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t + ' '; else intp += t;
      }
      if (fin) {
        const base = valueRef.current ? valueRef.current.trimEnd() + ' ' : '';
        const nuevo = (base + fin).trimStart();
        valueRef.current = nuevo;
        onChange(nuevo);
      }
      setInterim(intp);
    };
    rec.onend = () => { setGrabando(false); setInterim(''); };
    rec.onerror = (ev) => { if (ev.error === 'not-allowed') setGrabando(false); };
    recRef.current = rec;
    try { rec.start(); setGrabando(true); } catch { setGrabando(false); }
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label || 'Nota'}</span>
        {field.required && <span className="text-red-500 text-[11px]">*</span>}
      </div>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder="Escribe la nota… o usa el micrófono para dictarla."
        className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white resize-y"
      />
      <div className="flex items-center gap-2 mt-1">
        {soportado ? (
          <button type="button" onClick={toggle} className={`flex items-center gap-1 px-3 py-1.5 rounded-card text-xs font-bold ${grabando ? 'bg-red-600 text-white animate-pulse' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}>
            {grabando ? <><Square className="w-3.5 h-3.5" /> Detener</> : <><Mic className="w-3.5 h-3.5" /> Dictar nota de voz</>}
          </button>
        ) : (
          <span className="text-[10px] text-zinc-500">Dictado no disponible en este navegador (usa Chrome/Edge). Puedes escribir la nota.</span>
        )}
        {grabando && <span className="text-[11px] text-red-400 italic truncate">{interim || 'escuchando…'}</span>}
      </div>
    </div>
  );
}

// ============================================================
// DuctosTable — ductos de A/C (forma de cubo). Se recubren 3 caras:
// tapa superior + 2 lados a lo largo = Largo × (Ancho + 2×Alto).
// ============================================================
function DuctosTableField({ field, value, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const filas = Array.isArray(value) ? value : [];
  const agregar = () => onChange([...filas, { id: 'd_' + Date.now() + Math.random().toString(36).slice(2, 5) }]);
  const eliminar = (idx) => onChange(filas.filter((_, i) => i !== idx));
  const setCampo = (idx, k, v) => {
    const nuevo = [...filas];
    nuevo[idx] = { ...nuevo[idx], [k]: v };
    const L = Number(nuevo[idx].largo) || 0, W = Number(nuevo[idx].ancho) || 0, H = Number(nuevo[idx].alto) || 0;
    nuevo[idx].area_m2 = (L && (W || H)) ? Number((L * (W + 2 * H)).toFixed(2)) : null;
    onChange(nuevo);
  };
  const total = filas.reduce((a, f) => a + (Number(f.area_m2) || 0), 0);
  const cols = [['identificacion', 'Identificación'], ['largo', 'Largo (m)'], ['ancho', 'Ancho (m)'], ['alto', 'Alto (m)']];
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label || 'Ductos de A/C'}</span>
      </div>
      {/* Botón que abre el modal */}
      <button type="button" onClick={() => setAbierto(true)} className="w-full bg-zinc-900 border-2 border-zinc-800 hover:border-red-600 rounded-card px-3 py-2.5 text-sm text-left flex items-center justify-between">
        <span className="text-zinc-300">{filas.length ? `${filas.length} ducto(s) capturado(s)` : 'Agregar ductos…'}</span>
        <span className="text-[11px] font-bold text-red-300">{filas.length ? `${total.toFixed(2)} m²` : ''} <Plus className="w-3.5 h-3.5 inline ml-1" /></span>
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setAbierto(false)}>
          <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <div className="text-sm font-bold">Ductos de A/C — se recubren 3 caras = Largo × (Ancho + 2×Alto)</div>
              <button type="button" onClick={() => setAbierto(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-950 border-b border-zinc-800">
                    <tr>
                      {cols.map(([k, l]) => <th key={k} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">{l}</th>)}
                      <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-red-400">m² (3 caras)</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-zinc-600">Sin ductos. Agrega uno abajo.</td></tr>}
                    {filas.map((f, idx) => (
                      <tr key={f.id || idx} className="border-b border-zinc-800/60">
                        <td className="px-1 py-1"><input value={f.identificacion || ''} onChange={e => setCampo(idx, 'identificacion', e.target.value)} placeholder="Ducto 1" className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-1.5 py-1 text-white" /></td>
                        {['largo', 'ancho', 'alto'].map(k => (
                          <td key={k} className="px-1 py-1"><input type="number" inputMode="decimal" value={f[k] ?? ''} onChange={e => setCampo(idx, k, e.target.value)} className="w-16 bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none px-1.5 py-1 text-white" /></td>
                        ))}
                        <td className="px-2 py-1 text-right font-bold text-red-300">{f.area_m2 != null ? f.area_m2 : '—'}</td>
                        <td className="px-1 py-1 text-center"><button type="button" onClick={() => eliminar(idx)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  {filas.length > 0 && (
                    <tfoot><tr className="border-t border-zinc-700"><td colSpan={4} className="px-2 py-1.5 text-right uppercase text-[10px] text-zinc-400 font-bold">Total a recubrir</td><td className="px-2 py-1.5 text-right font-black text-red-300">{total.toFixed(2)}</td><td></td></tr></tfoot>
                  )}
                </table>
              </div>
              <button type="button" onClick={agregar} className="mt-2 text-[11px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Agregar ducto</button>
            </div>
            <div className="p-3 border-t border-zinc-800 flex justify-end">
              <button type="button" onClick={() => setAbierto(false)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-4 py-2 rounded-card">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MeasurementTable — filas con label + columns numéricas + total m²
// ============================================================
function MeasurementTableField({ field, value, onChange }) {
  const filas = Array.isArray(value) ? value : [];
  const columns = field.columns || [
    { id: 'label', label: 'Sección', type: 'text' },
    { id: 'length_m', label: 'Largo (m)', type: 'number' },
    { id: 'height_m', label: 'Alto (m)', type: 'number' },
  ];
  const autoCalcArea = field.auto_calc_area !== false;

  const agregarFila = () => {
    onChange([...filas, { id: 'm_' + Date.now() + Math.random().toString(36).slice(2, 5) }]);
  };
  const eliminarFila = (idx) => {
    onChange(filas.filter((_, i) => i !== idx));
  };
  const recalc = (row) => {
    if (!autoCalcArea) return row;
    const l = Number(row.length_m) || 0;
    const h = Number(row.height_m) || Number(row.width_m) || 0;
    let a = (l && h) ? Number((l * h).toFixed(2)) : null;
    if (a != null && row.restar) a = -Math.abs(a); // v8.23.8: fila de resta (deducción)
    row.area_m2 = a;
    return row;
  };
  const setCampo = (idx, colId, val) => {
    const nuevo = [...filas];
    nuevo[idx] = recalc({ ...nuevo[idx], [colId]: val });
    onChange(nuevo);
  };
  const toggleRestar = (idx) => {
    const nuevo = [...filas];
    nuevo[idx] = recalc({ ...nuevo[idx], restar: !nuevo[idx].restar });
    onChange(nuevo);
  };

  const total = filas.reduce((acc, f) => acc + (Number(f.area_m2) || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label}</span>
        {field.required && <span className="text-red-500 text-[11px]">*</span>}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-950 border-b border-zinc-800">
            <tr>
              {columns.map(c => (
                <th key={c.id} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                  {c.label}
                </th>
              ))}
              {autoCalcArea && (
                <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-red-400">
                  m²
                </th>
              )}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="text-center text-zinc-500 py-3 text-[11px]">
                  Sin filas. Agrega una con el botón abajo.
                </td>
              </tr>
            )}
            {filas.map((f, idx) => (
              <tr key={f.id || idx} className={`border-b border-zinc-800/50 ${f.restar ? 'bg-amber-900/10' : ''}`}>
                {columns.map(c => (
                  <td key={c.id} className="px-1 py-1">
                    <input
                      type={c.type === 'number' ? 'number' : 'text'}
                      inputMode={c.type === 'number' ? 'decimal' : undefined}
                      step="any"
                      value={f[c.id] ?? ''}
                      onChange={e => setCampo(idx, c.id, c.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
                      className={`w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-2.5 py-3 text-white ${c.type === 'number' ? 'text-base font-bold text-center tabular-nums' : 'text-sm'}`}
                    />
                  </td>
                ))}
                {autoCalcArea && (
                  <td className={`px-2 py-1 text-right text-xs font-bold ${f.restar ? 'text-amber-400' : 'text-red-400'}`}>
                    {f.area_m2 != null ? f.area_m2.toFixed(2) : '—'}
                  </td>
                )}
                <td className="px-1 py-1 whitespace-nowrap text-center">
                  {autoCalcArea && (
                    <button
                      type="button"
                      onClick={() => toggleRestar(idx)}
                      className={`mr-1 px-1.5 rounded text-[11px] font-black border ${f.restar ? 'border-amber-600 bg-amber-900/30 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}
                      title={f.restar ? 'Fila resta (deducción). Click para sumar.' : 'Convertir en resta (deducción)'}
                    >
                      {f.restar ? '−' : '±'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => eliminarFila(idx)}
                    className="text-zinc-500 hover:text-red-500"
                    title="Eliminar fila"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {autoCalcArea && filas.length > 0 && (
            <tfoot>
              <tr className="bg-zinc-950 border-t border-zinc-800">
                <td colSpan={columns.length} className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Total
                </td>
                <td className="px-2 py-1.5 text-right text-sm font-black text-red-500">
                  {total.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button
        type="button"
        onClick={agregarFila}
        className="mt-2 text-xs text-red-500 hover:text-red-400 font-bold flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Agregar fila
      </button>
    </div>
  );
}

// ============================================================
// OpeningsTable — tabla de aperturas (puertas/ventanas/etc) a descontar
// ============================================================
function OpeningsTableField({ field, value, onChange }) {
  const filas = Array.isArray(value) ? value : [];
  const tipos = field.types || ['puerta', 'ventana', 'otro'];

  const agregarFila = () => {
    onChange([...filas, { id: 'o_' + Date.now() + Math.random().toString(36).slice(2, 5), tipo: tipos[0], cantidad: 1, ancho_m: null, alto_m: null }]);
  };
  const eliminarFila = (idx) => {
    onChange(filas.filter((_, i) => i !== idx));
  };
  const setCampo = (idx, colId, val) => {
    const nuevo = [...filas];
    nuevo[idx] = { ...nuevo[idx], [colId]: val };
    const cant = Number(nuevo[idx].cantidad) || 0;
    const a = Number(nuevo[idx].ancho_m) || 0;
    const h = Number(nuevo[idx].alto_m) || 0;
    nuevo[idx].area_total_m2 = (cant && a && h) ? Number((cant * a * h).toFixed(2)) : null;
    onChange(nuevo);
  };

  const total = filas.reduce((acc, f) => acc + (Number(f.area_total_m2) || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label}</span>
        {field.required && <span className="text-red-500 text-[11px]">*</span>}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-950 border-b border-zinc-800">
            <tr>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">Tipo</th>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">Cant.</th>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">Ancho m</th>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">Alto m</th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-amber-400">m² total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-zinc-500 py-3 text-[11px]">
                  Sin aperturas. Agrega una con el botón abajo.
                </td>
              </tr>
            )}
            {filas.map((f, idx) => (
              <tr key={f.id || idx} className="border-b border-zinc-800/50">
                <td className="px-1 py-1">
                  <select
                    value={f.tipo || tipos[0]}
                    onChange={e => setCampo(idx, 'tipo', e.target.value)}
                    className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                  >
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    value={f.cantidad ?? ''}
                    onChange={e => setCampo(idx, 'cantidad', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="any"
                    value={f.ancho_m ?? ''}
                    onChange={e => setCampo(idx, 'ancho_m', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="any"
                    value={f.alto_m ?? ''}
                    onChange={e => setCampo(idx, 'alto_m', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                  />
                </td>
                <td className="px-2 py-1 text-right text-xs text-amber-400 font-bold">
                  {f.area_total_m2 != null ? f.area_total_m2.toFixed(2) : '—'}
                </td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => eliminarFila(idx)}
                    className="text-zinc-500 hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="bg-zinc-950 border-t border-zinc-800">
                <td colSpan={4} className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Total a descontar
                </td>
                <td className="px-2 py-1.5 text-right text-sm font-black text-amber-400">
                  {total.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button
        type="button"
        onClick={agregarFila}
        className="mt-2 text-xs text-red-500 hover:text-red-400 font-bold flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Agregar apertura
      </button>
    </div>
  );
}

// ============================================================
// Helpers de fórmulas y condicionales
// ============================================================

// Evalúa show_if simple: "field_id == valor" o "field_id == true" o "field_id != null"
function evaluarShowIf(expr, allValues) {
  if (!expr || typeof expr !== 'string') return true;
  // Parsing muy simple: <field_id> <op> <literal>  (op incluye 'includes' para arrays)
  const m = expr.match(/^\s*([\w.-]+)\s*(==|!=|>=|<=|>|<|includes)\s*(.+?)\s*$/);
  if (!m) return true;
  const [, fieldId, op, rhsRaw] = m;
  const lhs = allValues[fieldId];
  let rhs = rhsRaw.trim();
  // Parse RHS literal
  if (rhs === 'true') rhs = true;
  else if (rhs === 'false') rhs = false;
  else if (rhs === 'null') rhs = null;
  else if (op !== 'includes' && !isNaN(Number(rhs))) rhs = Number(rhs);
  else if ((rhs.startsWith('"') && rhs.endsWith('"')) || (rhs.startsWith("'") && rhs.endsWith("'"))) rhs = rhs.slice(1, -1);
  if (op === 'includes') return Array.isArray(lhs) && lhs.includes(rhs);
  switch (op) {
    case '==': return lhs == rhs;
    case '!=': return lhs != rhs;
    case '>':  return Number(lhs) > Number(rhs);
    case '<':  return Number(lhs) < Number(rhs);
    case '>=': return Number(lhs) >= Number(rhs);
    case '<=': return Number(lhs) <= Number(rhs);
    default:   return true;
  }
}

// Evalúa fórmula simple: solo aritmética con field_id como variables.
// Ej: "length_m * width_m" o "(gross - openings) * 1.1"
function computeFormula(formula, allValues) {
  if (!formula || typeof formula !== 'string') return null;
  try {
    // Reemplaza identificadores por sus valores numéricos (o 0 si null)
    const expr = formula.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (id) => {
      const v = allValues[id];
      return v == null ? '0' : String(Number(v) || 0);
    });
    // Solo permitimos +, -, *, /, parens, dígitos y punto
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')();
    return Number.isFinite(result) ? Number(result.toFixed(2)) : null;
  } catch {
    return null;
  }
}
