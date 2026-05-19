// Helpers para generar el cuadre de caja chica.
// Calcula saldos en un período arbitrario, agrupa egresos por categoría,
// separa aprobados / pendientes / rechazados.

// Devuelve fechaInicio y fechaFin (YYYY-MM-DD) de la semana actual o pasada
// (lunes a domingo, estándar comercial RD).
export function periodoSemana({ pasada = false } = {}) {
  const ref = new Date();
  if (pasada) ref.setDate(ref.getDate() - 7);
  // Convertir a lunes: getDay() devuelve 0=domingo, 1=lunes...6=sábado
  const dia = ref.getDay();
  const diasParaLunes = (dia + 6) % 7; // distancia hacia atrás al lunes
  const lunes = new Date(ref); lunes.setDate(ref.getDate() - diasParaLunes);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  const fmt = (d) => d.toISOString().split('T')[0];
  return { fechaInicio: fmt(lunes), fechaFin: fmt(domingo) };
}

// Aporte de un movimiento al saldo. + suma, - resta, 0 ignora.
function aporteSaldo(m) {
  if (m.tipo === 'entrega') return Number(m.monto) || 0;
  if (m.tipo === 'ajuste') return (Number(m.monto) || 0) * (m.signoAjuste >= 0 ? 1 : -1);
  // Gastos y dietas solo pesan cuando están aprobados (los pendientes no afectan saldo)
  if ((m.tipo === 'gasto_factura' || m.tipo === 'dieta') && m.status === 'aprobado') {
    return -(Number(m.monto) || 0);
  }
  return 0;
}

// Calcula el cuadre para una persona específica en un rango de fechas.
// Espera movimientos = [] (todos los movimientos de esa persona).
export function calcularCuadre({ movimientos, fechaInicio, fechaFin }) {
  const previos = movimientos.filter(m => m.fecha < fechaInicio);
  const enRango = movimientos.filter(m => m.fecha >= fechaInicio && m.fecha <= fechaFin);

  const saldoInicial = previos.reduce((s, m) => s + aporteSaldo(m), 0);

  // Sumas del período
  const totalEntregas = enRango
    .filter(m => m.tipo === 'entrega')
    .reduce((s, m) => s + Number(m.monto || 0), 0);

  const gastosAprob = enRango.filter(m => m.tipo === 'gasto_factura' && m.status === 'aprobado');
  const dietasAprob = enRango.filter(m => m.tipo === 'dieta' && m.status === 'aprobado');
  const ajustesEnRango = enRango.filter(m => m.tipo === 'ajuste');
  const pendientes = enRango.filter(m => m.status === 'pendiente_revision');
  const rechazados = enRango.filter(m => m.status === 'rechazado');

  const totalGastos = gastosAprob.reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalDietas = dietasAprob.reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalAjustes = ajustesEnRango.reduce((s, m) => s + (Number(m.monto || 0) * (m.signoAjuste >= 0 ? 1 : -1)), 0);
  const totalPendientes = pendientes.reduce((s, m) => s + Number(m.monto || 0), 0);

  const saldoFinal = saldoInicial + totalEntregas - totalGastos - totalDietas + totalAjustes;

  // Agrupación de gastos aprobados por categoría
  const porCategoria = {};
  gastosAprob.forEach(m => {
    const cat = m.datosIA?.categoria_sugerida || 'sin_categoria';
    if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, total: 0, count: 0 };
    porCategoria[cat].total += Number(m.monto || 0);
    porCategoria[cat].count += 1;
  });
  const categorias = Object.values(porCategoria).sort((a, b) => b.total - a.total);

  // v8.16.1: gastos sin factura aprobados — sección dedicada para auditoría
  const sinFacturaAprob = gastosAprob.filter(m => !!m.datosIA?.sin_factura);
  const totalSinFactura = sinFacturaAprob.reduce((s, m) => s + Number(m.monto || 0), 0);
  const pctSinFactura = totalGastos > 0 ? (totalSinFactura / totalGastos) * 100 : 0;

  return {
    saldoInicial, saldoFinal,
    totalEntregas, totalGastos, totalDietas, totalAjustes, totalPendientes,
    movimientosEnRango: enRango.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    gastosAprobados: gastosAprob,
    dietasAprobadas: dietasAprob,
    pendientes, rechazados,
    categorias,
    sinFacturaAprob,
    totalSinFactura,
    pctSinFactura,
  };
}

// Etiquetas para mostrar
export const TIPO_LABEL = {
  entrega: 'Entrega',
  gasto_factura: 'Gasto',
  dieta: 'Dieta',
  ajuste: 'Ajuste',
};

export const CATEGORIA_LABEL = {
  ferreteria: 'Ferretería',
  combustible: 'Combustible',
  comida: 'Comida',
  peaje: 'Peaje',
  transporte: 'Transporte',
  herramientas: 'Herramientas',
  otros: 'Otros',
  sin_categoria: 'Sin categoría',
};

// v8.17.82: desglose de gastos aprobados por empresa receptora.
// Pensado para reembolsos: cuánto de los gastos del titular se imputa a cada
// empresa (Super Techos / Prouco / Sin asignar), y opcionalmente cómo se
// reparte proporcionalmente un `montoEntrega` entre esas empresas.
//
// Returns:
//   bruto: { super_techos, prouco, sin_asignar }   — suma absoluta de gastos
//   proporcional: { super_techos, prouco, sin_asignar }   — solo si montoEntrega != null
//   totalGastos: suma total
//   pct: { super_techos, prouco, sin_asignar }   — % sobre el total
//
// Reglas:
// - Solo cuenta gastos APROBADOS de tipo gasto_factura, dieta y hospedaje
//   (los que tienen empresa receptora seteable). Entregas y ajustes no.
// - Filtra por rango de fechas si se pasa fechaInicio/fechaFin.
export function calcDesgloseEmpresa({ movimientos, montoEntrega = null, fechaInicio = null, fechaFin = null }) {
  const bruto = { super_techos: 0, prouco: 0, sin_asignar: 0 };
  let totalGastos = 0;
  movimientos.forEach(m => {
    if (fechaInicio && m.fecha < fechaInicio) return;
    if (fechaFin && m.fecha > fechaFin) return;
    if (m.status !== 'aprobado') return;
    if (m.tipo !== 'gasto_factura' && m.tipo !== 'dieta' && m.tipo !== 'hospedaje') return;
    const monto = Number(m.monto || 0);
    totalGastos += monto;
    const key = m.empresaReceptora === 'super_techos' || m.empresaReceptora === 'prouco'
      ? m.empresaReceptora
      : 'sin_asignar';
    bruto[key] += monto;
  });
  const pct = { super_techos: 0, prouco: 0, sin_asignar: 0 };
  if (totalGastos > 0) {
    pct.super_techos = (bruto.super_techos / totalGastos) * 100;
    pct.prouco = (bruto.prouco / totalGastos) * 100;
    pct.sin_asignar = (bruto.sin_asignar / totalGastos) * 100;
  }
  const proporcional = { super_techos: 0, prouco: 0, sin_asignar: 0 };
  if (montoEntrega != null && totalGastos > 0) {
    proporcional.super_techos = (bruto.super_techos / totalGastos) * montoEntrega;
    proporcional.prouco = (bruto.prouco / totalGastos) * montoEntrega;
    proporcional.sin_asignar = (bruto.sin_asignar / totalGastos) * montoEntrega;
  }
  return { bruto, proporcional, pct, totalGastos };
}
