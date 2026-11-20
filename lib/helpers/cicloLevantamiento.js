// v8.94.0: reglas del ciclo de una visita de levantamiento (abrir, guardar, cerrar).
// Módulo puro (sin Supabase ni React) para poder probarlo con node; lo usa
// components/surveys/DynamicSurveyForm.jsx.

// ─────────────────────────────────────────────────────────────
// Al abrir: qué visita usa el formulario
// ─────────────────────────────────────────────────────────────
// - Si la oficina tiene una visita abierta (sin cierre), esa.
// - Plantillas «por sitio» (`cierre_por_sitio`: una oficina = un levantamiento, ej. pintura de sucursales):
//   si no hay abierta pero la oficina ya tiene una, se sigue ESA para completar lo pendiente o corregir.
//   Se edita tal cual, sin reabrirla: quien solo entra a mirar no la deja abierta ni le cambia el check-in.
// - Si no, se crea una nueva (igual que siempre en las demás plantillas).
export function visitaAlAbrir({ abierta, ultima, porSitio }) {
  if (abierta) return { accion: 'abierta', visita: abierta };
  if (porSitio && ultima) return { accion: 'seguir', visita: ultima };
  return { accion: 'crear', visita: null };
}

// Una visita es «de esta plantilla» si todas sus áreas son de bloques repetibles de la plantilla. Si tiene áreas
// de otro formulario (se cambió de «Pintura» a «Pintura de Sucursal» con la oficina ya medida), no se sigue.
export function visitaDeEstaPlantilla(areas, schema) {
  const bloques = new Set((schema?.sections || []).filter(s => s.type === 'repeating_block').map(s => s.id));
  return (areas || []).every(a => bloques.has(a.block_id));
}

// ─────────────────────────────────────────────────────────────
// Al cerrar (plantillas por sitio): estado de la oficina y del proyecto
// ─────────────────────────────────────────────────────────────
// Estado de la oficina al cerrar (regla de Leo, 20-nov):
// - «Cerrar sin completar» → en proceso.
// - Finalizada con jardines o techo «pendiente para otra visita» → «Falta info» (missing_info): no cuenta como completa
//   y el proyecto no pasa a Realizado hasta completarla. «No tiene jardines» o techo «No aplica» NO son pendientes.
// - Finalizada sin pendientes → completada.
export function estadoSitioAlCerrar({ forzar, pendientes }) {
  if (forzar) return 'in_progress';
  return (pendientes && pendientes.length) ? 'missing_info' : 'completed';
}

const COMPLETOS = ['completed', 'validated'];
// El proyecto pasa a Realizado cuando TODAS sus oficinas están completas (contando la que se acaba de cerrar).
export function proyectoCompleto(sitios, siteId, estadoNuevo) {
  if (!Array.isArray(sitios) || sitios.length === 0) return false;
  return sitios.every(s => COMPLETOS.includes(s.id === siteId ? estadoNuevo : s.survey_status));
}

// ─────────────────────────────────────────────────────────────
// Errores: sin señal o dato rechazado
// ─────────────────────────────────────────────────────────────
// supabase-js devuelve los rechazos del servidor con código (ej. 22003, número fuera de rango) y las
// fallas de red sin código («TypeError: Failed to fetch» / «Load failed» en Safari).
export function esErrorDeRed(e) {
  if (!e) return false;
  if (/failed to fetch|load failed|networkerror|network request failed|timed? ?out|aborted/i.test(String(e.message || e))) return true;
  return !e.code;
}

// ─────────────────────────────────────────────────────────────
// Cambios pendientes de subir (por equipo)
// ─────────────────────────────────────────────────────────────
// Claves: 'general' (datos generales de la visita), claveArea(id, 'datos') y claveArea(id, 'nombre').
// Cada cambio lleva un sello creciente; un guardado solo «confirma» su clave si no hubo otro cambio después.
// Si un guardado viejo termina DESPUÉS de uno más nuevo (el servidor pudo quedar con lo viejo), la clave
// vuelve a quedar pendiente. Al cerrar se sube solo lo pendiente: nada que falló en silencio se queda sin
// subir, y no se pisa lo que otro equipo editó en lo que este no tocó.
export const claveArea = (id, parte) => `area:${id}:${parte}`;
export function crearCambiosPendientes() {
  let sello = 0;
  const pendientes = new Map();  // clave -> sello del último cambio sin confirmar
  const confirmados = new Map(); // clave -> mayor sello confirmado
  return {
    marcar(clave) { const s = ++sello; pendientes.set(clave, s); return s; },
    confirmar(clave, s) {
      if (!s) return;
      if (s < (confirmados.get(clave) || 0)) { if (!pendientes.has(clave)) pendientes.set(clave, ++sello); return; }
      confirmados.set(clave, s);
      if (pendientes.get(clave) === s) pendientes.delete(clave);
    },
    // Quita una clave o todas las que empiezan por «prefijo:» (ej. olvidar('area:ID') al borrar el área).
    olvidar(prefijo) { for (const k of [...pendientes.keys()]) if (k === prefijo || k.startsWith(prefijo + ':')) pendientes.delete(k); },
    lista() { return [...pendientes.entries()].map(([clave, s]) => ({ clave, sello: s })); },
    hay() { return pendientes.size > 0; },
  };
}

// Agrupa las claves pendientes: { general: sello|0, areas: [{ id, datos: sello|0, nombre: sello|0 }] }.
export function agruparPendientes(lista) {
  const out = { general: 0, areas: [] };
  const porId = new Map();
  for (const { clave, sello } of (lista || [])) {
    if (clave === 'general') { out.general = sello; continue; }
    const m = /^area:(.+):(datos|nombre)$/.exec(clave);
    if (!m) continue;
    if (!porId.has(m[1])) { const x = { id: m[1], datos: 0, nombre: 0 }; porId.set(m[1], x); out.areas.push(x); }
    porId.get(m[1])[m[2]] = sello;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Respaldo local (lo que no alcanzó a subir) al reabrir
// ─────────────────────────────────────────────────────────────
// JSON sin importar el orden de las claves (jsonb las devuelve en su propio orden).
function estable(v) {
  if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + estable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
export const igualJson = (a, b) => estable(a) === estable(b);
const numONull = (v) => (v == null || v === '' ? null : Number(v));

// Une lo del servidor con el respaldo del equipo y dice qué quedó distinto del servidor (por área: nombre y/o
// datos): solo eso se marca como pendiente de subir.
// `pendientes` = claves que este equipo tenía SIN confirmar (se guardan aparte en el equipo). Si viene, solo esas
// partes del respaldo se aplican: lo que el servidor ya confirmó manda, así un respaldo viejo de una sesión
// anterior no pisa lo que otro equipo editó después. Si no viene (respaldo de una versión anterior del ERP),
// el respaldo prevalece completo, como antes.
export function aplicarRespaldo({ generalServidor, areasServidor, respaldo, pendientes = null }) {
  const gs = generalServidor || {};
  const as = areasServidor || [];
  if (!respaldo || typeof respaldo !== 'object') return { general: gs, areas: as, generalDistinto: false, areasDistintas: [] };
  const toca = (clave) => !Array.isArray(pendientes) || pendientes.includes(clave);
  const general = toca('general') ? { ...gs, ...(respaldo.general_data || {}) } : gs;
  const enRespaldo = Array.isArray(respaldo.areas) ? respaldo.areas : [];
  const areasDistintas = [];
  const areas = as.map(a => {
    const da = enRespaldo.find(x => x && x.id === a.id);
    if (!da) return a;
    const usarNombre = toca(claveArea(a.id, 'nombre'));
    const usarDatos = toca(claveArea(a.id, 'datos'));
    if (!usarNombre && !usarDatos) return a;
    const unida = { ...a };
    if (usarNombre) unida.name = da.name || a.name;
    if (usarDatos) { unida.data = { ...(a.data || {}), ...(da.data || {}) }; unida.gross_area_m2 = da.gross_area_m2 ?? a.gross_area_m2; }
    const nombre = unida.name !== a.name;
    const datos = !igualJson(unida.data, a.data || {}) || numONull(unida.gross_area_m2) !== numONull(a.gross_area_m2);
    if (nombre || datos) areasDistintas.push({ id: a.id, nombre, datos });
    return (nombre || datos) ? unida : a;
  });
  return { general, areas, generalDistinto: !igualJson(general, gs), areasDistintas };
}

// ─────────────────────────────────────────────────────────────
// m² de un área (columna gross_area_m2)
// ─────────────────────────────────────────────────────────────
// Suma las tablas de medidas del bloque (measurement_table / surfaces_table). Un área «No se pinta» suma 0.
// Si el área ya tiene m² pero no trae NINGUNA tabla de medidas de este bloque (se midió con otra plantilla),
// se conservan sus m²: abrir el formulario (las fotos guardan solas al cargar) no la pone en 0.
export function grossDeArea(block, area, data) {
  if (!block) return area?.gross_area_m2 ?? null;
  const measFields = (block.fields || []).filter(f => f.type === 'measurement_table' || f.type === 'surfaces_table');
  if (!measFields.length) return area?.gross_area_m2 ?? null;
  const d = data || {};
  if (block.permite_no_pinta && d._no_pinta) return 0;
  if (area?.gross_area_m2 != null && !measFields.some(f => Array.isArray(d[f.id]))) return area.gross_area_m2;
  let tot = 0;
  for (const f of measFields) {
    const filas = Array.isArray(d[f.id]) ? d[f.id] : [];
    for (const r of filas) tot += Number(r.area_m2) || 0;
  }
  return Number(tot.toFixed(2));
}
