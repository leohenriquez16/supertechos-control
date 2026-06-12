// app/api/contabilidad/catalogo-odoo/route.js
// v8.26.1: [Contabilidad Fase 2] Catálogo de cuentas + diarios de la empresa,
// leídos de Odoo (read-only). El cliente los importa a cont_cuentas/cont_diarios
// con db.reemplazarCatalogoContable (botón "Importar desde Odoo").

import { listarCatalogoContableOdoo } from '../../../../lib/odoo';

export const maxDuration = 60;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get('empresa');
    if (!['super_techos', 'prouco'].includes(empresa)) {
      return Response.json({ ok: false, error: 'empresa inválida' }, { status: 400 });
    }
    const { cuentas, diarios } = await listarCatalogoContableOdoo(empresa);
    return Response.json({ ok: true, cuentas, diarios });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'Error consultando Odoo' }, { status: 500 });
  }
}
