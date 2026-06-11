// Tipos públicos del núcleo de contabilidad dominicana (contadom).
// Agnóstico de plataforma: estas estructuras las construye la app host
// (a partir de su propio modelo de datos) y las pasa a los generadores.

/** Empresa informante ante DGII. El RNC puede venir formateado; se normaliza. */
export interface EmpresaConfig {
  /** RNC del informante (9 u 11 dígitos; admite formato con guiones). */
  rnc: string;
  /** Nombre legal (opcional, para encabezados de reportes legibles). */
  nombre?: string;
  /** Clave/identificador interno opcional de la app host (ej. 'super_techos'). */
  clave?: string;
}

/** Período fiscal (mes). */
export interface Periodo {
  anio: number;
  /** 1..12 */
  mes: number;
}

/** Formas de pago/venta reconocidas (se mapean a códigos DGII). */
export type FormaPago =
  | 'efectivo'
  | 'cheque'
  | 'tarjeta'
  | 'credito'
  | 'bonos'
  | 'permuta'
  | 'otras';

/** Una compra para el formato 606 (datos ya fiscalmente normalizados). */
export interface Compra606 {
  /** RNC/Cédula del proveedor. */
  rnc: string;
  ncf: string;
  ncfModificado?: string;
  /** Fecha del comprobante, 'YYYY-MM-DD'. */
  fechaComprobante: string;
  /** Fecha de pago, 'YYYY-MM-DD'. Por defecto = fechaComprobante. */
  fechaPago?: string;
  /** Tipo de bienes y servicios comprados, código DGII '01'..'11'. */
  tipoBienesServicios: string;
  /** Monto sin ITBIS. */
  subtotal: number;
  /** ITBIS facturado. */
  itbis: number;
  itbisRetenido?: number;
  isrRetenido?: number;
  /** Tipo de retención en ISR (código DGII), si aplica. */
  tipoRetencionIsr?: string;
  /** Impuesto selectivo al consumo. */
  isc?: number;
  /** Otros impuestos/tasas. */
  otrosImpuestos?: number;
  /** Propina legal. */
  propinaLegal?: number;
  formaPago?: FormaPago;
}

/** Una venta para el formato 607 (datos ya fiscalmente normalizados). */
export interface Venta607 {
  /** RNC/Cédula del comprador. */
  rncCliente: string;
  ncf: string;
  ncfModificado?: string;
  /** Tipo de ingreso, código DGII (default '01'). */
  tipoIngreso?: string;
  /** Fecha del comprobante, 'YYYY-MM-DD'. */
  fecha: string;
  /** Fecha de retención, 'YYYY-MM-DD'. */
  fechaRetencion?: string;
  subtotal: number;
  itbis: number;
  itbisRetenidoTerceros?: number;
  isrPercibido?: number;
  retencionRentaTerceros?: number;
  isc?: number;
  otrosImpuestos?: number;
  propinaLegal?: number;
  formaPago?: FormaPago;
}

/** Un NCF anulado para el formato 608. */
export interface Anulado608 {
  ncf: string;
  /** Fecha de anulación, 'YYYY-MM-DD'. */
  fechaAnulacion: string;
  /** Tipo de anulación, código DGII '01'..'06'. */
  tipoAnulacion: string;
}

/** Resultado de un generador de archivo DGII. */
export interface ReporteDGII {
  /** Contenido del archivo TXT (delimitado por '|', sin BOM). */
  contenido: string;
  /** Nombre de archivo sugerido (ej. '606_130774331_202606.txt'). */
  nombreArchivo: string;
  /** Cantidad de registros de detalle. */
  registros: number;
  /** Total facturado (sin ITBIS) — solo 606/607. */
  totalFacturado: number;
  /** Total ITBIS — solo 606/607. */
  totalItbis: number;
}

/** Resumen para el Formulario IT-1 (ITBIS). */
export interface ResumenITBIS {
  itbisCobrado: number;
  itbisPagado: number;
  /** Cobrado − pagado. >0 a pagar, <0 saldo a favor. */
  neto: number;
  aPagar: number;
  saldoFavor: number;
  ventasFacturadas: number;
  comprasFacturadas: number;
}
