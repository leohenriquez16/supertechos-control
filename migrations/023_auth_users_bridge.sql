-- v8.17.90: Bridge personal ↔ auth.users (PR 2A de Fase 2).
--
-- Esta migración NO cambia el flujo de login todavía. Solo crea el
-- bridge para que cada row de `personal` pueda referenciar un user de
-- `auth.users` por UUID, manteniendo el TEXT id existente intacto.
--
-- Por qué este enfoque:
--   - 13 FKs implícitas a `personal.id` (TEXT) en el ERP — refactorizar
--     todas a UUID sería riesgo masivo. Bridge nullable es backward-compat.
--   - Cuando empecemos a usar RLS (PR 2C), las policies usarán
--     `personal_id_from_auth()` para mapear `auth.uid()` → `personal.id`.
--   - Si la fila de `auth.users` se borra, `auth_user_id` queda NULL pero
--     el row de `personal` y todas sus FKs siguen vivas.
--
-- Lo que SIGUE haciendo el ERP igual:
--   - Login con tel+PIN (server-side bcrypt, PR 2 hash-pins) — sin cambio.
--   - Estado del usuario en localStorage — sin cambio.
--   - Lectura/escritura en personal y FKs relacionadas — sin cambio.
--
-- Lo que viene después (PR 2B): el endpoint /api/auth/login emite sesión
-- Supabase via Admin API tras validar PIN, y el cliente recibe sesión real.
-- Idempotente.

-- 1. Columna bridge: cada persona puede tener un auth.users asociado.
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_personal_auth_user_id
  ON personal(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN personal.auth_user_id IS
  'Bridge a auth.users.id. Nullable porque la migración a Auth es gradual; un personal puede existir sin auth_user_id durante la transición. Se setea via scripts/backfill-auth-users.mjs y, en adelante, durante /api/auth/invitar.';

-- 2. Función helper: dado un auth.uid() activo, devuelve el personal.id (TEXT)
--    correspondiente. STABLE porque dentro de una misma transacción la sesión
--    no cambia. SECURITY DEFINER para que las policies puedan invocarla aunque
--    el usuario no tenga SELECT directo sobre personal.
CREATE OR REPLACE FUNCTION public.personal_id_from_auth()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM personal WHERE auth_user_id = auth.uid() LIMIT 1
$$;

COMMENT ON FUNCTION public.personal_id_from_auth() IS
  'Mapea la sesión Supabase Auth actual al personal.id (TEXT) correspondiente. Devuelve NULL si la sesión no tiene bridge a personal. Usado en RLS policies de PR 2C+.';

-- 3. Función helper: ¿el usuario actual tiene un rol específico?
--    Útil para policies que distinguen admin/supervisor/maestro/ayudante.
--    También STABLE + SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.persona_tiene_rol(rol_buscado TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol_buscado = ANY(roles)
  FROM personal
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

COMMENT ON FUNCTION public.persona_tiene_rol(TEXT) IS
  'TRUE si el personal vinculado a la sesión actual tiene el rol indicado en su array `roles`. Útil para policies admin/supervisor.';

-- 4. Grants — las funciones se pueden llamar desde policies con role
--    authenticated. Anon NO debe poder invocarlas.
GRANT EXECUTE ON FUNCTION public.personal_id_from_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION public.persona_tiene_rol(TEXT) TO authenticated;

-- 5. Reload del schema en PostgREST.
NOTIFY pgrst, 'reload schema';
