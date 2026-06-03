// v8.25.1: Informe fotográfico del levantamiento. Genera un PDF (window.print) con
// TODAS las fotos agrupadas (panorámicas/generales + por sección), con los datos del
// cliente, la locación, la fecha de realización y quién lo realizó.
//
// Uso: await imprimirInformeFotografico({ proyecto, site, usuario });

import { listarVisitasDeSite, listarAreasDeVisita, listarFotosVisita, getSignedUrlFotoSurvey, SERVICE_LINES } from '../../lib/surveys';
import { membreteHTML, MEMBRETE_CSS } from '../../lib/membrete';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

  const bloqueFotos = (titulo, fotos) => {
    if (!fotos || !fotos.length) return '';
    return `<section class="grupo">
      <h2>${esc(titulo)} <span class="conteo">(${fotos.length})</span></h2>
      <div class="grid">${fotos.map(f => `<figure><img src="${esc(f.url)}" />${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}</figure>`).join('')}</div>
    </section>`;
  };

  const seccionesHtml = Object.entries(porArea).map(([aid, fotos]) => bloqueFotos(areasMap[aid] || 'Sección', fotos)).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />
  <title>Informe Fotográfico — ${esc(site?.name || proyecto?.client_name || '')}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #18181b; margin: 0; padding: 24px; font-size: 12px; }
    .portada { border: 2px solid #CC0000; border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; }
    .portada .tit { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #CC0000; font-weight: 800; }
    .portada h1 { margin: 2px 0 8px; font-size: 22px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; font-size: 11px; }
    .meta b { color: #666; font-weight: 600; }
    h2 { font-size: 14px; border-bottom: 2px solid #CC0000; padding-bottom: 3px; margin: 16px 0 8px; }
    h2 .conteo { color: #999; font-weight: normal; font-size: 12px; }
    .grupo { page-break-inside: auto; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    figure { margin: 0; page-break-inside: avoid; }
    .grid img { width: 100%; height: auto; max-height: 360px; object-fit: contain; border-radius: 6px; border: 1px solid #ddd; background: #f4f4f5; }
    figcaption { font-size: 10px; color: #777; margin-top: 3px; text-align: center; }
    .vacio { color: #999; padding: 20px; text-align: center; }
    .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #999; text-align: center; }
    ${MEMBRETE_CSS}
    @media print { body { padding: 0; } @page { margin: 14mm; } }
  </style></head><body>
    ${membreteHTML(proyecto?.company)}
    <div class="portada">
      <div class="tit">Informe Fotográfico de Levantamiento</div>
      <h1>${esc(site?.name || proyecto?.client_name || '')}</h1>
      <div class="meta">
        <div><b>Cliente:</b> ${esc(proyecto?.client_name || '—')}</div>
        <div><b>Servicio:</b> ${esc(serviceLabel)}</div>
        <div><b>Locación:</b> ${esc(site?.name || '—')}</div>
        <div><b>Dirección:</b> ${esc(site?.address || '—')}</div>
        <div><b>Fecha del levantamiento:</b> ${fmtFecha(fechaRef)}</div>
        <div><b>Realizado por:</b> ${esc(levantador)}</div>
        <div><b>GPS:</b> ${esc(gps)}</div>
        <div><b>Total de fotos:</b> ${totalFotos}</div>
      </div>
    </div>

    ${totalFotos === 0 ? '<div class="vacio">Este levantamiento no tiene fotos.</div>' : ''}
    ${bloqueFotos('Fotos generales / panorámicas', generales)}
    ${seccionesHtml}

    <div class="footer">Super Techos Control · Informe fotográfico generado ${fmtFecha(new Date().toISOString())}</div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Permite las ventanas emergentes para generar el informe.'); return; }
  w.document.write(html);
  w.document.close();
  w.onload = () => { setTimeout(() => { w.focus(); w.print(); }, 700); };
}
