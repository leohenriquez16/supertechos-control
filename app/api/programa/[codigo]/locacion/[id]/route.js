// app/api/programa/[codigo]/locacion/[id]/route.js
// v8.59.1 — FICHA DE UN SITIO para el portal del cliente: datos, línea de tiempo y, si ya se
// levantó, áreas medidas y fotos. Las fotos viven en un bucket PRIVADO (surveys-photos):
// se entregan con URL firmada que vence en 1 hora, nunca públicas.
import { locacionParaCliente, levantamientoParaCliente } from '../../../../../../lib/server/portalPrograma';
import { autenticarPortal } from '../../../../../../lib/server/portalAuth';

export const dynamic = 'force-dynamic';
const VENCE_SEG = 60 * 60;
const MAX_FOTOS = 40;

export async function GET(request, { params }) {
  const { db, programa, error } = await autenticarPortal(request, params?.codigo);
  if (error) return error;

  const { data: fila } = await db.from('programa_locaciones').select('*')
    .eq('id', params?.id).eq('programa_id', programa.id).maybeSingle();
  if (!fila) return Response.json({ ok: false, error: 'Locación no encontrada.' }, { status: 404 });

  let obra = null;
  let historialObra = [];
  if (fila.proyecto_id) {
    const [{ data }, { data: hist }] = await Promise.all([
      db.from('proyectos').select('id, estado, fecha_inicio').eq('id', fila.proyecto_id).maybeSingle(),
      db.from('historial_estados').select('estado_nuevo, created_at').eq('proyecto_id', fila.proyecto_id),
    ]);
    obra = data || null;
    historialObra = hist || [];
  }
  const locacion = locacionParaCliente(fila, obra, historialObra);

  // Documentos visibles para el cliente (OC, cotización, informe…), con enlace de 1 hora
  const { data: docs } = await db.from('programa_documentos')
    .select('id, tipo, nombre, path, mime, tamano_bytes, origen, subido_por, created_at')
    .eq('locacion_id', fila.id).eq('visible_cliente', true).order('created_at', { ascending: false });
  let documentos = [];
  if (docs?.length) {
    const { data: firm } = await db.storage.from('proyecto-archivos').createSignedUrls(docs.map(d => d.path), VENCE_SEG);
    const url = new Map((firm || []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]));
    documentos = docs.map(d => ({
      id: d.id, tipo: d.tipo, nombre: d.nombre, mime: d.mime, tamanoBytes: d.tamano_bytes,
      origen: d.origen, subidoPor: d.subido_por || '', fecha: d.created_at, url: url.get(d.path) || null,
    }));
  }

  let levantamiento = null;
  if (fila.levantamiento_id) {
    const { data: sites } = await db.schema('surveys').from('sites').select('id').eq('project_id', fila.levantamiento_id);
    const siteIds = (sites || []).map(s => s.id);
    if (siteIds.length) {
      const { data: visitas } = await db.schema('surveys').from('visits')
        .select('id, checkin_at, created_at, is_completed, recommended_system, estimated_days, total_measured_m2')
        .in('site_id', siteIds).order('created_at', { ascending: false });
      const visita = (visitas || []).find(v => v.is_completed) || (visitas || [])[0] || null;
      if (visita) {
        const [{ data: areas }, { data: fotosRaw }] = await Promise.all([
          db.schema('surveys').from('areas').select('name, area_number, net_area_m2, gross_area_m2, to_be_treated').eq('visit_id', visita.id).order('area_number'),
          db.schema('surveys').from('photos').select('storage_path, caption, photo_type, taken_at, is_critical').eq('visit_id', visita.id).order('taken_at').limit(MAX_FOTOS),
        ]);
        const paths = (fotosRaw || []).map(f => f.storage_path).filter(Boolean);
        let firmadas = [];
        if (paths.length) {
          const { data } = await db.storage.from('surveys-photos').createSignedUrls(paths, VENCE_SEG);
          firmadas = data || [];
        }
        const urlDe = new Map(firmadas.filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]));
        const fotos = (fotosRaw || []).filter(f => urlDe.has(f.storage_path)).map(f => ({ ...f, url: urlDe.get(f.storage_path) }));
        levantamiento = levantamientoParaCliente(visita, areas || [], fotos);
      }
    }
  }
  return Response.json({ ok: true, locacion, levantamiento, documentos });
}
