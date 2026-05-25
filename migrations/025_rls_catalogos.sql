-- v8.17.93: RLS gradual paso 2 — catálogos públicos (PR 2C.2 de Fase 2).
--
-- Tablas:
--   - permisos_roles      (matriz de permisos por rol — la lee `puede()` en cliente)
--   - caja_chica_categorias (catálogo de categorías de gastos)
--
-- Patrón: catálogos de lectura pública dentro del ERP. SELECT permissive
-- (incluyendo anon, porque algunos clientes pueden leer ANTES de tener
-- sesión Supabase — ej. login screen consulta `puede()` cuando entra el
-- user). INSERT/UPDATE/DELETE solo admin.
--
-- Por qué SELECT a anon también:
--   - permisos_roles se lee en loadAllData (carga inicial del app), cuando
--     el cliente aún puede no tener sesión Supabase establecida.
--   - El contenido no es sensible — es metadata de cómo funciona el ERP.
--   - Sin esta apertura, la pantalla principal romperá durante la
--     transición de PR 2A→2B→2C para users que aún no re-loguearon.
--
-- Helper functions: persona_tiene_rol('admin') (de migration 023).
--
-- Pre-requisitos: migrations 023 + 024 ya aplicadas.
-- Idempotente.

-- ============================================================
-- permisos_roles
-- ============================================================
ALTER TABLE permisos_roles ENABLE ROW LEVEL SECURITY;

-- SELECT permissive: anyone (anon + authenticated) puede leer el catálogo.
DROP POLICY IF EXISTS permisos_roles_select_all ON permisos_roles;
CREATE POLICY permisos_roles_select_all ON permisos_roles
  FOR SELECT TO anon, authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: solo admin (vía persona_tiene_rol).
DROP POLICY IF EXISTS permisos_roles_insert_admin ON permisos_roles;
CREATE POLICY permisos_roles_insert_admin ON permisos_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.persona_tiene_rol('admin'));

DROP POLICY IF EXISTS permisos_roles_update_admin ON permisos_roles;
CREATE POLICY permisos_roles_update_admin ON permisos_roles
  FOR UPDATE TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

DROP POLICY IF EXISTS permisos_roles_delete_admin ON permisos_roles;
CREATE POLICY permisos_roles_delete_admin ON permisos_roles
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
-- caja_chica_categorias
-- ============================================================
ALTER TABLE caja_chica_categorias ENABLE ROW LEVEL SECURITY;

-- SELECT permissive: cualquier client puede leer el catálogo de categorías.
-- Se usa en modal de nuevo gasto, listados, etc.
DROP POLICY IF EXISTS caja_chica_categorias_select_all ON caja_chica_categorias;
CREATE POLICY caja_chica_categorias_select_all ON caja_chica_categorias
  FOR SELECT TO anon, authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: solo admin.
DROP POLICY IF EXISTS caja_chica_categorias_insert_admin ON caja_chica_categorias;
CREATE POLICY caja_chica_categorias_insert_admin ON caja_chica_categorias
  FOR INSERT TO authenticated
  WITH CHECK (public.persona_tiene_rol('admin'));

DROP POLICY IF EXISTS caja_chica_categorias_update_admin ON caja_chica_categorias;
CREATE POLICY caja_chica_categorias_update_admin ON caja_chica_categorias
  FOR UPDATE TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

DROP POLICY IF EXISTS caja_chica_categorias_delete_admin ON caja_chica_categorias;
CREATE POLICY caja_chica_categorias_delete_admin ON caja_chica_categorias
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
NOTIFY pgrst, 'reload schema';
