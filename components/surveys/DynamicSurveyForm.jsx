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

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Loader2, X, Save, Check, Plus, Copy, Trash2, ChevronDown, ChevronUp, Zap, Sun, Moon } from 'lucide-react';
import { obtenerTemplateSurvey, crearVisita, obtenerVisitaAbiertaDeSite, actualizarVisita, cerrarVisita, listarAreasDeVisita, crearArea, actualizarArea, eliminarArea, calcularCompletitud, setCompletitudProyecto, familiaDeServiceLine, tiposDeFamilia, familiaPorKey } from '../../lib/surveys';
import { obtenerUbicacion, distanciaMetros } from '../../lib/geo';
import SurveyFieldRenderer from './SurveyFieldRenderer';

// v8.19.6: detecta si un campo es "de medida" (visible cuando un área es
// marcada como 'similar a otra'). Reglas:
//   - tablas measurement_table / openings_table → siempre medidas
//   - number cuyo id incluye largo/alto/ancho/área/profundidad → medida
//   - computed → siempre visible (depende de medidas, debe recalcularse)
//   - resto (text, select, boolean, rating, photos, signature) → no medida
function esCampoMedida(field) {
  if (field.type === 'measurement_table' || field.type === 'openings_table') return true;
  if (field.type === 'computed') return true;
  if (field.type === 'number') {
    const id = (field.id || '').toLowerCase();
    return /(length|width|height|depth|area|m2|largo|ancho|alto|profund|metro|cantidad)/.test(id);
  }
  return false;
}

export default function DynamicSurveyForm({ site, proyecto, usuario, onCerrar, onCompletado }) {
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState(null);
  const [visit, setVisit] = useState(null);
  const [areas, setAreas] = useState([]); // localmente: areas con sus drafts
  const [generalData, setGeneralData] = useState({});
  const [errorMsg, setErrorMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);
  // v8.19.52: validación de ubicación en sitio al abrir el levantamiento.
  const [gps, setGps] = useState({ estado: 'idle' }); // idle|cargando|ok|sin_referencia|lejos|error
  // v8.19.53: check-in pide la foto de fachada de una vez (con opción de diferir).
  const [fachadaDiferida, setFachadaDiferida] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [modoCampo, setModoCampo] = useState(false); // v8.24.3: fondo claro para uso bajo el sol
  const [brillo, setBrillo] = useState(100); // v8.24.3: atenuador (no puede superar el máximo del equipo)

  // v8.24.3: mantener la pantalla encendida durante el levantamiento (Wake Lock).
  useEffect(() => {
    let lock = null;
    const pedir = async () => {
      try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch {}
    };
    pedir();
    const onVis = () => { if (document.visibilityState === 'visible') pedir(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); try { lock?.release?.(); } catch {} };
  }, []);

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

        // v8.24.7: reusar la visita ABIERTA del sitio si existe (evita acumular visitas
        // vacías al reabrir el formulario). Si no hay, se crea una nueva.
        const authUserId = (usuario && usuario.authUserId) || await obtenerAuthUserIdActual();
        let v = await obtenerVisitaAbiertaDeSite(site.id);
        let areasExistentes = [];
        if (v) {
          try { areasExistentes = await listarAreasDeVisita(v.id); } catch {}
        } else {
          v = await crearVisita({ siteId: site.id, surveyorAuthUserId: authUserId || null });
        }
        if (cancelado) return;
        setVisit(v);
        setGeneralData(v.general_data || {});
        setAreas(areasExistentes);
        setErrorMsg(null);

        // v8.19.52: validar ubicación EN SITIO al abrir (no bloquea el form).
        // Captura el GPS del técnico, lo guarda en la visita y lo compara con la
        // ubicación que mandó el cliente (site.latitude/longitude) si existe.
        (async () => {
          setGps({ estado: 'cargando' });
          const u = await obtenerUbicacion();
          if (cancelado) return;
          if (!u || u.lat == null) { setGps({ estado: 'error' }); return; }
          try { await actualizarVisita(v.id, { checkin_latitude: u.lat, checkin_longitude: u.lng }); } catch {}
          const slat = site?.latitude != null ? Number(site.latitude) : null;
          const slng = site?.longitude != null ? Number(site.longitude) : null;
          if (slat == null || slng == null) { setGps({ estado: 'sin_referencia', lat: u.lat, lng: u.lng }); return; }
          const d = distanciaMetros(u.lat, u.lng, slat, slng);
          setGps({ estado: (d != null && d > 200) ? 'lejos' : 'ok', distancia: d, lat: u.lat, lng: u.lng });
        })();
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
  // v8.19.53: la foto de fachada se pide en el check-in (no dentro de la sección general).
  const fotoFachadaField = (secGeneral?.fields || []).find(f => f.id === 'foto_frontal');
  const fachadaLista = Array.isArray(generalData.foto_frontal) && generalData.foto_frontal.length > 0;
  const bloquesRepetibles = secciones.filter(s => s.type === 'repeating_block');

  // v8.20.5: tipo de techo/piso POR ÁREA. La familia sale del service_line del
  // levantamiento; los tipos son los service_line de esa familia.
  const familiaKey = familiaDeServiceLine(template?.service_line || proyecto?.service_line);
  const tiposArea = familiaKey ? tiposDeFamilia(familiaKey) : [];
  const tipoLabel = familiaPorKey(familiaKey)?.tipoLabel || 'Tipo';

  // v8.19.81: [Fase 2] completitud en vivo (campos obligatorios + mínimos de fotos).
  const completitud = useMemo(() => template ? calcularCompletitud(template, generalData, areas) : { pct: 0, req: 0, ok: 0, faltantes: [] }, [template, generalData, areas]);

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

  // Agregar nueva área a un bloque repetible. El nombre queda vacío
  // para que el levantador lo escriba (ej. "Fachada norte", "Cubierta principal").
  // El AreaCard autoenfoca el input cuando name está vacío.
  const agregarArea = async (bloque) => {
    if (!visit) return;
    const delBloque = areas.filter(a => a.block_id === bloque.id);
    const nextNum = delBloque.length + 1;
    // v8.20.5: hereda el tipo de techo/piso del área anterior del mismo bloque
    // (editable). Cumple "si se agregan varias áreas, dejar las opciones de la anterior".
    const prev = delBloque[delBloque.length - 1];
    const dataInicial = {};
    if (prev?.data?._tipo) {
      dataInicial._tipo = prev.data._tipo;
      if (prev.data._tipo === 'other' && prev.data._tipo_otro) dataInicial._tipo_otro = prev.data._tipo_otro;
    }
    try {
      const a = await crearArea({
        visitId: visit.id,
        blockId: bloque.id,
        areaNumber: nextNum,
        name: '', // vacío — el levantador lo escribe
        data: dataInicial,
      });
      setAreas(prev => [...prev, a]);
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    }
  };

  // Actualizar campos de un area. Maneja un caso especial:
  //   campo === '__similar_to_area_id__'  → actualiza la columna nativa,
  //                                          no el JSON data.
  const actualizarCampoArea = async (areaId, campo, valor) => {
    if (campo === '__similar_to_area_id__') {
      setAreas(prev => prev.map(a => a.id === areaId ? { ...a, similar_to_area_id: valor || null } : a));
      try {
        await actualizarArea(areaId, { similar_to_area_id: valor || null });
      } catch (e) {
        console.warn('No se pudo setear similar_to_area_id:', e?.message);
      }
      return;
    }
    setAreas(prev => prev.map(a => {
      if (a.id !== areaId) return a;
      const data = { ...(a.data || {}), [campo]: valor };
      return { ...a, data };
    }));
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

  const cerrarVisitaCompleta = async (forzar = false) => {
    if (!visit) return;
    // v8.19.81: [Fase 2] regla maestra — no cerrar si falta lo obligatorio.
    if (!forzar && completitud.faltantes.length > 0) {
      const lista = completitud.faltantes.slice(0, 12).map(f => `• ${f.label}`).join('\n');
      const extra = completitud.faltantes.length > 12 ? `\n…y ${completitud.faltantes.length - 12} más` : '';
      alert(`Faltan ${completitud.faltantes.length} requisito(s) (${completitud.pct}% completo). No se puede cerrar:\n\n${lista}${extra}`);
      return;
    }
    if (!confirm(forzar ? `El levantamiento está al ${completitud.pct}%. ¿Cerrar de todas formas (justificado)?` : '¿Cerrar la visita? Después no podrás editarla desde aquí.')) return;
    setCerrando(true);
    try {
      await cerrarVisita(visit.id);
      try { await setCompletitudProyecto(proyecto?.id, completitud.pct); } catch {}
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
    <div className={`fixed inset-0 bg-black/85 z-[60] overflow-y-auto ${modoCampo ? 'modo-campo' : ''}`}>
      <style>{`
        .modo-campo .bg-zinc-950, .modo-campo .bg-zinc-900, .modo-campo .bg-zinc-900\\/60, .modo-campo .bg-zinc-900\\/50, .modo-campo .bg-zinc-900\\/40 { background-color:#ffffff !important; }
        .modo-campo .bg-zinc-800 { background-color:#e4e4e7 !important; }
        .modo-campo .text-white, .modo-campo .text-zinc-100, .modo-campo .text-zinc-200, .modo-campo .text-zinc-300 { color:#18181b !important; }
        .modo-campo .text-zinc-400, .modo-campo .text-zinc-500, .modo-campo .text-zinc-600 { color:#3f3f46 !important; }
        .modo-campo .border-zinc-800, .modo-campo .border-zinc-700, .modo-campo .border-zinc-800\\/50, .modo-campo .border-zinc-800\\/60 { border-color:#a1a1aa !important; }
        .modo-campo input, .modo-campo textarea, .modo-campo select { background-color:#ffffff !important; color:#111 !important; border-color:#71717a !important; }
        .modo-campo input::placeholder, .modo-campo textarea::placeholder { color:#71717a !important; }
        .modo-campo .border-2 { border-color:#a1a1aa !important; }
      `}</style>
      {brillo < 100 && (
        <div className="fixed inset-0 bg-black pointer-events-none" style={{ opacity: ((100 - brillo) / 100) * 0.8, zIndex: 55 }} />
      )}
      <div className="min-h-full p-2 sm:p-4">
        <div className={`bg-zinc-950 border-2 ${modoCampo ? 'border-zinc-400' : 'border-zinc-800'} max-w-3xl mx-auto`}>
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
              <div className="hidden sm:flex items-center gap-2" title={`${completitud.ok}/${completitud.req} obligatorios`}>
                <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${completitud.pct}%`, backgroundColor: completitud.pct >= 100 ? '#22c55e' : completitud.pct >= 50 ? '#f59e0b' : '#ef4444' }} />
                </div>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: completitud.pct >= 100 ? '#22c55e' : '#a1a1aa' }}>{completitud.pct}%</span>
              </div>
              {/* v8.24.3: atenuador de brillo (capa encima; no sube del máximo del equipo) */}
              <div className="flex items-center gap-1" title="Atenuar brillo (para subir, usa el brillo del equipo al máximo + Modo campo)">
                <Sun className="w-3.5 h-3.5 text-zinc-500" />
                <input type="range" min="30" max="100" value={brillo} onChange={e => setBrillo(Number(e.target.value))} className="w-16 accent-amber-500" />
              </div>
              <button
                onClick={() => setModoCampo(v => !v)}
                className={`p-1.5 rounded-card border ${modoCampo ? 'border-amber-500 text-amber-600 bg-amber-50' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}
                title={modoCampo ? 'Modo campo (claro) activo — tocar para oscuro' : 'Modo campo (fondo claro para el sol)'}
              >
                {modoCampo ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button
                onClick={onCerrar}
                className="text-zinc-400 hover:text-white p-1"
                title="Cerrar (sin completar)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* v8.19.52: validación de ubicación en sitio */}
          {gps.estado !== 'idle' && (
            <div className={`mx-4 mt-3 rounded-card px-3 py-2 text-xs flex items-center gap-2 border ${
              gps.estado === 'ok' ? 'bg-green-900/20 border-green-700/50 text-green-300' :
              gps.estado === 'lejos' ? 'bg-amber-900/30 border-amber-600 text-amber-200' :
              gps.estado === 'cargando' ? 'bg-zinc-900 border-zinc-700 text-zinc-400' :
              'bg-zinc-900 border-zinc-700 text-zinc-400'
            }`}>
              {gps.estado === 'cargando' && (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Validando tu ubicación en el sitio…</>)}
              {gps.estado === 'ok' && (<><Check className="w-3.5 h-3.5" /> Estás en la ubicación del cliente{gps.distancia != null ? ` (a ${Math.round(gps.distancia)} m)` : ''}.</>)}
              {gps.estado === 'lejos' && (<><span>⚠</span> Estás a {gps.distancia >= 1000 ? `${(gps.distancia/1000).toFixed(1)} km` : `${Math.round(gps.distancia)} m`} de la ubicación que envió el cliente. Verifica que sea el sitio correcto.</>)}
              {gps.estado === 'sin_referencia' && (<><span>📍</span> Ubicación capturada. El cliente no envió una ubicación de referencia para comparar.</>)}
              {gps.estado === 'error' && (<><span>📍</span> No se pudo capturar tu ubicación (permiso denegado o sin señal).</>)}
            </div>
          )}

          {/* v8.19.53: check-in — foto de la fachada de una vez, con opción de diferir */}
          {fotoFachadaField && (
            fachadaLista ? (
              <div className="mx-4 mt-3 rounded-card border border-green-700/50 bg-green-900/15 px-3 py-2 text-xs text-green-300 flex items-center gap-2">
                <Check className="w-3.5 h-3.5" /> Foto de la fachada capturada.
              </div>
            ) : fachadaDiferida ? (
              <div className="mx-4 mt-3 rounded-card border border-amber-700/50 bg-amber-900/15 px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-2">
                <span>⚠ Foto de fachada pendiente — recuerda subirla.</span>
                <button onClick={() => setFachadaDiferida(false)} className="text-[10px] underline hover:text-white">Tomar ahora</button>
              </div>
            ) : (
              <div className="mx-4 mt-3 rounded-card border-2 border-red-600 bg-red-900/10 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-red-400">Check-in · Foto de la fachada</div>
                  <button onClick={() => setFachadaDiferida(true)} className="text-[10px] text-zinc-400 hover:text-white underline">Subir más tarde</button>
                </div>
                <div className="text-[11px] text-zinc-400 mb-2">Toma una foto del frente del edificio/local al llegar.</div>
                <SurveyFieldRenderer
                  field={{ ...fotoFachadaField, label: '' }}
                  value={generalData.foto_frontal}
                  onChange={(v) => guardarGeneralData({ ...generalData, foto_frontal: v })}
                  allValues={generalData}
                  context={{ visitId: visit?.id, areaId: null }}
                />
              </div>
            )
          )}

          {/* Sección general */}
          {secGeneral && (
            <SeccionGeneral
              seccion={secGeneral}
              values={generalData}
              onChange={guardarGeneralData}
              visitId={visit?.id}
              excluirIds={fotoFachadaField ? ['foto_frontal'] : []}
              areas={areas}
              siteLat={site?.latitude != null ? Number(site.latitude) : null}
              siteLng={site?.longitude != null ? Number(site.longitude) : null}
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
              visitId={visit?.id}
              tiposArea={tiposArea}
              tipoLabel={tipoLabel}
              siteLat={site?.latitude != null ? Number(site.latitude) : null}
              siteLng={site?.longitude != null ? Number(site.longitude) : null}
            />
          ))}

          {/* Footer con cerrar visita */}
          <div className="border-t-2 border-zinc-800 p-4 sticky bottom-0 bg-zinc-950 space-y-2">
            {completitud.faltantes.length > 0 && (
              <div className="text-[11px] text-amber-300 bg-amber-900/15 border border-amber-800/40 rounded-card px-2 py-1.5">
                Faltan <b>{completitud.faltantes.length}</b> requisito(s) obligatorio(s) para poder cerrar. Toca "Cerrar" para ver la lista.
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-zinc-500">
                {areas.length} área{areas.length === 1 ? '' : 's'} · {completitud.pct}% completo · check-in {visit?.checkin_at ? new Date(visit.checkin_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={onCerrar} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 text-xs font-bold uppercase">
                  Pausar (guardar y salir)
                </button>
                {completitud.faltantes.length > 0 && (
                  <button onClick={() => cerrarVisitaCompleta(true)} disabled={cerrando} className="bg-amber-700/30 border border-amber-700 text-amber-300 hover:bg-amber-700/50 px-3 py-2 text-[11px] font-bold uppercase rounded-card disabled:opacity-50">Cerrar sin completar</button>
                )}
                <button
                  onClick={() => cerrarVisitaCompleta(false)}
                  disabled={cerrando}
                  className={`px-4 py-2 text-xs font-bold uppercase flex items-center gap-1 disabled:opacity-50 text-white ${completitud.faltantes.length > 0 ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  {cerrando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  {completitud.faltantes.length > 0 ? `Faltan ${completitud.faltantes.length}` : 'Cerrar levantamiento'}
                </button>
              </div>
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
function SeccionGeneral({ seccion, values, onChange, visitId, excluirIds = [], areas = [], siteLat = null, siteLng = null }) {
  const setField = (id, val) => {
    onChange({ ...values, [id]: val });
  };
  const campos = (seccion.fields || []).filter(f => !excluirIds.includes(f.id));
  return (
    <div className="border-b border-zinc-800">
      <div className="bg-zinc-900 px-4 py-2 text-[10px] uppercase tracking-widest text-red-500 font-bold">
        {seccion.title || 'Información general'}
      </div>
      <div className="p-4 space-y-3">
        {campos.map(f => (
          <SurveyFieldRenderer
            key={f.id}
            field={f}
            value={values[f.id]}
            onChange={(v) => setField(f.id, v)}
            allValues={values}
            context={{ visitId, areaId: null, areas, siteLat, siteLng }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Bloque repetible (N areas)
// ============================================================
function BloqueRepetible({ bloque, areas, onAgregar, onCambioCampo, onRenombrar, onEliminar, supportsSimilar, visitId, tiposArea = [], tipoLabel = 'Tipo', siteLat = null, siteLng = null }) {
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
      {areas.map((area, idx) => (
        <AreaCard
          key={area.id}
          area={area}
          bloque={bloque}
          onCambioCampo={(campo, valor) => onCambioCampo(area.id, campo, valor)}
          onRenombrar={(n) => onRenombrar(area.id, n)}
          onEliminar={() => onEliminar(area.id)}
          supportsSimilar={supportsSimilar}
          visitId={visitId}
          areasAnteriores={areas.slice(0, idx)}
          tiposArea={tiposArea}
          tipoLabel={tipoLabel}
          onAgregarSiguiente={onAgregar}
          siteLat={siteLat}
          siteLng={siteLng}
        />
      ))}
      {/* v8.23.5: agregar otra sección al final del formulario */}
      {areas.length > 0 && (
        <div className="px-4 py-3 border-t border-zinc-800">
          <button onClick={onAgregar} className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded-card flex items-center justify-center gap-1">
            <Plus className="w-3.5 h-3.5" /> {bloque.block_label || 'Agregar otra sección'}
          </button>
        </div>
      )}
    </div>
  );
}

function AreaCard({ area, bloque, onCambioCampo, onRenombrar, onEliminar, supportsSimilar, visitId, areasAnteriores = [], tiposArea = [], tipoLabel = 'Tipo', onAgregarSiguiente, siteLat = null, siteLng = null }) {
  const [colapsado, setColapsado] = useState(false);
  const [verDetalles, setVerDetalles] = useState(false); // v8.24.2: acordeón "Más detalles"
  const nombreInputRef = useRef(null);
  const esSimilar = !!area.similar_to_area_id;
  const sinNombre = !(area.name && area.name.trim());
  const areaOrigen = esSimilar
    ? areasAnteriores.find(a => a.id === area.similar_to_area_id)
    : null;
  const tipoActualLabel = area.data?._tipo === 'other'
    ? (area.data?._tipo_otro?.trim() || 'Otro')
    : (tiposArea.find(t => t.line === area.data?._tipo)?.label || null);

  // Autofoco en el input de nombre cuando el área se crea sin nombre.
  useEffect(() => {
    if (sinNombre && nombreInputRef.current) {
      nombreInputRef.current.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id]);

  const placeholderEjemplo = bloque.example_name
    || ({
         'exterior': 'Ej: Fachada norte, Marquesina, Muro principal…',
         'interior': 'Ej: Oficina 201, Pasillo, Lobby, Sala de juntas…',
         'roof': 'Ej: Cubierta principal, Techo área parqueo…',
         'floor': 'Ej: Piso planta baja, Almacén nave A…',
       }[bloque.id] || `Ej: ${bloque.block_label || 'Nombre'} 1, ${bloque.block_label || 'Nombre'} 2…`);

  const toggleSimilar = () => {
    if (esSimilar) {
      // Quitar atajo: limpia similar_to_area_id en DB
      onCambioCampo('__similar_to_area_id__', null);
    }
    // Si activa, el dropdown abajo le pide elegir el area
  };

  const setSimilarA = (origenId) => {
    onCambioCampo('__similar_to_area_id__', origenId || null);
  };

  // Filtrar campos visibles según modo:
  // - Normal: todos los campos.
  // - Similar: solo campos de medida + computed.
  const camposVisibles = (bloque.fields || []).filter(f => !esSimilar || esCampoMedida(f));

  return (
    <div className="border-t border-zinc-800/50">
      <div className={`px-3 py-2 flex items-center gap-2 ${esSimilar ? 'bg-amber-900/20' : 'bg-zinc-900/60'}`}>
        <button onClick={() => setColapsado(c => !c)} className="text-zinc-500 hover:text-white">
          {colapsado ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 flex-shrink-0">
          #{area.area_number}
        </span>
        <input
          ref={nombreInputRef}
          value={area.name || ''}
          onChange={e => onRenombrar(e.target.value)}
          placeholder={placeholderEjemplo}
          className={`flex-1 min-w-0 bg-zinc-950 border-2 ${
            sinNombre ? 'border-amber-600' : 'border-zinc-800'
          } focus:border-red-600 outline-none px-2 py-1 text-sm font-bold text-white placeholder:text-zinc-600 placeholder:font-normal placeholder:italic`}
        />
        {tipoActualLabel && (
          <span className="text-[9px] uppercase tracking-wider font-bold text-red-300 bg-red-900/30 px-1.5 py-0.5 border border-red-800/50 flex-shrink-0">
            {tipoActualLabel}
          </span>
        )}
        {esSimilar && (
          <span className="text-[9px] uppercase tracking-wider font-bold text-amber-400 bg-amber-900/40 px-1.5 py-0.5 border border-amber-700/50 flex-shrink-0">
            ⚡ Igual a {areaOrigen?.name || '#?'}
          </span>
        )}
        <button
          onClick={onEliminar}
          className="text-zinc-500 hover:text-red-500 flex-shrink-0"
          title="Eliminar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {sinNombre && (
        <div className="px-3 py-1.5 bg-amber-900/10 border-l-2 border-amber-600 space-y-1.5">
          <div className="text-[10px] text-amber-400">Escribe un nombre o elige uno rápido:</div>
          {(bloque.name_presets?.length ? [...bloque.name_presets, `Sección ${area.area_number}`] : [`Sección ${area.area_number}`]).map(p => (
            <button key={p} type="button" onClick={() => onRenombrar(p)} className="mr-1.5 mb-1 px-2 py-0.5 rounded-card text-[11px] font-bold border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-red-600">{p}</button>
          ))}
        </div>
      )}

      {!colapsado && (
        <div className="px-4 py-3 space-y-3">
          {/* v8.20.5: tipo de techo/piso de ESTA área (por área). Se hereda del área
              anterior al agregar, pero es editable aquí. */}
          {tiposArea.length > 1 && (
            <div className="border-2 border-zinc-800 bg-zinc-900/50 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-1.5">{tipoLabel} <span className="text-red-500">*</span></div>
              <div className="flex flex-wrap gap-1.5">
                {tiposArea.map(t => {
                  const activo = (area.data?._tipo || '') === t.line;
                  return (
                    <button
                      key={t.line}
                      onClick={() => onCambioCampo('_tipo', t.line)}
                      className={`px-2.5 py-1.5 rounded text-[11px] font-bold border ${activo ? 'border-red-600 bg-red-900/30 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'}`}
                    >
                      {t.label}
                      {activo && <Check className="w-3 h-3 inline ml-1 -mt-0.5 text-red-400" />}
                    </button>
                  );
                })}
              </div>
              {area.data?._tipo === 'other' && (
                <input
                  value={area.data?._tipo_otro || ''}
                  onChange={e => onCambioCampo('_tipo_otro', e.target.value)}
                  placeholder="Describe el tipo / superficie (no convencional)"
                  className="mt-2 w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-2 py-1.5 text-xs text-white"
                />
              )}
              {!area.data?._tipo && <div className="text-[10px] text-amber-400 mt-1.5">Elige el {tipoLabel.toLowerCase()} de esta área.</div>}
            </div>
          )}

          {/* Toggle "área similar" si el template lo soporta y hay areas anteriores */}
          {supportsSimilar && areasAnteriores.length > 0 && (
            <div className={`border-2 ${esSimilar ? 'border-amber-700/60 bg-amber-900/10' : 'border-zinc-800 bg-zinc-900/50'} p-3`}>
              <div className="flex items-center gap-2 mb-2">
                <Zap className={`w-4 h-4 ${esSimilar ? 'text-amber-400' : 'text-zinc-500'}`} />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                  Atajo "igual al elemento anterior"
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 mb-2">
                Si esta área es igual a una anterior, marca cuál. Sólo necesitarás cambiar las medidas — el resto se hereda al cerrar el levantamiento.
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={area.similar_to_area_id || ''}
                  onChange={e => setSimilarA(e.target.value)}
                  className="flex-1 bg-zinc-950 border-2 border-zinc-800 focus:border-amber-600 outline-none px-2 py-1.5 text-xs text-white"
                >
                  <option value="">— Es una área distinta —</option>
                  {areasAnteriores.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name || `Área #${a.area_number}`}
                    </option>
                  ))}
                </select>
                {esSimilar && (
                  <button
                    onClick={() => setSimilarA(null)}
                    className="text-[10px] text-zinc-400 hover:text-white"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          )}

          {esSimilar && camposVisibles.length < (bloque.fields || []).length && (
            <div className="bg-amber-900/10 border-l-2 border-amber-700 px-3 py-1.5 text-[11px] text-amber-300">
              Mostrando solo {camposVisibles.length} campos de medida.
              {' '}{(bloque.fields || []).length - camposVisibles.length} campos se heredarán de "{areaOrigen?.name || 'origen'}".
            </div>
          )}

          {(() => {
            const renderCampo = (f) => (
              <SurveyFieldRenderer
                key={f.id}
                field={f}
                value={(area.data || {})[f.id]}
                onChange={(v) => onCambioCampo(f.id, v)}
                allValues={area.data || {}}
                context={{ visitId, areaId: area.id, siteLat, siteLng }}
              />
            );
            const esenciales = camposVisibles.filter(f => !f.avanzado);
            const avanzados = camposVisibles.filter(f => f.avanzado);
            return (
              <>
                {esenciales.map(renderCampo)}
                {avanzados.length > 0 && (
                  <div className="border-2 border-zinc-800 rounded-card">
                    <button type="button" onClick={() => setVerDetalles(v => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300 hover:text-white">
                      <span>{verDetalles ? 'Ocultar detalles' : 'Más detalles'} ({avanzados.length})</span>
                      {verDetalles ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {verDetalles && <div className="px-3 pb-3 space-y-3 border-t border-zinc-800">{avanzados.map(renderCampo)}</div>}
                  </div>
                )}
              </>
            );
          })()}

          {/* v8.23.1/8.23.5: guardar y colapsar el área; o guardar y agregar otra (datos ya autoguardados) */}
          <div className="pt-1 flex gap-2">
            <button type="button" onClick={() => setColapsado(true)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold uppercase py-2.5 rounded-card flex items-center justify-center gap-1">
              <Check className="w-3.5 h-3.5" /> Guardar y cerrar
            </button>
            {onAgregarSiguiente && (
              <button type="button" onClick={() => { setColapsado(true); onAgregarSiguiente(); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase py-2.5 rounded-card flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Guardar y agregar otra
              </button>
            )}
          </div>
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
