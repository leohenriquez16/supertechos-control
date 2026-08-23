// v8.28.2: Motor de cálculo del bono trimestral por KPIs ("Mi bono").
// Todo se computa en vivo desde datos que el ERP ya captura:
//   - jornadas (quién las abre/cierra) → adopción del ERP por los supervisores
//   - reportes (flag retroactivo)      → disciplina de reporte diario
//   - reportes × precio × peso         → producción RD$ (misma fórmula que VistaProduccion)
//   - reclamaciones                    → calidad / gestión postventa
//   - levantamientos (surveys)         → tiempo de respuesta a solicitudes (gerente)
// Reglas del bono: gate 70% (debajo no hay bono), tope 120%.

export const BONO_GATE = 70;
export const BONO_TOPE = 120;

// Catálogo de KPIs por rol (para la pantalla de configuración del owner).
export const KPIS_SUPERVISOR = [
  { key: 'jornadas', label: 'Jornadas propias', pesoDefault: 20 },
  { key: 'reportes', label: 'Reportes al día', pesoDefault: 20 },
  { key: 'produccion', label: 'Producción vs meta', pesoDefault: 40 },
  { key: 'calidad', label: 'Calidad (reclamaciones)', pesoDefault: 20 },
];
export const KPIS_GERENTE = [
  { key: 'produccion', label: 'Producción vs meta', pesoDefault: 40 },
  { key: 'levantamientos', label: 'Levantamientos a tiempo', pesoDefault: 20 },
  { key: 'reclamaciones', label: 'Reclamaciones sin envejecer', pesoDefault: 20 },
  { key: 'disciplina', label: 'Disciplina de reporte', pesoDefault: 20 },
];

// v8.28.2: Ajustes manuales del owner por KPI (bonos_config.kpi_overrides):
//   { "<key>": { peso: 30, score: 85, nota: "..." } }
// - peso reemplaza el peso por defecto del KPI.
// - score (si viene) reemplaza el cálculo automático y el KPI se marca "manual".
function aplicarOverrides(kpis, overrides) {
  return kpis.map(k => {
    const o = overrides?.[k.key];
    if (!o) return k;
    const out = { ...k };
    if (o.peso != null && o.peso !== '' && !isNaN(Number(o.peso))) out.peso = Number(o.peso);
    if (o.score != null && o.score !== '' && !isNaN(Number(o.score))) {
      out.score = Number(o.score);
      out.manual = true;
      out.detalle = `Ajustado manualmente${o.nota ? ` — ${o.nota}` : ''}`;
    }
    return out;
  });
}

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

// Trimestre calendario actual: { inicio, fin, label }
export function trimestreActual(fecha = hoyRD()) {
  const y = Number(fecha.slice(0, 4));
  const m = Number(fecha.slice(5, 7));
  const q = Math.ceil(m / 3);
  const mIni = (q - 1) * 3 + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const finMes = new Date(y, mIni + 2, 0).getDate();
  return {
    inicio: `${y}-${pad(mIni)}-01`,
    fin: `${y}-${pad(mIni + 2)}-${pad(finMes)}`,
    label: `Q${q} ${y}`,
    q, anio: y,
  };
}

// Producción RD$ por reporte — MISMA fórmula que VistaProduccion (v8.27.73):
// m² × precio de venta del área (o del sistema) × peso ponderado de la tarea.
// Excluye retroactivos y fechas futuras. Devuelve filas { fecha, rd, proyectoId }.
export function filasProduccion(data) {
  const hoy = hoyRD();
  const out = [];
  const pesoMapPorProyecto = {};
  const nTareasPorSistema = {};
  (data.reportes || []).forEach(r => {
    if (!r.fecha || r.fecha > hoy || !(r.m2 > 0) || r.retroactivo) return;
    const proy = (data.proyectos || []).find(p => p.id === r.proyectoId);
    if (!proy || proy.archivado) return;
    const area = (proy.areas || []).find(a => a.id === r.areaId);
    const sid = area?.sistemaId || proy.sistema;
    const sis = data.sistemas?.[sid];
    if (!pesoMapPorProyecto[proy.id]) {
      const m = {};
      const sids = [...new Set([proy.sistema, ...(proy.areas || []).map(a => a.sistemaId).filter(Boolean)])];
      sids.forEach(s2 => {
        (data.sistemas?.[s2]?.tareas || []).forEach(t => { if (m[t.id] === undefined) m[t.id] = (Number(t.peso) || 0) / 100; });
        if (nTareasPorSistema[s2] === undefined) nTareasPorSistema[s2] = (data.sistemas?.[s2]?.tareas || []).length;
      });
      pesoMapPorProyecto[proy.id] = m;
    }
    let peso = pesoMapPorProyecto[proy.id][r.tareaId];
    if (peso === undefined) {
      const n = nTareasPorSistema[sid] || 0;
      peso = n > 0 ? 1 / n : 1;
    }
    const precio = Number(area?.precioVentaM2) > 0 ? Number(area.precioVentaM2) : (Number(sis?.precio_m2) || 0);
    out.push({ fecha: r.fecha, rd: r.m2 * precio * peso, proyectoId: proy.id });
  });
  return out;
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const pct = (num, den) => den > 0 ? (num / den) * 100 : null; // null = sin datos, no puntúa

// Combina KPIs { key, label, peso, score(0-∞|null), detalle } → puntaje ponderado.
// Los KPIs con score null (sin datos o sin meta) se excluyen y se renormalizan los pesos.
function combinar(kpis) {
  const activos = kpis.filter(k => k.score != null);
  const pesoTotal = activos.reduce((s, k) => s + k.peso, 0);
  const puntaje = pesoTotal > 0
    ? activos.reduce((s, k) => s + clamp(k.score, 0, BONO_TOPE) * (k.peso / pesoTotal), 0)
    : null;
  return { kpis, puntaje };
}

function diasEntre(a, b) {
  if (!a || !b) return null;
  return (new Date(b) - new Date(a)) / 86400000;
}

// ---------------- Supervisor ----------------
// ctx = { data, jornadas (del trimestre), reclamaciones, trimestre, config }
export function calcularBonoSupervisor(persona, ctx) {
  const { data, jornadas, reclamaciones, trimestre, config } = ctx;
  const misProyectos = (data.proyectos || []).filter(p => !p.archivado && p.supervisorId === persona.id);
  const ids = new Set(misProyectos.map(p => p.id));
  const maestroDe = Object.fromEntries(misProyectos.map(p => [p.id, p.maestroId]));

  // 1 · Jornadas propias: abiertas por el supervisor o el maestro titular (campo), no por la oficina.
  const js = (jornadas || []).filter(j => ids.has(j.proyectoId) && j.fecha >= trimestre.inicio && j.fecha <= trimestre.fin);
  const enCampo = js.filter(j => j.iniciadaPorId === persona.id || j.iniciadaPorId === maestroDe[j.proyectoId]).length;
  const kJornadas = { key: 'jornadas', label: 'Jornadas propias', peso: 20, score: pct(enCampo, js.length),
    detalle: js.length ? `${enCampo}/${js.length} abiertas en campo` : 'Sin jornadas en el trimestre' };

  // 2 · Reportes al día: sin flag retroactivo.
  const reps = (data.reportes || []).filter(r => ids.has(r.proyectoId) && r.fecha >= trimestre.inicio && r.fecha <= trimestre.fin);
  const alDia = reps.filter(r => !r.retroactivo).length;
  const kReportes = { key: 'reportes', label: 'Reportes al día', peso: 20, score: pct(alDia, reps.length),
    detalle: reps.length ? `${alDia}/${reps.length} sin retroactivo` : 'Sin reportes en el trimestre' };

  // 3 · Producción de sus obras vs meta del trimestre.
  const rd = filasProduccion(data).filter(f => ids.has(f.proyectoId) && f.fecha >= trimestre.inicio && f.fecha <= trimestre.fin)
    .reduce((s, f) => s + f.rd, 0);
  const meta = Number(config?.metaProduccionRd) || 0;
  const kProd = { key: 'produccion', label: 'Producción vs meta', peso: 40,
    score: meta > 0 ? (rd / meta) * 100 : null, rd, meta,
    detalle: meta > 0 ? `RD$ ${Math.round(rd).toLocaleString()} de ${Math.round(meta).toLocaleString()}` : 'Meta sin definir' };

  // 4 · Calidad: reclamaciones abiertas en el trimestre sobre sus obras (100 − 25 por cada una).
  const recs = (reclamaciones || []).filter(r => r.proyectoId && ids.has(r.proyectoId) &&
    (r.fechaApertura || '').slice(0, 10) >= trimestre.inicio && (r.fechaApertura || '').slice(0, 10) <= trimestre.fin);
  const kCalidad = { key: 'calidad', label: 'Calidad (reclamaciones)', peso: 20, score: clamp(100 - 25 * recs.length, 0, 100),
    detalle: recs.length ? `${recs.length} reclamación${recs.length !== 1 ? 'es' : ''} en el trimestre` : 'Sin reclamaciones 🎉' };

  return combinar(aplicarOverrides([kJornadas, kReportes, kProd, kCalidad], config?.kpiOverrides));
}

// ---------------- Gerente de Operaciones ----------------
// v1 con los 4 KPIs medibles hoy (margen y entregas a tiempo entran con sus módulos).
// ctx = { data, reclamaciones, surveys, trimestre, config }
export function calcularBonoGerente(persona, ctx) {
  const { data, reclamaciones, surveys, trimestre, config } = ctx;

  // 1 · Producción global vs meta.
  const rd = filasProduccion(data).filter(f => f.fecha >= trimestre.inicio && f.fecha <= trimestre.fin)
    .reduce((s, f) => s + f.rd, 0);
  const meta = Number(config?.metaProduccionRd) || 0;
  const kProd = { key: 'produccion', label: 'Producción vs meta', peso: 40,
    score: meta > 0 ? (rd / meta) * 100 : null, rd, meta,
    detalle: meta > 0 ? `RD$ ${Math.round(rd).toLocaleString()} de ${Math.round(meta).toLocaleString()}` : 'Meta sin definir' };

  // 2 · Levantamientos atendidos a tiempo: solicitudes del trimestre que salieron de
  // "nuevo" dentro de 7 días (asignado/agendado/realizado).
  const svs = (surveys || []).filter(s => (s.created_at || '').slice(0, 10) >= trimestre.inicio && (s.created_at || '').slice(0, 10) <= trimestre.fin);
  const aTiempo = svs.filter(s => {
    if (s.status === 'planning') return diasEntre(s.created_at, new Date().toISOString()) <= 7; // aún en plazo
    const d = diasEntre(s.created_at, s.stage_changed_at || s.fecha_visita_programada);
    return d != null && d <= 7;
  }).length;
  const kLev = { key: 'levantamientos', label: 'Levantamientos a tiempo', peso: 20, score: pct(aTiempo, svs.length),
    detalle: svs.length ? `${aTiempo}/${svs.length} atendidos en ≤7 días` : 'Sin solicitudes en el trimestre' };

  // 3 · Reclamaciones: ninguna envejeciendo (100 − 20 por cada abierta con más de 14 días).
  const abiertasViejas = (reclamaciones || []).filter(r =>
    r.estado !== 'resuelta' && r.estado !== 'cerrada' && !r.archivado &&
    (diasEntre(r.fechaApertura, new Date().toISOString()) || 0) > 14).length;
  const kRecl = { key: 'reclamaciones', label: 'Reclamaciones sin envejecer', peso: 20,
    score: clamp(100 - 20 * abiertasViejas, 0, 100),
    detalle: abiertasViejas ? `${abiertasViejas} abierta${abiertasViejas !== 1 ? 's' : ''} con +14 días` : 'Ninguna con +14 días 🎉' };

  // 4 · Disciplina operativa: % de reportes globales sin retroactivo en el trimestre.
  const reps = (data.reportes || []).filter(r => r.fecha >= trimestre.inicio && r.fecha <= trimestre.fin);
  const alDia = reps.filter(r => !r.retroactivo).length;
  const kDisc = { key: 'disciplina', label: 'Disciplina de reporte', peso: 20, score: pct(alDia, reps.length),
    detalle: reps.length ? `${alDia}/${reps.length} reportes sin retroactivo` : 'Sin reportes en el trimestre' };

  return combinar(aplicarOverrides([kProd, kLev, kRecl, kDisc], config?.kpiOverrides));
}

// Bono estimado en RD$ según puntaje y reglas (gate/tope).
export function bonoEstimado(puntaje, montoObjetivoRd) {
  const monto = Number(montoObjetivoRd) || 0;
  if (puntaje == null || monto <= 0) return null;
  if (puntaje < BONO_GATE) return 0;
  return monto * clamp(puntaje, 0, BONO_TOPE) / 100;
}
