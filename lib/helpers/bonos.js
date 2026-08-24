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
// v8.29.2: la producción baja a 20% (depende de que Ventas venda) y entra "Obras
// avanzando" — ejecución pura, que SÍ está bajo control de operaciones. El KPI de
// "arranque a tiempo" queda pendiente hasta que el ERP registre el motivo de espera
// de las obras aprobadas (materiales, cliente sin liberar áreas, etc.).
export const KPIS_SUPERVISOR = [
  { key: 'jornadas', label: 'Jornadas propias', pesoDefault: 20 },
  { key: 'reportes', label: 'Reportes al día', pesoDefault: 15 },
  { key: 'avance', label: 'Obras avanzando', pesoDefault: 15 },
  { key: 'lev48', label: 'Levantamientos ≤48h (equipo)', pesoDefault: 15 },
  { key: 'produccion', label: 'Producción vs meta', pesoDefault: 20 },
  { key: 'calidad', label: 'Calidad (reclamaciones)', pesoDefault: 15 },
];
// v8.31.0: Edwin — coordina el embudo comercial de levantamientos: recibir,
// crear en el ERP, asignar; cotizar el MISMO DÍA del levantamiento; y confirmar
// con el cliente que recibió la cotización en ≤24h (eso asegura su KPI).
export const KPIS_COMERCIAL = [
  { key: 'solicitudes', label: 'Solicitudes atendidas ≤1 día', pesoDefault: 20 },
  { key: 'asignacion', label: 'Nada sin asignar', pesoDefault: 15 },
  { key: 'lev48', label: 'Levantamientos ≤48h (equipo)', pesoDefault: 20 },
  { key: 'cotizacion_dia', label: 'Cotización el mismo día', pesoDefault: 25 },
  { key: 'confirmacion', label: 'Recepción confirmada ≤24h', pesoDefault: 20 },
];

// KPI COMPARTIDO (regla de Leonardo): todo levantamiento se REALIZA en ≤48 horas
// desde que se recibe (se crea en el ERP). El incumplimiento pega en el bono de
// Edwin, de TODOS los supervisores, de Miguel y de Erisdania — es de equipo.
function kpiLevantamientos48(surveys, trimestre, peso) {
  const ahora = Date.now();
  const enRango = (surveys || []).filter(s => (s.created_at || '').slice(0, 10) >= trimestre.inicio && (s.created_at || '').slice(0, 10) <= trimestre.fin);
  let cumplidos = 0, evaluables = 0;
  enRango.forEach(s => {
    const creado = new Date(s.created_at).getTime();
    if (s.realizado_at) {
      evaluables++;
      if (new Date(s.realizado_at).getTime() - creado <= 48 * 3600000) cumplidos++;
    } else if (s.status === 'planning' || s.status === 'survey_in_progress') {
      if (ahora - creado > 48 * 3600000) evaluables++; // vencido sin realizar = incumplido
      // dentro de plazo → aún no evalúa
    }
    // completados viejos sin realizado_at (pre-v8.31) no evalúan
  });
  return { key: 'lev48', label: 'Levantamientos ≤48h (equipo)', peso,
    score: evaluables > 0 ? (cumplidos / evaluables) * 100 : null,
    detalle: evaluables > 0 ? `${cumplidos}/${evaluables} realizados dentro de 48h` : 'Sin levantamientos evaluables aún' };
}
// Gerente (v8.29.2, pedido de Leonardo): no es solo hacer — es tener el ERP al día,
// ENTREGAR Y FACTURAR, y cubicar todos los meses las obras largas. La producción
// reportada es "blanda" hasta que se cubica o factura.
export const KPIS_GERENTE = [
  { key: 'produccion', label: 'Producción vs meta', pesoDefault: 15 },
  { key: 'avance', label: 'Obras avanzando', pesoDefault: 15 },
  { key: 'erp_al_dia', label: 'ERP al día', pesoDefault: 15 },
  { key: 'facturacion', label: 'Terminadas → facturadas', pesoDefault: 20 },
  { key: 'cubicaciones', label: 'Cubicaciones mensuales', pesoDefault: 15 },
  { key: 'lev48', label: 'Levantamientos ≤48h (equipo)', pesoDefault: 10 },
  { key: 'reclamaciones', label: 'Reclamaciones sin envejecer', pesoDefault: 10 },
];

// "Obras avanzando": % de obras en ejecución con avance reportado en los últimos
// DIAS_AVANCE días. Una obra parada por causa externa debe marcarse "parado" en el
// ERP (con razón y siguiente paso) — así sale del cálculo y queda documentada.
const DIAS_AVANCE = 5;
function kpiAvance(obrasEnEjecucion, reportes, peso) {
  const corte = (() => { const d = new Date(hoyRD() + 'T12:00:00'); d.setDate(d.getDate() - DIAS_AVANCE); return d.toISOString().slice(0, 10); })();
  const conAvance = obrasEnEjecucion.filter(p => (reportes || []).some(r => r.proyectoId === p.id && (r.fecha || '') >= corte)).length;
  return { key: 'avance', label: 'Obras avanzando', peso,
    score: obrasEnEjecucion.length > 0 ? (conAvance / obrasEnEjecucion.length) * 100 : null,
    detalle: obrasEnEjecucion.length > 0
      ? `${conAvance}/${obrasEnEjecucion.length} con avance en los últimos ${DIAS_AVANCE} días`
      : 'Sin obras en ejecución' };
}

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
// ctx = { data, jornadas (del trimestre), reclamaciones, surveys, trimestre, config }
export function calcularBonoSupervisor(persona, ctx) {
  const { data, jornadas, reclamaciones, surveys = [], trimestre, config } = ctx;
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
  const kReportes = { key: 'reportes', label: 'Reportes al día', peso: 15, score: pct(alDia, reps.length),
    detalle: reps.length ? `${alDia}/${reps.length} sin retroactivo` : 'Sin reportes en el trimestre' };

  // 3 · Obras avanzando (v8.29.2): ninguna obra en ejecución muere en silencio.
  const kAvance = kpiAvance(misProyectos.filter(p => p.estado === 'en_ejecucion'), data.reportes, 20);

  // 4 · Producción de sus obras vs meta del trimestre (20% — depende de la cartera vendida).
  const rd = filasProduccion(data).filter(f => ids.has(f.proyectoId) && f.fecha >= trimestre.inicio && f.fecha <= trimestre.fin)
    .reduce((s, f) => s + f.rd, 0);
  const meta = Number(config?.metaProduccionRd) || 0;
  const kProd = { key: 'produccion', label: 'Producción vs meta', peso: 20,
    score: meta > 0 ? (rd / meta) * 100 : null, rd, meta,
    detalle: meta > 0 ? `RD$ ${Math.round(rd).toLocaleString()} de ${Math.round(meta).toLocaleString()}` : 'Meta sin definir' };

  // 4 · Calidad: reclamaciones abiertas en el trimestre sobre sus obras (100 − 25 por cada una).
  const recs = (reclamaciones || []).filter(r => r.proyectoId && ids.has(r.proyectoId) &&
    (r.fechaApertura || '').slice(0, 10) >= trimestre.inicio && (r.fechaApertura || '').slice(0, 10) <= trimestre.fin);
  const kCalidad = { key: 'calidad', label: 'Calidad (reclamaciones)', peso: 15, score: clamp(100 - 25 * recs.length, 0, 100),
    detalle: recs.length ? `${recs.length} reclamación${recs.length !== 1 ? 'es' : ''} en el trimestre` : 'Sin reclamaciones 🎉' };

  // v8.31.0: KPI compartido de equipo — levantamientos realizados en ≤48h
  const kLev48 = kpiLevantamientos48(surveys, trimestre, 15);

  return combinar(aplicarOverrides([kJornadas, kReportes, kAvance, kLev48, kProd, kCalidad], config?.kpiOverrides));
}

// ---------------- Gerente de Operaciones ----------------
// ctx = { data, reclamaciones, surveys, cubicaciones, historialEstados, trimestre, config }
// historialEstados: mapa proyectoId -> [cambios en orden ascendente] (listarHistorialEstadosBatch)
export function calcularBonoGerente(persona, ctx) {
  const { data, reclamaciones, surveys, cubicaciones = [], historialEstados = {}, trimestre, config } = ctx;
  const hoy = hoyRD();
  const fechaMenosDias = (n) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  // 1 · Producción global vs meta (15% — depende de la cartera vendida).
  const rd = filasProduccion(data).filter(f => f.fecha >= trimestre.inicio && f.fecha <= trimestre.fin)
    .reduce((s, f) => s + f.rd, 0);
  const meta = Number(config?.metaProduccionRd) || 0;
  const kProd = { key: 'produccion', label: 'Producción vs meta', peso: 15,
    score: meta > 0 ? (rd / meta) * 100 : null, rd, meta,
    detalle: meta > 0 ? `RD$ ${Math.round(rd).toLocaleString()} de ${Math.round(meta).toLocaleString()}` : 'Meta sin definir' };

  // 1b · Obras avanzando (global, v8.29.2).
  const enEjecucion = (data.proyectos || []).filter(p => !p.archivado && p.estado === 'en_ejecucion');
  const kAvance = kpiAvance(enEjecucion, data.reportes, 15);

  // 1c · ERP al día: toda obra activa en el estado que le toca y con su equipo completo.
  // Señales de descuadre: en ejecución sin reporte en 10 días (debería estar parada o
  // terminada), o activa sin supervisor/maestro asignado.
  const activas = (data.proyectos || []).filter(p => !p.archivado && ['aprobado', 'planificado', 'en_ejecucion'].includes(p.estado));
  const corte10 = fechaMenosDias(10);
  const conProblema = activas.filter(p =>
    (p.estado === 'en_ejecucion' && !(data.reportes || []).some(r => r.proyectoId === p.id && (r.fecha || '') >= corte10)) ||
    !p.supervisorId || !p.maestroId
  ).length;
  const kErp = { key: 'erp_al_dia', label: 'ERP al día', peso: 15,
    score: activas.length > 0 ? ((activas.length - conProblema) / activas.length) * 100 : null,
    detalle: activas.length === 0 ? 'Sin obras activas'
      : conProblema === 0 ? 'Todas las obras cuadradas 🎉'
      : `${conProblema}/${activas.length} con estado desactualizado o sin equipo` };

  // 1d · Terminadas → facturadas: hacer no basta — entregar y facturar. Una obra que
  // lleva +15 días en "finalizado" sin llegar a facturado, resta.
  const terminadas = (data.proyectos || []).filter(p => !p.archivado &&
    (p.estado === 'finalizado_no_entregado' || p.estado === 'finalizado_recibido_conforme'));
  const fechaUltimoEstado = (p) => { const h = historialEstados[p.id]; return (h && h.length) ? (h[h.length - 1].created_at || '').slice(0, 10) : null; };
  const sinFacturarViejas = terminadas.filter(p => { const f = fechaUltimoEstado(p); return f && f < fechaMenosDias(15); }).length;
  const kFact = { key: 'facturacion', label: 'Terminadas → facturadas', peso: 20,
    score: clamp(100 - 20 * sinFacturarViejas, 0, 100),
    detalle: sinFacturarViejas > 0
      ? `${sinFacturarViejas} obra${sinFacturarViejas !== 1 ? 's' : ''} terminada${sinFacturarViejas !== 1 ? 's' : ''} con +15 días sin facturar`
      : terminadas.length > 0 ? `${terminadas.length} terminada${terminadas.length !== 1 ? 's' : ''} en proceso, ninguna envejecida` : 'Nada terminado sin facturar 🎉' };

  // 1e · Cubicaciones mensuales: toda obra en ejecución con +30 días de arrancada debe
  // tener cubicación reciente (últimos 35 días) o su próxima fecha de cubicación fijada.
  const largas = enEjecucion.filter(p => { const fi = p.fecha_inicio || p.fechaInicio; return fi && String(fi).slice(0, 10) < fechaMenosDias(30); });
  const corte35 = fechaMenosDias(35);
  const cubAlDia = largas.filter(p =>
    (cubicaciones || []).some(c => c.proyectoId === p.id && ((c.fechaCubicacion || c.createdAt || '').slice(0, 10) >= corte35)) ||
    ((p.proximaCubicacionFecha || p.proxima_cubicacion_fecha || '') >= hoy)
  ).length;
  const kCub = { key: 'cubicaciones', label: 'Cubicaciones mensuales', peso: 15,
    score: largas.length > 0 ? (cubAlDia / largas.length) * 100 : null,
    detalle: largas.length === 0 ? 'Sin obras de más de un mes en ejecución'
      : `${cubAlDia}/${largas.length} obras largas con cubicación al día o fecha fijada` };

  // 2 · Levantamientos ≤48h (v8.31.0: KPI compartido de equipo — regla de Leonardo).
  const kLev = kpiLevantamientos48(surveys, trimestre, 10);

  // 3 · Reclamaciones: ninguna envejeciendo (100 − 20 por cada abierta con más de 14 días).
  const abiertasViejas = (reclamaciones || []).filter(r =>
    r.estado !== 'resuelta' && r.estado !== 'cerrada' && !r.archivado &&
    (diasEntre(r.fechaApertura, new Date().toISOString()) || 0) > 14).length;
  const kRecl = { key: 'reclamaciones', label: 'Reclamaciones sin envejecer', peso: 10,
    score: clamp(100 - 20 * abiertasViejas, 0, 100),
    detalle: abiertasViejas ? `${abiertasViejas} abierta${abiertasViejas !== 1 ? 's' : ''} con +14 días` : 'Ninguna con +14 días 🎉' };

  // (v8.29.2: "disciplina de reporte" se retiró como KPI propio del gerente — ya vive
  // dentro de "ERP al día" y en el KPI de reportes de cada supervisor.)

  return combinar(aplicarOverrides([kProd, kAvance, kErp, kFact, kCub, kLev, kRecl], config?.kpiOverrides));
}

// ---------------- Comercial (Edwin — embudo de levantamientos) ----------------
// Su deber: recibir toda solicitud, crearla en el ERP y asignarla; los SUPERVISORES
// realizan el levantamiento (≤48h, KPI compartido); Edwin cotiza el MISMO DÍA del
// levantamiento; cuando la cotización sale ENVIADA en Odoo el proceso cierra y le
// nace la tarea de CONFIRMAR con el cliente que la recibió en ≤24h.
// ctx = { surveys, solicitudes, tareas, trimestre, config }
export function calcularBonoComercial(persona, ctx) {
  const { surveys = [], solicitudes = [], tareas = [], trimestre, config } = ctx;
  const ahora = Date.now();
  const fechaRDde = (iso) => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date(iso)) : null;
  const hoy = hoyRD();

  // 1 · Solicitudes atendidas ≤1 día (crearlas en el ERP): created_at → resuelto_at.
  const sols = solicitudes.filter(s => (s.created_at || '').slice(0, 10) >= trimestre.inicio && (s.created_at || '').slice(0, 10) <= trimestre.fin);
  let solOk = 0, solEval = 0;
  sols.forEach(s => {
    const creado = new Date(s.created_at).getTime();
    if (s.resuelto_at) { solEval++; if (new Date(s.resuelto_at).getTime() - creado <= 24 * 3600000) solOk++; }
    else if (ahora - creado > 24 * 3600000) solEval++; // sin atender y vencida
  });
  const kSol = { key: 'solicitudes', label: 'Solicitudes atendidas ≤1 día', peso: 20, score: pct(solOk, solEval),
    detalle: solEval ? `${solOk}/${solEval} atendidas dentro de 24h` : 'Sin solicitudes en el trimestre' };

  // 2 · Nada sin asignar: levantamientos nuevos sin responsable con +2 días.
  const sinAsignar = surveys.filter(s => s.status === 'planning' && !s.asignado_a_id &&
    (ahora - new Date(s.created_at).getTime()) > 2 * 86400000).length;
  const kAsig = { key: 'asignacion', label: 'Nada sin asignar', peso: 15, score: clamp(100 - 25 * sinAsignar, 0, 100),
    detalle: sinAsignar ? `${sinAsignar} levantamiento${sinAsignar !== 1 ? 's' : ''} sin asignar con +2 días` : 'Todo asignado 🎉' };

  // 3 · Levantamientos ≤48h — el KPI compartido del equipo.
  const kLev48 = kpiLevantamientos48(surveys, trimestre, 20);

  // 4 · Cotización el MISMO DÍA del levantamiento (realizado_at → cotizado_at).
  const realizados = surveys.filter(s => s.realizado_at && fechaRDde(s.realizado_at) >= trimestre.inicio && fechaRDde(s.realizado_at) <= trimestre.fin);
  let cotOk = 0, cotEval = 0;
  realizados.forEach(s => {
    if (s.cotizado_at) { cotEval++; if (fechaRDde(s.cotizado_at) === fechaRDde(s.realizado_at)) cotOk++; }
    else if (fechaRDde(s.realizado_at) < hoy) cotEval++; // el día pasó sin cotizar
  });
  const kCot = { key: 'cotizacion_dia', label: 'Cotización el mismo día', peso: 25, score: pct(cotOk, cotEval),
    detalle: cotEval ? `${cotOk}/${cotEval} cotizados el mismo día del levantamiento` : 'Sin levantamientos realizados evaluables aún' };

  // 5 · Confirmación de recepción ≤24h (tarea que nace al salir ENVIADA la cotización en Odoo).
  const confs = tareas.filter(t => t.tipo === 'confirmar_recepcion_cotizacion' &&
    (t.createdAt || '').slice(0, 10) >= trimestre.inicio && (t.createdAt || '').slice(0, 10) <= trimestre.fin);
  let cOk = 0, cEval = 0;
  confs.forEach(t => {
    const creado = new Date(t.createdAt).getTime();
    if (t.completada && t.completadaAt) { cEval++; if (new Date(t.completadaAt).getTime() - creado <= 24 * 3600000) cOk++; }
    else if (ahora - creado > 24 * 3600000) cEval++;
  });
  const kConf = { key: 'confirmacion', label: 'Recepción confirmada ≤24h', peso: 20, score: pct(cOk, cEval),
    detalle: cEval ? `${cOk}/${cEval} confirmadas con el cliente en ≤24h` : 'Sin cotizaciones enviadas evaluables aún' };

  return combinar(aplicarOverrides([kSol, kAsig, kLev48, kCot, kConf], config?.kpiOverrides));
}

// Bono estimado en RD$ según puntaje y reglas (gate/tope).
export function bonoEstimado(puntaje, montoObjetivoRd) {
  const monto = Number(montoObjetivoRd) || 0;
  if (puntaje == null || monto <= 0) return null;
  if (puntaje < BONO_GATE) return 0;
  return monto * clamp(puntaje, 0, BONO_TOPE) / 100;
}
