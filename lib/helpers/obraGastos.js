// v8.59.5 — ¿A qué obras se les puede cargar un gasto de caja chica?
// Una obra facturada o recibida conforme está cerrada: su costo ya se cerró con el cliente.
// Cargarle gastos le infla el costo a esa obra y se lo quita a la obra donde de verdad se usó
// (caso Cristian / PG-C1296, sep-2026: 124 gastos por RD$186k a 19 obras cerradas en 2026).
// La base de datos aplica la misma regla con 7 días de gracia (trigger en migración 138).

export const ESTADOS_OBRA_CERRADA = ['facturado', 'finalizado_recibido_conforme'];

export const obraCerrada = (p) => !!p && ESTADOS_OBRA_CERRADA.includes(p.estado);

/** true si la obra puede aparecer en el selector de obra de un gasto nuevo. */
export const obraAdmiteGastos = (p) => !!p && !p.archivado && !obraCerrada(p);
