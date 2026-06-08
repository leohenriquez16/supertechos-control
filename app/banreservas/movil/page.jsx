'use client';

import { useState, useRef, useEffect } from 'react';
import { sucursales } from '../../../lib/data/banreservas-mock';

const COLOR_CAT = { A: '#16a34a', B: '#84cc16', C: '#f59e0b', D: '#dc2626' };

// Selecciono 6 oficinas para la demo: 1 Ovando real + 5 cercanas
const OFICINAS_DEMO = (() => {
  const ovando = sucursales.find(s => s.codigo === '031');
  const otras = sucursales
    .filter(s => s.codigo !== '031' && s.regional === 'Metro Norte')
    .slice(0, 5);
  return [ovando, ...otras].filter(Boolean);
})();

const VISITAS_HOY = OFICINAS_DEMO.map((s, i) => ({
  id: s.codigo_br,
  oficina: s.zona,
  codigo: s.codigo_br,
  hora: ['07:45', '09:00', '10:15', '11:30', '13:00', '14:15'][i],
  estado: i < 2 ? 'completada' : i === 2 ? 'en_curso' : 'pendiente',
  km: ['2.1', '4.3', '5.8', '7.2', '9.4', '11.5'][i],
  categoria: s.categoria,
}));

const CHECKLIST_ITEMS = [
  { id: 'limpieza_sup',  label: 'Limpieza superficie',          icon: '🧹', estado: 'completado' },
  { id: 'limpieza_desg', label: 'Limpieza desagües',             icon: '💧', estado: 'completado' },
  { id: 'retiro_basura', label: 'Retiro basura',                 icon: '🗑',  estado: 'completado' },
  { id: 'insp_membrana', label: 'Inspección membrana',           icon: '🔍', estado: 'en_curso' },
  { id: 'insp_juntas',   label: 'Inspección juntas',             icon: '📐', estado: 'pendiente' },
  { id: 'insp_pen',      label: 'Inspección penetraciones',      icon: '🔧', estado: 'pendiente' },
  { id: 'insp_perim',    label: 'Inspección perimetral',         icon: '📏', estado: 'pendiente' },
];

export default function MovilPage() {
  const [vista, setVista] = useState('hoy'); // hoy | inspeccion | cierre
  const [oficinaActiva, setOficinaActiva] = useState(OFICINAS_DEMO[0]);

  return (
    <div className="min-h-screen bg-zinc-100 py-8 px-4">
      <div className="max-w-[1280px] mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block w-12 h-0.5 bg-red-600 mb-3" />
          <h1 className="text-3xl font-bold text-zinc-900">
            Aplicación Móvil de Campo
          </h1>
          <p className="text-sm text-zinc-500 mt-2 max-w-2xl mx-auto">
            PWA para brigadas en sitio · captura offline · checklist guiado · firma digital del responsable
            · sincronización automática con el ERP cuando hay conexión
          </p>
        </div>

        {/* Selector de vista */}
        <div className="flex justify-center gap-2 mb-8">
          {[
            { v: 'hoy',        label: '1. Calendario',     emoji: '📅' },
            { v: 'inspeccion', label: '2. Inspección',     emoji: '📋' },
            { v: 'cierre',     label: '3. Cierre · Firma', emoji: '✍️' },
          ].map(b => (
            <button
              key={b.v}
              onClick={() => setVista(b.v)}
              className={`px-4 py-2 rounded font-semibold text-sm transition ${
                vista === b.v ? 'bg-red-600 text-white' : 'bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <span className="mr-1.5">{b.emoji}</span> {b.label}
            </button>
          ))}
        </div>

        {/* 3 dispositivos en grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <DeviceFrame label="1. Calendario de Visitas" activo={vista === 'hoy'} onClick={() => setVista('hoy')}>
            <CalendarioScreen onSelectOficina={(o) => { setOficinaActiva(o); setVista('inspeccion'); }} />
          </DeviceFrame>

          <DeviceFrame label="2. Captura en Campo" activo={vista === 'inspeccion'} onClick={() => setVista('inspeccion')}>
            <InspeccionScreen oficina={oficinaActiva} onCerrar={() => setVista('cierre')} />
          </DeviceFrame>

          <DeviceFrame label="3. Cierre y Envío al Banco" activo={vista === 'cierre'} onClick={() => setVista('cierre')}>
            <CierreScreen oficina={oficinaActiva} onTerminar={() => setVista('hoy')} />
          </DeviceFrame>
        </div>

        {/* Características clave */}
        <div className="mt-12 bg-white border border-zinc-200 rounded p-6 max-w-4xl mx-auto">
          <h2 className="text-lg font-bold text-zinc-900 mb-3">Características clave</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-zinc-700">
            {[
              ['📶', 'Offline-first', 'Funciona sin señal · sincroniza al recuperar conexión'],
              ['✓', 'Checklist estructurado', 'Cada visita sigue el mismo protocolo'],
              ['📸', 'Foto con GPS obligatorio', 'Geolocalización y marca de tiempo no manipulables'],
              ['🔤', 'Categoría obligatoria', 'A/B/C/D asignada al cierre de cada visita'],
              ['✍️', 'Firma digital del responsable', 'Capturada en pantalla, integrada al reporte'],
              ['🔄', 'Sincronización automática', 'Sube al servidor cuando hay red disponible'],
            ].map(([emoji, t, sub]) => (
              <div key={t} className="flex items-start gap-3">
                <span className="text-xl mt-0.5 flex-shrink-0">{emoji}</span>
                <div>
                  <div className="font-semibold text-zinc-900">{t}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════ DEVICE FRAME ════════════
function DeviceFrame({ label, children, activo, onClick }) {
  return (
    <div className="flex flex-col items-center">
      <div
        onClick={onClick}
        className={`relative bg-zinc-900 rounded-[2.5rem] p-3 shadow-2xl transition cursor-pointer ${
          activo ? 'ring-4 ring-red-600 scale-105' : 'opacity-70 hover:opacity-100'
        }`}
        style={{ width: '320px' }}
      >
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-zinc-900 rounded-b-2xl z-10" />
        {/* Pantalla */}
        <div className="bg-white rounded-[2rem] overflow-hidden" style={{ height: '600px' }}>
          {children}
        </div>
      </div>
      <div className="text-xs text-zinc-600 font-semibold mt-3 text-center">{label}</div>
    </div>
  );
}

// ════════════ PANTALLA 1: CALENDARIO ════════════
function CalendarioScreen({ onSelectOficina }) {
  const completadas = VISITAS_HOY.filter(v => v.estado === 'completada').length;
  return (
    <div className="h-full flex flex-col text-xs">
      {/* Status bar */}
      <div className="bg-white px-4 pt-2 pb-1 flex items-center justify-between text-[10px] text-zinc-700 font-semibold">
        <span>9:42</span>
        <span className="flex items-center gap-1">📶 ⚡ 87%</span>
      </div>

      {/* App bar */}
      <div className="bg-red-600 text-white px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider opacity-90">VISITAS DE HOY</div>
        <div className="text-base font-bold">Miércoles 5 jun · Brigada 1</div>
        <div className="text-[10px] mt-1 opacity-90">{completadas} de {VISITAS_HOY.length} completadas</div>
      </div>

      {/* Progreso */}
      <div className="bg-red-700 h-1.5">
        <div className="bg-green-400 h-full" style={{ width: `${(completadas / VISITAS_HOY.length) * 100}%` }} />
      </div>

      {/* Supervisor */}
      <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200 text-[10px]">
        <span className="text-zinc-500">Supervisor:</span>{' '}
        <span className="font-semibold text-zinc-800">Roberto G.</span>
        <span className="text-zinc-400 ml-2">📍 18.490, -69.910</span>
      </div>

      {/* Lista de visitas */}
      <div className="flex-1 overflow-y-auto">
        {VISITAS_HOY.map(v => {
          const isActive = v.estado === 'en_curso';
          return (
            <div
              key={v.id}
              onClick={() => onSelectOficina(sucursales.find(s => s.codigo_br === v.id))}
              className={`px-4 py-3 border-b border-zinc-100 cursor-pointer ${
                isActive ? 'bg-amber-50 border-l-4 border-l-amber-500' : v.estado === 'completada' ? 'opacity-70' : 'hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {v.estado === 'completada' && <span className="w-4 h-4 rounded-full bg-green-600 text-white flex items-center justify-center text-[8px]">✓</span>}
                  {v.estado === 'en_curso' && <span className="w-4 h-4 rounded-full bg-amber-500 animate-pulse" />}
                  {v.estado === 'pendiente' && <span className="w-4 h-4 rounded-full border-2 border-zinc-300" />}
                  <span className={`font-mono text-[10px] ${v.estado === 'en_curso' ? 'text-amber-700 font-bold' : 'text-zinc-500'}`}>{v.codigo}</span>
                </div>
                <span className="text-[10px] text-zinc-500">{v.hora}</span>
              </div>
              <div className="font-semibold text-[11px] text-zinc-900 truncate">{v.oficina}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center justify-between">
                <span>{v.km} km de aquí</span>
                {v.estado === 'en_curso' && <span className="text-amber-700 font-bold">EN CURSO</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t border-zinc-200 flex">
        {[
          ['🏠', 'Hoy', true],
          ['📷', 'Captura'],
          ['📋', 'Pendientes'],
        ].map(([emoji, label, active]) => (
          <div key={label} className={`flex-1 py-2 text-center ${active ? 'text-red-600' : 'text-zinc-400'}`}>
            <div className="text-sm">{emoji}</div>
            <div className="text-[9px] mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════ PANTALLA 2: INSPECCIÓN ════════════
function InspeccionScreen({ oficina, onCerrar }) {
  return (
    <div className="h-full flex flex-col text-xs">
      <div className="bg-white px-4 pt-2 pb-1 flex items-center justify-between text-[10px] text-zinc-700 font-semibold">
        <span>9:42</span>
        <span className="flex items-center gap-1">📶 ⚡ 87%</span>
      </div>

      <div className="bg-red-600 text-white px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider opacity-90 flex items-center gap-1">
          <span>‹</span> INSPECCIÓN
        </div>
        <div className="text-sm font-bold leading-tight">{oficina?.zona || 'Oficina'}</div>
        <div className="text-[10px] opacity-90 mt-0.5 font-mono">{oficina?.codigo_br}</div>
      </div>

      <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200 text-[10px] flex items-center justify-between">
        <span><span className="text-zinc-500">Iniciada:</span> <strong>09:42</strong></span>
        <span className="text-amber-600 font-semibold">⏱ 23 min en sitio</span>
      </div>

      {/* Checklist */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-zinc-500 bg-zinc-50">
          Checklist técnico
        </div>
        {CHECKLIST_ITEMS.map(item => {
          const cls = item.estado === 'completado' ? 'bg-green-50 border-l-green-600 text-green-900'
                    : item.estado === 'en_curso' ? 'bg-amber-50 border-l-amber-500 text-amber-900'
                    : 'bg-white border-l-zinc-200 text-zinc-700';
          return (
            <div key={item.id} className={`px-4 py-2.5 border-b border-zinc-100 border-l-4 ${cls} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className="text-base">{item.icon}</span>
                <span className="text-[11px] font-semibold">{item.label}</span>
              </div>
              <div>
                {item.estado === 'completado' && <span className="w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center text-[9px]">✓</span>}
                {item.estado === 'en_curso' && <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px]">●</span>}
                {item.estado === 'pendiente' && <span className="w-5 h-5 rounded-full border-2 border-zinc-300" />}
              </div>
            </div>
          );
        })}

        {/* Hallazgos */}
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-zinc-500 bg-zinc-50 mt-2">
          Hallazgos registrados
        </div>
        <div className="bg-red-50 border-l-4 border-l-red-600 px-4 py-2.5 mb-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-red-700 text-[11px]">3 críticos</span>
            <span className="text-red-600 text-[10px]">›</span>
          </div>
          <div className="text-[10px] text-red-700 mt-1">
            Empozamiento central · Membrana al final · Vegetación en juntas
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-zinc-900 grid grid-cols-2 gap-px">
        <button className="bg-zinc-800 text-white py-3 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
          <span>📸</span> Capturar foto
        </button>
        <button onClick={onCerrar} className="bg-red-600 text-white py-3 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
          <span>+</span> Nuevo hallazgo
        </button>
      </div>
    </div>
  );
}

// ════════════ PANTALLA 3: CIERRE ════════════
function CierreScreen({ oficina, onTerminar }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [estadoFinal, setEstadoFinal] = useState('B');

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#18181b';
    ctx.lineCap = 'round';
  }, []);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - rect.left) * (c.width / rect.width),
      y: (t.clientY - rect.top) * (c.height / rect.height),
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setDrawing(true);
    const p = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => setDrawing(false);

  const clearSig = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHasSignature(false);
  };

  return (
    <div className="h-full flex flex-col text-xs">
      <div className="bg-white px-4 pt-2 pb-1 flex items-center justify-between text-[10px] text-zinc-700 font-semibold">
        <span>10:12</span>
        <span className="flex items-center gap-1">📶 ⚡ 87%</span>
      </div>

      <div className="bg-red-600 text-white px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider opacity-90">CIERRE DE VISITA</div>
        <div className="text-sm font-bold leading-tight">{oficina?.zona || 'Oficina'}</div>
        <div className="text-[10px] opacity-90 mt-0.5">Duración: 30 min · 18 fotos capturadas</div>
      </div>

      {/* Resumen */}
      <div className="bg-green-50 border-b border-green-200 px-4 py-2.5">
        <div className="text-[10px] uppercase tracking-wider font-bold text-green-700 mb-1">Resumen</div>
        <div className="space-y-0.5 text-[10px] text-green-900">
          <div>✓ Inspección completa</div>
          <div>✓ Limpieza ejecutada</div>
          <div>3 hallazgos · 1 alta severidad</div>
        </div>
      </div>

      {/* Estado final */}
      <div className="px-4 py-3 border-b border-zinc-200 flex-shrink-0">
        <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-2">
          Estado actual del techo
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {['A', 'B', 'C', 'D'].map(cat => {
            const isActive = estadoFinal === cat;
            return (
              <button
                key={cat}
                onClick={() => setEstadoFinal(cat)}
                className={`py-2 rounded font-bold text-sm transition ${
                  isActive ? 'text-white shadow-lg scale-105' : 'bg-zinc-100 text-zinc-400'
                }`}
                style={{ background: isActive ? COLOR_CAT[cat] : undefined }}
              >
                {cat}
              </button>
            );
          })}
        </div>
        <div className="text-[9px] text-zinc-500 mt-1.5 text-center">
          Asignado por <strong>R. Henríquez</strong> · {new Date().toLocaleDateString('es-DO')}
        </div>
      </div>

      {/* Observaciones */}
      <div className="px-4 py-2 border-b border-zinc-200 flex-shrink-0">
        <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Observaciones</div>
        <div className="text-[10px] text-zinc-700 italic bg-zinc-50 border border-zinc-200 rounded p-2 leading-relaxed">
          Sistema en buen estado general, pero hay una apertura crítica que requiere atención inmediata.
          Hay 3 hallazgos · recomendar reseñar.
        </div>
      </div>

      {/* Firma */}
      <div className="px-4 py-2 flex-1 flex flex-col">
        <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1 flex items-center justify-between">
          <span>Firma del responsable</span>
          {hasSignature && (
            <button onClick={clearSig} className="text-red-600 normal-case tracking-normal text-[10px]">Limpiar</button>
          )}
        </div>
        <div className="bg-zinc-50 border-2 border-dashed border-zinc-300 rounded flex-1 relative min-h-[60px]">
          <canvas
            ref={canvasRef}
            width={280}
            height={80}
            className="w-full h-full rounded"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          {!hasSignature && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-[10px] pointer-events-none">
              Lic. María Pérez · Gerente
            </div>
          )}
        </div>
      </div>

      {/* Action */}
      <button
        onClick={onTerminar}
        className="bg-green-600 hover:bg-green-700 text-white py-3 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
        ✓ Enviar y generar reporte
      </button>
      <div className="text-[9px] text-zinc-500 text-center py-1 bg-zinc-50">
        Reporte se sube automáticamente al banco
      </div>
    </div>
  );
}
