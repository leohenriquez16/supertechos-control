// v8.19.48: Genera el PDF "Levantamiento autocontenido" vía window.print().
// Mismo patrón que imprimirCuadre.js (HTML + CSS print, el usuario guarda como PDF).
// La regla maestra del módulo: un técnico nuevo debe poder ejecutar la obra solo
// con este documento, sin llamar a nadie.
//
// Uso:
//   await imprimirLevantamiento({ proyecto, site, visit, areas, template });
//
// Carga internamente las fotos de la visita y sus signed URLs.

import { listarFotosVisita, getSignedUrlFotoSurvey, SERVICE_LINES } from '../../lib/surveys';
import { membreteHTML, MEMBRETE_CSS } from '../../lib/membrete';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fmtFecha(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// Formatea el valor de un campo. Devuelve '' si está vacío (para ocultarlo).
function fmtValor(field, valor) {
  if (valor == null || valor === '' || (Array.isArray(valor) && valor.length === 0)) return '';
  switch (field.type) {
    case 'boolean': return valor === true ? 'Sí' : valor === false ? 'No' : esc(valor);
    case 'multi_select': return Array.isArray(valor) ? esc(valor.join(', ')) : esc(valor);
    case 'rating_1_5': return `${esc(valor)} / 5`;
    case 'counter': case 'number': return esc(valor);
    case 'measurement_table': {
      const filas = Array.isArray(valor) ? valor : [];
      if (filas.length === 0) return '';
      const tot = filas.reduce((s, f) => s + (Number(f.area_m2) || 0), 0);
      const lineas = filas.map(f => {
        const dims = [f.length_m, f.width_m, f.height_m].filter(x => x != null && x !== '').map(x => esc(x)).join(' × ');
        const a = f.area_m2 != null ? ` = ${Number(f.area_m2).toFixed(2)} m²` : '';
        return `${f.label ? esc(f.label) + ': ' : ''}${dims}${a}`;
      }).join(' · ');
      return `${lineas} <b>(Total ${tot.toFixed(2)} m²)</b>`;
    }
    case 'ductos_table': {
      const filas = Array.isArray(valor) ? valor : [];
      if (!filas.length) return '';
      const tot = filas.reduce((s, f) => s + (Number(f.area_m2) || 0), 0);
      return `${filas.length} ducto(s) · ${tot.toFixed(2)} m²`;
    }
    case 'map_point': return valor?.lat != null ? `${Number(valor.lat).toFixed(5)}, ${Number(valor.lng).toFixed(5)}` : '';
    case 'map_polygon': return valor?.areaM2 != null ? `${esc(valor.areaM2)} m² (polígono)` : '';
    case 'photos': case 'fotos_previas': return ''; // imágenes aparte
    default: return typeof valor === 'object' ? '' : esc(valor);
  }
}

// Renderea SOLO los campos con información, en 2 columnas compactas.
// Devuelve '' si no hay ninguno (para poder ocultar la sección entera).
function renderCampos(fields, data) {
  const items = fields
    .filter(f => f.type !== 'photos' && f.type !== 'fotos_previas')
    .map(f => ({ label: f.label, valor: fmtValor(f, data?.[f.id]) }))
    .filter(x => x.valor !== '');
  if (!items.length) return '';
  return `<div class="campos-grid">${items.map(x => `<div class="campo"><span class="campo-label">${esc(x.label)}</span><span class="campo-valor">${x.valor}</span></div>`).join('')}</div>`;
}

function gridFotos(fotos) {
  if (!fotos || fotos.length === 0) return '';
  return `<div class="fotos">${fotos.map(f => `
    <figure>
      <img src="${esc(f.url)}" />
      ${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}
    </figure>`).join('')}</div>`;
}

// v8.24.19: panorámicas a dimensión completa (sin recortar).
function gridFotosPano(fotos) {
  if (!fotos || fotos.length === 0) return '';
  return `<div class="fotos-pano">${fotos.map(f => `
    <figure>
      <img src="${esc(f.url)}" />
      ${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}
    </figure>`).join('')}</div>`;
}

export async function imprimirLevantamiento({ proyecto, site, visit, areas = [], template }) {
  const schema = template?.schema || {};
  const sections = schema.sections || [];
  const generalSections = sections.filter(s => s.type !== 'repeating_block');
  const blocks = sections.filter(s => s.type === 'repeating_block');

  // Cargar fotos de la visita + signed URLs, agrupadas por área (null = generales).
  let fotos = [];
  try { fotos = await listarFotosVisita(visit.id); } catch { fotos = []; }
  const fotosConUrl = await Promise.all((fotos || []).map(async (f) => {
    let url = '';
    try { url = await getSignedUrlFotoSurvey(f.storage_path, 3600); } catch { url = ''; }
    return { areaId: f.area_id || null, url, caption: f.caption || '', photoType: f.photo_type || '' };
  }));
  const fotosPorArea = {};
  const fotosGenerales = [];
  for (const f of fotosConUrl) {
    if (!f.url) continue;
    if (f.areaId) (fotosPorArea[f.areaId] = fotosPorArea[f.areaId] || []).push(f);
    else fotosGenerales.push(f);
  }

  const serviceLabel = SERVICE_LINES[proyecto?.service_line]?.label || proyecto?.service_line || '';
  const totalM2 = areas.reduce((s, a) => s + (Number(a.net_area_m2) || Number(a.gross_area_m2) || 0), 0);

  // v8.24.8: foto de fachada (check-in) + mapa de la ubicación para el encabezado.
  let fachadaUrl = '';
  const ff = (visit?.general_data || {}).foto_frontal;
  if (Array.isArray(ff) && ff[0]) {
    if (ff[0].signedUrl) fachadaUrl = ff[0].signedUrl;
    else if (ff[0].storage_path) { try { fachadaUrl = await getSignedUrlFotoSurvey(ff[0].storage_path, 3600); } catch { fachadaUrl = ''; } }
  }
  if (!fachadaUrl) {
    const ffp = fotosConUrl.find(f => f.photoType === 'foto_frontal' || /fachada|frontal|frente/i.test(f.caption || ''));
    if (ffp) fachadaUrl = ffp.url;
  }
  const lat = site?.latitude ?? visit?.checkin_latitude;
  const lng = site?.longitude ?? visit?.checkin_longitude;
  const MAPBOX = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_MAPBOX_TOKEN) || '';
  let mapaUrl = '';
  if (lat != null && lng != null) {
    mapaUrl = MAPBOX
      ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/pin-l+CC0000(${lng},${lat})/${lng},${lat},16,0/640x320@2x?access_token=${MAPBOX}`
      : '';
  }

  // --- Secciones generales (visit.general_data) — se omiten si no tienen datos ---
  const htmlGenerales = generalSections.map(sec => {
    const campos = renderCampos(sec.fields, visit.general_data || {});
    if (!campos) return '';
    return `<section class="bloque"><h2>${esc(sec.title)}</h2>${campos}</section>`;
  }).filter(Boolean).join('');

  // --- Bloques repetibles (áreas) ---
  const htmlBloques = blocks.map(block => {
    const filas = areas.filter(a => a.block_id === block.id);
    if (filas.length === 0) {
      return `<section class="bloque"><h2>${esc(block.title)}</h2><div style="color:#999;font-size:11px">Ninguno registrado</div></section>`;
    }
    const items = filas.map((a, i) => {
      const campos = renderCampos(block.fields, a.data || {});
      const m2 = a.gross_area_m2 != null ? ` · ${Number(a.gross_area_m2).toFixed(2)} m²` : '';
      return `
      <div class="area">
        <h3>${esc(a.name || (block.block_label || 'Item') + ' ' + (i + 1))}${a.data?.section_surface_type ? ' <span class="chip">' + esc(a.data.section_surface_type) + '</span>' : ''}<span class="m2">${m2}</span></h3>
        ${campos || '<div class="muted">Sin datos adicionales.</div>'}
        ${gridFotos(fotosPorArea[a.id])}
      </div>`;
    }).join('');
    return `<section class="bloque"><h2>${esc(block.title)} <span class="conteo">(${filas.length})</span></h2>${items}</section>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
  <title>Levantamiento ${esc(site?.external_code || site?.name || '')}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #18181b; margin: 0; padding: 24px; font-size: 12px; }
    .portada { border: 2px solid #CC0000; border-radius: 10px; padding: 18px 20px; margin-bottom: 18px; }
    .portada h1 { margin: 0 0 4px; font-size: 20px; color: #CC0000; }
    .portada .sub { font-size: 13px; font-weight: bold; }
    .portada .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; margin-top: 10px; font-size: 11px; }
    .portada .meta b { color: #555; font-weight: 600; }
    .cabecera-visual { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; page-break-inside: avoid; }
    .cv-item { margin: 0; }
    .cv-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #777; margin-bottom: 3px; font-weight: 700; }
    .cv-item img { width: 100%; height: 210px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; }
    .cv-ph { width: 100%; height: 210px; border: 1px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 11px; background: #fafafa; text-align: center; }
    .resumen { display: flex; gap: 10px; margin-bottom: 16px; }
    .kpi { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 12px; }
    .kpi .n { font-size: 18px; font-weight: 800; color: #CC0000; }
    .kpi .l { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #777; }
    h2 { font-size: 14px; border-bottom: 2px solid #CC0000; padding-bottom: 3px; margin: 18px 0 8px; color: #18181b; }
    h2 .conteo { color: #999; font-weight: normal; font-size: 12px; }
    h3 { font-size: 12px; margin: 10px 0 4px; color: #CC0000; display: flex; align-items: center; gap: 6px; }
    h3 .chip { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #555; border: 1px solid #ccc; border-radius: 4px; padding: 1px 5px; font-weight: 600; }
    h3 .m2 { margin-left: auto; color: #18181b; font-weight: 800; }
    .bloque { page-break-inside: avoid; }
    .area { border: 1px solid #e5e5e5; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; page-break-inside: avoid; }
    .campos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
    .campo { display: grid; grid-template-columns: minmax(70px, max-content) 1fr; gap: 8px; align-items: baseline; padding: 2px 0; border-bottom: 1px dotted #eee; font-size: 11px; }
    .campo-label { color: #666; }
    .campo-valor { font-weight: 600; color: #18181b; }
    .muted { color: #999; font-size: 11px; }
    .fotos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; }
    .fotos figure { margin: 0; }
    .fotos img { width: 100%; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; }
    .fotos figcaption { font-size: 9px; color: #777; margin-top: 2px; }
    .fotos-pano { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 6px; }
    .fotos-pano figure { margin: 0; page-break-inside: avoid; }
    .fotos-pano img { width: 100%; height: auto; max-height: 420px; object-fit: contain; border-radius: 6px; border: 1px solid #ddd; background: #f4f4f5; }
    .fotos-pano figcaption { font-size: 10px; color: #777; margin-top: 3px; text-align: center; }
    .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #999; text-align: center; }
    ${MEMBRETE_CSS}
    @media print { body { padding: 0; } @page { margin: 14mm; } }
  </style></head><body>
    ${membreteHTML(proyecto?.company)}
    <div class="portada">
      <h1>Levantamiento Técnico</h1>
      <div class="sub">${esc(site?.name || proyecto?.name || '')}${site?.external_code ? ' · ' + esc(site.external_code) : ''}</div>
      <div class="meta">
        <div><b>Proyecto:</b> ${esc(proyecto?.name || '—')}</div>
        <div><b>Cliente:</b> ${esc(proyecto?.client_name || '—')}</div>
        <div><b>Servicio:</b> ${esc(serviceLabel)}</div>
        <div><b>Dirección:</b> ${esc(site?.address || '—')}</div>
        <div><b>Contacto:</b> ${esc(visit?.site_contact_name || site?.contact_name || '—')}</div>
        <div><b>GPS:</b> ${visit?.checkin_latitude ? `${visit.checkin_latitude}, ${visit.checkin_longitude}` : '—'}</div>
        <div><b>Visita:</b> ${fmtFecha(visit?.checkin_at)}</div>
        <div><b>Cierre:</b> ${fmtFecha(visit?.checkout_at)}</div>
      </div>
    </div>

    <div class="cabecera-visual">
      <figure class="cv-item">
        <div class="cv-label">Fachada / frente</div>
        ${fachadaUrl ? `<img src="${esc(fachadaUrl)}" />` : `<div class="cv-ph">Sin foto de fachada</div>`}
      </figure>
      <figure class="cv-item">
        <div class="cv-label">Ubicación</div>
        ${mapaUrl ? `<img src="${esc(mapaUrl)}" />` : `<div class="cv-ph">${lat != null ? `${esc(lat)}, ${esc(lng)}` : 'Sin ubicación registrada'}</div>`}
      </figure>
    </div>

    <div class="resumen">
      <div class="kpi"><div class="n">${totalM2.toFixed(2)} m²</div><div class="l">Área medida</div></div>
      <div class="kpi"><div class="n">${areas.length}</div><div class="l">Items capturados</div></div>
      <div class="kpi"><div class="n">${fotosConUrl.filter(f => f.url).length}</div><div class="l">Fotos</div></div>
    </div>

    ${fotosGenerales.length ? `<section class="bloque"><h2>Fotos panorámicas</h2>${gridFotosPano(fotosGenerales)}</section>` : ''}
    ${htmlGenerales}
    ${htmlBloques}
    ${visit?.general_notes ? `<section class="bloque"><h2>Notas del supervisor</h2><div>${esc(visit.general_notes)}</div></section>` : ''}
    ${visit?.recommended_system ? `<section class="bloque"><h2>Sistema recomendado</h2><div>${esc(visit.recommended_system)}</div></section>` : ''}

    <div class="footer">Generado por Super Techos Control · ${fmtFecha(new Date().toISOString())} · Documento autocontenido del levantamiento</div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Permite las ventanas emergentes para generar el PDF.'); return; }
  w.document.write(html);
  w.document.close();
  // Esperar a que carguen las imágenes antes de imprimir.
  w.onload = () => { setTimeout(() => { w.focus(); w.print(); }, 600); };
}
