// app/api/odoo/test/route.js
// Endpoint para verificar conexión con Odoo
// GET /api/odoo/test → { ok: true } si funciona, { ok: false, error: '...' } si no

import { testConexion, listarCotizacionesAprobadas } from '../../../../lib/odoo';

export async function GET(request) {
  try {
    // Paso 1: verificar credenciales
    const test = await testConexion();
    if (!test.ok) {
      return Response.json({ ok: false, error: test.error }, { status: 500 });
    }

    // Paso 2: probar consulta real (lista cotizaciones aprobadas)
    const url = new URL(request.url);
    const incluirCotizaciones = url.searchParams.get('full') === '1';

    if (incluirCotizaciones) {
      const cotizaciones = await listarCotizacionesAprobadas();
      return Response.json({
        ok: true,
        autenticado: true,
        uid: test.uid,
        db: test.db,
        cotizacionesAprobadas: cotizaciones.length,
        ejemplo: cotizaciones.slice(0, 3), // muestra primeras 3
      });
    }

    return Response.json({
      ok: true,
      autenticado: true,
      uid: test.uid,
      db: test.db,
      mensaje: 'Conexión a Odoo OK. Para ver cotizaciones, agrega ?full=1 a la URL',
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
