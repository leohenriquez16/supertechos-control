// lib/helpers/dietaHospedaje.js
// v8.17.29 — Helpers de presupuesto vs consumido de Dieta + Hospedaje.
//
// Modelo:
// - Una persona consume "dieta" cuando se marca un sub_tipo (desayuno/comida/cena)
//   al cerrar la jornada. Cada sub_tipo paga un monto fijo (config_dieta).
// - Una persona consume "hospedaje" cuando se marca sub_tipo='hotel' (también monto fijo).
// - Las facturas en categorías con aplica_a='dieta'/'hospedaje' NO se reembolsan:
//   consumen el presupuesto en lugar de pasarse como gasto reembolsable.
// - La "holgura" = presupuesto otorgado - facturas reportadas en esa partida.
//   Positiva = al maestro le sobró (ganó esa diferencia).
//   Negativa = la oficina lo cubrió de más (raro; se ajusta manualmente).

const SUB_TIPOS_DIETA = ['desayuno', 'comida', 'cena'];
const SUB_TIPOS_HOSPEDAJE = ['hotel'];

/**
 * Devuelve el monto unitario en RD$ del sub_tipo, según la config global.
 */
export function montoDelSubTipo(subTipo, configDieta) {
  if (!subTipo || !configDieta) return 0;
  if (subTipo === 'desayuno') return Number(configDieta.desayunoRd || 0);
  if (subTipo === 'comida') return Number(configDieta.comidaRd || 0);
  if (subTipo === 'cena') return Number(configDieta.cenaRd || 0);
  if (subTipo === 'hotel') return Number(configDieta.hotelRd || 0);
  return 0;
}

/**
 * Decide si una categoría aplica a una partida (dieta/hospedaje) o si es un
 * gasto reembolsable normal. Devuelve 'dieta' | 'hospedaje' | null.
 */
export function partidaDeCategoria(categoriaId, categoriasCajaChica) {
  if (!categoriaId || !Array.isArray(categoriasCajaChica)) return null;
  const cat = categoriasCajaChica.find(c => c.id === categoriaId);
  return cat?.aplicaA || null;
}

/**
 * ¿La pareja (persona × proyecto) tiene dieta activa? (legacy v8.17.29)
 * Requiere AMBOS toggles en true (opt-in en 2 niveles).
 * v8.17.47: ya no se usa para filtrar en cierre de jornada (ahora se incluye
 * a todo el equipo y se debita al responsable de caja). Se conserva por
 * compatibilidad con código que pueda consultar por persona individual.
 */
export function dietaAplicaA(persona, proyecto) {
  return !!(persona?.dietaHabilitada && proyecto?.aplicaDieta);
}

export function hospedajeAplicaA(persona, proyecto) {
  return !!(persona?.hospedajeHabilitado && proyecto?.aplicaHospedaje);
}

/**
 * v8.17.47: Encuentra al responsable de caja chica del proyecto para registrar
 * dieta/hospedaje del equipo. La dieta NO sale de la caja de cada team member
 * — sale de la caja del maestro o supervisor (cualquiera que tenga
 * cajaChicaHabilitada). Si ambos la tienen, el maestro tiene prioridad porque
 * típicamente él es quien anda en obra con el efectivo.
 *
 * @param {Object} proyecto
 * @param {Array} personal - lista completa de personas (data.personal)
 * @returns {Object|null} la persona responsable, o null si nadie tiene caja
 */
export function obtenerResponsableCajaDieta(proyecto, personal) {
  if (!proyecto || !Array.isArray(personal)) return null;
  const maestro = personal.find(p => p.id === proyecto.maestroId);
  const supervisor = personal.find(p => p.id === proyecto.supervisorId);
  if (maestro?.cajaChicaHabilitada) return maestro;
  if (supervisor?.cajaChicaHabilitada) return supervisor;
  return null;
}

/**
 * Filtra movimientos a un rango de fechas (ISO yyyy-mm-dd inclusive).
 */
function enRango(m, desde, hasta) {
  if (desde && m.fecha < desde) return false;
  if (hasta && m.fecha > hasta) return false;
  return true;
}

/**
 * Calcula el resumen de Dieta + Hospedaje para una persona en un rango.
 *
 * @param {Object} args
 * @param {string} args.personaId
 * @param {string} args.desde  - ISO yyyy-mm-dd inclusive
 * @param {string} args.hasta  - ISO yyyy-mm-dd inclusive
 * @param {Array}  args.movimientos - todos los caja_chica_movimientos de la persona
 * @param {Object} args.configDieta - { desayunoRd, comidaRd, cenaRd, hotelRd }
 * @returns {Object} { dieta: {presupuesto, consumido, holgura, detalle},
 *                     hospedaje: {presupuesto, consumido, holgura, detalle} }
 */
export function resumenDietaHospedaje({ personaId, desde, hasta, movimientos, configDieta }) {
  const movs = (movimientos || []).filter(m => m.personaId === personaId && enRango(m, desde, hasta));

  // Presupuesto: suma de movimientos tipo='dieta' o tipo='hospedaje' con sub_tipo.
  // Son los "créditos" que la empresa registró cuando el maestro marcó las comidas/noches.
  let presupuestoDieta = 0;
  let presupuestoHospedaje = 0;
  const detalleDieta = { desayuno: 0, comida: 0, cena: 0 };
  const detalleHospedaje = { hotel: 0 };

  // Consumido: facturas (gasto_factura) cuyo aplica_a apunta a la partida.
  let consumidoDieta = 0;
  let consumidoHospedaje = 0;
  const facturasDieta = [];
  const facturasHospedaje = [];

  for (const m of movs) {
    // Pre-aprobados o pendientes — todos cuentan al presupuesto del mes
    // (rechazados sí se descuentan).
    if (m.status === 'rechazado') continue;
    const monto = Number(m.monto || 0);

    if (m.aplicaA === 'dieta' || (m.tipo === 'dieta' && SUB_TIPOS_DIETA.includes(m.subTipo))) {
      if (m.tipo === 'dieta' || m.tipo === 'hospedaje') {
        // Es un crédito de presupuesto (marca de "consumí desayuno/etc")
        presupuestoDieta += monto;
        if (m.subTipo && detalleDieta[m.subTipo] !== undefined) detalleDieta[m.subTipo] += monto;
      } else {
        // Es una factura cargada a dieta — consume presupuesto
        consumidoDieta += monto;
        facturasDieta.push(m);
      }
    } else if (m.aplicaA === 'hospedaje' || (m.tipo === 'hospedaje' && SUB_TIPOS_HOSPEDAJE.includes(m.subTipo))) {
      if (m.tipo === 'dieta' || m.tipo === 'hospedaje') {
        presupuestoHospedaje += monto;
        if (m.subTipo && detalleHospedaje[m.subTipo] !== undefined) detalleHospedaje[m.subTipo] += monto;
      } else {
        consumidoHospedaje += monto;
        facturasHospedaje.push(m);
      }
    }
  }

  return {
    dieta: {
      presupuesto: presupuestoDieta,
      consumido: consumidoDieta,
      holgura: presupuestoDieta - consumidoDieta,
      detalle: detalleDieta,
      facturas: facturasDieta,
    },
    hospedaje: {
      presupuesto: presupuestoHospedaje,
      consumido: consumidoHospedaje,
      holgura: presupuestoHospedaje - consumidoHospedaje,
      detalle: detalleHospedaje,
      facturas: facturasHospedaje,
    },
  };
}

/**
 * Crea los movimientos de crédito (tipo='dieta'/'hospedaje' con sub_tipo)
 * a partir de los checkboxes marcados al cerrar una jornada.
 *
 * v8.17.47: la dieta es del MAESTRO/SUPERVISOR responsable de caja, no de cada
 * persona del equipo. Si `consumioPersonaNombre` viene, lo agregamos al
 * concepto para que el admin sepa quién comió. `personaId` ahora es el dueño
 * de la caja (responsable), no quien consumió.
 *
 * @param {Object} args
 * @param {Array<string>} args.subTipos - ['desayuno','comida','hotel',...]
 * @param {string} args.personaId - el dueño de la caja chica (maestro/supervisor responsable)
 * @param {string} args.proyectoId
 * @param {string} args.fecha - ISO yyyy-mm-dd
 * @param {Object} args.configDieta
 * @param {string} [args.creadoPorId]
 * @param {string} [args.consumioPersonaNombre] - quién del equipo consumió (para concepto)
 * @returns {Array} - lista de objetos listos para crearMovimientoCajaChica()
 */
export function buildMovimientosDieta({ subTipos, personaId, proyectoId, fecha, configDieta, creadoPorId = null, consumioPersonaNombre = null }) {
  if (!Array.isArray(subTipos) || subTipos.length === 0) return [];
  return subTipos.map(st => {
    const partida = SUB_TIPOS_HOSPEDAJE.includes(st) ? 'hospedaje' : 'dieta';
    const tipo = partida; // tipo='dieta' o tipo='hospedaje' (vienen del enum existente)
    const monto = montoDelSubTipo(st, configDieta);
    const base = st === 'hotel' ? 'Hospedaje (hotel)' : `Dieta (${st})`;
    return {
      personaId,
      proyectoId,
      fecha,
      tipo,
      subTipo: st,
      aplicaA: partida,
      monto,
      concepto: consumioPersonaNombre
        ? `${base} — ${consumioPersonaNombre}`
        : base,
      status: 'aprobado', // pre-aprobado: viene del cierre de jornada
      creadoPorId,
    };
  });
}

export const SUB_TIPOS_DIETA_KEYS = SUB_TIPOS_DIETA;
export const SUB_TIPOS_HOSPEDAJE_KEYS = SUB_TIPOS_HOSPEDAJE;
export const TODOS_SUB_TIPOS = [...SUB_TIPOS_DIETA, ...SUB_TIPOS_HOSPEDAJE];

export const LABEL_SUB_TIPO = {
  desayuno: 'Desayuno',
  comida: 'Comida',
  cena: 'Cena',
  hotel: 'Hotel',
};

export const EMOJI_SUB_TIPO = {
  desayuno: '🥐',
  comida: '🍽',
  cena: '🌙',
  hotel: '🛏',
};
