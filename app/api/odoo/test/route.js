// app/api/odoo/test/route.js
// Endpoint de diagnóstico — muestra qué env vars están disponibles SIN revelar valores

import { testConexion, listarCotizacionesAprobadas } from '../../../../lib/odoo';

export async function GET(request) {
  // v8.10.15: Diagnóstico mejorado
  // Primero: revisar qué env vars existen (sin revelar valores)
  const debug = {
    ODOO_URL_exists: !!process.env.ODOO_URL,
    ODOO_URL_length: (process.env.ODOO_URL || '').length,
    ODOO_URL_starts: (process.env.ODOO_URL || '').slice(0, 8),
    ODOO_DB_exists: !!process.env.ODOO_DB,
    ODOO_DB_length: (process.env.ODOO_DB || '').length,
    ODOO_USERNAME_exists: !!process.env.ODOO_USERNAME,
    ODOO_USERNAME_length: (process.env.ODOO_USERNAME || '').length,
    ODOO_API_KEY_exists: !!process.env.ODOO_API_KEY,
    ODOO_API_KEY_length: (process.env.ODOO_API_KEY || '').length,
    todas_las_env_keys_que_empiezan_con_ODOO: Object.keys(process.env).filter(k => k.startsWith('ODOO')),
  };

  if (!debug.ODOO_URL_exists || !debug.ODOO_DB_exists || !debug.ODOO_USERNAME_exists || !debug.ODOO_API_KEY_exists) {
    return Response.json({
      ok: false,
      error: 'Faltan variables de entorno',
      debug,
    }, { status: 500 });
  }

  try {
    const test = await testConexion();
    if (!test.ok) {
      return Response.json({ ok: false, error: test.error, debug }, { status: 500 });
    }

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
        ejemplo: cotizaciones.slice(0, 3),
      });
    }

    return Response.json({
      ok: true,
      autenticado: true,
      uid: test.uid,
      db: test.db,
      mensaje: 'Conexión a Odoo OK. Para ver cotizaciones, agrega ?full=1 a la URL',
      debug,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message, debug }, { status: 500 });
  }
}
