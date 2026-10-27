// app/api/odoo/cotizacion-ref/route.js
// v8.74.3: una cotización de Odoo por su referencia (ST-C5338) con sus áreas y productos —
// para llenar la garantía de obras de antes del ERP al abrir una reclamación.
import { obtenerCotizacionPorRef } from '../../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const ref = (new URL(request.url).searchParams.get('ref') || '').trim();
    if (!ref) return Response.json({ ok: false, error: 'Falta ref' }, { status: 400 });
    const cotizacion = await obtenerCotizacionPorRef(ref);
    return Response.json({ ok: true, cotizacion });
  } catch (e) {
    console.error('cotizacion-ref:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
