// v8.59.3 — FIRMAR Y SELLAR LA OC DEL CLIENTE en el ERP.
// Miguel sube la OC tal como la manda Towers and Sites (sin firmar). El ERP busca el
// recuadro del proveedor ("RECIBO PEDIDO" con la línea "PROVEEDOR/VENDOR" debajo), estampa
// ahí la firma de quien la sube y el sello de la empresa, y devuelve el PDF firmado.
//
// La búsqueda del recuadro usa pdf.js (texto con posición) y el estampado pdf-lib; los dos
// se cargan del CDN solo cuando hace falta. La geometría (posicionFirma) es pura y probada.

/**
 * Dónde va la firma y el sello, en coordenadas PDF (origen abajo a la izquierda).
 * @param {object} p
 * @param {{x:number,y:number,w:number,h:number}} p.etiqueta  "PROVEEDOR/VENDOR" (y = base del texto)
 * @param {{y:number}|null} p.titulo                          "RECIBO PEDIDO" (y = base del texto), si se encontró
 * @param {{w:number,h:number}} p.firma                       tamaño de la imagen de la firma (px)
 * @returns {{firma:{x,y,w,h}, sello:{x,y,w,h}}}
 */
export function posicionFirma({ etiqueta, titulo, firma }) {
  const pie = etiqueta.y + etiqueta.h + 1.5;                       // justo encima de la etiqueta
  const techo = titulo ? titulo.y - 1.5 : pie + 34;                // justo debajo del título
  const alto = Math.max(16, Math.min(40, techo - pie));
  const proporcion = firma?.w && firma?.h ? firma.w / firma.h : 3;
  let h = alto, w = h * proporcion;
  const anchoMax = Math.max(80, etiqueta.w * 1.6);
  if (w > anchoMax) { w = anchoMax; h = w / proporcion; }
  const centro = etiqueta.x + etiqueta.w / 2;
  const firmaRect = { x: centro - w / 2, y: pie, w, h };
  const lado = Math.min(54, Math.max(36, alto * 1.7));
  // el sello no baja de la línea de la etiqueta (si no, cruza el borde del recuadro)
  const selloRect = { x: etiqueta.x + etiqueta.w + 6, y: Math.max(etiqueta.y, pie + alto / 2 - lado / 2), w: lado, h: lado };
  return { firma: firmaRect, sello: selloRect };
}

const cargar = (src, global) => new Promise((resolve, reject) => {
  if (typeof window !== 'undefined' && window[global]) return resolve(window[global]);
  const s = document.createElement('script');
  s.src = src; s.onload = () => resolve(window[global]); s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
  document.head.appendChild(s);
});
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

/** Busca el recuadro del proveedor en el PDF. Devuelve { pagina, etiqueta, titulo } o null. */
export async function buscarRecuadroProveedor(bytes) {
  const pdfjs = await cargar(PDFJS, 'pdfjsLib');
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const texto = (it) => String(it.str || '').toUpperCase();
    const et = items.find(it => /PROVEEDOR\s*\/\s*VENDOR/.test(texto(it)))
      || items.find(it => texto(it).trim() === 'PROVEEDOR');
    if (!et) continue;
    const [, , , , ex, ey] = et.transform;
    const eh = Math.abs(et.transform[3]) || et.height || 6;
    // "RECIBO PEDIDO": el título más cercano por encima, en la misma columna
    const tit = items
      .filter(it => /RECIBO/.test(texto(it)) && it.transform[5] > ey && it.transform[5] - ey < 80)
      .sort((a, b) => a.transform[5] - b.transform[5])[0];
    return {
      pagina: n - 1,
      etiqueta: { x: ex, y: ey, w: et.width || 60, h: eh },
      titulo: tit ? { y: tit.transform[5] } : null,
    };
  }
  return null;
}

/**
 * Estampa firma y sello. firmaPng y selloPng: ArrayBuffer/Uint8Array de PNG.
 * @returns {Uint8Array} PDF firmado
 */
export async function estamparFirmaYSello({ pdfBytes, firmaPng, selloPng, recuadro }) {
  const PDFLib = await cargar(PDFLIB, 'PDFLib');
  const pdf = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pagina = pdf.getPage(recuadro.pagina);
  const firma = await pdf.embedPng(firmaPng);
  const sello = selloPng ? await pdf.embedPng(selloPng) : null;
  const pos = posicionFirma({ etiqueta: recuadro.etiqueta, titulo: recuadro.titulo, firma: { w: firma.width, h: firma.height } });
  if (sello) pagina.drawImage(sello, { ...pos.sello, width: pos.sello.w, height: pos.sello.h, opacity: 0.9 });
  pagina.drawImage(firma, { x: pos.firma.x, y: pos.firma.y, width: pos.firma.w, height: pos.firma.h });
  return pdf.save();
}

/** La firma del pad viene sobre fondo blanco: lo vuelve transparente para que no tape la OC. */
export function blancoATransparente(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) d[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
