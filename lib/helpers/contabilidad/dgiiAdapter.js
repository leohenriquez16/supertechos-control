// Adaptador entre el modelo de ESTA app (caja chica, facturas Odoo, NCF
// anulados) y el núcleo portable @supertechos/contadom.
//
// El núcleo (lib/contadom) es agnóstico: recibe Compra606/Venta607/Anulado608
// ya normalizados y devuelve el contenido del archivo DGII. Aquí vive todo lo
// específico de la app: el mapa empresa→RNC, la categoría→código DGII, la
// inferencia de ITBIS de caja chica y la descarga en el navegador.

import {
  generar606, generar607, generar608, resumenITBIS,
} from '../../contadom/dist';
import { EMPRESAS_RECEPTORAS } from '../../constants';

// app empresa key ('super_techos' | 'prouco') → EmpresaConfig del núcleo.
export function empresaConfig(empresaKey) {
  const e = EMPRESAS_RECEPTORAS[empresaKey];
  return { rnc: e?.rnc || '', nombre: e?.label || empresaKey, clave: empresaKey };
}

// Categoría de caja chica → Tipo de Bienes y Servicios Comprados (606).
// Default de negocio (refinar con el contador).
const CATEGORIA_A_TIPO_BS = {
  ferreteria:   '09', // forma parte del costo de venta
  combustible:  '02', // trabajos, suministros y servicios
  comida:       '02',
  peaje:        '02',
  transporte:   '02',
  herramientas: '04', // activos fijos
  otros:        '06', // otras deducciones admitidas
};
const DEFAULT_TIPO_BS = '09';

// Movimiento de caja chica (cajaChicaRowToObj) → Compra606.
// Prefiere subtotal/ITBIS extraídos por la IA; si faltan, los infiere
// (RD 18%) y marca `inferido` para revisión del contador.
export function compraDesdeCajaChica(mov) {
  const datos = mov.datosIA || {};
  const total = Number(mov.monto) || 0;
  const itbisIA = Number(datos.itbis);
  const subtotalIA = Number(datos.subtotal);
  let subtotal = !isNaN(subtotalIA) && subtotalIA > 0 ? subtotalIA : null;
  let itbis = !isNaN(itbisIA) && itbisIA > 0 ? itbisIA : null;
  let inferido = false;
  if (subtotal == null && itbis != null) subtotal = total - itbis;
  else if (itbis == null && subtotal != null) itbis = total - subtotal;
  else if (subtotal == null && itbis == null) {
    subtotal = total / 1.18;
    itbis = total - subtotal;
    inferido = true;
  }
  return {
    rnc: mov.rnc || '',
    ncf: datos.ncf || '',
    ncfModificado: datos.ncf_modificado || '',
    fechaComprobante: datos.fecha || mov.fecha || '',
    fechaPago: mov.fecha || datos.fecha || '',
    tipoBienesServicios: CATEGORIA_A_TIPO_BS[datos.categoria_sugerida] || DEFAULT_TIPO_BS,
    subtotal: subtotal || 0,
    itbis: itbis || 0,
    formaPago: 'efectivo', // caja chica = pago al contado
    // metadatos solo para la UI (el núcleo los ignora):
    _inferido: inferido,
    _proveedor: mov.proveedor || '',
    _id: mov.id,
  };
}

// Factura de venta de Odoo (listarFacturasVenta) → Venta607.
export function ventaDesdeOdoo(f) {
  const total = Number(f.total) || 0;
  let subtotal = Number(f.subtotal);
  let itbis = Number(f.itbis);
  if ((!subtotal || isNaN(subtotal)) && total) { subtotal = total / 1.18; itbis = total - subtotal; }
  return {
    rncCliente: f.rncCliente || '',
    ncf: f.ncf || '',
    ncfModificado: f.ncfModificado || '',
    tipoIngreso: '01',
    fecha: f.fecha || '',
    subtotal: subtotal || 0,
    itbis: itbis || 0,
    formaPago: f.tipo === 'out_refund' ? 'credito' : 'credito', // factura nativa definirá esto en Fase 3
    _cliente: f.clienteNombre || '',
    _id: f.id,
  };
}

// NCF anulado de la app → Anulado608.
export function anuladoDesdeApp(a) {
  return {
    ncf: a.ncf,
    fechaAnulacion: a.fechaAnulacion,
    tipoAnulacion: a.tipoAnulacion,
  };
}

// ── Generadores de alto nivel (lo que llama la UI) ──
export function generarReporte606(empresaKey, periodo, movimientosCajaChica) {
  const compras = (movimientosCajaChica || []).map(compraDesdeCajaChica);
  return { reporte: generar606(empresaConfig(empresaKey), periodo, compras), compras };
}

export function generarReporte607(empresaKey, periodo, ventasOdoo) {
  const ventas = (ventasOdoo || []).map(ventaDesdeOdoo);
  return { reporte: generar607(empresaConfig(empresaKey), periodo, ventas), ventas };
}

export function generarReporte608(empresaKey, periodo, anulados) {
  const filas = (anulados || []).map(anuladoDesdeApp);
  return { reporte: generar608(empresaConfig(empresaKey), periodo, filas), filas };
}

export function calcularResumenITBIS(reporte606, reporte607) {
  return resumenITBIS({ data606: reporte606, data607: reporte607 });
}

// Descarga del contenido DGII como .txt en el navegador.
export function descargarTXT(contenido, nombreArchivo) {
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
