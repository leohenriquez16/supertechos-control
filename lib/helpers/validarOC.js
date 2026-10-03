// v8.59.3 — VALIDAR LA ORDEN DE COMPRA FIRMADA antes de reenviarla al cliente.
// Towers and Sites emite una OC por sitio (formato SAP: "ORDEN DE COMPRA 4500142510"). Miguel
// la firma en el recuadro "RECIBO PEDIDO · PROVEEDOR" y la sube al programa; antes de guardarla
// y reenviarla, el ERP comprueba que sea la OC correcta y que esté firmada.
//
// La lectura del PDF la hace la IA (EXTRAER_OC_PROMPT → JSON). Este archivo es puro: compara
// lo leído contra la sucursal y dice qué está mal (errores: no se guarda) o qué revisar
// (avisos: se guarda igual).

export const RNC_SUPER_TECHOS = '130774331';
export const RNC_PROUCO = '131515541';

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const normCodigo = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const EXTRAER_OC_PROMPT = `Lee esta orden de compra y devuelve SOLO un JSON (sin texto antes ni después) con esta forma:
{
  "es_orden_compra": true|false,
  "numero_oc": "texto o null",
  "cliente_nombre": "texto o null",
  "cliente_rnc": "solo dígitos o null",
  "proveedor_nombre": "texto o null",
  "proveedor_rnc": "solo dígitos o null",
  "fecha": "AAAA-MM-DD o null",
  "moneda": "DOP|USD|null",
  "sitios": [{"nombre": "texto", "codigo": "código del sitio tipo DO-01-SD-00157-10 o null"}],
  "subtotal": número o null,
  "impuestos": número o null,
  "total": número o null,
  "firmada_proveedor": true|false,
  "firma_detalle": "describe brevemente qué hay en el recuadro de firma del PROVEEDOR / RECIBO PEDIDO (firma manuscrita, sello, vacío)"
}
Reglas: los montos son números sin comas. "firmada_proveedor" es true SOLO si en el recuadro del proveedor ("RECIBO PEDIDO", "PROVEEDOR/VENDOR") hay una firma manuscrita o un sello; un recuadro vacío o solo con el texto impreso es false. Lista todos los sitios que aparezcan ("SITIO …-DO-xx-…").`;

/** Saca el JSON aunque la IA lo haya envuelto en ```json … ``` o con texto alrededor. */
export function parsearRespuestaIA(texto) {
  const t = String(texto || '');
  const ini = t.indexOf('{'), fin = t.lastIndexOf('}');
  if (ini < 0 || fin <= ini) return null;
  try { return JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
}

/**
 * @param {object} oc   JSON leído de la OC
 * @param {object} loc  sucursal del programa: { nombre, codigoUt, cotizacionMonto }
 * @param {object} opts { yaUsadas: ['4500…'], sinFirma: true } — sinFirma cuando la OC llega cruda
 *                     y la firma y el sello los estampa el ERP.
 * @returns {{ ok:boolean, errores:string[], avisos:string[], numeroOc:string|null, resumen:object }}
 */
export function validarOC(oc, loc = {}, opts = {}) {
  const errores = [], avisos = [];
  if (!oc || oc.es_orden_compra === false) {
    return { ok: false, errores: ['El archivo no parece una orden de compra.'], avisos, numeroOc: null, resumen: {} };
  }

  const numero = soloDigitos(oc.numero_oc);
  if (!numero) errores.push('No se encontró el número de la orden de compra.');
  else if (!/^45\d{8}$/.test(numero)) avisos.push(`El número de OC (${numero}) no tiene el formato habitual del cliente (45 + 8 dígitos).`);
  if (numero && (opts.yaUsadas || []).includes(numero)) errores.push(`La OC ${numero} ya está cargada en otra sucursal.`);

  const rncProv = soloDigitos(oc.proveedor_rnc);
  if (rncProv && rncProv !== RNC_SUPER_TECHOS && rncProv !== RNC_PROUCO) {
    errores.push(`La OC está a nombre de otro proveedor (RNC ${oc.proveedor_rnc}).`);
  } else if (!rncProv && !/super\s*techos|prouco/i.test(oc.proveedor_nombre || '')) {
    avisos.push('No se pudo confirmar que el proveedor sea LH Super Techos.');
  }

  // El sitio: el código UT de la sucursal tiene que estar en la OC
  const codigos = (oc.sitios || []).map(s => normCodigo(s.codigo)).filter(Boolean);
  const nombres = (oc.sitios || []).map(s => String(s.nombre || '').toUpperCase());
  const miCodigo = normCodigo(loc.codigoUt);
  if (miCodigo) {
    if (codigos.length && !codigos.includes(miCodigo)) {
      errores.push(`La OC es de otro sitio (${(oc.sitios || []).map(s => s.codigo || s.nombre).join(', ')}), no de ${loc.nombre} (${loc.codigoUt}).`);
    } else if (!codigos.length) {
      const nombreLoc = String(loc.nombre || '').toUpperCase().replace(/\(.*?\)/g, '').trim();
      if (nombreLoc && !nombres.some(n => n.includes(nombreLoc.split(/[-,]/)[0].trim()))) {
        avisos.push(`No se encontró el código ${loc.codigoUt} en la OC; revisa que sea de ${loc.nombre}.`);
      }
    }
  }
  if (codigos.length > 1) avisos.push(`La OC incluye ${codigos.length} sitios; confirma que esta sucursal sea una de ellas.`);

  if (!opts.sinFirma && oc.firmada_proveedor !== true) {
    errores.push(`La OC no está firmada en el recuadro del proveedor ("Recibo pedido").${oc.firma_detalle ? ` Se ve: ${oc.firma_detalle}.` : ''}`);
  }

  // Montos contra la cotización: aviso, no error (la OC puede incluir partidas adicionales)
  const sub = Number(oc.subtotal), cot = Number(loc.cotizacionMonto);
  if (sub > 0 && cot > 0) {
    const dif = (sub - cot) / cot;
    if (Math.abs(dif) > 0.02) {
      avisos.push(`El subtotal de la OC (RD$${sub.toLocaleString('es-DO', { minimumFractionDigits: 2 })}) difiere ${(dif * 100).toFixed(1)}% de la cotización (RD$${cot.toLocaleString('es-DO', { minimumFractionDigits: 2 })}).`);
    }
  }
  if (Number(oc.subtotal) > 0 && Number(oc.total) > 0 && Number(oc.impuestos) >= 0) {
    const suma = Number(oc.subtotal) + Number(oc.impuestos);
    if (Math.abs(suma - Number(oc.total)) > 1) avisos.push('Subtotal más impuestos no da el total de la OC.');
  }
  if (oc.moneda && oc.moneda !== 'DOP') avisos.push(`La OC está en ${oc.moneda}.`);

  return {
    ok: errores.length === 0, errores, avisos, numeroOc: numero || null,
    resumen: { numero: numero || null, fecha: oc.fecha || null, subtotal: oc.subtotal ?? null, total: oc.total ?? null, sitios: oc.sitios || [], firma: oc.firma_detalle || '' },
  };
}
