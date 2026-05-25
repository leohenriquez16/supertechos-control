-- v8.17.92: PRIMER PASO de RLS gradual (PR 2C.1 de Fase 2).
--
-- Tabla elegida: webauthn_credentials.
--   - Riesgo bajo: las queries cliente siempre filtran por persona_id,
--     que naturalmente coincide con "lo del user logueado".
--   - Los 3 endpoints WebAuthn (login-begin, login-finish, register-finish)
--     ahora usan service role en v8.17.92 → bypassean RLS, así el flujo
--     crítico de biometría no depende de que la sesión Supabase exista.
--   - Las queries client-side de lib/db.js (listarCredencialesPersona,
--     revocarCredencial, etc.) sí caen bajo RLS — eso es lo que queremos.
--
-- Helper functions usadas (creadas en migrations/023_auth_users_bridge.sql):
--   - public.personal_id_from_auth() — mapea auth.uid() → personal.id TEXT
--   - public.persona_tiene_rol(rol) — true si user actual tiene ese rol
--
-- IMPORTANTE: para que esta migration NO degrade UX, antes de aplicarla:
--   1. migrations/023 ya aplicada
--   2. scripts/backfill-auth-users.mjs corrido contra prod
--   3. v8.17.91 (PR 2B) desplegada → todos los logins futuros emiten sesión
--
-- Durante la transición, los users que aún no hayan re-logueado (sin
-- sesión Supabase activa) verán la pantalla de "Mis credenciales registradas"
-- vacía. Es esperable y se resuelve al re-loguear. NO bloquea el login mismo
-- ni la operación normal del ERP.
--
-- Idempotente vía DO blocks + IF NOT EXISTS donde aplica.

-- 1. Habilitar RLS.
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- 2. SELECT — cada user ve sus credenciales; admin ve todas.
DROP POLICY IF EXISTS webauthn_select_own_or_admin ON webauthn_credentials;
CREATE POLICY webauthn_select_own_or_admin ON webauthn_credentials
  FOR SELECT TO authenticated
  USING (
    persona_id = public.personal_id_from_auth()
    OR public.persona_tiene_rol('admin')
  );

-- 3. INSERT — un user puede registrar credenciales para sí mismo;
--    admin puede crear para cualquiera (caso: registrar dispositivo de otro
--    via panel admin, raro pero plausible).
--    Los endpoints WebAuthn server-side usan service role y bypassean esta
--    policy — necesaria solo para inserts directos desde cliente.
DROP POLICY IF EXISTS webauthn_insert_own_or_admin ON webauthn_credentials;
CREATE POLICY webauthn_insert_own_or_admin ON webauthn_credentials
  FOR INSERT TO authenticated
  WITH CHECK (
    persona_id = public.personal_id_from_auth()
    OR public.persona_tiene_rol('admin')
  );

-- 4. UPDATE — para revocar credenciales o actualizar counter/last_used_at.
--    Mismo criterio: dueño o admin. El endpoint login-finish usa service
--    role así que el contador se sigue actualizando aunque el cliente no
--    pueda escribir.
DROP POLICY IF EXISTS webauthn_update_own_or_admin ON webauthn_credentials;
CREATE POLICY webauthn_update_own_or_admin ON webauthn_credentials
  FOR UPDATE TO authenticated
  USING (
    persona_id = public.personal_id_from_auth()
    OR public.persona_tiene_rol('admin')
  )
  WITH CHECK (
    persona_id = public.personal_id_from_auth()
    OR public.persona_tiene_rol('admin')
  );

-- 5. DELETE — preferimos revocación lógica (UPDATE revocado=true), pero si
--    alguien quiere borrar físicamente, mismo criterio.
DROP POLICY IF EXISTS webauthn_delete_own_or_admin ON webauthn_credentials;
CREATE POLICY webauthn_delete_own_or_admin ON webauthn_credentials
  FOR DELETE TO authenticated
  USING (
    persona_id = public.personal_id_from_auth()
    OR public.persona_tiene_rol('admin')
  );

-- 6. Reload del schema en PostgREST.
NOTIFY pgrst, 'reload schema';
