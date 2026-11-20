// v8.87.0: datos de Odoo (puesto, contrato, volantes) de un empleado del ERP — Empleado 360.
// GET /api/odoo/empleado?personaId=... — exige sesión y rol admin/owner; montos solo owner/nomina.
import { empleadoOdoo } from '../../../../lib/odoo';
import { verificarSesionInterna, tieneRolInterno } from '../../../../lib/server/sesionInterna';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const ses = await verificarSesionInterna(request);
  if (ses.error) return ses.error;
  if (!tieneRolInterno(ses, ['admin', 'owner', 'nomina'])) return Response.json({ error: 'Sin permiso' }, { status: 403 });
  const personaId = new URL(request.url).searchParams.get('personaId') || '';
  const { data: p } = await ses.db.from('personal').select('id, nombre, cedula_numero').eq('id', personaId).maybeSingle();
  if (!p) return Response.json({ error: 'Persona no encontrada' }, { status: 404 });
  try {
    const conMontos = tieneRolInterno(ses, ['owner', 'nomina']);
    return Response.json({ ...(await empleadoOdoo({ cedula: p.cedula_numero, nombre: p.nombre, conMontos })), conMontos });
  } catch (e) {
    return Response.json({ error: e?.message || 'Error Odoo' }, { status: 500 });
  }
}
