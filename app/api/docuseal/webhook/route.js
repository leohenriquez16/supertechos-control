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
      .select('id, status, status_facturacion, tipo, proyecto_id, cliente_nombre')
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

    // v8.27.21 (Fase 3): al FIRMAR un acta de ENTREGA, el proyecto pasa a
    // "recibido conforme" y se avisa por correo a admins/contabilidad para facturar.
    // Best-effort: si algo falla, no rompemos el 200 al webhook.
    if (updates.status === 'firmada' && (acta.tipo === 'entrega_proyecto' || acta.tipo === 'entrega_area')) {
      try {
        const { data: proy } = await supabase
          .from('proyectos')
          .select('id, referencia_odoo, cliente, estado')
          .eq('id', acta.proyecto_id)
          .maybeSingle();
        if (proy && proy.estado !== 'finalizado_recibido_conforme') {
          await supabase.from('proyectos')
            .update({ estado: 'finalizado_recibido_conforme' })
            .eq('id', proy.id);
        }
        // Email a admins (incluye a Yamel cuando tenga email) para emitir la factura.
        const { data: admins } = await supabase.from('personal')
          .select('email, roles').contains('roles', ['admin']);
        const destinos = [...new Set((admins || []).map(a => a.email).filter(Boolean))];
        if (destinos.length) {
          const ref = proy?.referencia_odoo || proy?.cliente || acta.proyecto_id;
          const html = `<div style="font-family:Arial;padding:20px;"><h2 style="color:#CC0000;">Acta de entrega firmada — listo para facturar</h2>`
            + `<p>El cliente <b>${acta.cliente_nombre || ''}</b> firmó el acta de entrega de <b>${ref}</b>.</p>`
            + `<p>El proyecto pasó a <b>Recibido conforme</b>. Procede a emitir la factura.</p></div>`;
          const origin = new URL(req.url).origin;
          await fetch(`${origin}/api/enviar-reporte`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinatarios: destinos, asunto: `[${ref}] Acta firmada — listo para facturar`, html }),
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('Post-firma (recibido conforme/email) falló:', e?.message);
      }
    }

    // v8.27.22 (Fase 6): al FIRMAR la carta de garantía, se ACTIVA la garantía en
    // el módulo (tabla garantias) y se agendan los mantenimientos obligatorios
    // (inspecciones cada N meses según el sistema), igual que el flujo actual.
    if (updates.status === 'firmada' && acta.tipo === 'carta_garantia') {
      try {
        const yaExiste = await supabase.from('garantias').select('id').eq('proyecto_id', acta.proyecto_id).limit(1);
        if (!(yaExiste.data && yaExiste.data.length)) {
          const { data: p } = await supabase.from('proyectos')
            .select('id, cliente_id, ubicacion_id, referencia_odoo, sistema_id, valor_cotizacion, areas')
            .eq('id', acta.proyecto_id).maybeSingle();
          if (p) {
            const { data: sis } = await supabase.from('sistemas').select('*').eq('id', p.sistema_id).maybeSingle();
            const sumarMeses = (iso, n) => { const d = new Date(iso); d.setMonth(d.getMonth() + Number(n || 0)); return d.toISOString().split('T')[0]; };
            const hoy = new Date().toISOString().split('T')[0];
            const duracion = sis?.garantia_meses || 60;
            const cadaMeses = sis?.mantenimiento_cada_meses || 24;
            const venc = sumarMeses(hoy, duracion);
            const m2 = (p.areas || []).reduce((a, ar) => a + (Number(ar.m2) || 0), 0);
            const garId = 'gar_' + Date.now() + Math.random().toString(36).slice(2, 6);
            await supabase.from('garantias').insert({
              id: garId, cliente_id: p.cliente_id || null, ubicacion_id: p.ubicacion_id || null,
              proyecto_id: p.id, referencia_cotizacion: p.referencia_odoo || null,
              sistema_id: p.sistema_id || null, sistema_nombre: sis?.data?.nombre || null,
              fecha_inicio: hoy, duracion_meses: duracion, fecha_vencimiento: venc, estado: 'vigente',
              cobertura: sis?.data?.cobertura || null, condicion: sis?.data?.condicion || null,
              m2, monto: p.valor_cotizacion ?? null, origen: 'auto_carta_firmada',
            });
            // Agendar mantenimientos (inspecciones obligatorias cada `cadaMeses`).
            if (cadaMeses) {
              const mants = []; let n = cadaMeses, i = 0;
              while (i < 120) { const f = sumarMeses(hoy, n); if (f > venc) break; mants.push({ id: 'man_' + Date.now() + i + Math.random().toString(36).slice(2, 5), garantia_id: garId, cliente_id: p.cliente_id || null, ubicacion_id: p.ubicacion_id || null, tipo: 'inspeccion', obligatorio: true, fecha_programada: f, estado: 'pendiente' }); n += cadaMeses; i++; }
              if (mants.length) await supabase.from('mantenimientos').insert(mants);
            }
          }
        }
      } catch (e) { console.warn('Activar garantía tras firma falló:', e?.message); }
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
