// v8.25.1: Informe fotográfico del levantamiento. Genera un PDF (window.print) con
// TODAS las fotos agrupadas (panorámicas/generales + por sección), con los datos del
// cliente, la locación, la fecha de realización y quién lo realizó.
//
// Uso: await imprimirInformeFotografico({ proyecto, site, usuario });

import { listarVisitasDeSite, listarAreasDeVisita, listarFotosVisita, getSignedUrlFotoSurvey, SERVICE_LINES } from '../../lib/surveys';
import { cargarPdfLib } from '../../lib/helpers/pdf';

// pdf-lib + StandardFonts solo soportan Latin-1: sanea em-dash y quita emojis/no-Latin1.
const safe = (s) => String(s ?? '').replace(/[—–]/g, '-').replace(/[^\x00-\xFF]/g, '');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// v8.27.80: pdf-lib IGNORA la orientación EXIF, así que las fotos de teléfono
// (que llevan un flag de rotación que el navegador sí respeta al mostrarlas)
// salían giradas/de lado en el informe. Solución: redibujar cada foto en un
// canvas — el navegador aplica la orientación EXIF al pintar — y re-codificar a
// JPEG ya "derecho" y sin EXIF antes de incrustarla. De paso acota el tamaño.
// Se carga desde un blob URL (mismo origen) para no ensuciar el canvas por CORS.
async function fotoNormalizadaJpg(url, maxLado = 1600, quality = 0.72) {
  const buf = await (await fetch(url)).arrayBuffer();
  const objUrl = URL.createObjectURL(new Blob([buf]));
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = objUrl;
    });
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const s = Math.min(1, maxLado / Math.max(w, h));
    w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const outBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return { bytes: new Uint8Array(await outBlob.arrayBuffer()), width: w, height: h };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

function fmtFecha(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export async function imprimirInformeFotografico({ proyecto, site, usuario }) {
  // Cargar visitas + áreas (para nombres) + fotos (signed urls).
  const visitas = await listarVisitasDeSite(site.id);
  const areasMap = {};
  let fechaRef = null;
  for (const v of visitas) {
    if (!fechaRef) fechaRef = v.checkout_at || v.checkin_at || v.created_at;
    try {
      const areas = await listarAreasDeVisita(v.id);
      for (const a of areas) areasMap[a.id] = a.name || `Sección ${a.area_number}`;
    } catch {}
  }
  const generales = [];
  const porArea = {};
  let totalFotos = 0;
  for (const v of visitas) {
    let fs = [];
    try { fs = await listarFotosVisita(v.id); } catch { fs = []; }
    for (const f of (fs || [])) {
      let url = ''; try { url = await getSignedUrlFotoSurvey(f.storage_path, 3600); } catch { url = ''; }
      if (!url) continue;
      totalFotos++;
      const item = { url, caption: f.caption || '' };
      if (f.area_id) (porArea[f.area_id] = porArea[f.area_id] || []).push(item);
      else generales.push(item);
    }
  }

  const serviceLabel = SERVICE_LINES[proyecto?.service_line]?.label || proyecto?.service_line || '';
  const levantador = proyecto?.asignado_a_nombre || usuario?.nombre || '—';
  const gps = (site?.latitude != null) ? `${site.latitude}, ${site.longitude}` : '—';

  // Grupos: generales primero, luego por sección.
  const grupos = [];
  if (generales.length) grupos.push({ titulo: 'Fotos generales / panorámicas', fotos: generales });
  for (const [aid, fotos] of Object.entries(porArea)) grupos.push({ titulo: areasMap[aid] || 'Sección', fotos });

  // ---- Generar PDF descargable con pdf-lib ----
  const PDFLib = await cargarPdfLib();
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ROJO = rgb(0.8, 0, 0), GRIS = rgb(0.45, 0.45, 0.48), NEGRO = rgb(0.1, 0.1, 0.1);
  const PW = 595.28, PH = 841.89, M = 40, W = PW - M * 2;
  const IMG_MAX_H = 300, SLOT_H = 340;

  // Portada
  let page = pdf.addPage([PW, PH]);
  let y = PH - M;
  page.drawText('INFORME FOTOGRAFICO DE LEVANTAMIENTO', { x: M, y: y -= 8, size: 9, font: bold, color: ROJO });
  page.drawText(safe(site?.name || proyecto?.client_name || 'Levantamiento').slice(0, 55), { x: M, y: y -= 24, size: 18, font: bold, color: NEGRO });
  y -= 16;
  const meta = [
    ['Cliente', proyecto?.client_name], ['Servicio', serviceLabel], ['Locacion', site?.name],
    ['Direccion', site?.address], ['Fecha del levantamiento', fmtFecha(fechaRef)],
    ['Realizado por', levantador], ['GPS', gps], ['Total de fotos', String(totalFotos)],
  ];
  for (const [k, v] of meta) {
    y -= 16;
    page.drawText(safe(k) + ':', { x: M, y, size: 9, font: bold, color: GRIS });
    page.drawText(safe(v || '-').slice(0, 75), { x: M + 135, y, size: 9, font, color: NEGRO });
  }

  let cy = y - 10;
  const nuevaPagina = (titulo) => {
    page = pdf.addPage([PW, PH]);
    cy = PH - M;
    if (titulo) { page.drawText(safe(titulo).slice(0, 70), { x: M, y: cy - 4, size: 12, font: bold, color: ROJO }); cy -= 26; }
  };

  for (const g of grupos) {
    // título de la sección (en la página actual si cabe, si no en una nueva)
    if (cy - 26 < M) nuevaPagina(g.titulo);
    else { page.drawText(safe(`${g.titulo} (${g.fotos.length})`).slice(0, 70), { x: M, y: cy - 4, size: 12, font: bold, color: ROJO }); cy -= 26; }
    for (const f of g.fotos) {
      if (cy - SLOT_H < M) nuevaPagina(`${g.titulo} (cont.)`);
      try {
        // Normaliza orientación EXIF + tamaño; el resultado es siempre JPEG.
        const { bytes, width, height } = await fotoNormalizadaJpg(f.url);
        const img = await pdf.embedJpg(bytes);
        const s = Math.min(W / width, IMG_MAX_H / height);
        const iw = width * s, ih = height * s;
        page.drawImage(img, { x: M + (W - iw) / 2, y: cy - ih, width: iw, height: ih });
        cy -= ih + 4;
      } catch (e) { /* foto que no carga: la saltamos */ }
      if (f.caption) { page.drawText(safe(f.caption).slice(0, 95), { x: M, y: cy - 9, size: 8, font, color: GRIS }); cy -= 13; }
      cy -= 12;
    }
  }

  if (totalFotos === 0) {
    page.drawText('Este levantamiento no tiene fotos.', { x: M, y: cy - 16, size: 11, font, color: GRIS });
  }

  // Guardar → abrir en pestaña + descargar
  const pdfBytes = await pdf.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const nombre = `Informe-fotografico-${safe(site?.name || proyecto?.client_name || 'levantamiento').replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`;
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  window.open(url, '_blank'); // también lo abre para verlo
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
