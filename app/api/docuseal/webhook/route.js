// v8.16: Webhook receiver de DocuSeal.
// DocuSeal nos avisa cuando una submission cambia de estado:
//   - form.viewed       → cliente abrió el link
//   - form.completed    → cliente firmó (todos los signers de un slot completaron)
//   - form.declined     → cliente rechazó (no aplica en nuestro UI, pero lo registramos)
//   - submission.completed → toda la submission completa (todos los slots firmaron)
//   - submission.expired   → expiró sin firmar
//
// Configuración del lado de DocuSeal:
//   - URL del webhook: https://supertechos-control.vercel.app/api/docuseal/webhook
//   - Secret: el mismo que el env var DOCUSEAL_WEBHOOK_SECRET
//
// El secret valida que el body realmente viene de DocuSeal.

export const runtime = 'edge';
export const maxDuration = 30;

import { createClient } from '@supabase/supabase-js';
import { verificarFirmaWebhook, descargarPdfFirmado } from '../../../../lib/docuseal';

export async function POST(req) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-docuseal-signature') || req.headers.get('X-DocuSeal-Signature');

    const valido = await verificarFirmaWebhook(rawBody, sig);
    if (!valido) {
      console.warn('Webhook DocuSeal con firma inválida — rechazado');
      return new Response('invalid signature', { status: 401 });
    }

    const evento = JSON.parse(rawBody);
    const tipo = evento.event_type;
    const data = evento.data || {};

    // El submission_id puede venir directamente o anidado según el evento
    const submissionId = data.submission_id || data.submission?.id || data.id;
    if (!submissionId) {
      return new Response(JSON.stringify({ error: 'submission_id no encontrado en payload' }), { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_KEY
    );

    // Buscar el acta vinculada al submission
    const { data: acta, error: errAct } = await supabase
      .from('actas_proyecto')
      .select('id, status, status_facturacion, tipo')
      .eq('docuseal_submission_id', String(submissionId))
      .maybeSingle();

    if (errAct || !acta) {
      // Acta no encontrada — devolvemos 200 para que DocuSeal no reintente eternamente
      console.warn(`Webhook DocuSeal: submission ${submissionId} sin acta asociada`);
      return new Response(JSON.stringify({ ignored: true }), { status: 200 });
    }

    const updates = { docuseal_payload: evento };
    const ahora = new Date().toISOString();

    switch (tipo) {
      case 'form.viewed':
        if (acta.status === 'enviada') {
          updates.status = 'vista';
          updates.vista_por_cliente_at = ahora;
        }
        break;

      case 'form.declined':
      case 'submission.declined':
        updates.status = 'rechazada';
        updates.rechazada_at = ahora;
        break;

      case 'form.completed':
      case 'submission.completed':
        if (acta.status !== 'firmada') {
          updates.status = 'firmada';
          updates.firmada_at = ahora;
          // Cubicaciones automáticamente quedan pendientes de facturar al firmar
          if (acta.tipo === 'cubicacion' && !acta.status_facturacion) {
            updates.status_facturacion = 'pendiente';
          }
          // Descargar el PDF firmado y guardarlo en Storage (best-effort, no bloquea)
          try {
            const blob = await descargarPdfFirmado(submissionId);
            const path = `${acta.id}/firmado.pdf`;
            const arrBuf = await blob.arrayBuffer();
            const { error: upErr } = await supabase.storage.from('actas-firmadas').upload(
              path,
              new Uint8Array(arrBuf),
              { contentType: 'application/pdf', upsert: true }
            );
            if (!upErr) updates.pdf_firmado_path = path;
          } catch (e) {
            console.warn('No se pudo descargar/guardar PDF firmado:', e?.message);
          }
        }
        break;

      case 'submission.expired':
        if (acta.status !== 'firmada') {
          updates.status = 'expirada';
        }
        break;

      default:
        // Otros eventos: solo guardamos el payload por si los necesitamos en el futuro
        break;
    }

    const { error: updErr } = await supabase
      .from('actas_proyecto')
      .update(updates)
      .eq('id', acta.id);

    if (updErr) {
      console.error('Error actualizando acta:', updErr);
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, acta_id: acta.id, evento: tipo }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Error procesando webhook DocuSeal:', e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500 });
  }
}
