// v8.34.0: Motor de TAREAS RECURRENTES — obligaciones con fecha (impuestos,
// pagos, cierres) que se convierten solas en tareas del módulo Tareas.
// Lógica pura + generador que recibe el cliente supabase (lo usan el ERP
// en vivo y el cron diario con sus respectivos clientes).

const pad = (n) => String(n).padStart(2, '0');
const addDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// Día del mes con ajuste al último día real (día 31 en abril → 30).
const fechaMes = (anio, mes1a12, dia) => {
  const ultimo = new Date(anio, mes1a12, 0).getDate();
  return `${anio}-${pad(mes1a12)}-${pad(Math.min(Math.max(dia, 1), ultimo))}`;
};

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function descFrecuencia(rec) {
  if (rec.frecuencia === 'semanal') return `Cada ${DIAS_SEMANA[rec.diaSemana ?? 1] || 'semana'}`;
  if (rec.frecuencia === 'quincenal') return `Los días ${rec.diaMes || 15} y ${rec.diaMes2 || 30} de cada mes`;
  return `Mensual, día ${rec.diaMes || 1}`;
}

// Ocurrencias candidatas alrededor de hoy (mes pasado, este y el próximo) para
// poder recuperar fechas perdidas si el cron estuvo días sin correr.
export function ocurrenciasCandidatas(rec, hoy) {
  const [y, m] = hoy.split('-').map(Number);
  const out = [];
  if (rec.frecuencia === 'semanal') {
    const dow = rec.diaSemana ?? 1;
    for (let i = -21; i <= 7; i++) {
      const f = addDias(hoy, i);
      if (new Date(f + 'T12:00:00').getDay() === dow) out.push(f);
    }
  } else {
    const meses = [[m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1], [y, m], [m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1]];
    for (const [yy, mm] of meses) {
      out.push(fechaMes(yy, mm, rec.diaMes || 1));
      if (rec.frecuencia === 'quincenal') out.push(fechaMes(yy, mm, rec.diaMes2 || 30));
    }
  }
  return [...new Set(out)].sort();
}

// La próxima ocurrencia que TOCA generar hoy (o null): la más antigua que aún no
// se generó (por ultima_generada) y cuya ventana de aviso ya abrió.
export function proximaAGenerar(rec, hoy) {
  const candidatas = ocurrenciasCandidatas(rec, hoy);
  const pendiente = candidatas.find(f => (!rec.ultimaGenerada || f > rec.ultimaGenerada));
  if (!pendiente) return null;
  return hoy >= addDias(pendiente, -(rec.diasAviso ?? 3)) ? pendiente : null;
}

export const mapRecurrente = (r) => ({
  id: r.id, titulo: r.titulo, descripcion: r.descripcion, area: r.area,
  proyectoInternoId: r.proyecto_interno_id,
  responsableId: r.responsable_id, responsableNombre: r.responsable_nombre,
  supervisorId: r.supervisor_id, supervisorNombre: r.supervisor_nombre,
  prioridad: r.prioridad || 'normal', frecuencia: r.frecuencia,
  diaMes: r.dia_mes, diaMes2: r.dia_mes_2, diaSemana: r.dia_semana,
  diasAviso: r.dias_aviso ?? 3, activo: r.activo !== false,
  ultimaGenerada: r.ultima_generada, createdAt: r.created_at,
});

// Recorre las recurrentes activas y crea las tareas que tocan. Idempotente:
// ultima_generada avanza a la ocurrencia creada. Devuelve { generadas, detalles }.
export async function generarTareasRecurrentesCon(supabase, hoy) {
  const res = { generadas: 0, detalles: [] };
  const { data, error } = await supabase.from('tareas_recurrentes').select('*').eq('activo', true);
  if (error) throw error;
  for (const row of (data || [])) {
    const rec = mapRecurrente(row);
    const fecha = proximaAGenerar(rec, hoy);
    if (!fecha) continue;
    const { error: e1 } = await supabase.from('tareas').insert({
      id: 't_rec_' + rec.id + '_' + fecha.replace(/-/g, ''),
      tipo: 'recurrente', titulo: rec.titulo,
      descripcion: [rec.descripcion, `🔁 ${descFrecuencia(rec)}`].filter(Boolean).join('\n'),
      proyecto_interno_id: rec.proyectoInternoId || null,
      asignada_a_id: rec.responsableId || null, asignada_a_nombre: rec.responsableNombre || null,
      supervisor_id: rec.supervisorId || null, supervisor_nombre: rec.supervisorNombre || null,
      prioridad: rec.prioridad, fecha_limite: fecha,
    });
    // id determinístico por ocurrencia → si dos clientes generan a la vez, el
    // segundo insert choca por PK y no duplica; solo avanzamos el puntero.
    if (e1 && !`${e1.message}`.includes('duplicate')) { res.detalles.push({ id: rec.id, error: e1.message }); continue; }
    await supabase.from('tareas_recurrentes').update({ ultima_generada: fecha }).eq('id', rec.id);
    if (!e1) { res.generadas++; res.detalles.push({ id: rec.id, titulo: rec.titulo, fecha }); }
  }
  return res;
}
