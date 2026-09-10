// app/api/torre-control/estado-odoo/route.js
// v8.53.0 (Fase 3A): estado real de las cotizaciones en Odoo para la Torre de Control (vista viva).
// Odoo solo corre server-side; la vista (cliente) llama aquí y mezcla el estado por proyecto.
// Devuelve { [projectId]: 'draft'|'sent'|'sale'|'cancel' } — el MEJOR estado entre sus referencias.

import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY);

export async function GET() {
  try {
    const { data: sites } = await supabase.schema('surveys').from('sites')
      .select('project_id, referencia_odoo').not('referencia_odoo', 'is', null);
    const refsPorProy = {};
    (sites || []).forEach((s) => { const r = (s.referencia_odoo || '').trim(); if (r) (refsPorProy[s.project_id] = refsPorProy[s.project_id] || []).push(r); });
    const todasRefs = [...new Set(Object.values(refsPorProy).flat())];
    if (!todasRefs.length) return Response.json({ ok: true, estados: {} });

    const { estadoCotizacionesOdoo } = await import('../../../../lib/odoo');
    const estados = await estadoCotizacionesOdoo(todasRefs);
    const rank = { sale: 3, sent: 2, draft: 1, cancel: 0 };
    const out = {};
    Object.entries(refsPorProy).forEach(([pid, refs]) => {
      let best = null;
      refs.forEach((r) => { const e = estados[r]; if (e && (best === null || (rank[e] ?? -1) > (rank[best] ?? -1))) best = e; });
      if (best) out[pid] = best;
    });
    return Response.json({ ok: true, estados: out });
  } catch (e) {
    return Response.json({ ok: false, motivo: e?.message || 'error', estados: {} }, { status: 200 });
  }
}
