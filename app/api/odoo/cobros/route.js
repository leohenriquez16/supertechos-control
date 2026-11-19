// v8.83.0: facturado y cobrado por cotización (portafolio de rentabilidad).
// GET /api/odoo/cobros?refs=ST-C5173,ST-C5893 → { porReferencia: { '5173': {...} } }
import { NextResponse } from 'next/server';
import { cobrosPorReferenciaOdoo } from '../../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const refs = (searchParams.get('refs') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!refs.length) return NextResponse.json({ error: 'refs requerido' }, { status: 400 });
    return NextResponse.json(await cobrosPorReferenciaOdoo(refs));
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
