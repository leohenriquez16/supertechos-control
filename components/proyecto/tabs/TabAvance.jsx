'use client';

import React, { useState } from 'react';
import { ChevronDown, Edit2, Plus, Trash2, X } from 'lucide-react';
import { formatRD, formatFecha } from '../../../lib/helpers/formato';
import { getM2Reporte, getPrecioVentaArea, calcAvanceArea } from '../../../lib/helpers/calculos';
import ModalEditarReporte from '../modales/ModalEditarReporte';
import * as db from '../../../lib/db';

// v8.19.25: modal para crear un área nueva, o para "agregar otro sistema" a un
// área existente (clona el nombre + m² y solo permite cambiar el sistema).
// v8.19.35: Renderiza un nivel de grupos (recursivo: cada grupo despinta sus
// hijos a través de la misma componente).
function RenderGrupos({ grupos, nivel, ctx }) {
  if (!grupos || grupos.length === 0) return null;
  return (
    <div className={nivel === 0 ? 'space-y-3' : 'space-y-2 mt-3'}>
      {grupos.map(g => <GrupoArea key={g.nombre + '_' + (g.areas[0]?.padreId || 'root')} grupo={g} nivel={nivel} ctx={ctx} />)}
    </div>
  );
}

function GrupoArea({ grupo, nivel, ctx }) {
  const { proyecto, sistema, sistemas, reportes, esSupervisor, esAdmin,
          areasColapsadas, toggleColapsar, setModalNuevaArea } = ctx;
  // clave única para colapsar (nombre + padreId del primero del grupo)
  const claveColapso = `${nivel}_${grupo.areas[0]?.padreId || 'root'}_${grupo.nombre}`;
  const colapsado = areasColapsadas.has(claveColapso);

  const subs = grupo.areas.map(area => {
    const sistemaIdArea = area.sistemaId || proyecto.sistema;
    const sistemaArea = (sistemas && sistemas[sistemaIdArea]) || sistema;
    const calc = sistemaArea
      ? calcAvanceArea(proyecto, area.id, reportes, sistemaArea)
      : { porcentaje: 0, produccionRD: 0, m2PorTarea: {} };
    return { area, sistema: sistemaArea, ...calc };
  });
  const m2Zona = subs[0]?.area?.m2 || 0;
  const tieneAlgunSinSistema = subs.some(s => !s.sistema);
  const avancePromedio = subs.length > 0 ? subs.reduce((s, x) => s + x.porcentaje, 0) / subs.length : 0;
  const produccionTotal = subs.reduce((s, x) => s + (x.produccionRD || 0), 0);
  const contratoTotal = subs.reduce((s, x) => s + (x.sistema ? (x.area.m2 * getPrecioVentaArea(x.area, x.sistema)) : 0), 0);
  const sistemasLabel = subs.map(s => s.sistema?.nombre || '⚠').join(' + ');

  const nHijos = grupo.hijos?.length || 0;
  const sangria = nivel === 0 ? '' : 'ml-4 sm:ml-6 border-l-2 border-zinc-800 pl-3';
  const donutSize = nivel === 0 ? 56 : 36;

  return (
    <div className={sangria}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card">
        <button
          onClick={() => toggleColapsar(claveColapso)}
          className="w-full p-3 sm:p-4 text-left flex items-center gap-3 sm:gap-4 hover:bg-zinc-800/30"
        >
          <MiniDonut porcentaje={avancePromedio} size={donutSize} strokeWidth={nivel === 0 ? 6 : 4} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${colapsado ? '' : 'rotate-180'}`} />
              <div className={`font-bold ${nivel === 0 ? 'text-lg' : 'text-sm'} truncate`}>{grupo.nombre}</div>
              {subs.length > 1 && (
                <span className="text-[10px] uppercase tracking-wider bg-red-900/40 border border-red-700 text-red-300 px-1.5 py-0.5">
                  {subs.length} sistemas
                </span>
              )}
              {nHijos > 0 && (
                <span className="text-[10px] uppercase tracking-wider bg-cyan-900/40 border border-cyan-700 text-cyan-300 px-1.5 py-0.5">
                  {nHijos} sub-{nHijos === 1 ? 'área' : 'áreas'}
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-500 flex items-center gap-2 flex-wrap mt-1">
              <span>{m2Zona} m² · <span className="text-red-400">{sistemasLabel}</span></span>
              {esAdmin && subs.length > 0 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setModalNuevaArea({ areaBase: subs[0].area }); }}
                    className="text-[10px] text-red-500 hover:text-red-400 flex items-center gap-0.5"
                    title="Crea otro trabajo sobre la misma área con un sistema distinto"
                  >
                    <Plus className="w-2.5 h-2.5" /> Otro sistema aquí
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setModalNuevaArea({ padreArea: subs[0].area }); }}
                    className="text-[10px] text-cyan-500 hover:text-cyan-400 flex items-center gap-0.5"
                    title="Divide esta zona en sub-áreas (ej. Bloque A, Edificio 1)"
                  >
                    <Plus className="w-2.5 h-2.5" /> Sub-área
                  </button>
                </>
              )}
            </div>
            {!esSupervisor && (
              <div className="text-xs text-zinc-400 mt-1">
                Producción: <span className="text-green-400 font-bold">{formatRD(produccionTotal)}</span>
                <span className="text-zinc-600 ml-2">/ {formatRD(contratoTotal)}</span>
                {colapsado && <span className="text-zinc-500 ml-2">· {avancePromedio.toFixed(0)}% promedio</span>}
              </div>
            )}
          </div>
        </button>

        {!colapsado && (
          <div className="border-t border-zinc-800 p-3 sm:p-4 space-y-5">
            {tieneAlgunSinSistema && (
              <div className="text-xs text-red-400">⚠️ Una o más entradas no tienen sistema asignado. Edita el proyecto.</div>
            )}
            {subs.map((sub, subIdx) => {
              if (!sub.sistema) {
                return (
                  <div key={sub.area.id} className="text-[11px] text-red-400 border-l-2 border-red-700 pl-3">
                    Entrada sin sistema (id {sub.area.id.slice(0, 8)}…)
                  </div>
                );
              }
              return (
                <div key={sub.area.id} className={subIdx > 0 ? 'border-t border-zinc-800 pt-4' : ''}>
                  {subs.length > 1 && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] tracking-widest uppercase font-bold flex items-center gap-2">
                        <span className="text-red-400">{sub.sistema.nombre}</span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-400">{sub.porcentaje.toFixed(0)}%</span>
                      </div>
                      {!esSupervisor && (
                        <div className="text-[10px] text-zinc-500">
                          {formatRD(sub.produccionRD)} <span className="text-zinc-600">/ {formatRD(sub.area.m2 * getPrecioVentaArea(sub.area, sub.sistema))}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-3">
                    {sub.sistema.tareas.map((t, idx) => {
                      const m2P = Math.min(sub.m2PorTarea[t.id] || 0, sub.area.m2);
                      const pct = sub.area.m2 > 0 ? (m2P / sub.area.m2) * 100 : 0;
                      return (
                        <BarraProgreso
                          key={t.id}
                          porcentaje={pct}
                          m2Ejecutados={m2P}
                          m2Total={sub.area.m2}
                          nombreTarea={t.nombre}
                          colorIndex={idx}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sub-áreas anidadas (recursivo) */}
      {!colapsado && nHijos > 0 && (
        <RenderGrupos grupos={grupo.hijos} nivel={nivel + 1} ctx={ctx} />
      )}
    </div>
  );
}

function ModalNuevaArea({ proyecto, sistemas, areaBase, padreArea, onCerrar, onGuardado }) {
  // v8.19.35: 3 modos:
  //   1) Nueva área raíz (sin padreId, sin areaBase): nombre/m²/sistema libres.
  //   2) "Otro sistema aquí" (areaBase): clona nombre+m², solo cambia sistema.
  //   3) "Sub-área" (padreArea): nuevo nombre/m² libres, sistema hereda del padre.
  const esAgregarSistema = !!areaBase && !padreArea;
  const esSubArea = !!padreArea;
  const [nombre, setNombre] = useState(areaBase?.nombre || '');
  const [m2, setM2] = useState(areaBase?.m2 || '');
  const [sistemaId, setSistemaId] = useState(padreArea?.sistemaId || '');
  const [guardando, setGuardando] = useState(false);

  const titulo = esAgregarSistema ? 'Otro sistema en el área' : esSubArea ? `Sub-área de "${padreArea.nombre}"` : 'Nueva área';
  const ctaLabel = esAgregarSistema ? 'Agregar sistema' : esSubArea ? 'Crear sub-área' : 'Crear área';

  const guardar = async () => {
    if (!nombre.trim()) { alert('Falta el nombre del área.'); return; }
    if (!(Number(m2) > 0)) { alert('m² debe ser mayor a 0.'); return; }
    if (esAgregarSistema && !sistemaId) { alert('Elige un sistema (debe ser distinto al existente).'); return; }
    setGuardando(true);
    try {
      const nueva = {
        id: 'a_' + Date.now() + Math.random().toString(36).slice(2, 6),
        nombre: nombre.trim(),
        m2: Number(m2),
        sistemaId: sistemaId || null,
        // v8.19.35: padre para anidamiento
        padreId: esSubArea ? padreArea.id : (areaBase ? (areaBase.padreId || null) : null),
      };
      const nuevas = [...(proyecto.areas || []), nueva];
      await db.actualizarProyecto({ ...proyecto, areas: nuevas });
      if (onGuardado) await onGuardado();
      onCerrar();
    } catch (e) { alert('Error guardando: ' + (e.message || e)); }
    setGuardando(false);
  };

  const sistemaActual = areaBase ? (areaBase.sistemaId || proyecto.sistema) : null;
  const opciones = Object.values(sistemas || {}).filter(s => !esAgregarSistema || s.id !== sistemaActual);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-md w-full p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-black uppercase tracking-wide">{titulo}</div>
          <button onClick={onCerrar} disabled={guardando} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {esAgregarSistema && (
          <div className="text-[11px] text-zinc-500 italic border-l-2 border-red-600 pl-2">
            Crea un trabajo adicional sobre "{areaBase.nombre}" ({areaBase.m2} m²) con un sistema distinto al actual.
          </div>
        )}
        {esSubArea && (
          <div className="text-[11px] text-zinc-500 italic border-l-2 border-red-600 pl-2">
            Divide "{padreArea.nombre}" en partes más pequeñas (ej. Bloque A, Edificio 1).
            Las sub-áreas tienen sus propios m² y reportes; el padre agrega sus avances.
          </div>
        )}
        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Nombre del área</div>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            disabled={esAgregarSistema}
            placeholder={esSubArea ? 'Ej. Bloque A, Edificio 1' : 'Ej. Techo Superior'}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-sm text-white disabled:opacity-60"
          />
        </label>
        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">m²</div>
          <input
            type="number" step="0.01"
            value={m2}
            onChange={e => setM2(e.target.value)}
            disabled={esAgregarSistema}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-sm text-white disabled:opacity-60 text-right tabular-nums"
          />
        </label>
        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Sistema {esAgregarSistema ? '(distinto al actual)' : esSubArea ? '(hereda del padre por defecto)' : '(opcional — si no eliges usa el del proyecto)'}
          </div>
          <select
            value={sistemaId}
            onChange={e => setSistemaId(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-sm text-white"
          >
            <option value="">{esAgregarSistema ? '— elige uno —' : esSubArea ? '— heredar del padre —' : '— sistema del proyecto —'}</option>
            {opciones.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||'')).map(s => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCerrar} disabled={guardando} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white uppercase">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-black uppercase text-xs">
            {guardando ? 'Guardando…' : ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// v8.10.23: Mini donut SVG reutilizable
function MiniDonut({ porcentaje, size = 80, strokeWidth = 8, className = '' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (porcentaje / 100) * circumference;
  // Color según nivel de avance
  const color = porcentaje >= 75 ? '#22c55e' : porcentaje >= 40 ? '#eab308' : '#ef4444';
  const textColor = porcentaje >= 75 ? 'text-green-400' : porcentaje >= 40 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-black ${textColor}`}>{porcentaje.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// v8.10.23: Barra de progreso con gradiente por nivel
function BarraProgreso({ porcentaje, m2Ejecutados, m2Total, nombreTarea, colorIndex = 0 }) {
  const pct = Math.min(porcentaje, 100);
  const colores = [
    { dot: 'bg-cyan-500', bar: 'bg-gradient-to-r from-cyan-600 to-cyan-400' },
    { dot: 'bg-purple-500', bar: 'bg-gradient-to-r from-purple-600 to-purple-400' },
    { dot: 'bg-blue-500', bar: 'bg-gradient-to-r from-blue-600 to-blue-400' },
    { dot: 'bg-amber-500', bar: 'bg-gradient-to-r from-amber-600 to-amber-400' },
    { dot: 'bg-rose-500', bar: 'bg-gradient-to-r from-rose-600 to-rose-400' },
  ];
  const c = colores[colorIndex % colores.length];
  const textColor = pct >= 75 ? 'text-green-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
          <span className="text-xs font-semibold">{nombreTarea}</span>
        </div>
        <span className={`text-xs font-bold ${textColor}`}>
          {m2Ejecutados.toFixed(0)}/{m2Total.toFixed(0)} m² · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${c.bar}`}
          style={{ width: `${pct}%`, transition: 'width 0.8s ease' }}
        />
      </div>
    </div>
  );
}

export default function TabAvance({ proyecto, reportes, sistema, sistemas, esSupervisor, onEliminarReporte, onEditarReporte, data, usuario, onRecargar }) {
  const [reporteEditando, setReporteEditando] = useState(null);
  const [modalNuevaArea, setModalNuevaArea] = useState(null); // null | { areaBase?: object }
  const [areasColapsadas, setAreasColapsadas] = useState(new Set()); // v8.19.34: claves de áreas colapsadas
  const esAdmin = (usuario?.roles || []).includes('admin');
  const reportesProy = reportes.filter(r => r.proyectoId === proyecto.id).sort((a, b) => b.fecha.localeCompare(a.fecha));

  // v8.19.35: construir jerarquía recursiva.
  //   - Raíces: áreas con padreId == null.
  //   - Hijos: padreId apunta a otra área. Las sub-áreas heredan visualmente y
  //     se renderizan anidadas (con sangría).
  //   - "Otro sistema aquí" (v8.19.25) sigue agrupando por nombre dentro del
  //     mismo padre — el mismo nombre + mismo padre = misma zona física.
  const jerarquiaAreas = React.useMemo(() => {
    const todas = proyecto.areas || [];
    const construir = (padreIds) => {
      const directas = todas.filter(a => padreIds.includes(a.padreId || null));
      const mapa = {};
      const orden = [];
      for (const a of directas) {
        const key = (a.nombre || '(sin nombre)').trim();
        if (!mapa[key]) { mapa[key] = []; orden.push(key); }
        mapa[key].push(a);
      }
      return orden.map(nombre => {
        const areasDelGrupo = mapa[nombre];
        return {
          nombre,
          areas: areasDelGrupo,
          hijos: construir(areasDelGrupo.map(x => x.id)),
        };
      });
    };
    return construir([null]);
  }, [proyecto.areas]);

  const toggleColapsar = (key) => {
    const next = new Set(areasColapsadas);
    if (next.has(key)) next.delete(key); else next.add(key);
    setAreasColapsadas(next);
  };
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold">Áreas</h2>
          {esAdmin && (
            <button
              onClick={() => setModalNuevaArea({})}
              className="text-[11px] text-red-500 hover:text-red-400 flex items-center gap-1 font-bold uppercase tracking-wider"
            >
              <Plus className="w-3 h-3" /> Nueva área
            </button>
          )}
        </div>
        <div className="space-y-3">
          <RenderGrupos
            grupos={jerarquiaAreas}
            nivel={0}
            ctx={{
              proyecto, sistema, sistemas, reportes, esSupervisor, esAdmin,
              areasColapsadas, toggleColapsar, setModalNuevaArea,
            }}
          />
        </div>
      </div>

      <div>
        <h2 className="text-xs tracking-widest uppercase text-zinc-400 font-bold mb-3">Reportes ({reportesProy.length})</h2>
        <div className="space-y-2">{reportesProy.map(r => {
          const area = proyecto.areas.find(a => a.id === r.areaId);
          const sistemaIdArea = area?.sistemaId || proyecto.sistema;
          const sistemaR = (sistemas && sistemas[sistemaIdArea]) || sistema;
          if (!sistemaR) return null;
          const tarea = sistemaR.tareas.find(t => t.id === r.tareaId);
          const m2 = getM2Reporte(r, sistemaR);
          return (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-zinc-500">{formatFecha(r.fecha)}</div>
                <div className="text-sm font-bold">{area?.nombre || '—'} · {tarea?.nombre || '—'}</div>
                <div className="text-xs text-zinc-400">{m2.toFixed(2)} m²{r.rollos ? ` · ${r.rollos} rollos` : ''}{r.cubetas ? ` · ${r.cubetas} cubetas` : ''}</div>
                {r.nota && <div className="text-[10px] text-zinc-500 mt-1 italic">{r.nota}</div>}
                {r.supervisor && <div className="text-[10px] text-zinc-600">— {r.supervisor}</div>}
              </div>
              {!esSupervisor && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setReporteEditando(r)} className="text-zinc-500 hover:text-blue-500 p-1"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={() => onEliminarReporte && onEliminarReporte(r.id)} className="text-zinc-500 hover:text-red-500 p-1"><Trash2 className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          );
        })}{reportesProy.length === 0 && <div className="text-center text-zinc-500 text-sm py-8">Sin reportes</div>}</div>
      </div>

      {/* v8.19.25/35: modal "Nueva área" / "Otro sistema aquí" / "Sub-área" */}
      {modalNuevaArea && (
        <ModalNuevaArea
          proyecto={proyecto}
          sistemas={sistemas}
          areaBase={modalNuevaArea.areaBase || null}
          padreArea={modalNuevaArea.padreArea || null}
          onCerrar={() => setModalNuevaArea(null)}
          onGuardado={onRecargar}
        />
      )}

      {/* v8.10.23: Modal editar reporte */}
      {reporteEditando && onEditarReporte && (
        <ModalEditarReporte
          reporte={reporteEditando}
          proyecto={proyecto}
          data={data}
          sistema={sistema}
          sistemas={sistemas}
          onCerrar={() => setReporteEditando(null)}
          onGuardar={async (reporteActualizado, motivo) => {
            await onEditarReporte(reporteActualizado, reporteEditando, motivo);
            setReporteEditando(null);
          }}
        />
      )}
    </div>
  );
}
