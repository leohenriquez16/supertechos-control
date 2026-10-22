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
  "partidas": [{"descripcion": "texto de la línea", "monto": número sin ITBIS o null}],
  "subtotal": número o null,
  "impuestos": número o null,
  "total": número o null,
  "firmada_proveedor": true|false,
  "firma_detalle": "describe brevemente qué hay en el recuadro de firma del PROVEEDOR / RECIBO PEDIDO (firma manuscrita, sello, vacío)"
}
Reglas: los montos son números sin comas. "firmada_proveedor" es true SOLO si en el recuadro del proveedor ("RECIBO PEDIDO", "PROVEEDOR/VENDOR") hay una firma manuscrita o un sello; un recuadro vacío o solo con el texto impreso es false. Lista todos los sitios que aparezcan ("SITIO …-DO-xx-…"). Copia el código del sitio tal cual aparece aunque esté cortado. En "partidas" pon cada línea de la OC con su valor neto (techo, pintura, etc.).`;

// v8.72.2: el SAP del cliente corta los nombres largos, así que el código del sitio puede llegar
// truncado ("SITIO SAN CARLOS CELDA-DO-01-DN-0009"). Con 11 caracteres normalizados
// (DO01DN00097 = región + zona + número) el sitio ya es único; con menos no se acepta.
export const MIN_CODIGO_SIGNIFICATIVO = 11;
// v8.72.2: tolerancia de montos OC vs cotización (la misma que ya se usaba para el aviso).
export const TOLERANCIA_MONTO = 0.02;

const sinAcentos = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

/** Saca los códigos de sitio que aparezcan en un texto (también cortados al final). */
export function codigosEnTexto(texto) {
  return (String(texto || '').toUpperCase().match(/DO[-\s]?\d{2}[-\s]?[A-Z]{2}[-\s]?[\d-]*/g) || [])
    .map(normCodigo).filter(c => c.length >= 6);
}

/**
 * v8.72.2: ¿el código leído en la OC es el de la sucursal? Igual normalizado, o uno es prefijo
 * del otro con al menos MIN_CODIGO_SIGNIFICATIVO caracteres (corte del SAP).
 */
export function codigoCoincide(leido, miCodigo) {
  const a = normCodigo(leido), b = normCodigo(miCodigo);
  if (!a || !b) return false;
  if (a === b) return true;
  const corto = a.length < b.length ? a : b, largo = a.length < b.length ? b : a;
  return corto.length >= MIN_CODIGO_SIGNIFICATIVO && largo.startsWith(corto);
}

/** v8.72.2: ¿el nombre del sitio en la OC (quizá cortado) es el de la sucursal? */
export function nombreSitioCoincide(nombreOc, nombreLoc) {
  const limpiar = (v) => sinAcentos(v).replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/^\s*SITIO\s+/, '')
    .replace(/DO[-\s]?\d{2}[-\s]?[A-Z]{2}[-\s]?[\d-]*/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
  const a = limpiar(nombreOc), b = limpiar(nombreLoc);
  if (a.length < 5 || b.length < 5) return false;
  return a.startsWith(b) || b.startsWith(a) || a.includes(b);
}

/**
 * v8.72.2: ¿esta obra del ERP es del mismo sitio que la sucursal? (p. ej. la cotización de
 * pintura, que vive en otra obra: "Servicio de Pintura San Geronimo"). Por código o por nombre.
 */
export function esObraDelSitio(obra = {}, loc = {}) {
  const texto = `${obra.nombre || ''} ${obra.referenciaProyecto || ''}`;
  const codigos = codigosEnTexto(texto);
  if (loc.codigoUt && codigos.some(c => codigoCoincide(c, loc.codigoUt))) return true;
  if (codigos.some(c => c.length >= MIN_CODIGO_SIGNIFICATIVO)) return false; // trae el código de otro sitio
  const core = sinAcentos(loc.nombre).replace(/\(.*?\)|\[.*?\]/g, ' ').split(/[-,]/)[0]
    .replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 2);
  // Dos palabras del nombre como mínimo ("MENDOZA" sola sale en "Savica de Mendoza").
  if (core.length < 2 || core.join(' ').length < 6) return false;
  return ` ${sinAcentos(texto).replace(/[^A-Z0-9]+/g, ' ')} `.includes(` ${core.join(' ')} `);
}

const cuadra = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / b <= TOLERANCIA_MONTO;
const rd = (n) => `RD$${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * v8.72.2: el monto de la OC contra las cotizaciones del sitio. Una OC puede traer el techo y la
 * pintura juntos (dos cotizaciones, dos obras). Pasa si el subtotal cuadra con la suma de
 * cualquier combinación de cotizaciones del sitio, o si una partida de la OC cuadra con una.
 * @param {object} oc            { subtotal, partidas: [{ descripcion, monto }] }
 * @param {Array}  cotizaciones  [{ ref, montos: [n, …] }] — cada cotización con sus montos
 *                               posibles (el de la sucursal y el valor de la obra, si difieren)
 * @returns {{ ok:boolean|null, menor?:boolean, error?:string, aviso?:string, combinacion?:string[] }}
 *          ok null = no hay con qué comparar; menor = la OC no llega ni a la cotización de la sucursal (la primera).
 */
export function cuadrarMontoOC(oc = {}, cotizaciones = []) {
  const sub = Number(oc?.subtotal);
  const cots = (cotizaciones || []).map(c => ({ ref: c.ref || 's/ref', montos: [...new Set((c.montos || []).map(Number).filter(n => n > 0))] }))
    .filter(c => c.montos.length).slice(0, 6);
  if (!(sub > 0) || !cots.length) return { ok: null };
  // Todas las combinaciones: cada cotización entra o no, con uno de sus montos.
  let combos = [{ refs: [], suma: 0 }];
  cots.forEach(c => {
    const nuevos = [];
    combos.forEach(k => c.montos.forEach(m => nuevos.push({ refs: [...k.refs, c.ref], suma: k.suma + m })));
    combos = combos.concat(nuevos);
  });
  combos = combos.filter(k => k.refs.length);
  const exacta = combos.find(k => cuadra(sub, k.suma));
  if (exacta) return { ok: true, combinacion: exacta.refs, aviso: exacta.refs.length > 1 ? `La OC cubre ${exacta.refs.length} cotizaciones del sitio (${exacta.refs.join(' + ')}).` : undefined };
  const partidas = (oc.partidas || []).map(p => Number(p?.monto)).filter(n => n > 0);
  for (const p of partidas) {
    const k = combos.find(x => cuadra(p, x.suma));
    if (k) return { ok: true, combinacion: k.refs, aviso: `Una partida de la OC (${rd(p)}) cuadra con ${k.refs.join(' + ')}; el subtotal (${rd(sub)}) incluye otras partidas.` };
  }
  const esperado = cots.map(c => `${c.ref} ${c.montos.map(rd).join(' o ')}`).join('; ');
  const total = cots.reduce((s, c) => s + Math.max(...c.montos), 0);
  // La primera cotización es la de la sucursal: la OC tiene que cubrirla por lo menos.
  const menor = sub < Math.min(...cots[0].montos) * (1 - TOLERANCIA_MONTO);
  return {
    ok: false, menor,
    error: `${menor ? 'La OC es menor que lo cotizado' : 'El monto de la OC no cuadra con las cotizaciones del sitio'}: leí un subtotal de ${rd(sub)}${partidas.length > 1 ? ` (partidas ${partidas.map(rd).join(' + ')})` : ''} y esperaba ${esperado}${cots.length > 1 ? ` (todo junto ${rd(total)})` : ''}.`,
  };
}

/** Saca el JSON aunque la IA lo haya envuelto en ```json … ``` o con texto alrededor. */
export function parsearRespuestaIA(texto) {
  const t = String(texto || '');
  const ini = t.indexOf('{'), fin = t.lastIndexOf('}');
  if (ini < 0 || fin <= ini) return null;
  try { return JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
}

/**
 * @param {object} oc   JSON leído de la OC
 * @param {object} loc  sucursal del programa: { nombre, codigoUt, cotizacionRef, cotizacionMonto, obra,
 *                     cotizacionesSitio: [{ ref, monto }] } — v8.72.2: las otras obras del mismo sitio
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
  // v8.72.2: también cortado por el SAP (prefijo), y buscado dentro del nombre del sitio.
  const sitiosOc = oc.sitios || [];
  const codigos = sitiosOc.flatMap(s => {
    const c = normCodigo(s.codigo);
    return c.length >= 6 ? [c] : codigosEnTexto(s.nombre);
  }).filter(Boolean);
  const nombres = sitiosOc.map(s => String(s.nombre || ''));
  const miCodigo = normCodigo(loc.codigoUt);
  if (miCodigo) {
    if (codigos.length && !codigos.some(c => codigoCoincide(c, miCodigo))) {
      errores.push(`La OC es de otro sitio (${sitiosOc.map(s => s.codigo || s.nombre).join(', ')}), no de ${loc.nombre} (${loc.codigoUt}).`);
    } else if (codigos.length && !codigos.includes(miCodigo)) {
      avisos.push(`El código del sitio viene cortado en la OC (${sitiosOc.map(s => s.codigo || s.nombre).join(', ')}); coincide con ${loc.codigoUt}.`);
    } else if (!codigos.length) {
      if (loc.nombre && !nombres.some(n => nombreSitioCoincide(n, loc.nombre))) {
        avisos.push(`No se encontró el código ${loc.codigoUt} en la OC; revisa que sea de ${loc.nombre}.`);
      }
    }
  }
  if (codigos.length > 1) avisos.push(`La OC incluye ${codigos.length} sitios; confirma que esta sucursal sea una de ellas.`);

  if (!opts.sinFirma && oc.firmada_proveedor !== true) {
    errores.push(`La OC no está firmada en el recuadro del proveedor ("Recibo pedido").${oc.firma_detalle ? ` Se ve: ${oc.firma_detalle}.` : ''}`);
  }

  // v8.72.2: montos contra TODAS las cotizaciones del sitio (techo + pintura). Antes era un
  // aviso contra una sola cotización. Ahora una OC MENOR que lo cotizado se rechaza diciendo
  // qué se esperaba y qué se leyó; una OC mayor que no cuadra sigue siendo aviso, porque hay
  // OC reales con partidas adicionales (El Almirante 4500142510: RD$552,786 vs RD$435,684).
  const cotizaciones = [];
  const montosLoc = [loc.cotizacionMonto, loc.obra?.valorCotizacion].map(Number).filter(n => n > 0);
  if (montosLoc.length) cotizaciones.push({ ref: loc.cotizacionRef || loc.obra?.referenciaOdoo || 'cotización', montos: montosLoc });
  (loc.cotizacionesSitio || []).forEach(c => cotizaciones.push({ ref: c.ref, montos: [c.monto] }));
  const monto = cuadrarMontoOC(oc, cotizaciones);
  // Sin cotización propia de la sucursal no hay piso con qué decir "menor": queda en aviso.
  if (monto.ok === false) (monto.menor && montosLoc.length ? errores : avisos).push(monto.error);
  else if (monto.aviso) avisos.push(monto.aviso);
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
