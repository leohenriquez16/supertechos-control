// v8.52.0: Motor de SLA de Levantamientos (puro, sin DB).
// Política (definida por Leo): meta 72h de recepción (envío del formulario) a
// cotización enviada, midiendo SOLO tiempo controlable. Reglas:
//  - Si la fecha de visita la puso el CLIENTE → el reloj se pausa en "Agendado".
//  - Post-visita sistema NORMAL → cotización el mismo día (fin de tarde).
//  - Sistema COMPLEJO → consulta técnica, SLA 24h.

export const ETAPAS_ACTIVAS = ['New', 'Contactado', 'Asignado', 'Agendado', 'Realizado', 'Cotizacion en Revision'];
export const TERMINALES = ['Cotizacion Realizada', 'No se pudo coordinar', 'No podemos cotizar', 'Cliente no esta interesado'];
export const ETAPA_EXITO = 'Cotizacion Realizada';

// SLA por etapa en HORAS (Realizado se calcula aparte por "mismo día").
const SLA_HORAS = { 'New': 24, 'Contactado': 24, 'Asignado': 24, 'Agendado': 48, 'Cotizacion en Revision': 24 };

const H = (ms) => ms / 3600000;
const finDeDia = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export function evaluarSlaLevantamiento(it, ahora = new Date()) {
  const etapa = it.odoo_stage || 'New';
  const terminal = TERMINALES.includes(etapa);
  const exito = etapa === ETAPA_EXITO;
  const esComplejo = !!it.requiere_consulta_tecnica;
  const esperandoCliente = !!it.visita_por_cliente && etapa === 'Agendado';
  const desdeEtapa = it.stage_changed_at ? new Date(it.stage_changed_at) : new Date(it.recepcionAt || it.created_at);
  const horasEnEtapa = Math.max(0, H(ahora - desdeEtapa));

  let slaEtapa = SLA_HORAS[etapa] ?? null;
  let motivoSla = null;
  if (etapa === 'Realizado') {
    if (esComplejo && it.consulta_tecnica_at) { slaEtapa = 24; motivoSla = 'consulta técnica 24h'; }
    else { const limite = finDeDia(it.realizado_at || it.stage_changed_at || it.recepcionAt); slaEtapa = Math.max(2, H(limite - desdeEtapa)); motivoSla = 'mismo día'; }
  } else if (etapa === 'Cotizacion en Revision' && esComplejo && it.consulta_tecnica_at) {
    slaEtapa = 24; motivoSla = 'consulta técnica 24h';
  }

  let semaforo = 'verde';
  if (terminal) semaforo = exito ? 'exito' : 'cerrado';
  else if (esperandoCliente) semaforo = 'pausa';
  else if (slaEtapa != null) {
    if (horasEnEtapa > slaEtapa * 2) semaforo = 'rojo';
    else if (horasEnEtapa > slaEtapa) semaforo = 'amarillo';
  }

  const inicio = new Date(it.recepcionAt || it.created_at);
  const fin = exito ? new Date(it.cotizado_at || ahora) : ahora;
  const horasTotales = Math.max(0, H(fin - inicio));

  // v8.53.0 (Fase 3A): verdad de Odoo. it.odooCotState = draft|sent|sale|cancel (o undefined).
  // FUGA: marcada "Cotizacion Realizada" en el ERP pero la cotización sigue en BORRADOR
  // en Odoo → nunca se envió al cliente; el embudo NO está realmente cerrado.
  const odooCotState = it.odooCotState || null;
  const cotizadaSinEnviar = exito && odooCotState === 'draft';
  const enviadaOdoo = odooCotState === 'sent' || odooCotState === 'sale';

  return {
    etapa, terminal, exito, esComplejo, esperandoCliente,
    horasEnEtapa, slaEtapa, motivoSla, semaforo,
    horasTotales, dentro72: horasTotales <= 72,
    atascado: semaforo === 'amarillo' || semaforo === 'rojo',
    odooCotState, cotizadaSinEnviar, enviadaOdoo,
  };
}

// v8.53.0 (Fase 3A): métricas de tiempo de ciclo (recepción → cotización enviada)
// sobre los levantamientos cotizados dentro de un período (desdeISO opcional).
// Devuelve mediana y promedio en horas, cuántos cumplieron la meta de 72h, y el %.
export function metricasCiclo(evaluados, desdeISO = null) {
  const enviados = (evaluados || []).filter((e) =>
    e.sla.exito && e.it.cotizado_at && (!desdeISO || e.it.cotizado_at >= desdeISO));
  const horas = enviados.map((e) => e.sla.horasTotales).sort((a, b) => a - b);
  const n = horas.length;
  const mediana = n ? (n % 2 ? horas[(n - 1) / 2] : (horas[n / 2 - 1] + horas[n / 2]) / 2) : null;
  const prom = n ? horas.reduce((a, b) => a + b, 0) / n : null;
  const dentro72 = enviados.filter((e) => e.sla.dentro72).length;
  return { n, mediana, prom, dentro72, pct72: n ? Math.round((dentro72 / n) * 100) : null };
}

// "3 h", "2 d 4 h"
export function formatHoras(h) {
  if (h == null) return '—';
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24); const r = Math.round(h % 24);
  return r ? `${d} d ${r} h` : `${d} d`;
}
