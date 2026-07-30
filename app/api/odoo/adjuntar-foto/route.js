// app/api/odoo/adjuntar-foto/route.js
// v8.27.57: adjunta la foto de una factura de gasto a su bill en Odoo (ir.attachment),
// casando por ref (= NCF) + compañía. ESCRIBE en Odoo (autorizado solo para adjuntos).
// POST { empresa, ref, base64, filename, mimetype }.

import { adjuntarFotoFacturaOdoo } from '../../../../lib/odoo';

export async function POST(request) {
  try {
    const { empresa, ref, base64, filename, mimetype } = await request.json();
    // quitar el prefijo data:...;base64, si viene como dataURL
    const limpio = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
    const r = await adjuntarFotoFacturaOdoo({ empresa, ref, base64: limpio, filename, mimetype });
    return Response.json(r);
  } catch (e) {
    console.error('Error adjuntando foto a Odoo:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
