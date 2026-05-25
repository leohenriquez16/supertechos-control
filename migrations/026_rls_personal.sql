-- v8.17.94: RLS gradual paso 3 — personal (PR 2C.3 de Fase 2).
--
-- Tabla CRÍTICA. Estrategia conservadora para no romper el ERP:
--
--   SELECT — anon + authenticated, USING (true).
--     Razón: loadAllData hace SELECT * FROM personal y MUCHAS pantallas
--     dependen de tener la lista completa (selectores de "asignar a:",
--     autocomplete, equipo del proyecto, gestión de personal, etc.).
--     Restringir el SELECT requeriría refactorizar loadAllData a
--     endpoints server-side per-feature — eso es scope de un PR de
--     refactor separado, no de RLS. Por ahora mantenemos el status quo
--     de visibilidad (todos ven a todos) y solo cerramos mutaciones.
--
--   INSERT — solo admin.
--     reemplazarPersonal upsertea solo desde la pantalla admin. Si el
--     row no existía, es un INSERT (admin lo hace).
--
--   UPDATE — admin O la persona misma.
--     Habilita: guardarPerfil cuando el usuario edita sus propios datos
--     personales, completarOnboarding (la persona se actualiza a sí misma),
--     reemplazarPersonal con upsert (admin). NO habilita maestros editando
--     ayudantes desde el cliente — si se necesita, va por endpoint admin
--     server-side con service role.
--
--   DELETE — solo admin.
--     Eliminar personal es decisión administrativa.
--
-- Helper personal_id_from_auth() viene de migration 023.
--
-- Pre-requisitos: 023 + 024 + 025 ya aplicadas + backfill corrido + PR 2B
-- desplegado. Sin esto, los users sin sesión Supabase no podrán hacer
-- UPDATE de su propio perfil (cae fuera de admin O id=auth).
--
-- Idempotente.

ALTER TABLE personal ENABLE ROW LEVEL SECURITY;

-- SELECT — visibilidad pública dentro del ERP (status quo).
DROP POLICY IF EXISTS personal_select_all ON personal;
CREATE POLICY personal_select_all ON personal
  FOR SELECT TO anon, authenticated
  USING (true);

-- INSERT — solo admin.
DROP POLICY IF EXISTS personal_insert_admin ON personal;
CREATE POLICY personal_insert_admin ON personal
  FOR INSERT TO authenticated
  WITH CHECK (public.persona_tiene_rol('admin'));

-- UPDATE — admin O la persona misma.
DROP POLICY IF EXISTS personal_update_self_or_admin ON personal;
CREATE POLICY personal_update_self_or_admin ON personal
  FOR UPDATE TO authenticated
  USING (
    id = public.personal_id_from_auth()
    OR public.persona_tiene_rol('admin')
  )
  WITH CHECK (
    id = public.personal_id_from_auth()
    OR public.persona_tiene_rol('admin')
  );

-- DELETE — solo admin.
DROP POLICY IF EXISTS personal_delete_admin ON personal;
CREATE POLICY personal_delete_admin ON personal
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

NOTIFY pgrst, 'reload schema';
