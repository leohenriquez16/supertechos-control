// v8.94.0: catálogo estándar del levantamiento de PINTURA de sucursales.
// Fuente única de verdad para: la plantilla `paint-v2` (scripts/gen-paint-v2-template.mjs),
// el campo `surfaces_table` del formulario y las salidas (ficha, PDF).
// Módulo puro (sin Supabase ni React) para poder probarlo con node.

export const PINTURAS = [
  { value: 'semigloss',    label: 'Semigloss (Monto Uno Zero Satinada)' },
  { value: 'acrilica_int', label: 'Acrílica interior (Monto Uno Zero Acrílica)' },
  { value: 'ovaldine',     label: 'Acrílica exterior (Monto Ovaldine)' },
  { value: 'esmalte',      label: 'Esmalte industrial' },
  { value: 'trafico',      label: 'Tráfico' },
  { value: 'pavimont',     label: 'Pavimont' },
  { value: 'laca',         label: 'Laca' },
  { value: 'por_definir',  label: 'Por definir' },
];

// Cada superficie define su unidad y la pintura que lleva por defecto.
export const SUPERFICIES = [
  { value: 'paredes',   label: 'Paredes',                    ud: 'M2',  pintura: 'semigloss' },
  { value: 'techo',     label: 'Techo',                      ud: 'M2',  pintura: 'acrilica_int' },
  { value: 'columnas',  label: 'Columnas',                   ud: 'M2',  pintura: 'semigloss' },
  { value: 'fachada',   label: 'Fachada / muro exterior',    ud: 'M2',  pintura: 'ovaldine' },
  { value: 'techo_ext', label: 'Techo exterior / marquesina', ud: 'M2', pintura: 'ovaldine' },
  { value: 'hierros',   label: 'Hierros / metal',            ud: 'ML',  pintura: 'esmalte' },
  { value: 'lineas',    label: 'Líneas de parqueo',          ud: 'ML',  pintura: 'trafico' },
  { value: 'bordillos', label: 'Bordillos / contenes',       ud: 'ML',  pintura: 'trafico' },
  { value: 'senal',     label: 'Señalización (pieza)',       ud: 'UND', pintura: 'trafico' },
  { value: 'discap',    label: 'Logo de discapacitado',      ud: 'UND', pintura: 'pavimont' },
  { value: 'puertas',   label: 'Puertas / marcos',           ud: 'UND', pintura: 'laca' },
];

export const NIVELES = ['Sótano', 'Primer nivel', 'Segundo nivel', 'Tercer nivel', 'Mezzanine'];

// Áreas estándar por zona. `sup` = superficies que se precargan al elegir el área
// (id de superficie, o [id, pintura] cuando el área usa otra pintura que la de la superficie).
// Las claves son los ids de bloque de paint-v2. Son distintas de las de paint-v1 («exterior», «interior»)
// a propósito: si un levantamiento cambia de formulario, las áreas del otro quedan guardadas e intactas,
// pero no se mezclan (como pasa entre cualquier otro par de plantillas).
const PT = ['paredes', 'techo'];
export const CATALOGO_AREAS = {
  exteriores: [
    { nombre: 'Fachada frontal', sup: ['fachada'] },
    { nombre: 'Fachada lateral derecha', sup: ['fachada'] },
    { nombre: 'Fachada lateral izquierda', sup: ['fachada'] },
    { nombre: 'Fachada trasera', sup: ['fachada'] },
    { nombre: 'Techo de entrada / marquesina', sup: ['techo_ext'] },
    { nombre: 'Autobanco', sup: ['fachada', 'techo_ext'] },
    { nombre: 'Muros perimetrales', sup: ['fachada'] },
    { nombre: 'Verjas y hierros', sup: ['hierros'] },
    { nombre: 'Escalera metálica exterior', sup: ['hierros'] },
    { nombre: 'Tubos de lámparas / astas', sup: ['hierros'] },
  ],
  // v8.99.0: líneas, flechas, discapacitados y bordillos se levantan en la sección «Parqueo» (por cantidad);
  // aquí quedan solo las áreas que sí se miden (parqueo techado o sótano).
  parqueo: [
    { nombre: 'Muros de parqueo', sup: ['fachada'] },
    { nombre: 'Columnas de parqueo', sup: [['columnas', 'ovaldine']] },
    { nombre: 'Techo de parqueo', sup: ['techo'] },
    { nombre: 'Paragomas', sup: ['senal'] },
  ],
  interiores: [
    { nombre: 'Área de plataforma', sup: PT },
    { nombre: 'Área de cajas / bóveda', sup: PT },
    { nombre: 'Cajeros automáticos', sup: PT },
    { nombre: 'Área de negocios', sup: PT },
    { nombre: 'Oficinas / gerencia', sup: PT },
    { nombre: 'Área administrativa y pasillo', sup: PT },
    { nombre: 'Cocina', sup: PT },
    { nombre: 'Comedor', sup: PT },
    { nombre: 'Baños', sup: PT },
    { nombre: 'Data', sup: PT },
    { nombre: 'Cuarto eléctrico', sup: PT },
    { nombre: 'Cuarto agente de seguridad', sup: PT },
    { nombre: 'Suministro / almacén', sup: PT },
    { nombre: 'Archivo', sup: PT },
    { nombre: 'Escalera interior', sup: [...PT, 'hierros'] },
    { nombre: 'Columnas azules', sup: ['columnas'] },
  ],
};

const supPorId = (id) => SUPERFICIES.find(s => s.value === id) || null;
export const labelSuperficie = (id) => supPorId(id)?.label || (id ? String(id) : '');
export const labelPintura = (id) => PINTURAS.find(p => p.value === id)?.label || (id ? String(id) : '');
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v))) ? null : Number(v);
const r2 = (n) => Math.round(n * 100) / 100;
let _seq = 0;
const nuevoId = () => 's_' + Date.now().toString(36) + (_seq++).toString(36) + Math.random().toString(36).slice(2, 5);

// Recalcula una fila. M2: largo × alto × cantidad − vanos. ML: largo × cantidad. UND: cantidad.
// `area_m2` solo cuenta las superficies en M2 (es lo que suma el área total de la oficina).
export function calcFilaSuperficie(row) {
  const r = { ...row };
  const ud = r.ud || supPorId(r.superficie)?.ud || 'M2';
  r.ud = ud;
  const largo = num(r.largo_m), alto = num(r.alto_m), vanos = num(r.vanos_m2) || 0;
  const cantDada = num(r.cantidad);
  const cant = cantDada == null ? 1 : cantDada;
  let total = null;
  if (ud === 'UND') total = cantDada == null ? null : cantDada;
  else if (ud === 'ML') total = largo == null ? null : r2(largo * cant);
  else total = (largo == null || alto == null) ? null : r2(Math.max(0, largo * alto * cant - vanos));
  r.total = total;
  r.area_m2 = ud === 'M2' ? total : 0;
  return r;
}

// Fila nueva para una superficie (con su unidad y pintura por defecto).
export function filaDeSuperficie(supId, pinturaOverride) {
  const s = supPorId(supId);
  return calcFilaSuperficie({ id: nuevoId(), superficie: supId, ud: s?.ud || 'M2', pintura: pinturaOverride || s?.pintura || 'por_definir' });
}

// Superficies que se precargan al elegir un área del catálogo.
export function filasPorDefecto(zonaId, nombreArea) {
  const a = (CATALOGO_AREAS[zonaId] || []).find(x => x.nombre === nombreArea);
  if (!a) return [];
  return a.sup.map(s => Array.isArray(s) ? filaDeSuperficie(s[0], s[1]) : filaDeSuperficie(s));
}

// Una fila "cuenta" si ya tiene resultado.
export const filaCompleta = (r) => r && r.total != null && Number(r.total) > 0;

// Totales de una lista de filas: m², ml, und y desglose por pintura.
export function totalesSuperficies(filas) {
  const t = { m2: 0, ml: 0, und: 0, porPintura: {} };
  for (const r of (Array.isArray(filas) ? filas : [])) {
    if (!filaCompleta(r)) continue;
    const k = r.ud === 'ML' ? 'ml' : r.ud === 'UND' ? 'und' : 'm2';
    t[k] = r2(t[k] + Number(r.total));
    const p = r.pintura || 'por_definir';
    t.porPintura[p] = t.porPintura[p] || { m2: 0, ml: 0, und: 0 };
    t.porPintura[p][k] = r2(t.porPintura[p][k] + Number(r.total));
  }
  return t;
}

// «108.00 m² · 120.00 ml · 4 und» (solo las unidades que tienen algo).
export function textoTotales(t) {
  if (!t) return '';
  return [t.m2 > 0 && `${t.m2.toFixed(2)} m²`, t.ml > 0 && `${t.ml.toFixed(2)} ml`, t.und > 0 && `${t.und} und`].filter(Boolean).join(' · ');
}

// Medida corta de un área para su encabezado en la ficha y el PDF, o null si no aplica:
// superficies (m² / ml / und) o el área de un jardín. Las áreas de otras plantillas devuelven null.
export function textoMedidaArea(area) {
  const d = (area && area.data) || {};
  if (Array.isArray(d.superficies)) return textoTotales(totalesSuperficies(d.superficies)) || null;
  if (area && area.block_id === 'jardines' && num(d.area_m2) != null) return `${num(d.area_m2).toFixed(2)} m²`;
  return null;
}

// Texto corto de una lista de filas (ficha y PDF).
export function resumenSuperficies(filas) {
  const ok = (Array.isArray(filas) ? filas : []).filter(filaCompleta);
  return ok.map(r => `${labelSuperficie(r.superficie)}: ${Number(r.total).toFixed(2)} ${r.ud === 'M2' ? 'm²' : r.ud === 'ML' ? 'ml' : 'und'} — ${labelPintura(r.pintura)}`);
}

// ─────────────────────────────────────────────────────────────
// v8.94.0: jardines y techo / vista aérea
// ─────────────────────────────────────────────────────────────
export const ESTADOS_JARDINES = [
  { value: 'levantado', label: 'Se levantaron' },
  { value: 'no_tiene', label: 'No tiene jardines' },
  { value: 'pendiente', label: 'Pendiente para otra visita' },
];
export const ESTADOS_TECHO = [
  { value: 'levantado', label: 'Se levantó' },
  { value: 'pendiente', label: 'Pendiente para otra visita' },
  { value: 'no_aplica', label: 'No aplica (local dentro de una plaza o edificio)' },
];
export const MOTIVOS_PENDIENTE = [
  { value: 'sin_acceso', label: 'Sin acceso' },
  { value: 'sin_autorizacion', label: 'Falta autorización' },
  { value: 'clima', label: 'Lluvia o mal tiempo' },
  { value: 'sin_equipo', label: 'Sin equipo (escalera o dron)' },
  { value: 'sin_tiempo', label: 'No dio tiempo' },
];
export const TIPOS_JARDIN = ['Jardinera de concreto', 'Grava decorativa', 'Césped', 'Plantas ornamentales'];
export const TIPOS_CUBIERTA = ['Losa de hormigón', 'Aluzinc o metálica', 'Shingle', 'Teja'];
const etiquetaDe = (lista, v) => lista.find(x => x.value === v)?.label || (v ? String(v).trim() : '');
// Lo que la visita dejó «Pendiente para otra visita» (jardines y/o techo), con su motivo en texto.
// El motivo puede ser uno de la lista o el texto libre de «Otro…».
export function pendientesVisita(generalData) {
  const g = generalData || {}; const out = [];
  if (g.jardines_estado === 'pendiente') out.push({ parte: 'Jardines', clave: 'jardines', motivo: etiquetaDe(MOTIVOS_PENDIENTE, g.jardines_pendiente_motivo) || 'sin motivo' });
  if (g.techo_estado === 'pendiente') out.push({ parte: 'Techo / vista aérea', clave: 'techo', motivo: etiquetaDe(MOTIVOS_PENDIENTE, g.techo_pendiente_motivo) || 'sin motivo' });
  return out;
}

// Áreas que cuentan en las salidas (ficha, PDF): los jardines cargados solo valen si la visita los marcó
// como levantados. Visitas de otras plantillas (sin `jardines_estado`) no cambian.
export function areasVigentes(areas, generalData) {
  const g = generalData || {};
  if (!('jardines_estado' in g) || g.jardines_estado === 'levantado') return areas || [];
  return (areas || []).filter(a => a.block_id !== 'jardines');
}

// ─────────────────────────────────────────────────────────────
// v8.99.0: PARQUEO simplificado. Se pregunta si tiene parqueo y, si tiene: cuántos parqueos (de ahí se
// estiman los metros lineales de líneas), flechas (cantidad y tipo), parqueos de discapacitados y bordillos.
// Estimado de líneas: una línea de ML_POR_PARQUEO metros por parqueo + una de cierre → (n + 1) × 5 ml.
// Si el técnico midió las líneas, manda lo medido.
// ─────────────────────────────────────────────────────────────
export const ML_POR_PARQUEO = 5;
export const SI_NO = [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }];
export const TIPOS_FLECHA = ['Recta', 'Giro (curva)', 'Doble (recta y giro)', 'Entrada / Salida'];
const pos = (v) => { const n = num(v); return n != null && n > 0 ? n : null; };
export function mlLineasParqueo(g) {
  const d = g || {};
  if (d.parqueo_tiene !== 'si') return null;
  const medido = pos(d.parqueo_lineas_ml);
  if (medido != null) return { ml: r2(medido), estimado: false };
  const n = pos(d.parqueo_cantidad);
  return n == null ? null : { ml: r2((Math.round(n) + 1) * ML_POR_PARQUEO), estimado: true };
}
// Filas de superficie equivalentes (para el resumen por tipo de pintura).
export function filasParqueoSimple(g) {
  const d = g || {};
  if (d.parqueo_tiene !== 'si') return [];
  const f = (superficie, total) => {
    const sp = supPorId(superficie);
    return { superficie, ud: sp.ud, pintura: sp.pintura, total, area_m2: 0 };
  };
  const out = [];
  const l = mlLineasParqueo(d); if (l) out.push(f('lineas', l.ml));
  const fl = pos(d.parqueo_flechas_cantidad); if (fl != null) out.push(f('senal', Math.round(fl)));
  if (d.parqueo_discap === 'si') { const n = pos(d.parqueo_discap_cantidad); if (n != null) out.push(f('discap', Math.round(n))); }
  if (d.parqueo_bordillos === 'si') { const n = pos(d.parqueo_bordillos_ml); if (n != null) out.push(f('bordillos', r2(n))); }
  return out;
}
// «12 parqueos · líneas 65.00 ml (estimado) · 4 flechas (Recta, Giro) · 2 de discapacitados · bordillos 30.00 ml»
export function textoParqueo(g) {
  const d = g || {};
  if (d.parqueo_tiene === 'no') return 'No tiene parqueo';
  if (d.parqueo_tiene !== 'si') return null;
  const partes = [];
  const n = pos(d.parqueo_cantidad); if (n != null) partes.push(`${Math.round(n)} parqueo${Math.round(n) === 1 ? '' : 's'}`);
  const l = mlLineasParqueo(d); if (l) partes.push(`líneas ${l.ml.toFixed(2)} ml${l.estimado ? ' (estimado)' : ''}`);
  const fl = pos(d.parqueo_flechas_cantidad);
  const tipos = Array.isArray(d.parqueo_flechas_tipo) ? d.parqueo_flechas_tipo.filter(Boolean) : [];
  partes.push(fl != null ? `${Math.round(fl)} flecha${Math.round(fl) === 1 ? '' : 's'}${tipos.length ? ` (${tipos.join(', ')})` : ''}` : 'sin flechas');
  if (d.parqueo_discap === 'si') { const k = pos(d.parqueo_discap_cantidad); partes.push(`${k != null ? Math.round(k) : '?'} de discapacitados`); }
  else if (d.parqueo_discap === 'no') partes.push('sin parqueo de discapacitados');
  if (d.parqueo_bordillos === 'si') { const b = pos(d.parqueo_bordillos_ml); partes.push(`bordillos ${b != null ? b.toFixed(2) + ' ml' : '?'}`); }
  else if (d.parqueo_bordillos === 'no') partes.push('sin bordillos');
  return partes.join(' · ');
}

// ─────────────────────────────────────────────────────────────
// Plantilla paint-v2 (schema que consume DynamicSurveyForm)
// ─────────────────────────────────────────────────────────────
const camposArea = (extra = []) => [
  ...extra,
  { id: 'superficies', label: 'Superficies a pintar', type: 'surfaces_table', required: true, superficies: SUPERFICIES, pinturas: PINTURAS },
  { id: 'fotos', label: 'Fotos del área', type: 'photos', min: 1 },
  { id: 'observaciones', label: 'Observaciones (color distinto al estándar, difícil acceso, andamio…)', type: 'textarea', rows: 2 },
  { id: 'nota_voz', label: 'Nota de voz', type: 'voice_note', avanzado: true },
];
const bloque = (id, order, title, block_label, example_name, extra = [], opts = {}) => ({
  id, order, title, block_label, example_name, type: 'repeating_block',
  catalogo: CATALOGO_AREAS[id], name_presets: CATALOGO_AREAS[id].map(a => a.nombre),
  fields: camposArea(extra), permite_no_pinta: true, ...opts,
});

export function plantillaPinturaV2() {
  return {
    id: 'paint-v2', name: 'Levantamiento Pintura de Sucursal', service_line: 'paint', company: 'shared', version: '2.0',
    layout: 'wide', supports_similar_shortcut: false, sin_tipo_area: true, resumen_pintura: true, cierre_por_sitio: true,
    sections: [
      {
        id: 'general', order: 1, title: 'Información general de la oficina',
        fields: [
          { id: 'foto_frontal', label: 'Fachada con vista total del edificio', type: 'photos', required: true, min: 1, max: 3, obligatoria_dura: true,
            ayuda: 'De frente, con el edificio completo y sin recortes. Sin esta foto no se puede cerrar el levantamiento.' },
          { id: 'tipo_oficina', label: 'Tipo de oficina', type: 'single_select', required: true, options: ['Oficina', 'UNP', 'Regional / edificio', 'Punto bancario', 'Estafeta'] },
          { id: 'niveles_edificio', label: 'Niveles del edificio', type: 'single_select', options: ['1 nivel', '2 niveles', '3 niveles', '4 o más'] },
          { id: 'acceso_altura', label: 'Acceso para trabajo en altura', type: 'single_select', options: ['No requiere', 'Escalera larga', 'Andamio', 'Equipo de altura'] },
          // v8.95.2: «Restricciones para ejecutar» quitada a pedido de Leo (por ahora no hace falta).
          { id: 'notas_generales', label: 'Notas generales', type: 'textarea', rows: 2 },
        ],
      },
      bloque('exteriores', 2, 'Exterior / Fachada', 'Área exterior', 'Ej: Fachada frontal, Marquesina, Verjas…'),
      // v8.99.0: parqueo simplificado (por cantidad). El bloque de áreas medidas queda solo para parqueo
      // techado o sótano (muros, columnas, techo), opcional y solo si tiene parqueo.
      {
        id: 'parqueo_info', order: 3, title: 'Parqueo', extra: true,
        fields: [
          { id: 'parqueo_tiene', label: '¿Tiene parqueo?', type: 'single_select', required: true, allow_other: false, options: SI_NO },
        ],
      },
      {
        id: 'parqueo_detalle', order: 3.1, title: 'Datos del parqueo', extra: true, show_if: 'parqueo_tiene == si',
        fields: [
          { id: 'parqueo_cantidad', label: 'Cantidad de parqueos', type: 'number', required: true, positivo: true, min: 0, unit: 'parqueos' },
          { id: 'parqueo_lineas_estimado', label: `Líneas de parqueo estimadas (${ML_POR_PARQUEO} m por parqueo + 1 de cierre)`, type: 'computed',
            formula: `(parqueo_cantidad + 1) * ${ML_POR_PARQUEO}`, unit: 'ml', show_if: 'parqueo_cantidad > 0' },
          { id: 'parqueo_lineas_ml', label: 'Si mediste las líneas: metros lineales (reemplaza el estimado)', type: 'number', min: 0, unit: 'ml' },
          { id: 'parqueo_flechas_cantidad', label: 'Cantidad de flechas (0 si no tiene)', type: 'number', required: true, min: 0, unit: 'flechas' },
          { id: 'parqueo_flechas_tipo', label: 'Tipo de flechas', type: 'multi_select', required: true, options: TIPOS_FLECHA, show_if: 'parqueo_flechas_cantidad > 0' },
          { id: 'parqueo_discap', label: '¿Tiene parqueo de discapacitados?', type: 'single_select', required: true, allow_other: false, options: SI_NO },
          { id: 'parqueo_discap_cantidad', label: 'Cantidad de parqueos de discapacitados', type: 'number', required: true, positivo: true, min: 0, show_if: 'parqueo_discap == si' },
          { id: 'parqueo_bordillos', label: '¿Tiene bordillos o contenes?', type: 'single_select', required: true, allow_other: false, options: SI_NO },
          { id: 'parqueo_bordillos_ml', label: 'Bordillos (metros lineales)', type: 'number', required: true, positivo: true, min: 0, unit: 'ml', show_if: 'parqueo_bordillos == si' },
          { id: 'parqueo_fotos', label: 'Fotos del parqueo', type: 'photos', min: 1 },
          { id: 'parqueo_obs', label: 'Observaciones del parqueo', type: 'textarea', rows: 2 },
        ],
      },
      bloque('parqueo', 3.2, 'Parqueo techado o sótano (solo si aplica)', 'Área de parqueo', 'Ej: Muros de parqueo, Columnas, Techo…', [], { opcional: true, show_if: 'parqueo_tiene == si' }),
      bloque('interiores', 4, 'Interiores por nivel', 'Área interior', 'Ej: Área de plataforma, Cocina, Data…',
        [{ id: 'nivel', label: 'Nivel', type: 'single_select', required: true, options: NIVELES, allow_other: true, heredar: true }]),
      // v8.94.0: jardines y techo. Cada uno se levanta en esta visita o se deja «Pendiente para otra visita»
      // con su motivo (así la oficina se puede cerrar sin perder el rastro de lo que falta).
      // `extra: true` = sección fija adicional que el formulario pinta en su orden, después de la general.
      {
        id: 'jardines_info', order: 5, title: 'Jardines y áreas verdes', extra: true,
        fields: [
          { id: 'jardines_estado', label: '¿Se levantaron los jardines y jardineras?', type: 'single_select', required: true, allow_other: false, options: ESTADOS_JARDINES },
          { id: 'jardines_pendiente_motivo', label: '¿Por qué quedan pendientes?', type: 'single_select', required: true, show_if: 'jardines_estado == pendiente', options: MOTIVOS_PENDIENTE },
        ],
      },
      {
        id: 'jardines', order: 6, title: 'Jardines', block_label: 'Jardín o jardinera', example_name: 'Ej: Jardinera de fachada, Jardín frontal…',
        type: 'repeating_block', show_if: 'jardines_estado == levantado',
        name_presets: ['Jardinera de fachada', 'Jardín frontal', 'Jardín lateral', 'Área verde del parqueo'],
        fields: [
          { id: 'tipo_jardin', label: 'Tipo', type: 'single_select', options: TIPOS_JARDIN },
          { id: 'area_m2', label: 'Área (m²)', type: 'number', required: true, positivo: true, unit: 'm²', min: 0 },
          { id: 'perimetro_ml', label: 'Perímetro (m)', type: 'number', unit: 'm', min: 0 },
          { id: 'fotos', label: 'Fotos del jardín (y del plano o croquis, si lo hay)', type: 'photos', min: 1 },
          { id: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
        ],
      },
      {
        id: 'techo', order: 7, title: 'Techo / vista aérea', extra: true,
        fields: [
          { id: 'techo_estado', label: '¿Se levantó el techo?', type: 'single_select', required: true, allow_other: false, options: ESTADOS_TECHO },
          { id: 'techo_pendiente_motivo', label: '¿Por qué queda pendiente?', type: 'single_select', required: true, show_if: 'techo_estado == pendiente', options: MOTIVOS_PENDIENTE },
          { id: 'techo_fotos', label: 'Fotos aéreas o del techo', type: 'photos', min: 1, show_if: 'techo_estado == levantado' },
          { id: 'techo_area_m2', label: 'Área del techo (m²)', type: 'number', unit: 'm²', min: 0, show_if: 'techo_estado == levantado' },
          { id: 'techo_tipo', label: 'Tipo de cubierta', type: 'single_select', options: TIPOS_CUBIERTA, show_if: 'techo_estado == levantado' },
          { id: 'techo_obs', label: 'Observaciones del techo', type: 'textarea', rows: 2, show_if: 'techo_estado == levantado' },
        ],
      },
    ],
  };
}

// v8.94.0: avisos por fila para reducir errores en campo (avisan, no bloquean).
// Rangos pensados para oficinas bancarias; fuera de ellos casi siempre es un dedo equivocado.
export const RANGOS = { largo: [0.3, 250], alto: [1.5, 15], ancho: [0.3, 60], ml: [0.3, 600], und: [1, 200] };
export function avisosFila(row) {
  const r = row || {}; const a = [];
  const largo = num(r.largo_m), alto = num(r.alto_m), vanos = num(r.vanos_m2), cant = num(r.cantidad);
  const techo = r.superficie === 'techo' || r.superficie === 'techo_ext';
  const fuera = (v, [mn, mx]) => v != null && (v < mn || v > mx);
  if (r.ud === 'UND') {
    if (fuera(cant, RANGOS.und)) a.push(`¿${cant} unidades? Revisa la cantidad.`);
  } else if (r.ud === 'ML') {
    if (fuera(largo, RANGOS.ml)) a.push(`¿${largo} m lineales? Fuera de lo normal.`);
  } else {
    if (fuera(largo, RANGOS.largo)) a.push(`¿${largo} m de largo? Revisa.`);
    if (!techo && fuera(alto, RANGOS.alto)) a.push(`¿${alto} m de altura? Lo normal es entre 1.5 y 15 m.`);
    if (techo && fuera(alto, RANGOS.ancho)) a.push(`¿${alto} m de ancho? Revisa.`);
    if (largo != null && alto != null && vanos != null && vanos >= largo * alto * (cant ?? 1))
      a.push('Los vanos son iguales o mayores que la superficie.');
    if (largo != null && alto != null && vanos != null && vanos > 0.6 * largo * alto * (cant ?? 1) && vanos < largo * alto * (cant ?? 1))
      a.push('Los vanos son más del 60% de la superficie. ¿Seguro?');
  }
  if (cant != null && (cant <= 0 || !Number.isInteger(cant)) && r.ud !== 'UND') a.push('La cantidad (veces) debe ser un número entero.');
  if (r.pintura === 'por_definir') a.push('Falta el tipo de pintura.');
  return a;
}
// Fila empezada pero sin total: se midió algo y quedó a medias.
export const filaIncompleta = (r) => r && r.total == null && ['largo_m', 'alto_m', 'cantidad', 'vanos_m2'].some(k => num(r[k]) != null);
// Acepta coma decimal ("3,5") y espacios.
export const leerNumero = (s) => { const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

// v8.94.0: motivos para marcar un área como "No se pinta".
export const MOTIVOS_NO_PINTA = [
  { value: 'buen_estado', label: 'Ya está en buen estado' },
  { value: 'no_aplica', label: 'No aplica en esta oficina' },
  { value: 'acceso', label: 'Acceso restringido' },
  { value: 'otro_contratista', label: 'Lo hace otro contratista' },
  { value: 'otro', label: 'Otro' },
];
export const areaNoPinta = (a) => !!(a && a.data && a.data._no_pinta);
export function textoNoPinta(data) {
  const d = data || {};
  const m = MOTIVOS_NO_PINTA.find(x => x.value === d._no_pinta_motivo);
  const motivo = d._no_pinta_motivo === 'otro' ? (String(d._no_pinta_otro || '').trim() || 'Otro') : (m?.label || 'sin motivo');
  return `No se pinta — ${motivo}`;
}
// Resumen de toda la visita por tipo de pintura (excluye áreas "No se pinta").
// v8.99.0: con `generalData` suma también el parqueo simplificado (líneas, flechas, discapacitados, bordillos).
export function resumenVisitaPintura(areas, campoId = 'superficies', generalData = null) {
  const filas = [...filasParqueoSimple(generalData)];
  const noPinta = [];
  for (const a of (areas || [])) {
    if (areaNoPinta(a)) { noPinta.push({ nombre: a.name || 'Área', texto: textoNoPinta(a.data) }); continue; }
    const v = a?.data?.[campoId];
    if (Array.isArray(v)) filas.push(...v);
  }
  return { totales: totalesSuperficies(filas), noPinta };
}
