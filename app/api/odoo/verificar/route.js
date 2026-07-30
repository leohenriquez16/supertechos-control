// app/api/odoo/verificar/route.js
// v8.27.61: verifica que las facturas exportadas entraron en Odoo (casa por ref=NCF +
// compañía). Read-only. POST { items: [{ncf, empresa}] } → { ok, resultado: {ncf: {...}} }.

import { verificarFacturasEnOdoo } from '../../../../lib/odoo';

export async function POST(request) {
  try {
    let items = [];
    try { const body = await request.json(); items = Array.isArray(body?.items) ? body.items : []; } catch { /* sin body */ }
    const resultado = await verificarFacturasEnOdoo(items);
    return Response.json({ ok: true, resultado });
  } catch (e) {
    console.error('Error verificando facturas en Odoo:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
