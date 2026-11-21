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
import { Loader2, X, Save, Check, Plus, Copy, Trash2, ChevronDown, ChevronUp, Zap, Sun, Moon, MessageSquare } from 'lucide-react';
import { obtenerTemplateSurvey, crearVisita, obtenerVisitaAbiertaDeSite, listarVisitasDeSite, listarSitesProyectoSurvey, marcarEstadoSitioSurvey, cerrarOficinaCampana, actualizarVisita, cerrarVisita, listarAreasDeVisita, crearArea, actualizarArea, eliminarArea, calcularCompletitud, setCompletitudProyecto, finalizarLevantamientoSurvey, showIfOk, familiaDeServiceLine, tiposDeFamilia, familiaPorKey } from '../../lib/surveys';
import { filasPorDefecto, MOTIVOS_NO_PINTA, textoNoPinta, resumenVisitaPintura, labelPintura, pendientesVisita } from '../../lib/pinturaCatalogo';
import { visitaAlAbrir, visitaDeEstaPlantilla, estadoSitioAlCerrar, proyectoCompleto, esErrorDeRed, crearCambiosPendientes, claveArea, agruparPendientes, aplicarRespaldo, grossDeArea } from '../../lib/helpers/cicloLevantamiento';
import { obtenerUbicacion, distanciaMetros } from '../../lib/geo';
import SurveyFieldRenderer from './SurveyFieldRenderer';
import { fotosSubiendo } from './PhotoCapture';
import { HojaNoPude } from '../coordinacion/TarjetaMisOficinasHoy'; // v8.99.0: «No se pudo levantar» desde el formulario

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
  // v8.94.0: última versión de `areas` sin esperar al render (varios campos pueden reportar a la vez).
  const areasRef = useRef(areas);
  areasRef.current = areas;
  const [generalData, setGeneralData] = useState({});
  // Los guardados de datos generales parten de generalRef (lo último real), no del cierre del render:
  // una foto que termina de subir ya no pisa lo que el técnico llenó mientras tanto.
  const generalRef = useRef(generalData);
  generalRef.current = generalData;
  // v8.94.0: visita ya cerrada que se sigue (plantillas por sitio): { pendientes, cerradaEl } o null.
  const [seguida, setSeguida] = useState(null);
  // v8.94.0: cambios de este equipo que el servidor aún no confirmó (se suben antes de cerrar).
  const cambiosRef = useRef(null);
  if (!cambiosRef.current) cambiosRef.current = crearCambiosPendientes();
  // Las claves sin confirmar también se guardan en el equipo (survey_pend_<visita>): al reabrir, del respaldo solo
  // se recupera eso, y un respaldo viejo ya confirmado no pisa lo que otro equipo editó después.
  const recordarPendientes = (vid) => { try { if (vid) localStorage.setItem('survey_pend_' + vid, JSON.stringify(cambiosRef.current.lista().map(x => x.clave))); } catch (e) {} };
  const marcarCambio = (vid, clave) => { const s = cambiosRef.current.marcar(clave); recordarPendientes(vid); return s; };
  const confirmarCambio = (vid, clave, s) => { cambiosRef.current.confirmar(clave, s); recordarPendientes(vid); };
  // Las subidas de pendientes (al abrir, al volver la señal y al cerrar) van en fila: el cierre espera a la anterior.
  const colaSubidaRef = useRef(Promise.resolve());
  const [intento, setIntento] = useState(0); // «Reintentar» en la pantalla de error vuelve a cargar
  const [errorMsg, setErrorMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);
  // v8.25.30: estado de guardado para el indicador + respaldo local (A+B).
  const [estadoGuardado, setEstadoGuardado] = useState('guardado'); // 'guardado' | 'guardando' | 'local'
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

  // v8.25.30: al volver la conexión, re-sincroniza al servidor lo que quedó guardado en el equipo.
  // v8.94.0: sube solo lo que quedó pendiente (antes re-subía todo, pisando lo que otro equipo hubiera editado).
  useEffect(() => {
    const onOnline = async () => {
      if (!visit || !cambiosRef.current.hay()) return;
      setEstadoGuardado('guardando');
      try { await subirPendientes(visit.id); setEstadoGuardado('guardado'); }
      catch (e) { setEstadoGuardado('local'); }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit]);

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
        // v8.94.0: plantillas «por sitio» (una oficina = un levantamiento): si la oficina ya tiene una visita
        // cerrada, se sigue ESA (completar lo pendiente o corregir) en vez de crear otra en blanco.
        // Las lecturas que fallan ya no se toman como «no hay nada»: van a la pantalla de error con «Reintentar»
        // y no se crea ni se escribe nada.
        const authUserId = (usuario && usuario.authUserId) || await obtenerAuthUserIdActual();
        const porSitio = !!t.schema?.cierre_por_sitio;
        const abierta = await obtenerVisitaAbiertaDeSite(site.id);
        const ultima = (!abierta && porSitio) ? ((await listarVisitasDeSite(site.id, { estricto: true }))[0] || null) : null;
        const decision = visitaAlAbrir({ abierta, ultima, porSitio });
        let v = decision.visita;
        let accion = decision.accion;
        let areasExistentes = [];
        if (v) areasExistentes = await listarAreasDeVisita(v.id, { estricto: true });
        // v8.94.0: una visita hecha con OTRO formulario (tiene áreas de bloques que esta plantilla no tiene) no se
        // sigue: se empieza una nueva y la anterior queda intacta.
        if (accion === 'seguir' && !visitaDeEstaPlantilla(areasExistentes, t.schema)) { v = null; accion = 'crear'; areasExistentes = []; }
        if (!v) v = await crearVisita({ siteId: site.id, surveyorAuthUserId: authUserId || null });
        if (cancelado) return;
        setVisit(v);
        setSeguida(accion === 'seguir' ? { pendientes: pendientesVisita(v.general_data), cerradaEl: v.checkout_at || null } : null);
        // v8.25.30: recuperar respaldo local si existe (lo que no alcanzó a guardarse por
        // batería/cierre/sin señal). El draft local es siempre >= servidor, así que prevalece.
        let respaldo = null, pendLocal = null;
        try { const raw = localStorage.getItem('survey_draft_' + v.id); if (raw) respaldo = JSON.parse(raw); } catch (e) {}
        try { const rawP = localStorage.getItem('survey_pend_' + v.id); if (rawP) { const arr = JSON.parse(rawP); if (Array.isArray(arr)) pendLocal = arr; } } catch (e) {}
        // v8.94.0: lo pendiente guardado en el equipo + lo que este formulario aún tiene sin confirmar (tras «Reintentar»).
        const enMemoria = cambiosRef.current.lista().map(x => x.clave);
        const pendUnion = pendLocal ? [...new Set([...pendLocal, ...enMemoria])] : null;
        const rec = aplicarRespaldo({ generalServidor: v.general_data, areasServidor: areasExistentes, respaldo, pendientes: pendUnion });
        const gdInicial = rec.general;
        const areasIniciales = rec.areas;
        generalRef.current = gdInicial;
        areasRef.current = areasIniciales;
        setGeneralData(gdInicial);
        setAreas(areasIniciales);
        setErrorMsg(null);
        // v8.94.0: lo del respaldo que difiere del servidor queda pendiente y se sube ya (best-effort);
        // si no sube, se reintenta al volver la señal y, sí o sí, antes de cerrar.
        const cambios = cambiosRef.current;
        if (rec.generalDistinto) cambios.marcar('general');
        for (const d of rec.areasDistintas) { if (d.datos) cambios.marcar(claveArea(d.id, 'datos')); if (d.nombre) cambios.marcar(claveArea(d.id, 'nombre')); }
        recordarPendientes(v.id);
        if (cambios.hay()) {
          (async () => {
            try { await subirPendientes(v.id); } catch (e) { if (!cancelado) setEstadoGuardado('local'); }
          })();
        }

        // v8.19.52: validar ubicación EN SITIO al abrir (no bloquea el form).
        // Captura el GPS del técnico, lo guarda en la visita y lo compara con la
        // ubicación que mandó el cliente (site.latitude/longitude) si existe.
        (async () => {
          setGps({ estado: 'cargando' });
          const u = await obtenerUbicacion();
          if (cancelado) return;
          if (!u || u.lat == null) { setGps({ estado: 'error' }); return; }
          // v8.94.0: una visita ya cerrada que se sigue conserva su check-in (el GPS de quien la abre ahora puede ser la oficina).
          if (accion !== 'seguir') { try { await actualizarVisita(v.id, { checkin_latitude: u.lat, checkin_longitude: u.lng }); } catch {} }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.template_id, site.id, intento]);

  const secciones = template?.schema?.sections || [];
  const secGeneral = secciones.find(s => s.type !== 'repeating_block') || secciones[0];
  // v8.19.53: la foto de fachada se pide en el check-in (no dentro de la sección general).
  const fotoFachadaField = (secGeneral?.fields || []).find(f => f.id === 'foto_frontal');
  const fachadaLista = Array.isArray(generalData.foto_frontal) && generalData.foto_frontal.length > 0;
  // v8.94.0: fachada obligatoria sin opción de diferir ni de cerrar sin ella (plantillas que lo pidan).
  const fachadaDura = !!fotoFachadaField?.obligatoria_dura;
  const bloquesRepetibles = secciones.filter(s => s.type === 'repeating_block');
  // v8.94.0: el cuerpo del formulario son los bloques repetibles y, solo si la plantilla las marca `extra`,
  // secciones fijas adicionales (ej. Jardines, Techo) que guardan en los datos generales. Se pintan en el
  // orden de la plantilla; una sección o bloque con `show_if` se oculta si la condición no se cumple.
  // Plantillas sin `extra` ni `show_if` se ven exactamente igual que antes.
  const cuerpo = secciones.filter(s => s !== secGeneral && (s.type === 'repeating_block' || s.extra) && showIfOk(s.show_if, generalData));
  const pendientes = useMemo(() => pendientesVisita(generalData), [generalData]);
  // Bloques condicionados por un campo de esta sección que quedaron ocultos teniendo áreas cargadas
  // (ej. jardines medidos y luego marcados «Pendiente»): se conservan, pero se avisa que no se incluyen.
  const avisoOcultos = (sec) => {
    const ids = new Set((sec.fields || []).map(f => f.id));
    const ocultos = bloquesRepetibles.filter(b => b.show_if && ids.has((/^\s*([\w.-]+)/.exec(b.show_if) || [])[1]) && !showIfOk(b.show_if, generalData) && areas.some(a => a.block_id === b.id));
    if (!ocultos.length) return null;
    return (
      <div className="rounded-card border border-amber-700/50 bg-amber-900/15 px-3 py-2 text-xs text-amber-200">
        {ocultos.map(b => { const n = areas.filter(a => a.block_id === b.id).length; return <div key={b.id}>Hay {n} {n === 1 ? 'registro cargado' : 'registros cargados'} en «{b.title}». Se conservan, pero no se incluyen mientras esta respuesta no cambie.</div>; })}
      </div>
    );
  };

  // v8.20.5: tipo de techo/piso POR ÁREA. La familia sale del service_line del
  // levantamiento; los tipos son los service_line de esa familia.
  const familiaKey = familiaDeServiceLine(template?.service_line || proyecto?.service_line);
  // v8.94.0: plantillas con `sin_tipo_area` (pintura) no piden tipo por área: la pintura va por superficie.
  const tiposArea = (familiaKey && !template?.schema?.sin_tipo_area) ? tiposDeFamilia(familiaKey) : [];
  const tipoLabel = familiaPorKey(familiaKey)?.tipoLabel || 'Tipo';

  // v8.19.81: [Fase 2] completitud en vivo (campos obligatorios + mínimos de fotos).
  const completitud = useMemo(() => template ? calcularCompletitud(template, generalData, areas) : { pct: 0, req: 0, ok: 0, faltantes: [] }, [template, generalData, areas]);

  // v8.25.30: respaldo local INMEDIATO (sobrevive cierre de ventana / batería / sin señal).
  const escribirDraft = (gd, ars) => {
    if (!visit) return;
    try {
      localStorage.setItem('survey_draft_' + visit.id, JSON.stringify({
        general_data: gd,
        areas: (ars || []).map(a => ({ id: a.id, block_id: a.block_id, name: a.name, data: a.data, gross_area_m2: a.gross_area_m2, similar_to_area_id: a.similar_to_area_id })),
      }));
    } catch (e) {}
  };
  const borrarDraft = () => { if (visit) { try { localStorage.removeItem('survey_draft_' + visit.id); localStorage.removeItem('survey_pend_' + visit.id); } catch (e) {} } };

  // Guardado de general_data (al cambiar)
  const guardarGeneralData = useCallback(async (nuevo) => {
    if (!visit) return;
    generalRef.current = nuevo;
    setGeneralData(nuevo);
    const sello = marcarCambio(visit.id, 'general');
    escribirDraft(nuevo, areasRef.current);       // respaldo local primero (nunca falla)
    setGuardando(true);
    setEstadoGuardado('guardando');
    try {
      await actualizarVisita(visit.id, { general_data: nuevo });
      confirmarCambio(visit.id, 'general', sello);
      setEstadoGuardado('guardado');
    } catch (e) {
      setEstadoGuardado('local');      // quedó a salvo en el equipo; se re-sincroniza al volver la señal
    } finally {
      setGuardando(false);
    }
  }, [visit]);
  // Cambia UN campo general partiendo de lo último guardado (no de una copia del render en que empezó).
  const guardarCampoGeneral = useCallback((id, valor) => guardarGeneralData({ ...generalRef.current, [id]: valor }), [guardarGeneralData]);

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
    // v8.94.0: campos marcados `heredar` (ej. el nivel en pintura) se copian del área anterior.
    for (const f of (bloque.fields || [])) {
      if (f.heredar && prev?.data?.[f.id] != null && prev.data[f.id] !== '') dataInicial[f.id] = prev.data[f.id];
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
      // v8.94.0: fallo no fatal (antes tumbaba todo el formulario).
      alert('No se pudo agregar el área' + (typeof navigator !== 'undefined' && navigator.onLine === false ? ' porque no hay conexión' : '') + '. Lo ya capturado está guardado; intenta de nuevo.');
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
    // v8.94.0: partir de areasRef (no del cierre) para que dos cambios seguidos no se pisen.
    const base = areasRef.current;
    const area = base.find(a => a.id === areaId);
    const data = { ...((area && area.data) || {}), [campo]: valor };
    // v8.24.15: calcular el m² del área desde las tablas de medidas y guardarlo en
    // la columna gross_area_m2 (antes solo quedaba en data → el resumen mostraba 0).
    const gross = calcularGrossArea(area, data);
    const nuevasAreas = base.map(a => (a.id === areaId ? { ...a, data, gross_area_m2: gross } : a));
    areasRef.current = nuevasAreas;
    setAreas(nuevasAreas);
    const sello = marcarCambio(visit?.id, claveArea(areaId, 'datos'));
    escribirDraft(generalRef.current, nuevasAreas);   // respaldo local primero (nunca falla)
    setEstadoGuardado('guardando');
    try {
      await actualizarArea(areaId, gross != null ? { data, gross_area_m2: gross } : { data });
      confirmarCambio(visit?.id, claveArea(areaId, 'datos'), sello);
      setEstadoGuardado('guardado');
    } catch (e) {
      console.warn('No se pudo guardar campo de area:', e?.message);
      setEstadoGuardado('local');
    }
  };

  // Suma el área (m²) de todas las tablas de medidas del bloque del área.
  // v8.94.0: la regla vive en lib/helpers/cicloLevantamiento.js (grossDeArea) para poder probarla.
  const calcularGrossArea = (area, data) => grossDeArea((template?.schema?.sections || []).find(s => s.id === area?.block_id), area, data);

  const renombrarArea = async (areaId, nuevoNombre) => {
    // v8.94.0: el nombre también va al respaldo local y queda pendiente hasta que el servidor lo confirme
    // (antes, al reabrir, el respaldo devolvía el nombre viejo y el cierre lo subía encima del corregido).
    const nuevas = areasRef.current.map(a => a.id === areaId ? { ...a, name: nuevoNombre } : a);
    areasRef.current = nuevas;
    setAreas(nuevas);
    const sello = marcarCambio(visit?.id, claveArea(areaId, 'nombre'));
    escribirDraft(generalRef.current, nuevas);
    try {
      await actualizarArea(areaId, { name: nuevoNombre });
      confirmarCambio(visit?.id, claveArea(areaId, 'nombre'), sello);
    } catch (e) {
      console.warn('No se pudo renombrar:', e?.message);
      setEstadoGuardado('local');
    }
  };

  const eliminarAreaLocal = async (areaId) => {
    if (!confirm('¿Eliminar esta área? Esta acción no se puede deshacer.')) return;
    try {
      await eliminarArea(areaId);
      cambiosRef.current.olvidar('area:' + areaId);
      recordarPendientes(visit?.id);
      setAreas(prev => prev.filter(a => a.id !== areaId));
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    }
  };

  // v8.94.0: resumen por tipo de pintura que el técnico confirma antes de cerrar (plantillas con resumen_pintura).
  const [verResumen, setVerResumen] = useState(false);
  const resumenPintura = useMemo(() => template?.schema?.resumen_pintura ? resumenVisitaPintura(areas, 'superficies', generalData) : null, [template, areas, generalData]);

  // v8.94.0: sube lo que este equipo cambió y el servidor no ha confirmado (datos generales y, por área, sus
  // datos y/o su nombre). Lanza el primer error, con el nombre del área si fue un área.
  const subirPendientes = (visitId) => {
    const turno = colaSubidaRef.current.catch(() => {}).then(() => subirPendientesAhora(visitId));
    colaSubidaRef.current = turno;
    return turno;
  };
  const subirPendientesAhora = async (visitId) => {
    try { await subirLoPendiente(visitId); } finally { recordarPendientes(visitId); }
  };
  const subirLoPendiente = async (visitId) => {
    const c = cambiosRef.current;
    const p = agruparPendientes(c.lista());
    if (p.general) {
      await actualizarVisita(visitId, { general_data: generalRef.current });
      c.confirmar('general', p.general);
    }
    for (let i = 0; i < p.areas.length; i += 6) {
      await Promise.all(p.areas.slice(i, i + 6).map(async (x) => {
        const a = areasRef.current.find(y => y.id === x.id);
        if (!a) { c.olvidar('area:' + x.id); return; }
        const cuerpo = {};
        if (x.nombre) cuerpo.name = a.name || '';
        if (x.datos) { cuerpo.data = a.data || {}; if (a.gross_area_m2 != null) cuerpo.gross_area_m2 = a.gross_area_m2; }
        try { await actualizarArea(a.id, cuerpo); }
        catch (e) { if (e && typeof e === 'object') e.areaNombre = a.name || `Área #${a.area_number}`; throw e; }
        if (x.nombre) c.confirmar(claveArea(a.id, 'nombre'), x.nombre);
        if (x.datos) c.confirmar(claveArea(a.id, 'datos'), x.datos);
      }));
    }
  };

  const cerrarVisitaCompleta = async (forzar = false, confirmado = false) => {
    if (!visit) return;
    // v8.94.0: con una foto a medio subir no se cierra (se perdería sin aviso).
    if (fotosSubiendo() > 0) { alert('Espera: hay una foto subiendo. Cierra cuando termine para no perderla.'); return; }
    // v8.94.0: requisitos duros — ni siquiera "Cerrar sin completar" los salta.
    const duros = completitud.faltantes.filter(f => f.duro);
    if (duros.length > 0) {
      alert(`No se puede cerrar la visita sin:\n\n${duros.map(f => `• ${f.label}`).join('\n')}\n\nPuedes usar "Pausar" para guardar y volver luego.`);
      return;
    }
    // v8.19.81: [Fase 2] regla maestra — no cerrar si falta lo obligatorio.
    if (!forzar && completitud.faltantes.length > 0) {
      const lista = completitud.faltantes.slice(0, 12).map(f => `• ${f.label}`).join('\n');
      const extra = completitud.faltantes.length > 12 ? `\n…y ${completitud.faltantes.length - 12} más` : '';
      alert(`Faltan ${completitud.faltantes.length} requisito(s) (${completitud.pct}% completo). No se puede cerrar:\n\n${lista}${extra}`);
      return;
    }
    if (!forzar && resumenPintura && !confirmado) { setVerResumen(true); return; }
    if (!confirmado && !confirm(forzar ? `El levantamiento está al ${completitud.pct}%. ¿Cerrar sin finalizar (queda pendiente)?` : '¿Finalizar el levantamiento? Quedará como REALIZADO y no podrás editar esta visita desde aquí.')) return;
    setVerResumen(false);
    setCerrando(true);
    try {
      // v8.94.0: antes de cerrar se sube lo que haya quedado pendiente y se espera el resultado. Si algo no sube,
      // la visita no se cierra y el respaldo local no se borra: un guardado que falló en silencio no se pierde.
      try {
        await subirPendientes(visit.id);
      } catch (e) {
        setEstadoGuardado('local');
        alert(esErrorDeRed(e)
          ? 'No se pudo subir todo lo capturado (revisa la señal). La visita NO se cerró y tus datos siguen guardados en este equipo. Busca señal y vuelve a intentarlo.'
          : `El sistema no aceptó ${e?.areaNombre ? `el área «${e.areaNombre}»` : 'los datos generales'}: ${e?.message || e}\n\nRevisa ese dato (por ejemplo, una medida demasiado grande) y vuelve a intentarlo. La visita NO se cerró y tus datos siguen guardados en este equipo.`);
        return;
      }
      await cerrarVisita(visit.id);
      // v8.95.0: en una campaña (proyecto.es_campana) el proyecto no se toca: ni completitud ni «Realizado».
      const campana = !!proyecto?.es_campana;
      if (!campana) { try { await setCompletitudProyecto(proyecto?.id, completitud.pct); } catch {} }
      // v8.24.18: si se cierra completo (no forzado), el levantamiento pasa a "Realizado".
      let resultado = forzar ? 'cerrado' : 'finalizado';
      let estadoSitio = null;
      if (campana) {
        // v8.95.0: campaña (es_campana) → solo cambia ESTA oficina (y se limpian devolución y «no pude»).
        // No se leen las demás oficinas ni se llama finalizarLevantamientoSurvey: el proyecto nunca pasa a Realizado.
        const nuevoEstado = estadoSitioAlCerrar({ forzar, pendientes });
        try { await cerrarOficinaCampana(site.id, nuevoEstado); estadoSitio = nuevoEstado; }
        catch (e) { alert('La visita quedó cerrada y guardada, pero no se pudo actualizar el estado de la oficina (revisa la señal). Vuelve a abrir la oficina y toca «Finalizar» otra vez.'); }
        resultado = 'oficina_cerrada';
      } else if (template?.schema?.cierre_por_sitio) {
        // v8.94.0: plantillas «por sitio» (pintura de sucursales): se marca ESTA oficina (completada, o en proceso
        // si se cerró sin completar o quedó algo pendiente) y el proyecto pasa a Realizado solo cuando TODAS sus
        // oficinas están completas. Si alguna lectura falla, no se finaliza nada (se decide en el próximo cierre).
        const nuevoEstado = estadoSitioAlCerrar({ forzar, pendientes });
        let proyectoFinalizado = false;
        let fallo = null;
        try { await marcarEstadoSitioSurvey(site.id, nuevoEstado); estadoSitio = nuevoEstado; }
        catch (e) { fallo = 'el estado de la oficina'; }
        if (estadoSitio) {
          try {
            const sitios = await listarSitesProyectoSurvey(proyecto?.id, { estricto: true });
            if (proyectoCompleto(sitios, site.id, estadoSitio)) proyectoFinalizado = await finalizarLevantamientoSurvey(proyecto?.id);
          } catch (e) { fallo = 'el estado del proyecto'; }
        }
        // La visita ya quedó cerrada y guardada; solo falta el estado: se avisa para volver a finalizar con señal.
        if (fallo) alert(`La visita quedó cerrada y guardada, pero no se pudo actualizar ${fallo} (revisa la señal). Vuelve a abrir la oficina y toca «Finalizar» otra vez.`);
        resultado = proyectoFinalizado ? 'finalizado' : 'oficina_cerrada';
      } else if (!forzar) {
        try { await finalizarLevantamientoSurvey(proyecto?.id); } catch {}
      }
      borrarDraft(); // v8.25.30: ya quedó en el servidor; limpiamos el respaldo local
      onCompletado?.(resultado, { estadoSitio });
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setCerrando(false);
    }
  };

  // v8.99.0: oficina de campaña que no se pudo levantar (o terminar): motivo + nota; queda pendiente para
  // que Edwin la reprograme. Lo ya capturado se conserva en la visita abierta.
  const [hojaNoPude, setHojaNoPude] = useState(false);
  const abrirNoPude = () => {
    if (guardando || cerrando) { alert('Espera un segundo: guardando tus cambios…'); return; }
    if (fotosSubiendo() > 0) { alert('Espera: hay una foto subiendo.'); return; }
    setHojaNoPude(true);
  };

  // v8.25.8: no cerrar mientras hay un guardado en vuelo (evita perder cambios).
  const cerrarSeguro = () => {
    if (guardando || cerrando) { alert('Espera un segundo: guardando tus cambios…'); return; }
    // v8.94.0: una foto a medio subir se perdería sin aviso al salir.
    if (fotosSubiendo() > 0) { alert('Espera: hay una foto subiendo. Sal cuando termine para no perderla.'); return; }
    // v8.94.0: si se siguió una oficina ya cerrada y al salir quedó incompleta, deja de contar como completada
    // (si no, el cierre de otra oficina podría pasar el proyecto a Realizado con esta a medias).
    // v8.95.0: oficina de campaña devuelta por Edwin/Leo: salir a medias la deja devuelta, con su nota.
    if (proyecto?.es_campana && site?.devuelto_at) { onCerrar?.(); return; }
    if (seguida && template?.schema?.cierre_por_sitio && (completitud.faltantes.length > 0 || pendientes.length > 0)) {
      const est = completitud.faltantes.length > 0 ? 'in_progress' : 'missing_info'; // con pendientes: «Falta info»
      marcarEstadoSitioSurvey(site.id, est).catch(() => {});
      onCerrar?.({ estadoSitio: est });
      return;
    }
    onCerrar?.();
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
          <div className="text-sm text-zinc-300 mb-1">{errorMsg}</div>
          <div className="text-[12px] text-zinc-500 mb-4">Revisa la señal y vuelve a intentarlo. Lo ya capturado sigue guardado.</div>
          <div className="flex gap-2">
            {/* v8.94.0: reintentar la carga sin salir */}
            <button onClick={() => { setLoading(true); setErrorMsg(null); setIntento(n => n + 1); }} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-bold">
              Reintentar
            </button>
            <button onClick={onCerrar} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 text-sm font-bold">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // v8.94.0: nunca pintar el formulario sin plantilla o sin visita (ej. justo al tocar «Reintentar»).
  if (!template || !visit) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
        <div className="bg-zinc-900 border-2 border-zinc-800 p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-red-500" />
          <span className="text-sm text-zinc-300">Iniciando levantamiento...</span>
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
      {hojaNoPude && site && (
        <HojaNoPude site={site} onCerrar={() => setHojaNoPude(false)} onGuardado={() => { setHojaNoPude(false); onCerrar?.(); }} />
      )}
      {verResumen && resumenPintura && (
        <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-3" onClick={() => setVerResumen(false)}>
          <div className="bg-zinc-900 border-2 border-red-700 rounded-card w-full max-w-xl max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">Antes de cerrar · revisa el resumen</div>
            <div className="font-black text-lg text-white mt-0.5 mb-3">{site.name}</div>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-zinc-400">
                  <th className="text-left font-bold py-1.5">Tipo de pintura</th><th className="text-right font-bold">m²</th><th className="text-right font-bold">ml</th><th className="text-right font-bold">und</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(resumenPintura.totales.porPintura).map(([p, v]) => (
                  <tr key={p} className={`border-t border-zinc-800 ${p === 'por_definir' ? 'text-amber-400' : 'text-zinc-100'}`}>
                    <td className="py-2 pr-2">{labelPintura(p)}</td>
                    <td className="text-right">{v.m2 ? v.m2.toFixed(2) : '—'}</td>
                    <td className="text-right">{v.ml ? v.ml.toFixed(2) : '—'}</td>
                    <td className="text-right">{v.und || '—'}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-zinc-600 font-black text-white">
                  <td className="py-2">Total</td>
                  <td className="text-right text-red-400">{resumenPintura.totales.m2.toFixed(2)}</td>
                  <td className="text-right">{resumenPintura.totales.ml.toFixed(2)}</td>
                  <td className="text-right">{resumenPintura.totales.und}</td>
                </tr>
              </tbody>
            </table>
            {pendientes.length > 0 && (
              <div className="mt-4 rounded-card border border-amber-700/60 bg-amber-900/15 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-amber-300 font-bold mb-1">Queda pendiente para otra visita</div>
                <ul className="text-sm text-amber-100 space-y-0.5">
                  {pendientes.map(x => <li key={x.clave}>• {x.parte}: {x.motivo}</li>)}
                </ul>
              </div>
            )}
            {resumenPintura.noPinta.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1">Áreas que no se pintan ({resumenPintura.noPinta.length})</div>
                <ul className="text-sm text-zinc-300 space-y-0.5">
                  {resumenPintura.noPinta.map((n, i) => <li key={i}>• {n.nombre}: {n.texto.replace(/^No se pinta — /, '')}</li>)}
                </ul>
              </div>
            )}
            {resumenPintura.totales.porPintura.por_definir && (
              <div className="mt-3 text-xs font-bold text-amber-400">Hay superficies con pintura "Por definir".</div>
            )}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setVerResumen(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold uppercase py-3.5 rounded-card">Volver a revisar</button>
              <button type="button" disabled={cerrando} onClick={() => cerrarVisitaCompleta(false, true)} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-bold uppercase py-3.5 rounded-card disabled:opacity-50">Confirmar y cerrar</button>
            </div>
          </div>
        </div>
      )}
      {brillo < 100 && (
        <div className="tema-original fixed inset-0 bg-black pointer-events-none" style={{ opacity: ((100 - brillo) / 100) * 0.8, zIndex: 55 }} />
      )}
      <div className="min-h-full p-2 sm:p-4">
        <div className={`bg-zinc-950 border-2 ${modoCampo ? 'border-zinc-400' : 'border-zinc-800'} ${template?.schema?.layout === 'wide' ? 'max-w-5xl' : 'max-w-3xl'} mx-auto`}>
          {/* Header sticky */}
          <div className="sticky top-0 bg-zinc-950 border-b-2 border-red-600 px-4 py-3 flex items-center justify-between z-10">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                Levantamiento · {template.name}
              </div>
              <div className="font-black text-sm truncate">{site.name}</div>
            </div>
            <div className="flex items-center gap-2">
              {/* v8.25.30: indicador de guardado (A+B) */}
              {estadoGuardado === 'guardando' ? (
                <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Guardando…</span>
              ) : estadoGuardado === 'local' ? (
                <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1" title="Sin conexión: tus datos están guardados en este equipo y se subirán al volver la señal.">⚠ Guardado en el equipo</span>
              ) : (
                <span className="text-[10px] font-bold text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Guardado</span>
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
                onClick={cerrarSeguro}
                className="text-zinc-400 hover:text-white p-1"
                title="Cerrar (los cambios se guardan solos)"
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

          {seguida && (
            <div className="mx-4 mt-3 rounded-card border border-amber-700/60 bg-amber-900/15 px-3 py-2 text-xs text-amber-200">
              <b>Sigues el levantamiento de esta oficina{seguida.cerradaEl ? ` (cerrado el ${new Date(seguida.cerradaEl).toLocaleDateString('es-DO', { dateStyle: 'medium' })})` : ''}.</b>{' '}
              {seguida.pendientes.length > 0
                ? <>Quedó pendiente: {seguida.pendientes.map(x => `${x.parte} (${x.motivo})`).join(' · ')}. Lo ya capturado sigue aquí; completa lo que falta y vuelve a finalizar.</>
                : <>Lo ya capturado sigue aquí y los cambios se guardan solos. Si corriges algo, vuelve a finalizar para dejar la oficina al día.</>}
            </div>
          )}

          {/* v8.19.53: check-in — foto de la fachada de una vez, con opción de diferir */}
          {fotoFachadaField && (
            fachadaLista ? (
              <div className="mx-4 mt-3 rounded-card border border-green-700/50 bg-green-900/15 px-3 py-2 text-xs text-green-300 flex items-center gap-2">
                <Check className="w-3.5 h-3.5" /> Foto de la fachada capturada.
              </div>
            ) : (fachadaDiferida && !fachadaDura) ? (
              <div className="mx-4 mt-3 rounded-card border border-amber-700/50 bg-amber-900/15 px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-2">
                <span>⚠ Foto de fachada pendiente — recuerda subirla.</span>
                <button onClick={() => setFachadaDiferida(false)} className="text-[10px] underline hover:text-white">Tomar ahora</button>
              </div>
            ) : (
              <div className="mx-4 mt-3 rounded-card border-2 border-red-600 bg-red-900/10 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-red-400">{fachadaDura ? `Obligatoria · ${fotoFachadaField.label}` : 'Check-in · Foto de la fachada'}</div>
                  {!fachadaDura && <button onClick={() => setFachadaDiferida(true)} className="text-[10px] text-zinc-400 hover:text-white underline">Subir más tarde</button>}
                </div>
                <div className={fachadaDura ? 'text-sm text-zinc-300 mb-2' : 'text-[11px] text-zinc-400 mb-2'}>{fotoFachadaField.ayuda || 'Toma una foto del frente del edificio/local al llegar.'}</div>
                <SurveyFieldRenderer
                  field={{ ...fotoFachadaField, label: '' }}
                  value={generalData.foto_frontal}
                  onChange={(v) => guardarCampoGeneral('foto_frontal', v)}
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
              onCampo={guardarCampoGeneral}
              visitId={visit?.id}
              excluirIds={fotoFachadaField ? ['foto_frontal'] : []}
              areas={areas}
              siteLat={site?.latitude != null ? Number(site.latitude) : null}
              siteLng={site?.longitude != null ? Number(site.longitude) : null}
            />
          )}

          {/* Cuerpo: bloques repetibles y secciones fijas adicionales, en el orden de la plantilla */}
          {cuerpo.map(b => (b.type === 'repeating_block' ? (
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
          ) : (
            <SeccionGeneral
              key={b.id}
              seccion={b}
              values={generalData}
              onCampo={guardarCampoGeneral}
              aviso={avisoOcultos(b)}
              visitId={visit?.id}
              areas={areas}
              siteLat={site?.latitude != null ? Number(site.latitude) : null}
              siteLng={site?.longitude != null ? Number(site.longitude) : null}
            />
          )))}

          {/* v8.25.8: Finalizar levantamiento inline — al final de las secciones, para
              cuando no hay más secciones que agregar (sin tener que buscar el footer). */}
          {areas.length > 0 && (
            <div className="p-4 border-b border-zinc-800">
              <div className="text-[11px] text-zinc-500 mb-2 text-center">¿No hay más secciones que agregar?</div>
              <button
                onClick={() => cerrarVisitaCompleta(false)}
                disabled={cerrando}
                className={`w-full py-3.5 text-sm font-black uppercase tracking-wider rounded-card flex items-center justify-center gap-2 disabled:opacity-50 text-white ${completitud.faltantes.length > 0 ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {cerrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {completitud.faltantes.length > 0 ? `Finalizar — faltan ${completitud.faltantes.length} requisito(s)` : 'Finalizar levantamiento'}
              </button>
            </div>
          )}

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
              <div className="flex flex-wrap items-center justify-end gap-2">
                {proyecto?.es_campana && (
                  <button onClick={abrirNoPude} className="bg-zinc-900 border border-orange-700 text-orange-300 hover:bg-orange-900/30 px-3 py-2 text-[11px] font-bold uppercase rounded-card">No se pudo levantar</button>
                )}
                <button onClick={cerrarSeguro} disabled={guardando} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold uppercase flex items-center gap-1">
                  {guardando && <Loader2 className="w-3 h-3 animate-spin" />} {guardando ? 'Guardando…' : 'Pausar (guardar y salir)'}
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
                  {completitud.faltantes.length > 0 ? `Faltan ${completitud.faltantes.length}` : 'Finalizar levantamiento'}
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
function SeccionGeneral({ seccion, values, onCampo, visitId, excluirIds = [], areas = [], siteLat = null, siteLng = null, aviso = null }) {
  const setField = (id, val) => onCampo(id, val);
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
        {aviso}
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
  const noPinta = !!(bloque.permite_no_pinta && area.data?._no_pinta);
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

  // v8.94.0: al elegir un área del catálogo se precargan sus superficies (si aún no hay ninguna).
  const elegirPreset = (p) => {
    const fSup = (bloque.fields || []).find(f => f.type === 'surfaces_table');
    const yaTiene = fSup && Array.isArray(area.data?.[fSup.id]) && area.data[fSup.id].length > 0;
    if (fSup && bloque.catalogo && !yaTiene) {
      const filas = filasPorDefecto(bloque.id, p);
      if (filas.length) onCambioCampo(fSup.id, filas);
    }
    onRenombrar(p);
  };

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
        {colapsado && String(area.data?._comentario || '').trim() && (
          <MessageSquare className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" aria-label="Tiene comentario" />
        )}
        {area.data?._no_pinta && (
          <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 border border-zinc-600 flex-shrink-0">
            No se pinta
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
          <div className="flex flex-wrap gap-2">
            {(bloque.name_presets?.length ? [...bloque.name_presets, `Sección ${area.area_number}`] : [`Sección ${area.area_number}`]).map(p => (
              <button key={p} type="button" onClick={() => elegirPreset(p)} className="px-4 py-2.5 rounded-card text-sm font-bold border-2 border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-red-600">{p}</button>
            ))}
          </div>
        </div>
      )}

      {!colapsado && (
        <div className="px-4 py-3 space-y-3">
          {/* v8.94.0: "No se pinta" — el área se registra (para que conste que se vio) pero no suma.
              Pide motivo; no exige superficies ni fotos. */}
          {bloque.permite_no_pinta && (
            <div className={`border-2 rounded-card p-3 ${noPinta ? 'border-zinc-500 bg-zinc-800/60' : 'border-zinc-800 bg-zinc-900/50'}`}>
              <button type="button" onClick={() => onCambioCampo('_no_pinta', !noPinta)}
                className={`px-4 py-2.5 rounded-card text-sm font-bold border-2 ${noPinta ? 'border-zinc-300 bg-zinc-700 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-400'}`}>
                {noPinta ? <><Check className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />No se pinta (tocar para deshacer)</> : 'Esta área no se pinta'}
              </button>
              {noPinta && (
                <div className="mt-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-1.5">Motivo <span className="text-red-500">*</span></div>
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS_NO_PINTA.map(m => {
                      const activo = area.data?._no_pinta_motivo === m.value;
                      return (
                        <button key={m.value} type="button" onClick={() => onCambioCampo('_no_pinta_motivo', m.value)}
                          className={`px-4 py-2.5 rounded-card text-sm font-bold border-2 ${activo ? 'border-red-600 bg-red-900/30 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-red-600'}`}>
                          {m.label}{activo && <Check className="w-3.5 h-3.5 inline ml-1 -mt-0.5 text-red-400" />}
                        </button>
                      );
                    })}
                  </div>
                  {area.data?._no_pinta_motivo === 'otro' && (
                    <input autoFocus value={area.data?._no_pinta_otro || ''} onChange={e => onCambioCampo('_no_pinta_otro', e.target.value)}
                      placeholder="¿Por qué no se pinta?"
                      className="mt-2 w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2.5 text-sm text-white" />
                  )}
                  {!area.data?._no_pinta_motivo && <div className="text-[10px] text-amber-400 mt-1.5">Elige el motivo.</div>}
                </div>
              )}
            </div>
          )}

          {!noPinta && <>
          {/* v8.20.5: tipo de techo/piso de ESTA área (por área). Se hereda del área
              anterior al agregar, pero es editable aquí. */}
          {tiposArea.length > 1 && (
            <div className="border-2 border-zinc-800 bg-zinc-900/50 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-1.5">{tipoLabel} <span className="text-red-500">*</span></div>
              <div className="flex flex-wrap gap-2">
                {tiposArea.map(t => {
                  const activo = (area.data?._tipo || '') === t.line;
                  return (
                    <button
                      key={t.line}
                      onClick={() => onCambioCampo('_tipo', t.line)}
                      className={`px-4 py-2.5 rounded-card text-sm font-bold border-2 ${activo ? 'border-red-600 bg-red-900/30 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-red-600'}`}
                    >
                      {t.label}
                      {activo && <Check className="w-3.5 h-3.5 inline ml-1 -mt-0.5 text-red-400" />}
                    </button>
                  );
                })}
                {/* v8.25.27: opción "Otro" con teclado */}
                {!tiposArea.some(t => t.line === 'other') && (
                  <button
                    onClick={() => onCambioCampo('_tipo', 'other')}
                    className={`px-4 py-2.5 rounded-card text-sm font-bold border-2 ${area.data?._tipo === 'other' ? 'border-red-600 bg-red-900/30 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-red-600'}`}
                  >
                    Otro…
                  </button>
                )}
              </div>
              {area.data?._tipo === 'other' && (
                <input
                  autoFocus
                  value={area.data?._tipo_otro || ''}
                  onChange={e => onCambioCampo('_tipo_otro', e.target.value)}
                  placeholder="Describe el tipo / superficie"
                  className="mt-2 w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2.5 text-sm text-white"
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
            // v8.25.27: desagües y antepechos SIEMPRE visibles (no escondidos en "Más detalles").
            const esExtra = f => /desag[uü]e|antepecho/i.test(((f.id || '') + ' ' + (f.label || '')));
            // v8.25.28: el mapa (marcar/dibujar área) va al final, antes de "agregar otra área".
            const esMapa = f => f.type === 'map_point' || f.type === 'map_polygon';
            let esenciales = camposVisibles.filter(f => (!f.avanzado || esExtra(f)) && !esMapa(f));
            const avanzados = camposVisibles.filter(f => f.avanzado && !esExtra(f) && !esMapa(f));
            const mapas = camposVisibles.filter(esMapa);
            // v8.25.29: el orden de antepecho/condición se maneja en el template (quedan juntos).
            // v8.25.31: "Más detalles" va justo debajo de penetraciones; el resto de esenciales después.
            const idxPen = esenciales.findIndex(f => /penetra/i.test(((f.id || '') + ' ' + (f.label || ''))));
            const esAntes = idxPen >= 0 ? esenciales.slice(0, idxPen + 1) : esenciales;
            const esDespues = idxPen >= 0 ? esenciales.slice(idxPen + 1) : [];
            const bloqueDetalles = avanzados.length > 0 && (
              <div className="border-2 border-zinc-800 rounded-card">
                <button type="button" onClick={() => setVerDetalles(v => !v)} className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-bold uppercase tracking-wider text-zinc-200 hover:text-white">
                  <span>{verDetalles ? 'Ocultar detalles' : 'Más detalles'} ({avanzados.length})</span>
                  {verDetalles ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                {verDetalles && <div className="px-3 pb-3 space-y-3 border-t border-zinc-800">{avanzados.map(renderCampo)}</div>}
              </div>
            );
            return (
              <>
                {esAntes.map(renderCampo)}
                {bloqueDetalles}
                {esDespues.map(renderCampo)}
                {/* v8.25.28: mapa al final (más intuitivo: marcar/dibujar justo antes de agregar otra área) */}
                {mapas.map(renderCampo)}
              </>
            );
          })()}
          </>}

          {/* v8.97.0: comentario libre del área (data._comentario; se guarda como los demás campos) */}
          <ComentarioArea valor={area.data?._comentario || ''} onCambiar={(v) => onCambioCampo('_comentario', v)} />

          {/* v8.23.1/8.23.5: guardar y colapsar el área; o guardar y agregar otra (datos ya autoguardados) */}
          {/* v8.25.27: separado de "Más detalles" para no presionarlo por error */}
          <div className="mt-5 pt-4 border-t border-zinc-800 flex gap-2">
            <button type="button" onClick={() => setColapsado(true)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold uppercase py-3 rounded-card flex items-center justify-center gap-1">
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

// v8.97.0: «+ Agregar comentario» por área. Cerrado no ocupa espacio; con texto queda siempre abierto.
function ComentarioArea({ valor, onCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const hay = String(valor || '').length > 0;
  if (!hay && !abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-card text-sm font-bold border-2 border-dashed border-zinc-700 text-zinc-300 hover:border-sky-500 hover:text-white">
        <Plus className="w-4 h-4" /> Agregar comentario
      </button>
    );
  }
  return (
    <div className="border-2 border-zinc-800 bg-zinc-900/50 rounded-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-1.5">
        <MessageSquare className="w-3.5 h-3.5 text-sky-400" /> Comentario
        {!hay && <button type="button" onClick={() => setAbierto(false)} className="ml-auto text-zinc-500 hover:text-white normal-case font-normal tracking-normal">Cancelar</button>}
      </div>
      <textarea autoFocus={!hay} value={valor} onChange={(e) => onCambiar(e.target.value)} rows={3}
        placeholder="Ej: las columnas son de otro color, el techo necesita andamio…"
        className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-sky-500 outline-none px-3 py-2.5 text-sm text-white resize-y" />
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
