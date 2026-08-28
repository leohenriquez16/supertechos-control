// v8.49.5: salidas de almacén pendientes en Odoo (entregas de ventas confirmadas).
// GET /api/odoo/salidas-pendientes → { pendientes: [{pickingId, name, origin, cliente, fecha, items}] }
// READ-ONLY sobre Odoo — el ERP solo las lee para alistarlas en Almacén.
import { NextResponse } from 'next/server';
import { salidasPendientesOdoo } from '../../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await salidasPendientesOdoo();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
