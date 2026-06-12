// app/api/contabilidad/pendientes-odoo/route.js
// v8.26.1: [Contabilidad Fase 2] Cuentas por Pagar / Cobrar — facturas posteadas
// con saldo pendiente, leídas de Odoo (read-only) mientras la facturación nativa
// llega en Fase 3. El cliente llama este endpoint porque lib/odoo.js usa process.env.

import { listarFacturasPendientesOdoo } from '../../../../lib/odoo';

export const maxDuration = 60;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get('empresa');
    const tipo = searchParams.get('tipo'); // 'cxp' | 'cxc'

    if (!['super_techos', 'prouco'].includes(empresa)) {
      return Response.json({ ok: false, error: 'empresa inválida' }, { status: 400 });
    }
    if (!['cxp', 'cxc'].includes(tipo)) {
      return Response.json({ ok: false, error: 'tipo inválido (cxp|cxc)' }, { status: 400 });
    }

    const facturas = await listarFacturasPendientesOdoo(empresa, tipo);
    return Response.json({ ok: true, facturas });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'Error consultando Odoo' }, { status: 500 });
  }
}
