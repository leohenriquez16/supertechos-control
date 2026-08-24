// v8.41.0: búsqueda de suplidores en Odoo (para vincular suplidores del ERP).
import { buscarSuplidoresOdoo } from '../../../../lib/odoo';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams.get('q') || '';
    if (q.trim().length < 3) return Response.json({ resultados: [] });
    const resultados = await buscarSuplidoresOdoo(q);
    return Response.json({ resultados });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
