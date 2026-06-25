// v8.16: Endpoint server-side para crear un acta + submission DocuSeal.
// Vive server-side para no exponer la DOCUSEAL_API_KEY al browser.
//
// Body esperado:
// {
//   tipo: 'cubicacion' | 'entrega_area' | 'entrega_proyecto',
//   proyectoId, areaId?,
//   cliente: { nombre, email?, telefono?, viaEnvio: 'email' | 'whatsapp' },
//   snapshotDatos: {
//     periodo, areas: [...], fotosIds: [...], totalCubicado, observaciones, ...
//   },
//   generadaPorId,
//   docusealValues: { ... }   // valores que se pasan a la plantilla DocuSeal
// }

export const runtime = 'edge';
export const maxDuration = 30;

import { createClient } from '@supabase/supabase-js';
import { crearSubmission } from '../../../../lib/docuseal';

// La carta de garantía tiene plantilla POR EMPRESA emisora (Super Techos / Prouco),
// porque cada una tiene su membrete y firma. El resto usa una sola plantilla.
function templateIdParaTipo(tipo, empresa) {
  if (tipo === 'cubicacion') return process.env.DOCUSEAL_TEMPLATE_CUBICACION_ID;
  if (tipo === 'entrega_area') return process.env.DOCUSEAL_TEMPLATE_ENTREGA_AREA_ID;
  if (tipo === 'entrega_proyecto') return process.env.DOCUSEAL_TEMPLATE_ENTREGA_PROYECTO_ID;
  if (tipo === 'carta_garantia') {
    return empresa === 'prouco'
      ? process.env.DOCUSEAL_TEMPLATE_CARTA_GARANTIA_PROUCO_ID
      : process.env.DOCUSEAL_TEMPLATE_CARTA_GARANTIA_ST_ID;
  }
  return null;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      tipo,
      proyectoId,
      areaId = null,
      empresa = null,          // 'super_techos' | 'prouco' — define el membrete de la carta de garantía
      garantiaId = null,       // garantía de origen (cuando tipo = 'carta_garantia')
      cliente,
      snapshotDatos = {},
      generadaPorId,
      docusealValues = {},
    } = body;

    if (!['cubicacion', 'entrega_area', 'entrega_proyecto', 'carta_garantia'].includes(tipo)) {
      return new Response(JSON.stringify({ error: 'Tipo inválido' }), { status: 400 });
    }
    if (!proyectoId) return new Response(JSON.stringify({ error: 'proyectoId requerido' }), { status: 400 });
    if (!cliente?.nombre) return new Response(JSON.stringify({ error: 'cliente.nombre requerido' }), { status: 400 });
    if (!cliente?.viaEnvio) return new Response(JSON.stringify({ error: 'cliente.viaEnvio requerido' }), { status: 400 });
    if (cliente.viaEnvio === 'email' && !cliente.email) {
      return new Response(JSON.stringify({ error: 'Email requerido cuando viaEnvio = email' }), { status: 400 });
    }
    if (cliente.viaEnvio === 'whatsapp' && !cliente.telefono) {
      return new Response(JSON.stringify({ error: 'Teléfono requerido cuando viaEnvio = whatsapp' }), { status: 400 });
    }

    const templateId = templateIdParaTipo(tipo, empresa);
    if (!templateId) {
      const sufijo = tipo === 'carta_garantia'
        ? `DOCUSEAL_TEMPLATE_CARTA_GARANTIA_${empresa === 'prouco' ? 'PROUCO' : 'ST'}_ID`
        : `DOCUSEAL_TEMPLATE_${tipo.toUpperCase()}_ID`;
      return new Response(JSON.stringify({
        error: `Template ID de DocuSeal no configurado para tipo "${tipo}". Variable de entorno: ${sufijo}`,
      }), { status: 503 });
    }

    // Crear submission en DocuSeal
    let submission;
    try {
      submission = await crearSubmission({
        templateId,
        submitter: {
          email: cliente.email || `${proyectoId}@no-email.local`, // DocuSeal exige email; si solo hay teléfono, usamos placeholder
          name: cliente.nombre,
          phone: cliente.telefono || undefined,
          values: docusealValues,
        },
        // Si el cliente prefiere WhatsApp, no enviamos email automático;
        // nosotros le mandamos el link. Si prefiere email, DocuSeal lo envía.
        enviarPorEmail: cliente.viaEnvio === 'email',
      });
    } catch (e) {
      console.error('Error creando submission DocuSeal:', e);
      return new Response(JSON.stringify({
        error: 'Error en DocuSeal: ' + (e?.message || 'desconocido'),
      }), { status: 502 });
    }

    // Insertar acta en DB
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_KEY
    );

    const id = 'act_' + Date.now() + Math.random().toString(36).slice(2, 7);
    const ahora = new Date().toISOString();

    const row = {
      id,
      proyecto_id: proyectoId,
      area_id: areaId || null,
      tipo,
      snapshot_datos: snapshotDatos,
      cliente_nombre: cliente.nombre,
      cliente_email: cliente.email || null,
      cliente_telefono: cliente.telefono || null,
      cliente_via_envio: cliente.viaEnvio,
      docuseal_submission_id: String(submission.submissionId || submission.submitterId),
      docuseal_url_firmante: submission.urlFirmante,
      docuseal_payload: submission.raw || null,
      status: 'enviada',
      enviada_at: ahora,
      status_facturacion: tipo === 'cubicacion' ? null : 'no_aplica',
      // Carta de garantía: empresa emisora, garantía de origen y plazo de cobertura.
      empresa: empresa || null,
      garantia_id: garantiaId || null,
      garantia_inicio_at: body.garantiaInicio || null,
      garantia_fin_at: body.garantiaFin || null,
      garantia_anios: body.garantiaAnios || null,
      generada_por_id: generadaPorId || null,
    };

    const { data: insertada, error: errIns } = await supabase
      .from('actas_proyecto')
      .insert(row)
      .select()
      .single();

    if (errIns) {
      console.error('Error insertando acta:', errIns);
      return new Response(JSON.stringify({
        error: 'Submission creada en DocuSeal pero falló guardado local: ' + errIns.message,
        submissionId: submission.submissionId,
        urlFirmante: submission.urlFirmante,
      }), { status: 500 });
    }

    return new Response(JSON.stringify({
      ok: true,
      acta: insertada,
      urlFirmante: submission.urlFirmante,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Error en /api/actas/crear:', e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500 });
  }
}
