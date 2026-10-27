// app/api/odoo/resumen-mensual/route.js
// v8.74.0: Aprobado vs Facturado por mes (Odoo, solo lectura, sin ITBIS, RD$) para Producción.
import { resumenMensualOdoo } from '../../../../lib/odoo';
import { agruparOdooPorMes } from '../../../../lib/helpers/resumenMensual';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const anioParam = Number(new URL(request.url).searchParams.get('anio'));
    const anio = anioParam >= 2020 && anioParam <= 2100 ? anioParam : new Date().getFullYear();
    const r = await resumenMensualOdoo(anio);
    return Response.json({ ok: true, anio, tasaUsd: r.tasaUsd, usdSinTasa: r.usdSinTasa, meses: agruparOdooPorMes(r, anio) });
  } catch (e) {
    console.error('resumen-mensual:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
