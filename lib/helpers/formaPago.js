// v8.59.7 — ¿A quién de esta obra le falta la forma de pago?
// Lo que importa para nómina es lo que la empresa paga: si a alguien le toca cobrar POR DÍA
// (por el modo de la obra o el suyo propio) y no tiene monto, cobra RD$0. Los ayudantes de una
// obra por m² no se preguntan: su arreglo es con su maestro (decisión de Leo, oct-2026).
// 'maestro' = lo paga su maestro: la empresa no le paga nada en esa obra y no se alerta.

export const MODOS_CON_DIA = ['dia', 'dia_m2'];

/**
 * @param proyecto  { id, modoPagoManoObra, maestroId }
 * @param personasIds  ids que trabajaron (jornadas recientes)
 * @param costos  [{ personaId, costoDia, modoPago }] de costos_dia_proyecto de esa obra
 * @returns [{ personaId, modo, esMaestro }]
 */
export function personasSinFormaDePago(proyecto, personasIds = [], costos = []) {
  if (!proyecto) return [];
  const porPersona = new Map(costos.map(c => [c.personaId, c]));
  const vistos = new Set();
  const out = [];
  personasIds.forEach(pid => {
    if (!pid || vistos.has(pid)) return;
    vistos.add(pid);
    const ov = porPersona.get(pid) || {};
    const modo = ov.modoPago || proyecto.modoPagoManoObra;
    if (!MODOS_CON_DIA.includes(modo)) return;
    if (Number(ov.costoDia) > 0) return;
    out.push({ personaId: pid, modo, esMaestro: pid === proyecto.maestroId });
  });
  return out;
}
