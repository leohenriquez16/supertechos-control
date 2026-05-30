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

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fmtFecha(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// Formatea el valor de un campo según su tipo, usando el def del template.
function fmtValor(field, valor) {
  if (valor == null || valor === '') return '<span style="color:#999">—</span>';
  switch (field.type) {
    case 'boolean': return valor === true ? 'Sí' : valor === false ? 'No' : esc(valor);
    case 'multi_select': return Array.isArray(valor) ? esc(valor.join(', ')) : esc(valor);
    case 'rating_1_5': return `${esc(valor)} / 5`;
    case 'measurement_table': {
      const filas = Array.isArray(valor) ? valor : [];
      if (filas.length === 0) return '<span style="color:#999">Sin medidas</span>';
      let total = 0;
      const rows = filas.map(f => {
        const nums = Object.entries(f).filter(([k]) => k !== 'label').map(([, v]) => Number(v) || 0);
        const area = nums.length >= 2 ? nums[0] * nums[1] : (nums[0] || 0);
        total += area;
        return `<tr><td>${esc(f.label || '')}</td>${Object.entries(f).filter(([k]) => k !== 'label').map(([, v]) => `<td style="text-align:right">${esc(v ?? '')}</td>`).join('')}<td style="text-align:right;font-weight:bold">${area.toFixed(2)} m²</td></tr>`;
      }).join('');
      return `<table class="meas"><tbody>${rows}<tr class="meas-total"><td colspan="99" style="text-align:right">Total: ${total.toFixed(2)} m²</td></tr></tbody></table>`;
    }
    case 'photos': return ''; // las fotos se renderizan aparte por área
    default: return esc(valor);
  }
}

// Renderea los campos (no-foto) de un objeto de datos según una lista de fields.
function renderCampos(fields, data) {
  const items = fields
    .filter(f => f.type !== 'photos')
    .map(f => {
      const v = fmtValor(f, data?.[f.id]);
      if (v === '') return '';
      return `<div class="campo"><span class="campo-label">${esc(f.label)}</span><span class="campo-valor">${v}</span></div>`;
    })
    .filter(Boolean)
    .join('');
  return items || '<div style="color:#999;font-size:11px">Sin datos capturados</div>';
}

function gridFotos(fotos) {
  if (!fotos || fotos.length === 0) return '';
  return `<div class="fotos">${fotos.map(f => `
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

  // --- Secciones generales (visit.general_data) ---
  const htmlGenerales = generalSections.map(sec => `
    <section class="bloque">
      <h2>${esc(sec.title)}</h2>
      ${renderCampos(sec.fields, visit.general_data || {})}
    </section>`).join('');

  // --- Bloques repetibles (áreas) ---
  const htmlBloques = blocks.map(block => {
    const filas = areas.filter(a => a.block_id === block.id);
    if (filas.length === 0) {
      return `<section class="bloque"><h2>${esc(block.title)}</h2><div style="color:#999;font-size:11px">Ninguno registrado</div></section>`;
    }
    const items = filas.map((a, i) => `
      <div class="area">
        <h3>${esc(block.block_label || 'Item')} ${i + 1}${a.name ? ' — ' + esc(a.name) : ''}</h3>
        ${renderCampos(block.fields, a.data || {})}
        ${gridFotos(fotosPorArea[a.id])}
      </div>`).join('');
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
    .resumen { display: flex; gap: 10px; margin-bottom: 16px; }
    .kpi { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 12px; }
    .kpi .n { font-size: 18px; font-weight: 800; color: #CC0000; }
    .kpi .l { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #777; }
    h2 { font-size: 14px; border-bottom: 2px solid #CC0000; padding-bottom: 3px; margin: 18px 0 8px; color: #18181b; }
    h2 .conteo { color: #999; font-weight: normal; font-size: 12px; }
    h3 { font-size: 12px; margin: 10px 0 4px; color: #CC0000; }
    .bloque { page-break-inside: avoid; }
    .area { border: 1px solid #e5e5e5; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; page-break-inside: avoid; }
    .campo { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; border-bottom: 1px dotted #eee; }
    .campo-label { color: #555; }
    .campo-valor { font-weight: 600; text-align: right; }
    table.meas { width: 100%; border-collapse: collapse; margin-top: 2px; }
    table.meas td { border: 1px solid #eee; padding: 2px 5px; font-size: 11px; }
    .meas-total td { border: none; font-weight: bold; padding-top: 3px; }
    .fotos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; }
    .fotos figure { margin: 0; }
    .fotos img { width: 100%; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; }
    .fotos figcaption { font-size: 9px; color: #777; margin-top: 2px; }
    .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #999; text-align: center; }
    @media print { body { padding: 0; } @page { margin: 14mm; } }
  </style></head><body>
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

    <div class="resumen">
      <div class="kpi"><div class="n">${totalM2.toFixed(2)} m²</div><div class="l">Área medida</div></div>
      <div class="kpi"><div class="n">${areas.length}</div><div class="l">Items capturados</div></div>
      <div class="kpi"><div class="n">${fotosConUrl.filter(f => f.url).length}</div><div class="l">Fotos</div></div>
    </div>

    ${fotosGenerales.length ? `<section class="bloque"><h2>Fotos panorámicas</h2>${gridFotos(fotosGenerales)}</section>` : ''}
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
