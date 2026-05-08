// Generadores de CSV para importar movimientos de caja chica a Odoo.
//
// Dos modos:
//   1. exportarPagosOdooCSV: cada movimiento como línea de diario de pagos
//      (entregas como entrada, gastos/dietas/ajustes como salida).
//      Pensado para diarios `Caja Chica - {Titular}` ya creados en Odoo.
//   2. exportarFacturasOdooCSV: solo gastos_factura aprobados, con cuenta
//      analítica derivada del proyecto. Pensado para crear facturas
//      proveedor en Odoo (account.move tipo in_invoice).
//
// Nota: el formato exacto que Odoo espera depende de tu configuración.
// Estos CSVs son una propuesta razonable basada en convenciones comunes;
// es esperable que el usuario diga "renombrá X columna a Y" después de
// probar el primer import.

// Escapa un valor para CSV: si tiene comilla, coma o salto de línea,
// se envuelve en comillas dobles y las comillas internas se duplican.
const csvEscape = (v) => {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const fmtN = (n) => Number(n || 0).toFixed(2);

// Convierte el array de objetos a CSV con cabecera. Headers es array de
// {key, label} — key es el campo en el objeto, label la columna del CSV.
function toCSV(rows, headers) {
  const head = headers.map(h => csvEscape(h.label)).join(',');
  const body = rows.map(r => headers.map(h => csvEscape(r[h.key])).join(',')).join('\n');
  // BOM para que Excel detecte UTF-8 con tildes correctas
  return '﻿' + head + '\n' + body + '\n';
}

// ============================================================
// CSV de PAGOS — diario de caja chica
// ============================================================
// Una fila por movimiento (entrega/gasto/dieta/ajuste).
// El campo `direccion` indica si entra (entrega, ajuste positivo) o sale
// (gasto aprobado, dieta aprobada, ajuste negativo). Los movimientos
// pendientes/rechazados NO se incluyen — solo aprobados afectan caja.
export function exportarPagosOdooCSV({ movimientos, data }) {
  const aprobados = movimientos.filter(m => m.tipo === 'entrega' || m.status === 'aprobado');
  const rows = aprobados.map(m => {
    const titular = data.personal.find(p => p.id === m.personaId);
    const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
    const direccion = m.tipo === 'entrega' ? 'entrada'
      : (m.tipo === 'ajuste' ? (m.signoAjuste >= 0 ? 'entrada' : 'salida') : 'salida');
    return {
      fecha: m.fecha,
      diario: `Caja Chica - ${titular?.nombre || m.personaId}`,
      referencia: m.id,
      tipo: m.tipo,
      direccion,
      monto: fmtN(m.monto),
      partner_nombre: m.proveedor || (m.tipo === 'entrega' ? '' : m.tipo === 'dieta' ? 'Dieta diaria' : ''),
      partner_rnc: m.rnc || '',
      ncf: m.datosIA?.ncf || '',
      concepto: m.concepto || '',
      proyecto_ref: proy?.referenciaOdoo || '',
      categoria: m.datosIA?.categoria_sugerida || '',
      fecha_aprobacion: m.aprobadoAt ? m.aprobadoAt.split('T')[0] : '',
    };
  });
  const headers = [
    { key: 'fecha',             label: 'fecha' },
    { key: 'diario',            label: 'diario' },
    { key: 'referencia',        label: 'referencia' },
    { key: 'tipo',              label: 'tipo' },
    { key: 'direccion',         label: 'direccion' },
    { key: 'monto',             label: 'monto' },
    { key: 'partner_nombre',    label: 'partner_nombre' },
    { key: 'partner_rnc',       label: 'partner_rnc' },
    { key: 'ncf',               label: 'ncf' },
    { key: 'concepto',          label: 'concepto' },
    { key: 'proyecto_ref',      label: 'proyecto_referencia_odoo' },
    { key: 'categoria',         label: 'categoria' },
    { key: 'fecha_aprobacion',  label: 'fecha_aprobacion' },
  ];
  return toCSV(rows, headers);
}

// ============================================================
// CSV de FACTURAS — para crear account.move tipo in_invoice en Odoo
// ============================================================
// Solo gastos_factura aprobados con RNC presente. Cuenta analítica =
// referencia Odoo del proyecto, si está asociado.
export function exportarFacturasOdooCSV({ movimientos, data }) {
  const facturas = movimientos.filter(m => m.tipo === 'gasto_factura' && m.status === 'aprobado');
  const rows = facturas.map(m => {
    const titular = data.personal.find(p => p.id === m.personaId);
    const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
    const total = Number(m.monto) || 0;
    // Si la AI extrajo subtotal e itbis los usamos; si no, calculamos por convención
    // RD (18% sobre subtotal) DEDUCIENDO desde el total.
    const itbisIA = Number(m.datosIA?.itbis);
    const subtotalIA = Number(m.datosIA?.subtotal);
    let subtotal = !isNaN(subtotalIA) && subtotalIA > 0 ? subtotalIA : null;
    let itbis = !isNaN(itbisIA) && itbisIA > 0 ? itbisIA : null;
    if (subtotal == null && itbis != null) subtotal = total - itbis;
    if (itbis == null && subtotal != null) itbis = total - subtotal;
    if (subtotal == null && itbis == null) {
      // Asumir total ya incluye ITBIS 18% — calcular hacia atrás
      subtotal = total / 1.18;
      itbis = total - subtotal;
    }
    return {
      fecha_factura: m.fecha,
      proveedor_rnc: m.rnc || '',
      proveedor_nombre: m.proveedor || '',
      ncf: m.datosIA?.ncf || '',
      monto_total: fmtN(total),
      subtotal: fmtN(subtotal),
      itbis: fmtN(itbis),
      concepto: m.concepto || '',
      categoria: m.datosIA?.categoria_sugerida || '',
      cuenta_analitica: proy?.referenciaOdoo || '',
      proyecto_referencia_odoo: proy?.referenciaOdoo || '',
      proyecto_cliente: proy?.cliente || '',
      pagado_con: titular?.nombre ? `Caja Chica - ${titular.nombre}` : '',
      referencia_movimiento: m.id,
    };
  });
  const headers = [
    { key: 'fecha_factura',             label: 'fecha_factura' },
    { key: 'proveedor_rnc',             label: 'proveedor_rnc' },
    { key: 'proveedor_nombre',          label: 'proveedor_nombre' },
    { key: 'ncf',                       label: 'ncf' },
    { key: 'monto_total',               label: 'monto_total' },
    { key: 'subtotal',                  label: 'subtotal' },
    { key: 'itbis',                     label: 'itbis' },
    { key: 'concepto',                  label: 'concepto' },
    { key: 'categoria',                 label: 'categoria' },
    { key: 'cuenta_analitica',          label: 'cuenta_analitica' },
    { key: 'proyecto_referencia_odoo',  label: 'proyecto_referencia_odoo' },
    { key: 'proyecto_cliente',          label: 'proyecto_cliente' },
    { key: 'pagado_con',                label: 'pagado_con' },
    { key: 'referencia_movimiento',     label: 'referencia_movimiento' },
  ];
  return toCSV(rows, headers);
}

// Dispara la descarga del CSV en el navegador
export function descargarCSV(contenido, nombreArchivo) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
