// v8.47.0: salidas de almacén de Odoo por referencia de cotización (rentabilidad).
// GET /api/odoo/salidas-almacen?refs=ST-C5716,ST-C5734 → { pickings, productos }
import { NextResponse } from 'next/server';
import { salidasAlmacenOdoo } from '../../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const refs = (searchParams.get('refs') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!refs.length) return NextResponse.json({ error: 'refs requerido' }, { status: 400 });
    const data = await salidasAlmacenOdoo(refs);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
