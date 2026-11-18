// Verificación mínima de sesión para las rutas internas de /api (GPS de la flota, rutas).
// Antes /api/gps/posiciones respondía a cualquiera: con el repo público, cualquiera
// podía ver dónde está cada camión. Esto cierra eso SIN romper el login actual.
//
// Acepta, en orden:
//   1. Authorization: Bearer <access_token de Supabase>  (sesión real; ~1/3 del
//      personal la tiene hoy porque solo se emite si la persona tiene auth_user_id).
//      Se valida con Supabase y se busca la persona activa por auth_user_id.
//   2. x-usuario-id: <personal.id>  (el mismo id que la app guarda en localStorage
//      'supertechos_usuario_id' al iniciar sesión). Se exige que sea una persona
//      ACTIVA. Es débil (el id no es secreto), pero corta el acceso anónimo; se
//      quita cuando todo el personal tenga sesión Supabase (Fase 2 Auth).
//   3. Authorization: Bearer <CRON_SECRET>  solo si se pide { permitirCron: true }.
//
// El cliente manda estos headers con lib/fetchConSesion.js.
import { sbServicio } from './portalAuth';

const noAutorizado = () => Response.json({ error: 'Inicia sesión para ver esto.' }, { status: 401 });

/** @returns {Promise<{db, persona: {id, nombre} | null, via: 'supabase'|'usuario'|'cron'} | {error: Response}>} */
export async function verificarSesionInterna(request, { permitirCron = false } = {}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: Response.json({ error: 'Falta configuración de Supabase en el servidor' }, { status: 500 }) };
  }
  const db = sbServicio();
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (bearer && permitirCron && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) {
    return { db, persona: null, via: 'cron' };
  }
  if (bearer) {
    try {
      const { data, error } = await db.auth.getUser(bearer);
      if (!error && data?.user?.id) {
        const { data: p } = await db.from('personal').select('id, nombre, activo')
          .eq('auth_user_id', data.user.id).maybeSingle();
        if (p && p.activo !== false) return { db, persona: { id: p.id, nombre: p.nombre }, via: 'supabase' };
      }
    } catch { /* cae al siguiente método */ }
  }
  const usuarioId = (request.headers.get('x-usuario-id') || '').trim();
  if (usuarioId && usuarioId.length <= 64) {
    const { data: p } = await db.from('personal').select('id, nombre, activo').eq('id', usuarioId).maybeSingle();
    if (p && p.activo !== false) return { db, persona: { id: p.id, nombre: p.nombre }, via: 'usuario' };
  }
  return { error: noAutorizado() };
}
