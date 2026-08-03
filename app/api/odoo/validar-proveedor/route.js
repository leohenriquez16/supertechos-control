// app/api/odoo/validar-proveedor/route.js
// v8.27.63: valida el proveedor contra Odoo (read-only) al capturar una factura.
// POST { rnc, nombre } → { ok, porRnc, porNombre }.

import { validarProveedorOdoo } from '../../../../lib/odoo';

export async function POST(request) {
  try {
    let rnc = '', nombre = '';
    try { const b = await request.json(); rnc = b?.rnc || ''; nombre = b?.nombre || ''; } catch { /* sin body */ }
    const r = await validarProveedorOdoo({ rnc, nombre });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.error('Error validando proveedor en Odoo:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
