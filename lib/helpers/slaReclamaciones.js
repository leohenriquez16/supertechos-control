// v8.53.1 (Torre de Control · Fase 3B): motor de SLA de Reclamaciones (puro, sin DB).
// El ciclo va de la CREACIÓN de la reclamación hasta que el CLIENTE RECIBE el informe de
// solución (hito informe_entregado_at). Política (definida por Leo): SLA por SEVERIDAD.
//
// Meta total (creación → informe entregado), PROPUESTA para confirmar:
//   alta 48h · media 5 días (120h) · baja 10 días (240h).
// Sub-alerta: "Resuelta pero sin informe entregado" = el arreglo interno está hecho pero el
// cliente aún no recibió el informe → el ciclo NO está cerrado (paralelo a la fuga de Levantamientos).

export const SLA_SEVERIDAD_HORAS = { alta: 48, media: 120, baja: 240 };
export const SEVERIDAD_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const H = (ms) => ms / 3600000;

// r: objeto de reclamación (camelCase de reclamacionRowToObj) o snake (best-effort).
export function evaluarSlaReclamacion(r, ahora = new Date()) {
  const severidad = (r.severidad || 'media').toLowerCase();
  const estado = r.estado || 'abierta';
  const informeAt = r.informeEntregadoAt || r.informe_entregado_at || null;
  const fechaResuelta = r.fechaResuelta || r.fecha_resuelta || null;
  const apertura = r.fechaApertura || r.fecha_apertura || r.createdAt || r.created_at;

  const exito = !!informeAt;                                  // ciclo cerrado de verdad
  const terminal = exito || estado === 'rechazada' || estado === 'cerrada';
  // El arreglo está hecho pero el cliente no ha recibido el informe → sigue "activo" y se marca.
  const resueltaSinInforme = !informeAt && (estado === 'resuelta' || !!fechaResuelta);

  const slaTotal = SLA_SEVERIDAD_HORAS[severidad] ?? SLA_SEVERIDAD_HORAS.media;
  const inicio = apertura ? new Date(apertura) : ahora;
  const fin = exito ? new Date(informeAt) : ahora;
  const horasTotales = Math.max(0, H(fin - inicio));

  let semaforo = 'verde';
  if (terminal && !exito) semaforo = 'cerrado';              // cerrada/rechazada sin informe
  else if (exito) semaforo = horasTotales <= slaTotal ? 'exito' : 'exitoTarde';
  else if (horasTotales > slaTotal * 2) semaforo = 'rojo';
  else if (horasTotales > slaTotal) semaforo = 'amarillo';

  return {
    severidad, estado, exito, terminal, resueltaSinInforme,
    slaTotal, horasTotales, dentroSla: horasTotales <= slaTotal,
    semaforo, atascado: semaforo === 'amarillo' || semaforo === 'rojo',
  };
}

// Métricas de ciclo (creación → informe entregado) de las reclamaciones cerradas en un período.
export function metricasCicloReclam(evaluados, desdeISO = null) {
  const cerradas = (evaluados || []).filter((e) => {
    const at = e.r.informeEntregadoAt || e.r.informe_entregado_at;
    return e.sla.exito && at && (!desdeISO || at >= desdeISO);
  });
  const horas = cerradas.map((e) => e.sla.horasTotales).sort((a, b) => a - b);
  const n = horas.length;
  const mediana = n ? (n % 2 ? horas[(n - 1) / 2] : (horas[n / 2 - 1] + horas[n / 2]) / 2) : null;
  const prom = n ? horas.reduce((a, b) => a + b, 0) / n : null;
  const dentro = cerradas.filter((e) => e.sla.dentroSla).length;
  return { n, mediana, prom, dentro, pct: n ? Math.round((dentro / n) * 100) : null };
}
