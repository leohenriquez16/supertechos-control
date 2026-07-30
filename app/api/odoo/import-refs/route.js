// app/api/odoo/import-refs/route.js
// v8.27.51: referencias de Odoo (read-only) para armar el CSV de importación de facturas:
//  - cuentas analíticas (proyectos) → resolver el "número azul" a id (analytic_distribution JSON)
//  - productos de compra → resolver el concepto al nombre EXACTO (match case-sensitive de Odoo)
//  - proveedores por RNC → resolver el nombre EXACTO y evitar duplicados
// POST { rncs: string[] } (los RNC presentes en la exportación, para acotar la búsqueda).

import { listarCuentasAnaliticasOdoo, listarProductosCompraOdoo, buscarProveedoresPorRncOdoo } from '../../../../lib/odoo';

export async function POST(request) {
  try {
    let rncs = [];
    try { const body = await request.json(); rncs = Array.isArray(body?.rncs) ? body.rncs : []; } catch { /* sin body */ }
    const [cuentas, prod, proveedores] = await Promise.all([
      listarCuentasAnaliticasOdoo(),
      listarProductosCompraOdoo(),
      buscarProveedoresPorRncOdoo(rncs),
    ]);
    return Response.json({
      ok: true,
      cuentas,
      productos: prod.productos,
      cuentasProducto: prod.cuentas,
      cuentaDefault: prod.cuentaDefault,
      proveedores,
    });
  } catch (e) {
    console.error('Error import-refs Odoo:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
