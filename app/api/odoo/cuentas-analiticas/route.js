// app/api/odoo/cuentas-analiticas/route.js
// v8.27.50: devuelve las cuentas analíticas (proyectos) de Odoo, read-only.
// El export de Facturas las usa para resolver el "número azul" (ST-C5737, PG-C1269…)
// al ID de la cuenta y armar el JSON de analytic_distribution que Odoo exige.

import { listarCuentasAnaliticasOdoo } from '../../../../lib/odoo';

export async function GET() {
  try {
    const cuentas = await listarCuentasAnaliticasOdoo();
    return Response.json({ ok: true, cuentas });
  } catch (e) {
    console.error('Error listando cuentas analíticas Odoo:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
