-- v8.17.95: RLS gradual paso 4 — caja chica (PR 2C.4 de Fase 2).
--
-- Tablas:
--   - caja_chica_movimientos  (gastos / aportes / retiros / ajustes)
--   - caja_chica_proveedores  (catálogo de proveedores con datos fiscales)
--   - caja_chica_historiales  (snapshots de cuadre, append-only)
--
-- Modelo de visibilidad:
--
--   movimientos:
--     - admin → todo
--     - dueño (persona_id) → sus propios movimientos
--     - supervisor del proyecto → los movimientos vinculados a SUS proyectos
--       (para aprobar / cuadrar caja del equipo)
--     - resto → nada
--
--   proveedores:
--     - admin → todo
--     - cualquier autenticado → SELECT (catálogo compartido entre maestros y
--       supervisores que registran gastos a un proveedor existente)
--     - INSERT/UPDATE/DELETE → admin + supervisor (ambos pueden agregar
--       proveedores nuevos cuando registran un gasto). DELETE solo admin.
--
--   historiales:
--     - admin → todo
--     - dueño → los suyos (cierre de caja al rotar maestro)
--     - supervisor del proyecto → los historiales vinculados a SUS proyectos
--
-- Storage del bucket `caja-chica-facturas`: scope de PR 2D, no se toca aquí.
--
-- Helper `personal_id_from_auth()` y `persona_tiene_rol()` de migration 023.
--
-- Pre-requisitos: 023 + 024 + 025 + 026 aplicadas + backfill + PR 2B deployed.
-- Idempotente.

-- ============================================================
-- caja_chica_movimientos
-- ============================================================
ALTER TABLE caja_chica_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caja_mov_select ON caja_chica_movimientos;
CREATE POLICY caja_mov_select ON caja_chica_movimientos
  FOR SELECT TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR persona_id = public.personal_id_from_auth()
    OR (
      proyecto_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM proyectos p
        WHERE p.id = caja_chica_movimientos.proyecto_id
        AND p.supervisor_id = public.personal_id_from_auth()
      )
    )
  );

DROP POLICY IF EXISTS caja_mov_insert ON caja_chica_movimientos;
CREATE POLICY caja_mov_insert ON caja_chica_movimientos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR persona_id = public.personal_id_from_auth()
    OR (
      proyecto_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM proyectos p
        WHERE p.id = caja_chica_movimientos.proyecto_id
        AND p.supervisor_id = public.personal_id_from_auth()
      )
    )
  );

DROP POLICY IF EXISTS caja_mov_update ON caja_chica_movimientos;
CREATE POLICY caja_mov_update ON caja_chica_movimientos
  FOR UPDATE TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR persona_id = public.personal_id_from_auth()
    OR (
      proyecto_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM proyectos p
        WHERE p.id = caja_chica_movimientos.proyecto_id
        AND p.supervisor_id = public.personal_id_from_auth()
      )
    )
  )
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR persona_id = public.personal_id_from_auth()
    OR (
      proyecto_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM proyectos p
        WHERE p.id = caja_chica_movimientos.proyecto_id
        AND p.supervisor_id = public.personal_id_from_auth()
      )
    )
  );

DROP POLICY IF EXISTS caja_mov_delete ON caja_chica_movimientos;
CREATE POLICY caja_mov_delete ON caja_chica_movimientos
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
-- caja_chica_proveedores
-- ============================================================
ALTER TABLE caja_chica_proveedores ENABLE ROW LEVEL SECURITY;

-- Catálogo compartido: todos los autenticados pueden leer.
DROP POLICY IF EXISTS caja_prov_select ON caja_chica_proveedores;
CREATE POLICY caja_prov_select ON caja_chica_proveedores
  FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE: admin o supervisor (registran nuevos proveedores cuando
-- añaden un gasto).
DROP POLICY IF EXISTS caja_prov_insert ON caja_chica_proveedores;
CREATE POLICY caja_prov_insert ON caja_chica_proveedores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR public.persona_tiene_rol('supervisor')
  );

DROP POLICY IF EXISTS caja_prov_update ON caja_chica_proveedores;
CREATE POLICY caja_prov_update ON caja_chica_proveedores
  FOR UPDATE TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR public.persona_tiene_rol('supervisor')
  )
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR public.persona_tiene_rol('supervisor')
  );

DROP POLICY IF EXISTS caja_prov_delete ON caja_chica_proveedores;
CREATE POLICY caja_prov_delete ON caja_chica_proveedores
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
-- caja_chica_historiales (existe si migration 016 aplicada)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'caja_chica_historiales'
  ) THEN
    EXECUTE 'ALTER TABLE caja_chica_historiales ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DROP POLICY IF EXISTS caja_hist_select ON caja_chica_historiales;
CREATE POLICY caja_hist_select ON caja_chica_historiales
  FOR SELECT TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR persona_id = public.personal_id_from_auth()
    OR (
      proyecto_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM proyectos p
        WHERE p.id = caja_chica_historiales.proyecto_id
        AND p.supervisor_id = public.personal_id_from_auth()
      )
    )
  );

-- Historiales son append-only (snapshots de cuadre). Solo admin + supervisor
-- pueden generar uno (al rotar caja). Sin UPDATE/DELETE policies → bloqueado.
DROP POLICY IF EXISTS caja_hist_insert ON caja_chica_historiales;
CREATE POLICY caja_hist_insert ON caja_chica_historiales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR public.persona_tiene_rol('supervisor')
  );

NOTIFY pgrst, 'reload schema';
