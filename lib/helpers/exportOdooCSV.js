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
      partner_nombre: m.proveedor || (m.tipo === 'entrega' ? '' : m.tipo === 'dieta' ? 'Dieta diaria' : m.datosIA?.sin_factura ? 'Sin factura (informal)' : ''),
      partner_rnc: m.rnc || '',
      ncf: m.datosIA?.ncf || '',
      concepto: m.concepto || '',
      proyecto_ref: proy?.referenciaOdoo || '',
      categoria: m.datosIA?.categoria_sugerida || '',
      // v8.16.1: bandera para identificar gastos informales en Odoo
      sin_factura: m.datosIA?.sin_factura ? 'true' : '',
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
    { key: 'sin_factura',       label: 'sin_factura' },
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
  // v8.16.1: gastos sin factura quedan EXCLUIDOS de este CSV (no son facturas Odoo).
  // Aparecen en CSV de pagos con flag sin_factura=true y en cuadre PDF como sección separada.
  const facturas = movimientos.filter(m => m.tipo === 'gasto_factura' && m.status === 'aprobado' && !m.datosIA?.sin_factura);
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
      empresa_receptora: m.empresaReceptora || '', // v8.17.25
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
    { key: 'empresa_receptora',         label: 'empresa_receptora' }, // v8.17.25
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

// v8.17.25: CSV de gastos SIN comprobante fiscal (sin ITBIS deducible)
// Para enviar al contador como referencia — no van al 606.
export function exportarSinComprobanteCSV({ movimientos, data }) {
  const lista = movimientos.filter(m =>
    m.tipo === 'gasto_factura' && m.status === 'aprobado' && m.datosIA?.sin_factura
  );
  const rows = lista.map(m => {
    const titular = data.personal.find(p => p.id === m.personaId);
    const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
    return {
      fecha: m.fecha,
      monto_total: fmtN(m.monto || 0),
      concepto: m.concepto || '',
      categoria: m.datosIA?.categoria_sugerida || '',
      proyecto_referencia_odoo: proy?.referenciaOdoo || '',
      proyecto_cliente: proy?.cliente || '',
      pagado_con: titular?.nombre ? `Caja Chica - ${titular.nombre}` : '',
      referencia_movimiento: m.id,
    };
  });
  const headers = [
    { key: 'fecha',                    label: 'fecha' },
    { key: 'monto_total',              label: 'monto_total' },
    { key: 'concepto',                 label: 'concepto' },
    { key: 'categoria',                label: 'categoria' },
    { key: 'proyecto_referencia_odoo', label: 'proyecto_referencia_odoo' },
    { key: 'proyecto_cliente',         label: 'proyecto_cliente' },
    { key: 'pagado_con',               label: 'pagado_con' },
    { key: 'referencia_movimiento',    label: 'referencia_movimiento' },
  ];
  return toCSV(rows, headers);
}

// v8.17.25: Genera 3 CSVs separados por empresa receptora + sin comprobante.
// Devuelve un objeto con los CSVs ya listos y el conteo de cada uno.
// Las facturas APROBADAS sin empresa_receptora asignada NO se incluyen en
// ningún CSV y se devuelven en `sinAsignar` para que el admin las atienda.
export function generarFacturasSeparadasPorEmpresa({ movimientos, data, fechaInicio, fechaFin }) {
  const enRango = movimientos.filter(m => {
    if (fechaInicio && m.fecha < fechaInicio) return false;
    if (fechaFin && m.fecha > fechaFin) return false;
    return true;
  });

  const facturasAprobadas = enRango.filter(m =>
    m.tipo === 'gasto_factura' && m.status === 'aprobado' && !m.datosIA?.sin_factura
  );

  const superTechos = facturasAprobadas.filter(m => m.empresaReceptora === 'super_techos');
  const prouco       = facturasAprobadas.filter(m => m.empresaReceptora === 'prouco');
  const sinAsignar   = facturasAprobadas.filter(m => !m.empresaReceptora);

  return {
    csvSuperTechos: exportarFacturasOdooCSV({ movimientos: superTechos, data }),
    csvProuco:       exportarFacturasOdooCSV({ movimientos: prouco,       data }),
    // v8.27.71 (correo Felvison): las facturas SIN empresa asignada ya no se pierden en
    // silencio — van en su propio CSV "REVISAR" dentro del ZIP para asignarlas y re-exportar.
    csvSinEmpresa: sinAsignar.length > 0 ? exportarFacturasOdooCSV({ movimientos: sinAsignar, data }) : null,
    csvSinComprobante: exportarSinComprobanteCSV({ movimientos: enRango, data }),
    counts: {
      superTechos: superTechos.length,
      prouco: prouco.length,
      sinComprobante: enRango.filter(m => m.tipo === 'gasto_factura' && m.status === 'aprobado' && m.datosIA?.sin_factura).length,
      sinAsignar: sinAsignar.length,
    },
    sinAsignar, // Lista de facturas que el admin debe completar
  };
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

// v8.17.25: Empaqueta los 3 CSVs separados en un ZIP y dispara la descarga.
export async function descargarFacturasSeparadasZIP({ csvSuperTechos, csvProuco, csvSinEmpresa, csvSinComprobante, fechaInicio, fechaFin }) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const sufijo = `${fechaInicio || ''}_${fechaFin || ''}`.replace(/-/g, '');
  if (csvSuperTechos) zip.file(`facturas-super-techos${sufijo ? '-' + sufijo : ''}.csv`, csvSuperTechos);
  if (csvProuco) zip.file(`facturas-prouco${sufijo ? '-' + sufijo : ''}.csv`, csvProuco);
  // v8.27.71: facturas con NCF pero sin empresa asignada — para REVISAR, no se pierden.
  if (csvSinEmpresa) zip.file(`facturas-SIN-EMPRESA-REVISAR${sufijo ? '-' + sufijo : ''}.csv`, csvSinEmpresa);
  if (csvSinComprobante) zip.file(`gastos-sin-comprobante${sufijo ? '-' + sufijo : ''}.csv`, csvSinComprobante);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facturas-cajachica${sufijo ? '-' + sufijo : ''}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
