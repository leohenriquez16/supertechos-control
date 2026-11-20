// v8.88.0: cotizaciones de Odoo de un cliente de Programas (Sites), para amarrar cada
// locación con su cotización por el código de la antena aunque no haya levantamiento.
// GET /api/odoo/cotizaciones-programa?cliente=TOWERS AND SITES DOMINICANA
//   → { cotizaciones: [{ nombre, estado, fecha, texto, montoSinItbis }] }
// SOLO LECTURA sobre Odoo. Pide sesión (el cliente usa fetchConSesion).
import { NextResponse } from 'next/server';
import { cotizacionesProgramaOdoo } from '../../../../lib/odoo';
import { verificarSesionInterna } from '../../../../lib/server/sesionInterna';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const ses = await verificarSesionInterna(req);
  if (ses.error) return ses.error;
  try {
    const cliente = (new URL(req.url).searchParams.get('cliente') || '').trim();
    if (cliente.length < 4) return NextResponse.json({ error: 'Falta cliente' }, { status: 400 });
    return NextResponse.json({ cotizaciones: await cotizacionesProgramaOdoo(cliente) });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
