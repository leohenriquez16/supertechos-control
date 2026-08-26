// v8.46.0: costos reales por cuenta analítica de Odoo (rentabilidad por obra).
// GET /api/odoo/costos-analitica?ids=123,456 → { totalCosto, totalIngreso, lineas }
import { NextResponse } from 'next/server';
import { costosAnaliticaOdoo } from '../../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = (searchParams.get('ids') || '').split(',').map(s => Number(s)).filter(n => n > 0);
    if (!ids.length) return NextResponse.json({ error: 'ids requerido' }, { status: 400 });
    const data = await costosAnaliticaOdoo(ids);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
