// v8.47.0: salidas de almacén de Odoo por referencia de cotización (rentabilidad).
// GET /api/odoo/salidas-almacen?refs=ST-C5716,ST-C5734 → { pickings, productos }
// v8.76: &prefijo=1 → solo salidas con la cotización exacta (prefijo ST/PG + número) en el origen
// v8.74.15: &agrupar=1 → { porReferencia: { '5716': { productos } } } (portafolio)
import { NextResponse } from 'next/server';
import { salidasAlmacenOdoo } from '../../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const refs = (searchParams.get('refs') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!refs.length) return NextResponse.json({ error: 'refs requerido' }, { status: 400 });
    const data = await salidasAlmacenOdoo(refs, {
      agruparPorReferencia: searchParams.get('agrupar') === '1',
      conPrefijo: searchParams.get('prefijo') === '1',
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
