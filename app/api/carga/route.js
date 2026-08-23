// v8.30.2: Actividad de Odoo para el tablero "Carga y Actividad" (solo lectura).
// GET /api/carga?dias=30 → conteos por usuario de Odoo + ciclo de OCs + cola en borrador.
import { NextResponse } from 'next/server';
import { resumenActividadOdoo } from '../../../lib/odoo';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const dias = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get('dias')) || 30));
    const d = new Date(); d.setDate(d.getDate() - dias);
    const desde = d.toISOString().slice(0, 19).replace('T', ' ');
    const resumen = await resumenActividadOdoo(desde);
    return NextResponse.json({ ok: true, dias, ...resumen });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
