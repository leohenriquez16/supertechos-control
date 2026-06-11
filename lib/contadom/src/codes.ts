// Códigos del catálogo DGII. Valores por defecto razonables; conviene
// validarlos/refinarlos con el contador para cada negocio.

import type { FormaPago } from './types';

/** Forma de pago/venta → código DGII (606 forma de pago, 607 columnas de venta). */
export const FORMA_PAGO_CODIGO: Record<FormaPago, string> = {
  efectivo: '01',
  cheque: '02',
  tarjeta: '03',
  credito: '04',
  bonos: '05',
  permuta: '06',
  otras: '07',
};

/**
 * Tipo de Bienes y Servicios Comprados (606). Códigos DGII:
 *   01 Gastos de personal
 *   02 Gastos por trabajos, suministros y servicios
 *   03 Arrendamientos
 *   04 Gastos de activos fijos
 *   05 Gastos de representación
 *   06 Otras deducciones admitidas
 *   07 Gastos financieros
 *   08 Gastos extraordinarios
 *   09 Compras y gastos que forman parte del costo de venta
 *   10 Adquisiciones de activos
 *   11 Gastos de seguros
 */
export const TIPO_BIENES_SERVICIOS = {
  GASTOS_PERSONAL: '01',
  TRABAJOS_SUMINISTROS_SERVICIOS: '02',
  ARRENDAMIENTOS: '03',
  ACTIVOS_FIJOS: '04',
  REPRESENTACION: '05',
  OTRAS_DEDUCCIONES: '06',
  FINANCIEROS: '07',
  EXTRAORDINARIOS: '08',
  COSTO_DE_VENTA: '09',
  ADQUISICION_ACTIVOS: '10',
  SEGUROS: '11',
} as const;

/** Tipo de anulación (608) → descripción. */
export const TIPO_ANULACION: Record<string, string> = {
  '01': 'Deterioro de factura pre-impresa',
  '02': 'Errores de impresión (factura pre-impresa)',
  '03': 'Impresión defectuosa',
  '04': 'Duplicidad de factura',
  '05': 'Corrección de la información',
  '06': 'Cambio de productos',
};

/** Tipo de ingreso (607) → descripción. */
export const TIPO_INGRESO: Record<string, string> = {
  '01': 'Ingresos por operaciones (no financieros)',
  '02': 'Ingresos financieros',
  '03': 'Ingresos extraordinarios',
  '04': 'Ingresos por arrendamientos',
  '05': 'Ingresos por venta de activos depreciables',
  '06': 'Otros ingresos',
};
