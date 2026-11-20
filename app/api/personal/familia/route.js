// v8.89.0: familia y datos personales del empleado (Empleado 360).
// Tablas con RLS ON sin políticas: solo se llega por aquí (service role).
// Ven/editan: la propia persona, o admin / owner / nomina. Supervisores NO (decisión de Leo 20-nov-2026).
import { verificarSesionInterna, tieneRolInterno } from '../../../../lib/server/sesionInterna';

export const dynamic = 'force-dynamic';

const RRHH = ['estado_civil', 'sexo', 'nacionalidad', 'nivel_estudios', 'profesion'];
const txt = (v, n = 120) => (v == null ? null : String(v).trim().slice(0, n) || null);
const fechaOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

async function permiso(request, personaId) {
  const ses = await verificarSesionInterna(request);
  if (ses.error) return { error: ses.error };
  if (!personaId) return { error: Response.json({ error: 'Falta personaId' }, { status: 400 }) };
  const propio = ses.persona?.id === personaId;
  if (!propio && !tieneRolInterno(ses, ['admin', 'owner', 'nomina'])) return { error: Response.json({ error: 'Sin permiso' }, { status: 403 }) };
  return { ses };
}

async function leer(db, personaId) {
  const [r, f] = await Promise.all([
    db.from('personal_rrhh').select('*').eq('persona_id', personaId).maybeSingle(),
    db.from('personal_familia').select('*').eq('persona_id', personaId).order('fecha_nacimiento', { ascending: true, nullsFirst: false }),
  ]);
  return { rrhh: r.data || {}, familia: f.data || [] };
}

export async function GET(request) {
  const personaId = new URL(request.url).searchParams.get('personaId') || '';
  const { ses, error } = await permiso(request, personaId);
  if (error) return error;
  return Response.json(await leer(ses.db, personaId));
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const personaId = String(body.personaId || '');
  const { ses, error } = await permiso(request, personaId);
  if (error) return error;
  const db = ses.db; const quien = ses.persona?.nombre || ses.persona?.id || 'sistema';
  const ahora = new Date().toISOString();

  if (body.rrhh) {
    const fila = { persona_id: personaId, updated_at: ahora, updated_by: quien };
    RRHH.forEach(k => { fila[k] = txt(body.rrhh[k]); });
    const { error: e } = await db.from('personal_rrhh').upsert(fila);
    if (e) return Response.json({ error: e.message }, { status: 500 });
  }
  if (Array.isArray(body.familia)) {
    const filas = body.familia.slice(0, 40).filter(x => txt(x?.nombre) && txt(x?.parentesco)).map((x, i) => ({
      id: txt(x.id, 60) || `fam_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      persona_id: personaId, parentesco: txt(x.parentesco, 40), nombre: txt(x.nombre), fecha_nacimiento: fechaOk(x.fecha_nacimiento),
      cedula: txt(x.cedula, 20), telefono: txt(x.telefono, 30), dependiente: !!x.dependiente, nota: txt(x.nota, 300),
      updated_at: ahora, updated_by: quien,
    }));
    const ids = filas.map(f => f.id);
    // borrar los que el usuario quitó (solo de esta persona)
    let q = db.from('personal_familia').delete().eq('persona_id', personaId);
    if (ids.length) q = q.not('id', 'in', `(${ids.map(i => `"${i.replace(/"/g, '')}"`).join(',')})`);
    const { error: e1 } = await q;
    if (e1) return Response.json({ error: e1.message }, { status: 500 });
    if (filas.length) {
      const { error: e2 } = await db.from('personal_familia').upsert(filas);
      if (e2) return Response.json({ error: e2.message }, { status: 500 });
    }
  }
  return Response.json(await leer(db, personaId));
}
