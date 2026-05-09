// v8.16.1: Alertas detectivas para gastos sin factura.
// NO bloquean nada — solo informan al admin de patrones que merecen atención.
//
// Tipos:
//   - monto_redondo: monto múltiplo de 1000 (sospechoso pero común; nivel "info")
//   - alto_pct_mes: >20% del consumo del titular este mes es sin factura ("warning")
//   - frecuente_semana: >5 gastos sin factura del mismo titular en últimos 7 días ("warning")

const NIVELES = {
  info: { color: 'yellow', label: '🟡' },
  warning: { color: 'orange', label: '🟠' },
  critico: { color: 'red', label: '🔴' },
};

const esSinFactura = (m) => !!m.datosIA?.sin_factura;

// Detecta si un monto es múltiplo "redondo" sospechoso (múltiplo de 1000 ≥ 1000).
function esMontoRedondo(monto) {
  const n = Number(monto || 0);
  if (n < 1000) return false;
  return n % 1000 === 0;
}

// Calcula el % del consumo del titular en el mes actual que es sin factura.
// Solo considera gastos APROBADOS o PENDIENTES (no rechazados).
function pctSinFacturaDelMes(personaId, todosLosMovimientos) {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0];
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).toISOString().split('T')[0];

  const delMes = todosLosMovimientos.filter(m =>
    m.personaId === personaId &&
    m.tipo === 'gasto_factura' &&
    m.status !== 'rechazado' &&
    m.fecha >= inicioMes &&
    m.fecha <= finMes
  );

  if (delMes.length === 0) return 0;

  const totalGastos = delMes.reduce((acc, m) => acc + Number(m.monto || 0), 0);
  const totalSinFactura = delMes
    .filter(esSinFactura)
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  if (totalGastos === 0) return 0;
  return (totalSinFactura / totalGastos) * 100;
}

// Cuenta gastos sin factura del titular en los últimos 7 días.
function countSinFacturaUltimaSemana(personaId, todosLosMovimientos) {
  const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return todosLosMovimientos.filter(m =>
    m.personaId === personaId &&
    m.tipo === 'gasto_factura' &&
    m.status !== 'rechazado' &&
    esSinFactura(m) &&
    m.fecha >= hace7
  ).length;
}

// Calcula todas las alertas para un movimiento dado.
// Retorna array de { tipo, nivel, label, color, mensaje }.
// Si el movimiento NO es sin factura, retorna [].
//
// `todosLosMovimientos` es la lista completa de movimientos visible al admin
// (para calcular contexto del titular).
export function calcularAlertasSinFactura(movimiento, todosLosMovimientos) {
  if (!esSinFactura(movimiento)) return [];

  const alertas = [];
  const monto = Number(movimiento.monto || 0);

  // Alerta 1: monto redondo
  if (esMontoRedondo(monto)) {
    alertas.push({
      tipo: 'monto_redondo',
      nivel: 'info',
      label: NIVELES.info.label,
      color: NIVELES.info.color,
      mensaje: `Monto múltiplo de 1000 (RD$${new Intl.NumberFormat('es-DO').format(monto)}). Revisa con cuidado.`,
    });
  }

  // Alerta 2: alto % del mes
  const pct = pctSinFacturaDelMes(movimiento.personaId, todosLosMovimientos);
  if (pct > 20) {
    alertas.push({
      tipo: 'alto_pct_mes',
      nivel: pct > 40 ? 'critico' : 'warning',
      label: pct > 40 ? NIVELES.critico.label : NIVELES.warning.label,
      color: pct > 40 ? NIVELES.critico.color : NIVELES.warning.color,
      mensaje: `${pct.toFixed(0)}% del consumo del titular este mes son sin factura.`,
    });
  }

  // Alerta 3: frecuente en la última semana
  const cnt = countSinFacturaUltimaSemana(movimiento.personaId, todosLosMovimientos);
  if (cnt > 5) {
    alertas.push({
      tipo: 'frecuente_semana',
      nivel: cnt > 10 ? 'critico' : 'warning',
      label: cnt > 10 ? NIVELES.critico.label : NIVELES.warning.label,
      color: cnt > 10 ? NIVELES.critico.color : NIVELES.warning.color,
      mensaje: `${cnt} gastos sin factura de este titular en los últimos 7 días.`,
    });
  }

  return alertas;
}

// Atajo: ¿este movimiento tiene alguna alerta CRITICA o WARNING?
export function tieneAlertaSeria(movimiento, todosLosMovimientos) {
  const alertas = calcularAlertasSinFactura(movimiento, todosLosMovimientos);
  return alertas.some(a => a.nivel === 'critico' || a.nivel === 'warning');
}
