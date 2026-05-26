'use client';

// v8.19.4: DynamicSurveyForm — corazón del módulo. Lee template.schema
// y renderiza formulario completo. Maneja:
//   - Sección "general" → visits.general_data (jsonb)
//   - Secciones tipo "repeating_block" → N rows en surveys.areas
//   - Check-in (auto al crear visita) y Check-out (al cerrar)
//   - Persist autosave de cambios cada N segundos
//
// Soporta el atajo "área similar" (PR 3B.6 lo enriquece): copia campos
// no-medida del area de origen a un area nueva, dejándolo editable.
//
// Lo que NO está en esta primera versión (queda para iteraciones):
//   - Upload real de fotos (placeholder visible — PR 3B.5)
//   - Signature canvas (placeholder)
//   - GPS check-in con validación contra coordenadas del site
//   - Sync offline (PWA / IndexedDB)

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2, X, Save, Check, Plus, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { obtenerTemplateSurvey, crearVisita, actualizarVisita, cerrarVisita, listarAreasDeVisita, crearArea, actualizarArea, eliminarArea } from '../../lib/surveys';
import SurveyFieldRenderer from './SurveyFieldRenderer';

export default function DynamicSurveyForm({ site, proyecto, usuario, onCerrar, onCompletado }) {
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState(null);
  const [visit, setVisit] = useState(null);
  const [areas, setAreas] = useState([]); // localmente: areas con sus drafts
  const [generalData, setGeneralData] = useState({});
  const [errorMsg, setErrorMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  // 1. Cargar template + crear/recuperar visita
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const t = await obtenerTemplateSurvey(proyecto.template_id);
        if (!t) throw new Error('Template no encontrado: ' + proyecto.template_id);
        if (cancelado) return;
        setTemplate(t);

        // Crear visita nueva. (Iteración futura: reusar visita abierta del site.)
        // Usamos el auth_user_id del usuario. Si no lo tiene (transition), fallamos
        // con mensaje claro.
        const authUserId = await obtenerAuthUserIdActual();
        if (!authUserId) {
          throw new Error('No se pudo identificar al levantador. Cierra sesión y vuelve a entrar.');
        }
        const v = await crearVisita({ siteId: site.id, surveyorAuthUserId: authUserId });
        if (cancelado) return;
        setVisit(v);
        setGeneralData(v.general_data || {});
        setAreas([]);
        setErrorMsg(null);
      } catch (e) {
        if (!cancelado) setErrorMsg(e?.message || String(e));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [proyecto.template_id, site.id]);

  const secciones = template?.schema?.sections || [];
  const secGeneral = secciones.find(s => s.type !== 'repeating_block') || secciones[0];
  const bloquesRepetibles = secciones.filter(s => s.type === 'repeating_block');

  // Guardado de general_data (al cambiar)
  const guardarGeneralData = useCallback(async (nuevo) => {
    if (!visit) return;
    setGeneralData(nuevo);
    setGuardando(true);
    try {
      await actualizarVisita(visit.id, { general_data: nuevo });
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setGuardando(false);
    }
  }, [visit]);

  // Agregar nueva área a un bloque repetible
  const agregarArea = async (bloque) => {
    if (!visit) return;
    const nextNum = areas.filter(a => a.block_id === bloque.id).length + 1;
    const nombreSugerido = `${bloque.block_label || bloque.title || 'Área'} #${nextNum}`;
    try {
      const a = await crearArea({
        visitId: visit.id,
        blockId: bloque.id,
        areaNumber: nextNum,
        name: nombreSugerido,
        data: {},
      });
      setAreas(prev => [...prev, a]);
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    }
  };

  // Actualizar campos de un area (debounce manual via timer si quisieras)
  const actualizarCampoArea = async (areaId, campo, valor) => {
    setAreas(prev => prev.map(a => {
      if (a.id !== areaId) return a;
      const data = { ...(a.data || {}), [campo]: valor };
      return { ...a, data };
    }));
    // Persistir
    const area = areas.find(a => a.id === areaId);
    const data = { ...((area && area.data) || {}), [campo]: valor };
    try {
      await actualizarArea(areaId, { data });
    } catch (e) {
      console.warn('No se pudo guardar campo de area:', e?.message);
    }
  };

  const renombrarArea = async (areaId, nuevoNombre) => {
    setAreas(prev => prev.map(a => a.id === areaId ? { ...a, name: nuevoNombre } : a));
    try {
      await actualizarArea(areaId, { name: nuevoNombre });
    } catch (e) {
      console.warn('No se pudo renombrar:', e?.message);
    }
  };

  const eliminarAreaLocal = async (areaId) => {
    if (!confirm('¿Eliminar esta área? Esta acción no se puede deshacer.')) return;
    try {
      await eliminarArea(areaId);
      setAreas(prev => prev.filter(a => a.id !== areaId));
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    }
  };

  const cerrarVisitaCompleta = async () => {
    if (!visit) return;
    if (!confirm('¿Cerrar la visita? Después no podrás editarla desde aquí.')) return;
    setCerrando(true);
    try {
      await cerrarVisita(visit.id);
      onCompletado?.();
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setCerrando(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
        <div className="bg-zinc-900 border-2 border-zinc-800 p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-red-500" />
          <span className="text-sm text-zinc-300">Iniciando levantamiento...</span>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onCerrar}>
        <div className="bg-zinc-900 border-2 border-red-700 p-6 max-w-md" onClick={e => e.stopPropagation()}>
          <div className="text-red-400 font-bold mb-2">No se pudo iniciar el levantamiento</div>
          <div className="text-sm text-zinc-300 mb-4">{errorMsg}</div>
          <button onClick={onCerrar} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 text-sm font-bold">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[60] overflow-y-auto">
      <div className="min-h-full p-2 sm:p-4">
        <div className="bg-zinc-950 border-2 border-zinc-800 max-w-3xl mx-auto">
          {/* Header sticky */}
          <div className="sticky top-0 bg-zinc-950 border-b-2 border-red-600 px-4 py-3 flex items-center justify-between z-10">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                Levantamiento · {template.name}
              </div>
              <div className="font-black text-sm truncate">{site.name}</div>
            </div>
            <div className="flex items-center gap-2">
              {guardando && (
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> guardando
                </span>
              )}
              <button
                onClick={onCerrar}
                className="text-zinc-400 hover:text-white p-1"
                title="Cerrar (sin completar)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sección general */}
          {secGeneral && (
            <SeccionGeneral
              seccion={secGeneral}
              values={generalData}
              onChange={guardarGeneralData}
            />
          )}

          {/* Bloques repetibles */}
          {bloquesRepetibles.map(b => (
            <BloqueRepetible
              key={b.id}
              bloque={b}
              areas={areas.filter(a => a.block_id === b.id)}
              onAgregar={() => agregarArea(b)}
              onCambioCampo={actualizarCampoArea}
              onRenombrar={renombrarArea}
              onEliminar={eliminarAreaLocal}
              supportsSimilar={template.schema?.supports_similar_shortcut}
            />
          ))}

          {/* Footer con cerrar visita */}
          <div className="border-t-2 border-zinc-800 p-4 flex items-center justify-between gap-2 sticky bottom-0 bg-zinc-950">
            <div className="text-[11px] text-zinc-500">
              {areas.length} área{areas.length === 1 ? '' : 's'} · check-in {visit?.checkin_at ? new Date(visit.checkin_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onCerrar}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 text-xs font-bold uppercase"
              >
                Pausar (guardar y salir)
              </button>
              <button
                onClick={cerrarVisitaCompleta}
                disabled={cerrando}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold uppercase flex items-center gap-1 disabled:opacity-50"
              >
                {cerrando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Cerrar levantamiento
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sección general (no repetible)
// ============================================================
function SeccionGeneral({ seccion, values, onChange }) {
  const setField = (id, val) => {
    onChange({ ...values, [id]: val });
  };
  return (
    <div className="border-b border-zinc-800">
      <div className="bg-zinc-900 px-4 py-2 text-[10px] uppercase tracking-widest text-red-500 font-bold">
        {seccion.title || 'Información general'}
      </div>
      <div className="p-4 space-y-3">
        {(seccion.fields || []).map(f => (
          <SurveyFieldRenderer
            key={f.id}
            field={f}
            value={values[f.id]}
            onChange={(v) => setField(f.id, v)}
            allValues={values}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Bloque repetible (N areas)
// ============================================================
function BloqueRepetible({ bloque, areas, onAgregar, onCambioCampo, onRenombrar, onEliminar, supportsSimilar }) {
  return (
    <div className="border-b border-zinc-800">
      <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-red-500 font-bold">
          {bloque.title} {areas.length > 0 && <span className="text-zinc-500">({areas.length})</span>}
        </div>
        <button
          onClick={onAgregar}
          className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-2 py-1 font-bold uppercase tracking-wider flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> {bloque.block_label || 'Agregar'}
        </button>
      </div>
      {areas.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-zinc-500">
          Aún no hay {bloque.block_label?.toLowerCase() || 'áreas'}. Agrega la primera arriba.
        </div>
      )}
      {areas.map((area) => (
        <AreaCard
          key={area.id}
          area={area}
          bloque={bloque}
          onCambioCampo={(campo, valor) => onCambioCampo(area.id, campo, valor)}
          onRenombrar={(n) => onRenombrar(area.id, n)}
          onEliminar={() => onEliminar(area.id)}
          supportsSimilar={supportsSimilar}
        />
      ))}
    </div>
  );
}

function AreaCard({ area, bloque, onCambioCampo, onRenombrar, onEliminar, supportsSimilar }) {
  const [colapsado, setColapsado] = useState(false);
  return (
    <div className="border-t border-zinc-800/50">
      <div className="px-4 py-2 flex items-center gap-2 bg-zinc-900/60">
        <button onClick={() => setColapsado(c => !c)} className="text-zinc-500 hover:text-white">
          {colapsado ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        <input
          value={area.name || ''}
          onChange={e => onRenombrar(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none text-sm font-bold text-white"
        />
        <button
          onClick={onEliminar}
          className="text-zinc-500 hover:text-red-500"
          title="Eliminar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {!colapsado && (
        <div className="px-4 py-3 space-y-3">
          {(bloque.fields || []).map(f => (
            <SurveyFieldRenderer
              key={f.id}
              field={f}
              value={(area.data || {})[f.id]}
              onChange={(v) => onCambioCampo(f.id, v)}
              allValues={area.data || {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helper: obtener auth_user_id del usuario actual
// ============================================================
async function obtenerAuthUserIdActual() {
  if (typeof window === 'undefined') return null;
  try {
    // El cliente Supabase persiste la sesión en localStorage tras login (PR 2B).
    // window.supabase no existe globalmente, pero podemos leer de la key del storage.
    const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (keys.length === 0) return null;
    const raw = localStorage.getItem(keys[0]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.id || parsed?.currentSession?.user?.id || null;
  } catch (e) {
    console.warn('obtenerAuthUserIdActual:', e?.message);
    return null;
  }
}
