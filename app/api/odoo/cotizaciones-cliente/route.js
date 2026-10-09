// app/api/odoo/cotizaciones-cliente/route.js
// v8.63.0: cotizaciones de un cliente en Odoo (solo lectura) — para amarrar
// reclamaciones de obras que existían antes del ERP.
import { buscarCotizacionesClienteOdoo } from '../../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams.get('q') || '';
    if (q.trim().length < 3) return Response.json({ ok: true, cotizaciones: [] });
    const cotizaciones = await buscarCotizacionesClienteOdoo(q.trim());
    return Response.json({ ok: true, cotizaciones });
  } catch (e) {
    console.error('cotizaciones-cliente:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
