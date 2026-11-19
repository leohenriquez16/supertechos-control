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
//      ACTIVA.
//      ⚠ ESTO ES FRICCIÓN, NO AUTENTICACIÓN. El id no es secreto (tiene forma de
//      timestamp) y, con RLS OFF y la anon key en el bundle de un repo público,
//      cualquiera puede listar personal.id y mandarlo aquí. Solo corta el acceso
//      anónimo casual. Por eso las rutas que ESCRIBEN además exigen rol
//      (tieneRolInterno) y tienen límite de frecuencia (lib/server/limiteFrecuencia.js).
//      El cierre de verdad es la Fase 2 Auth: exigir el JWT de Supabase (método 1)
//      cuando todo el personal tenga auth_user_id, y quitar este método.
//   3. Authorization: Bearer <CRON_SECRET>  solo si se pide { permitirCron: true }.
//
// El cliente manda estos headers con lib/fetchConSesion.js.
import { timingSafeEqual } from 'crypto';
import { sbServicio } from './portalAuth';

const noAutorizado = () => Response.json({ error: 'Inicia sesión para ver esto.' }, { status: 401 });

// Comparación en tiempo constante (para el CRON_SECRET).
function igualSeguro(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ¿La persona de la sesión tiene alguno de estos roles? (personal.roles es un
// arreglo de texto, igual que tieneRol en app/page.jsx). El cron pasa siempre.
export function tieneRolInterno(ses, roles) {
  if (ses?.via === 'cron') return true;
  const r = Array.isArray(ses?.persona?.roles) ? ses.persona.roles : [];
  return roles.some(x => r.includes(x));
}

/** @returns {Promise<{db, persona: {id, nombre, roles} | null, via: 'supabase'|'usuario'|'cron'} | {error: Response}>} */
export async function verificarSesionInterna(request, { permitirCron = false } = {}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: Response.json({ error: 'Falta configuración de Supabase en el servidor' }, { status: 500 }) };
  }
  const db = sbServicio();
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (bearer && permitirCron && process.env.CRON_SECRET && igualSeguro(bearer, process.env.CRON_SECRET)) {
    return { db, persona: null, via: 'cron' };
  }
  if (bearer) {
    try {
      const { data, error } = await db.auth.getUser(bearer);
      if (!error && data?.user?.id) {
        const { data: p } = await db.from('personal').select('id, nombre, activo, roles')
          .eq('auth_user_id', data.user.id).maybeSingle();
        if (p && p.activo !== false) return { db, persona: { id: p.id, nombre: p.nombre, roles: p.roles || [] }, via: 'supabase' };
      }
    } catch { /* cae al siguiente método */ }
  }
  const usuarioId = (request.headers.get('x-usuario-id') || '').trim();
  if (usuarioId && usuarioId.length <= 64) {
    const { data: p } = await db.from('personal').select('id, nombre, activo, roles').eq('id', usuarioId).maybeSingle();
    if (p && p.activo !== false) return { db, persona: { id: p.id, nombre: p.nombre, roles: p.roles || [] }, via: 'usuario' };
  }
  return { error: noAutorizado() };
}
