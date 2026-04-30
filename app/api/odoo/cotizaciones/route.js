// app/api/odoo/cotizaciones/route.js
// v8.10.23: Endpoint para listar cotizaciones aprobadas desde Odoo

import { listarCotizacionesAprobadas } from '../../../../lib/odoo';

export async function GET() {
  try {
    const cotizaciones = await listarCotizacionesAprobadas();
    return Response.json({ ok: true, cotizaciones });
  } catch (e) {
    console.error('Error listando cotizaciones Odoo:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
