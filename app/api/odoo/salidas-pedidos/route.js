// v8.76: salidas de almacén de Odoo para amarrar los PEDIDOS de material (requisiciones).
// GET /api/odoo/salidas-pedidos?refs=ST-C5867,PG-C1269&codigos=REQ-0142,REQ-0150&desde=YYYY-MM-DD
//   → { porReferencia: { 'ST5867': [salida] }, porCodigo: { 'REQ-0142': [salida] } }
// Todas las salidas (outgoing) no canceladas, hechas y abiertas, creadas desde `desde`,
// cuyo origen menciona la cotización o el código REQ. El amarre fino pedido ↔ salida lo
// hace salidasDePedido (lib/helpers/requisiciones.js) en la pantalla.
// SOLO LECTURA sobre Odoo. Pide sesión (lib/server/sesionInterna.js; el cliente usa fetchConSesion).
import { NextResponse } from 'next/server';
import { salidasPorPedidos } from '../../../../lib/odoo';
import { verificarSesionInterna } from '../../../../lib/server/sesionInterna';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const lista = (v, max) => (v || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, max);

export async function GET(req) {
  const ses = await verificarSesionInterna(req);
  if (ses.error) return ses.error;
  try {
    const { searchParams } = new URL(req.url);
    const refs = lista(searchParams.get('refs'), 100);
    const codigos = lista(searchParams.get('codigos'), 300);
    const desde = (searchParams.get('desde') || '').trim();
    if (!refs.length && !codigos.length) return NextResponse.json({ error: 'Falta refs o codigos' }, { status: 400 });
    if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) return NextResponse.json({ error: 'desde debe ser YYYY-MM-DD' }, { status: 400 });
    const data = await salidasPorPedidos(refs, codigos, desde || null);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
