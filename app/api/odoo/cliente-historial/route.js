// v8.74.25: historial Odoo (cotizaciones + facturas) de un cliente para la ficha 360.
// GET /api/odoo/cliente-historial?rnc=130174768&nombre=ALAMSA%20SRL
import { NextResponse } from 'next/server';
import { historialClienteOdoo } from '../../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rnc = searchParams.get('rnc') || '';
    const nombre = searchParams.get('nombre') || '';
    if (!rnc && !nombre) return NextResponse.json({ error: 'rnc o nombre requerido' }, { status: 400 });
    return NextResponse.json(await historialClienteOdoo({ rnc, nombre }));
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
