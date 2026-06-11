// Generadores de los formatos de envío DGII (República Dominicana).
// Puros y agnósticos de plataforma: reciben datos ya normalizados
// (Compra606[]/Venta607[]/Anulado608[]) y devuelven el contenido del archivo.
// La normalización desde el modelo de cada app y la descarga del archivo
// son responsabilidad del host (adaptador).
//
// Formato: TXT delimitado por '|', sin cabecera de columnas, sin BOM,
// fechas AAAAMMDD, montos con punto y 2 decimales, más una línea de
// ENCABEZADO con [formato, RNC informante, período AAAAMM, # registros].
//
// ⚠ Los layouts de columnas siguen la especificación pública de DGII pero
// deben validarse contra la versión vigente antes de presentar.

import type {
  EmpresaConfig, Periodo, Compra606, Venta607, Anulado608,
  ReporteDGII, ResumenITBIS, FormaPago,
} from './types';
import {
  soloDigitos, fmtMonto, fmtFechaDGII, periodoStr, tipoIdentificacion,
  toDelimited, nombreArchivoDGII,
} from './format';
import { FORMA_PAGO_CODIGO } from './codes';

const codigoFormaPago = (fp?: FormaPago): string =>
  FORMA_PAGO_CODIGO[fp ?? 'efectivo'] ?? '01';

// ─────────────────────────────────────────────────────────────
// 606 — Compras de bienes y servicios
// ─────────────────────────────────────────────────────────────
export function generar606(
  empresa: EmpresaConfig,
  periodo: Periodo,
  compras: Compra606[],
): ReporteDGII {
  const rows: (string | number)[][] = compras.map((c) => {
    const esServicio = c.tipoBienesServicios === '02' || c.tipoBienesServicios === '03';
    const rnc = soloDigitos(c.rnc);
    return [
      rnc,                                       // 1 RNC/Cédula
      tipoIdentificacion(rnc),                   // 2 Tipo Id
      c.tipoBienesServicios,                     // 3 Tipo Bienes/Servicios
      c.ncf,                                     // 4 NCF
      c.ncfModificado ?? '',                     // 5 NCF modificado
      fmtFechaDGII(c.fechaComprobante),          // 6 Fecha comprobante
      fmtFechaDGII(c.fechaPago ?? c.fechaComprobante), // 7 Fecha pago
      esServicio ? fmtMonto(c.subtotal) : '0.00',// 8 Monto facturado servicios
      esServicio ? '0.00' : fmtMonto(c.subtotal),// 9 Monto facturado bienes
      fmtMonto(c.subtotal),                      // 10 Total monto facturado (sin ITBIS)
      fmtMonto(c.itbis),                         // 11 ITBIS facturado
      fmtMonto(c.itbisRetenido),                 // 12 ITBIS retenido
      '0.00',                                    // 13 ITBIS sujeto a proporcionalidad
      '0.00',                                    // 14 ITBIS llevado al costo
      fmtMonto(c.itbis),                         // 15 ITBIS por adelantar
      '0.00',                                    // 16 ITBIS percibido en compras
      c.tipoRetencionIsr ?? '',                  // 17 Tipo retención ISR
      fmtMonto(c.isrRetenido),                   // 18 Monto retención Renta
      '0.00',                                    // 19 ISR percibido en compras
      fmtMonto(c.isc),                           // 20 Impuesto selectivo al consumo
      fmtMonto(c.otrosImpuestos),                // 21 Otros impuestos/tasas
      fmtMonto(c.propinaLegal),                  // 22 Monto propina legal
      codigoFormaPago(c.formaPago),              // 23 Forma de pago
    ];
  });
  const totalFacturado = compras.reduce((s, c) => s + (Number(c.subtotal) || 0), 0);
  const totalItbis = compras.reduce((s, c) => s + (Number(c.itbis) || 0), 0);
  const header = ['606', soloDigitos(empresa.rnc), periodoStr(periodo.anio, periodo.mes), rows.length];
  return {
    contenido: toDelimited({ header, rows }),
    nombreArchivo: nombreArchivoDGII('606', empresa.rnc, periodo.anio, periodo.mes),
    registros: rows.length,
    totalFacturado,
    totalItbis,
  };
}

// ─────────────────────────────────────────────────────────────
// 607 — Ventas de bienes y servicios
// ─────────────────────────────────────────────────────────────
export function generar607(
  empresa: EmpresaConfig,
  periodo: Periodo,
  ventas: Venta607[],
): ReporteDGII {
  const rows: (string | number)[][] = ventas.map((v) => {
    const rnc = soloDigitos(v.rncCliente);
    const total = (Number(v.subtotal) || 0) + (Number(v.itbis) || 0);
    const fp = codigoFormaPago(v.formaPago);
    const porForma = (codigo: string) => (fp === codigo ? fmtMonto(total) : '0.00');
    return [
      rnc,                                       // 1 RNC/Cédula comprador
      tipoIdentificacion(rnc),                   // 2 Tipo Id
      v.ncf,                                     // 3 NCF
      v.ncfModificado ?? '',                     // 4 NCF modificado
      v.tipoIngreso ?? '01',                     // 5 Tipo de ingreso
      fmtFechaDGII(v.fecha),                     // 6 Fecha comprobante
      fmtFechaDGII(v.fechaRetencion),            // 7 Fecha de retención
      fmtMonto(v.subtotal),                      // 8 Monto facturado (sin ITBIS)
      fmtMonto(v.itbis),                         // 9 ITBIS facturado
      fmtMonto(v.itbisRetenidoTerceros),         // 10 ITBIS retenido por terceros
      '0.00',                                    // 11 ITBIS percibido
      fmtMonto(v.retencionRentaTerceros),        // 12 Retención renta por terceros
      fmtMonto(v.isrPercibido),                  // 13 ISR percibido
      fmtMonto(v.isc),                           // 14 Impuesto selectivo al consumo
      fmtMonto(v.otrosImpuestos),                // 15 Otros impuestos/tasas
      fmtMonto(v.propinaLegal),                  // 16 Monto propina legal
      porForma('01'),                            // 17 Efectivo
      porForma('02'),                            // 18 Cheque/transf./depósito
      porForma('03'),                            // 19 Tarjeta débito/crédito
      porForma('04'),                            // 20 Venta a crédito
      porForma('05'),                            // 21 Bonos/certificados
      porForma('06'),                            // 22 Permuta
      porForma('07'),                            // 23 Otras formas de venta
    ];
  });
  const totalFacturado = ventas.reduce((s, v) => s + (Number(v.subtotal) || 0), 0);
  const totalItbis = ventas.reduce((s, v) => s + (Number(v.itbis) || 0), 0);
  const header = ['607', soloDigitos(empresa.rnc), periodoStr(periodo.anio, periodo.mes), rows.length];
  return {
    contenido: toDelimited({ header, rows }),
    nombreArchivo: nombreArchivoDGII('607', empresa.rnc, periodo.anio, periodo.mes),
    registros: rows.length,
    totalFacturado,
    totalItbis,
  };
}

// ─────────────────────────────────────────────────────────────
// 608 — Comprobantes fiscales anulados
// ─────────────────────────────────────────────────────────────
export function generar608(
  empresa: EmpresaConfig,
  periodo: Periodo,
  anulados: Anulado608[],
): ReporteDGII {
  const rows: (string | number)[][] = anulados.map((a) => [
    a.ncf,                          // 1 NCF
    fmtFechaDGII(a.fechaAnulacion), // 2 Fecha comprobante (anulación)
    a.tipoAnulacion,                // 3 Tipo de anulación
  ]);
  const header = ['608', soloDigitos(empresa.rnc), periodoStr(periodo.anio, periodo.mes), rows.length];
  return {
    contenido: toDelimited({ header, rows }),
    nombreArchivo: nombreArchivoDGII('608', empresa.rnc, periodo.anio, periodo.mes),
    registros: rows.length,
    totalFacturado: 0,
    totalItbis: 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Resumen ITBIS (base del Formulario IT-1)
// ─────────────────────────────────────────────────────────────
export function resumenITBIS(args: {
  data606: Pick<ReporteDGII, 'totalItbis' | 'totalFacturado'>;
  data607: Pick<ReporteDGII, 'totalItbis' | 'totalFacturado'>;
}): ResumenITBIS {
  const itbisPagado = args.data606.totalItbis || 0;
  const itbisCobrado = args.data607.totalItbis || 0;
  const neto = itbisCobrado - itbisPagado;
  return {
    itbisCobrado,
    itbisPagado,
    neto,
    aPagar: neto > 0 ? neto : 0,
    saldoFavor: neto < 0 ? -neto : 0,
    ventasFacturadas: args.data607.totalFacturado || 0,
    comprasFacturadas: args.data606.totalFacturado || 0,
  };
}
