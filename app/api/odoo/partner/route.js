// app/api/odoo/partner/route.js
// Endpoint para obtener datos completos de un partner (cliente) de Odoo

import { obtenerPartner } from '../../../../lib/odoo';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    const id = parseInt(idParam, 10);
    if (!idParam || isNaN(id)) {
      return Response.json({ ok: false, error: 'Falta parámetro id' }, { status: 400 });
    }
    const partner = await obtenerPartner(id);
    return Response.json({ ok: true, partner });
  } catch (e) {
    console.error('Error obteniendo partner Odoo:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
