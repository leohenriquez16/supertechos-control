// app/api/contabilidad/ventas-odoo/route.js
// v8.26.0: Fuente del reporte 607 (DGII) durante la transición a facturación
// nativa — lee de Odoo las facturas de venta posteadas de una empresa en un
// mes. El cliente (VistaContabilidad) llama este endpoint vía fetch porque
// lib/odoo.js usa process.env (solo servidor).

import { listarFacturasVenta } from '../../../../lib/odoo';

export const maxDuration = 60;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get('empresa');
    const anio = parseInt(searchParams.get('anio'), 10);
    const mes = parseInt(searchParams.get('mes'), 10);

    if (!['super_techos', 'prouco'].includes(empresa)) {
      return Response.json({ ok: false, error: 'empresa inválida' }, { status: 400 });
    }
    if (!anio || !mes || mes < 1 || mes > 12) {
      return Response.json({ ok: false, error: 'anio/mes inválidos' }, { status: 400 });
    }

    const ventas = await listarFacturasVenta(empresa, anio, mes);
    return Response.json({ ok: true, ventas });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'Error consultando Odoo' }, { status: 500 });
  }
}
