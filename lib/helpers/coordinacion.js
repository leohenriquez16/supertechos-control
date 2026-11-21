// v8.95.0: reglas de la Coordinación de levantamientos por campaña (ej. pintura de las oficinas de Banreservas).
// Módulo puro (sin Supabase ni React) para poder probarlo con node. Todo el estado vive en la OFICINA (surveys.sites):
// técnico (asignado_a_id), día (visita_fecha 'AAAA-MM-DD'), franja, confirmación, «no pude», revisión.

export const FRANJAS = { manana: 'Mañana', tarde: 'Tarde' };
export const MOTIVOS_NO_PUDO = [
  { value: 'cerrada', label: 'Oficina cerrada' },
  { value: 'sin_permiso', label: 'No me dejaron entrar / sin autorización' },
  { value: 'sin_tiempo', label: 'No me dio el tiempo' },
  { value: 'lluvia', label: 'Lluvia' },
  { value: 'sin_equipo', label: 'Falta escalera o equipo' },
  { value: 'otro', label: 'Otro' },
];
export const labelNoPudo = (v) => MOTIVOS_NO_PUDO.find(m => m.value === v)?.label || v || '';

export const esCampana = (p) => !!(p && p.es_campana);
// Quita de una lista de proyectos los que son campaña (por la marca o por un conjunto de ids de campaña).
export function sinCampanas(lista, idsCampana = null) {
  return (lista || []).filter(p => !esCampana(p) && !(idsCampana && idsCampana.has(p.id)));
}

// ── Fechas (día de República Dominicana, sin cuentas de zona horaria) ──
export function hoyRD(ahora = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ahora);
  const v = (t) => p.find(x => x.type === t).value;
  return `${v('year')}-${v('month')}-${v('day')}`;
}
const aUTC = (f) => { const [y, m, d] = String(f).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const deUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
export const sumarDias = (fecha, n) => deUTC(aUTC(fecha) + n * 86400000);
export function lunesDe(fecha) {
  const dow = new Date(aUTC(fecha)).getUTCDay(); // 0 domingo
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const diaCorto = (fecha) => { const d = new Date(aUTC(fecha)); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`; };

// ── Estado de una oficina tal como lo ven Edwin y el técnico ──
export const ESTADO_OFICINA = {
  sin_asignar: { label: 'Sin asignar', color: '#71717a', orden: 1 },
  programada:  { label: 'Programada',  color: '#3b82f6', orden: 2 },
  confirmada:  { label: 'Confirmada',  color: '#06b6d4', orden: 3 },
  no_pudo:     { label: 'No se pudo',  color: '#f97316', orden: 4 },
  en_sitio:    { label: 'En proceso',  color: '#eab308', orden: 5 },
  falta_info:  { label: 'Falta info',  color: '#ef4444', orden: 6 },
  devuelta:    { label: 'Devuelta',    color: '#db2777', orden: 7 },
  por_revisar: { label: 'Por revisar', color: '#22c55e', orden: 8 },
  validada:    { label: 'Validada',    color: '#a855f7', orden: 9 },
};
const ABIERTOS = ['pending', 'coordinated', 'confirmed'];
export function estadoOficina(s) {
  const st = s?.survey_status || 'pending';
  if (st === 'validated') return 'validada';
  if (st === 'completed') return 'por_revisar';
  if (st === 'missing_info') return s.devuelto_at ? 'devuelta' : 'falta_info';
  if (st === 'in_progress' || st === 'in_route') return 'en_sitio';
  if (s?.no_pudo_at && ABIERTOS.includes(st)) return 'no_pudo';
  if (st === 'confirmed' || s?.cita_confirmada) return s?.asignado_a_id ? 'confirmada' : 'sin_asignar';
  if (s?.asignado_a_id && s?.visita_fecha) return 'programada';
  return 'sin_asignar';
}
const LEVANTADA = ['por_revisar', 'validada'];
export const levantada = (s) => LEVANTADA.includes(estadoOficina(s));
export function atrasada(s, hoy) {
  return !!(s?.visita_fecha && s.visita_fecha < hoy && ['programada', 'confirmada', 'en_sitio', 'no_pudo'].includes(estadoOficina(s)));
}
// Botón grande del técnico.
export function accionTecnico(s) {
  const e = estadoOficina(s);
  if (e === 'validada' || e === 'por_revisar') return { label: 'Ver', tono: 'neutro' };
  if (e === 'devuelta') return { label: 'Corregir', tono: 'alerta' };
  if (e === 'en_sitio' || e === 'falta_info') return { label: 'Seguir', tono: 'principal' };
  return { label: 'Iniciar', tono: 'principal' };
}
const esAdmin = (u) => (u?.roles || []).some(r => r === 'admin' || r === 'owner');
export const puedeAbrirOficina = (s, u) => !!u && (esAdmin(u) || (!!s?.asignado_a_id && s.asignado_a_id === u.id));

// ── Asignar y programar en lote ──
// Devuelve los campos a escribir en todas y, aparte, qué oficinas cambian de survey_status.
// Solo las que aún no se levantan (pending/coordinated/confirmed/in_route) cambian de estado; las que están en curso o
// cerradas cambian técnico/fecha sin tocar su estado. personaId null = quitar la asignación.
export function planAsignacion(sites, { personaId = null, nombre = null, fecha = null, franja = null, por = null, ahora = null } = {}) {
  const abiertas = (sites || []).filter(s => [...ABIERTOS, 'in_route'].includes(s.survey_status || 'pending'));
  const campos = personaId
    ? { asignado_a_id: personaId, asignado_a_nombre: nombre, asignado_por: por, asignado_at: ahora, visita_fecha: fecha, visita_franja: franja || null,
        cita_confirmada: false, cita_confirmada_por: null, cita_confirmada_at: null, no_pudo_motivo: null, no_pudo_nota: null, no_pudo_at: null }
    : { asignado_a_id: null, asignado_a_nombre: null, asignado_por: por, asignado_at: ahora, visita_fecha: null, visita_franja: null,
        cita_confirmada: false, cita_confirmada_por: null, cita_confirmada_at: null };
  return {
    ids: (sites || []).map(s => s.id),
    campos,
    idsAEstado: personaId
      ? { coordinated: abiertas.map(s => s.id) }
      : { pending: abiertas.map(s => s.id) },
  };
}

// ── Técnico: sus oficinas ──
const ordFranja = (s) => (s.visita_franja === 'manana' ? 0 : s.visita_franja === 'tarde' ? 1 : 2);
const porFranjaNombre = (a, b) => ordFranja(a) - ordFranja(b) || String(a.name || '').localeCompare(String(b.name || ''));
export function oficinasDeHoy(sites, usuarioId, hoy) {
  const mias = (sites || []).filter(s => s.asignado_a_id === usuarioId);
  // Devueltas por Edwin/Leo y oficinas con algo pendiente (falta info): siempre a la vista hasta completarlas.
  const corregir = mias.filter(s => ['devuelta', 'falta_info'].includes(estadoOficina(s))).sort(porFranjaNombre);
  const yaCorregir = new Set(corregir.map(s => s.id));
  const hoyL = mias.filter(s => s.visita_fecha === hoy && !yaCorregir.has(s.id) && !levantada(s)).sort(porFranjaNombre);
  const atrasadas = mias.filter(s => !yaCorregir.has(s.id) && atrasada(s, hoy))
    .sort((a, b) => String(a.visita_fecha).localeCompare(String(b.visita_fecha)) || porFranjaNombre(a, b));
  // v8.96.0: próximas (programadas después de hoy) — el técnico de campaña ve su semana.
  const proximas = mias.filter(s => !yaCorregir.has(s.id) && s.visita_fecha && s.visita_fecha > hoy && !levantada(s))
    .sort((a, b) => String(a.visita_fecha).localeCompare(String(b.visita_fecha)) || porFranjaNombre(a, b));
  return { hoy: hoyL, atrasadas, corregir, proximas };
}

// ── Edwin: avance, agenda, atención ──
export function avancePorZona(sites) {
  const filas = new Map();
  const tot = { zona: 'Total', total: 0, asignadas: 0, levantadas: 0, validadas: 0, faltaInfo: 0, pct: 0 };
  for (const s of (sites || [])) {
    const z = s.zona || 'Sin zona';
    if (!filas.has(z)) filas.set(z, { zona: z, total: 0, asignadas: 0, levantadas: 0, validadas: 0, faltaInfo: 0, pct: 0 });
    const e = estadoOficina(s);
    for (const f of [filas.get(z), tot]) {
      f.total++;
      if (s.asignado_a_id) f.asignadas++;
      if (LEVANTADA.includes(e)) f.levantadas++;
      if (e === 'validada') f.validadas++;
      if (e === 'falta_info' || e === 'devuelta') f.faltaInfo++;
    }
  }
  const lista = [...filas.values()].sort((a, b) => a.zona.localeCompare(b.zona));
  for (const f of [...lista, tot]) f.pct = f.total ? Math.round((f.levantadas / f.total) * 100) : 0;
  return { zonas: lista, total: tot };
}

export function agendaSemana(sites, tecnicos, lunes) {
  const dias = [0, 1, 2, 3, 4, 5].map(i => sumarDias(lunes, i)); // lunes a sábado
  const conFecha = (sites || []).filter(s => s.visita_fecha && dias.includes(s.visita_fecha));
  const fila = (id, nombre) => ({
    tecnico: { id, nombre },
    dias: dias.map(fecha => {
      const del = conFecha.filter(s => (s.asignado_a_id || null) === id && s.visita_fecha === fecha);
      return { fecha, manana: del.filter(s => s.visita_franja !== 'tarde'), tarde: del.filter(s => s.visita_franja === 'tarde') };
    }),
  });
  const ids = new Set((tecnicos || []).map(t => t.id));
  const filas = (tecnicos || []).map(t => fila(t.id, t.nombre));
  // técnicos con oficinas esa semana que no están en el equipo
  for (const s of conFecha) if (s.asignado_a_id && !ids.has(s.asignado_a_id)) { ids.add(s.asignado_a_id); filas.push(fila(s.asignado_a_id, s.asignado_a_nombre || s.asignado_a_id)); }
  return { dias, filas };
}
export const cargaDelDia = (sites, personaId, fecha) => (sites || []).filter(s => s.asignado_a_id === personaId && s.visita_fecha === fecha).length;

export function bandejaAtencion(sites, hoy) {
  const out = { atrasadas: [], noPudo: [], faltaInfo: [], devueltas: [], sinUbicacion: [] };
  for (const s of (sites || [])) {
    const e = estadoOficina(s);
    if (e === 'no_pudo') out.noPudo.push(s);
    else if (atrasada(s, hoy)) out.atrasadas.push(s);
    if (e === 'falta_info') out.faltaInfo.push(s);
    if (e === 'devuelta') out.devueltas.push(s);
    if (s.latitude == null || s.longitude == null) out.sinUbicacion.push(s);
  }
  return out;
}
export const totalAtencion = (b) => b.atrasadas.length + b.noPudo.length + b.faltaInfo.length + b.devueltas.length + b.sinUbicacion.length;

const PALETA = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#dc2626', '#4d7c0f', '#c026d3', '#0f766e', '#b45309'];
export function colorTecnico(id, tecnicos) {
  if (!id) return '#71717a';
  const i = (tecnicos || []).findIndex(t => t.id === id);
  if (i >= 0) return PALETA[i % PALETA.length];
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
export const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function coincideBusqueda(s, q) {
  const t = sinTildes(q).trim();
  if (!t) return true;
  return sinTildes([s.external_code, s.name, s.address, s.province, s.zona, s.asignado_a_nombre].filter(Boolean).join(' ')).includes(t);
}
