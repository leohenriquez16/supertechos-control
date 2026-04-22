// v8.9.30: Listar TODAS las jornadas abiertas (sin horaFin) — para "Personal en Obra Ahora"
export async function listarJornadasAbiertas() {
  const { data, error } = await supabase
    .from('jornadas')
    .select('*')
    .is('hora_fin', null)
    .order('hora_inicio', { ascending: false });
  if (error) throw error;
  return (data || []).map(j => ({
    id: j.id, proyectoId: j.proyecto_id, fecha: j.fecha,
    horaInicio: j.hora_inicio, iniciadaPorId: j.iniciada_por_id, iniciadaPorNombre: j.iniciada_por_nombre,
    inicioLat: j.inicio_lat, inicioLng: j.inicio_lng, inicioPrecisionM: j.inicio_precision_m, inicioDistanciaObraM: j.inicio_distancia_obra_m,
    personasPresentesIds: j.personas_presentes_ids || [],
    horaFin: j.hora_fin, finalizadaPorId: j.finalizada_por_id, finalizadaPorNombre: j.finalizada_por_nombre,
    finLat: j.fin_lat, finLng: j.fin_lng, finPrecisionM: j.fin_precision_m, finDistanciaObraM: j.fin_distancia_obra_m,
    nota: j.nota,
    diaDoble: j.dia_doble || false,
    condicionDia: j.condicion_dia || 'normal',
    condicionNota: j.condicion_nota || '',
  }));
}
