// app/api/cron/garantias-por-factura/route.js
// v8.27.21 (Fase 3): cron que, para proyectos con acta de entrega FIRMADA y
// SIN carta de garantía aún, revisa en Odoo si la factura ya está SALDADA;
// si lo está, emite automáticamente la carta de garantía vía DocuSeal.
//
// Protegido por `Authorization: Bearer <CRON_SECRET>` (lo envía Vercel Cron).

import { createClient } from '@supabase/supabase-js';
import { buscarFacturasDeSO } from '../../../../lib/odoo';
import { crearSubmission } from '../../../../lib/docuseal';

export const maxDuration = 120;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_KEY);

const fmt = (s) => { try { return new Date(s).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };
const addAnios = (iso, n) => { try { const d = new Date(iso); d.setFullYear(d.getFullYear() + Number(n || 0)); return fmt(d.toISOString()); } catch { return '—'; } };
const templateCarta = (empresa) => empresa === 'prouco'
  ? process.env.DOCUSEAL_TEMPLATE_CARTA_GARANTIA_PROUCO_ID
  : process.env.DOCUSEAL_TEMPLATE_CARTA_GARANTIA_ST_ID;

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  if (!process.env.CRON_SECRET) return Response.json({ ok: false, error: 'CRON_SECRET no configurado' }, { status: 500 });
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const resumen = { revisados: 0, emitidas: 0, errores: [] };
  try {
    // Actas de entrega FIRMADAS
    const { data: firmadas } = await supabase.from('actas_proyecto')
      .select('proyecto_id, area_ids, area_id, firmada_at, cliente_nombre, cliente_email, empresa')
      .in('tipo', ['entrega_proyecto', 'entrega_area']).eq('status', 'firmada');
    // Proyectos que ya tienen carta de garantía (para no duplicar)
    const { data: cartas } = await supabase.from('actas_proyecto')
      .select('proyecto_id').eq('tipo', 'carta_garantia');
    const conCarta = new Set((cartas || []).map(c => c.proyecto_id));

    // Agrupar entregas firmadas por proyecto (sin carta aún)
    const porProyecto = {};
    for (const a of (firmadas || [])) {
      if (conCarta.has(a.proyecto_id)) continue;
      (porProyecto[a.proyecto_id] = porProyecto[a.proyecto_id] || []).push(a);
    }

    for (const [proyId, entregas] of Object.entries(porProyecto)) {
      resumen.revisados++;
      try {
        const { data: proy } = await supabase.from('proyectos')
          .select('id, referencia_odoo, cliente, empresa_ejecutora, ubicacion_direccion_texto, areas')
          .eq('id', proyId).maybeSingle();
        if (!proy?.referencia_odoo) continue;

        // ¿Factura saldada en Odoo?
        const facturas = await buscarFacturasDeSO(proy.referencia_odoo);
        if (!facturas.length) continue;
        const total = facturas.reduce((s, f) => s + (Number(f.monto_total) || 0), 0);
        const pagado = facturas.reduce((s, f) => s + (Number(f.monto_pagado) || 0), 0);
        if (total <= 0 || (total - pagado) > 1) continue; // aún no saldada

        // Email del cliente (de alguna entrega)
        const email = entregas.map(e => e.cliente_email).find(Boolean);
        if (!email) { resumen.errores.push(`${proyId}: sin email de cliente`); continue; }

        // Áreas + fechas de entrega
        const areasMap = {};
        (proy.areas || []).forEach(a => { areasMap[a.id] = a.nombre; });
        const anios = 5;
        const lineas = [];
        entregas.forEach(e => {
          const ids = (e.area_ids && e.area_ids.length) ? e.area_ids : (e.area_id ? [e.area_id] : []);
          ids.forEach(id => lineas.push(`• ${areasMap[id] || 'Área'} — entregada ${fmt(e.firmada_at)} — garantía ${anios} años, vence ${addAnios(e.firmada_at, anios)}`));
        });
        const areasGarantia = lineas.join('\n');
        const empresa = proy.empresa_ejecutora || entregas[0]?.empresa || 'super_techos';
        const tpl = templateCarta(empresa);
        if (!tpl) { resumen.errores.push(`${proyId}: template carta no configurado`); continue; }

        const submission = await crearSubmission({
          templateId: tpl,
          submitter: { email, name: proy.cliente || entregas[0]?.cliente_nombre || 'Cliente', values: {
            cliente: proy.cliente || '', fecha: fmt(new Date().toISOString()),
            ref_cotizacion: proy.referencia_odoo, trabajo: '', ubicacion: proy.ubicacion_direccion_texto || '',
            areas_garantia: areasGarantia,
          } },
          enviarPorEmail: true,
        });

        const id = 'act_' + Date.now() + Math.random().toString(36).slice(2, 7);
        await supabase.from('actas_proyecto').insert({
          id, proyecto_id: proyId, tipo: 'carta_garantia', empresa,
          area_ids: entregas.flatMap(e => (e.area_ids?.length ? e.area_ids : (e.area_id ? [e.area_id] : []))),
          cliente_nombre: proy.cliente, cliente_email: email, cliente_via_envio: 'email',
          docuseal_submission_id: String(submission.submissionId || submission.submitterId),
          docuseal_url_firmante: submission.urlFirmante, docuseal_payload: submission.raw || null,
          status: 'enviada', enviada_at: new Date().toISOString(), status_facturacion: 'no_aplica',
          garantia_anios: anios, snapshot_datos: { areas: areasGarantia, origen: 'auto_factura_saldada' },
        });
        resumen.emitidas++;
      } catch (e) {
        resumen.errores.push(`${proyId}: ${e?.message || e}`);
      }
    }
    return Response.json({ ok: true, ...resumen });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e), ...resumen }, { status: 500 });
  }
}
