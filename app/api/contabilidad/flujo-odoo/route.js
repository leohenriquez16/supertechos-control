// app/api/contabilidad/flujo-odoo/route.js
// v8.28.0: [Flujo de Caja] Todo lo que el tab necesita de Odoo en una llamada:
// CxC y CxP pendientes (con vencimiento, para ubicarlas por semana), saldos en
// libros de las cuentas de liquidez (referencia) y tasa USD del día.
// El cliente llama este endpoint porque lib/odoo.js usa process.env.

import { listarFacturasPendientesOdoo, listarSaldosLiquidezOdoo } from '../../../../lib/odoo';

export const maxDuration = 60;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get('empresa');
    if (!['super_techos', 'prouco'].includes(empresa)) {
      return Response.json({ ok: false, error: 'empresa inválida' }, { status: 400 });
    }

    // allSettled: si los saldos fallan, el flujo sigue sirviendo con CxC/CxP.
    const [cxcR, cxpR, saldosR] = await Promise.allSettled([
      listarFacturasPendientesOdoo(empresa, 'cxc'),
      listarFacturasPendientesOdoo(empresa, 'cxp'),
      listarSaldosLiquidezOdoo(empresa),
    ]);
    if (cxcR.status === 'rejected' && cxpR.status === 'rejected') {
      throw new Error(cxcR.reason?.message || 'Error consultando Odoo');
    }

    return Response.json({
      ok: true,
      cxc: cxcR.status === 'fulfilled' ? cxcR.value : [],
      cxp: cxpR.status === 'fulfilled' ? cxpR.value : [],
      saldosLibros: saldosR.status === 'fulfilled' ? saldosR.value.cuentas : [],
      tasaUsd: saldosR.status === 'fulfilled' ? saldosR.value.tasaUsd : null,
      advertencias: [
        ...(cxcR.status === 'rejected' ? ['CxC no disponible: ' + (cxcR.reason?.message || '')] : []),
        ...(cxpR.status === 'rejected' ? ['CxP no disponible: ' + (cxpR.reason?.message || '')] : []),
        ...(saldosR.status === 'rejected' ? ['Saldos en libros no disponibles: ' + (saldosR.reason?.message || '')] : []),
      ],
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'Error consultando Odoo' }, { status: 500 });
  }
}
