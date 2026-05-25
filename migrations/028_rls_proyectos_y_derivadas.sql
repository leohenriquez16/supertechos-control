-- v8.17.96: RLS gradual paso 5 — proyectos + tablas derivadas (PR 2C.5 de Fase 2).
--
-- Tablas:
--   - proyectos
--   - reportes
--   - envios
--   - jornadas
--   - ajustes_nomina
--   - detalle_nomina (si existe)
--
-- Modelo de visibilidad:
--
--   ADMIN → todo en todas las tablas.
--
--   SUPERVISOR → proyectos donde supervisor_id = me, y todo lo derivado
--   (reportes, envios, ajustes, jornadas) de esos proyectos.
--
--   MAESTRO → proyectos donde maestro_id = me + reportes/envios/jornadas
--   de esos proyectos. NO accede a ajustes_nomina (es info financiera).
--
--   AYUDANTE → ve los proyectos donde su maestro está asignado (vía
--   personal.maestro_id) + jornadas de esos proyectos. NO accede a
--   reportes / envios / ajustes (info gerencial).
--
-- Helper introducido en esta migration:
--   public.puede_ver_proyecto(p_id text) — encapsula la lógica de
--   visibilidad de proyecto para reusar en policies de las derivadas.
--
-- Pre-requisitos: 023-027 aplicadas + backfill + PR 2B desplegado.
-- Idempotente.

-- ============================================================
-- HELPER: puede_ver_proyecto
-- ============================================================
CREATE OR REPLACE FUNCTION public.puede_ver_proyecto(p_id text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = p_id
      AND (
        p.supervisor_id = public.personal_id_from_auth()
        OR p.maestro_id = public.personal_id_from_auth()
        OR EXISTS (
          SELECT 1 FROM personal ayu
          WHERE ayu.id = public.personal_id_from_auth()
          AND ayu.maestro_id = p.maestro_id
          AND p.maestro_id IS NOT NULL
        )
      )
    )
$$;

COMMENT ON FUNCTION public.puede_ver_proyecto(text) IS
  'TRUE si el user actual (vía auth.uid()) tiene visibilidad sobre el proyecto: admin, supervisor asignado, maestro asignado, o ayudante cuyo maestro está asignado.';

GRANT EXECUTE ON FUNCTION public.puede_ver_proyecto(text) TO authenticated;

-- ============================================================
-- proyectos
-- ============================================================
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proyectos_select ON proyectos;
CREATE POLICY proyectos_select ON proyectos
  FOR SELECT TO authenticated
  USING (public.puede_ver_proyecto(id));

DROP POLICY IF EXISTS proyectos_insert ON proyectos;
CREATE POLICY proyectos_insert ON proyectos
  FOR INSERT TO authenticated
  WITH CHECK (public.persona_tiene_rol('admin'));

DROP POLICY IF EXISTS proyectos_update ON proyectos;
CREATE POLICY proyectos_update ON proyectos
  FOR UPDATE TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR supervisor_id = public.personal_id_from_auth()
  )
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR supervisor_id = public.personal_id_from_auth()
  );

DROP POLICY IF EXISTS proyectos_delete ON proyectos;
CREATE POLICY proyectos_delete ON proyectos
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
-- reportes (cascada vía proyecto_id)
-- ============================================================
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reportes_select ON reportes;
CREATE POLICY reportes_select ON reportes
  FOR SELECT TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id));

DROP POLICY IF EXISTS reportes_insert ON reportes;
CREATE POLICY reportes_insert ON reportes
  FOR INSERT TO authenticated
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));

DROP POLICY IF EXISTS reportes_update ON reportes;
CREATE POLICY reportes_update ON reportes
  FOR UPDATE TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id))
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));

DROP POLICY IF EXISTS reportes_delete ON reportes;
CREATE POLICY reportes_delete ON reportes
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
-- envios (materiales)
-- ============================================================
ALTER TABLE envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS envios_select ON envios;
CREATE POLICY envios_select ON envios
  FOR SELECT TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id));

-- INSERT/UPDATE envios: supervisor del proyecto + admin (no maestro).
DROP POLICY IF EXISTS envios_insert ON envios;
CREATE POLICY envios_insert ON envios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = envios.proyecto_id
      AND p.supervisor_id = public.personal_id_from_auth()
    )
  );

DROP POLICY IF EXISTS envios_update ON envios;
CREATE POLICY envios_update ON envios
  FOR UPDATE TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = envios.proyecto_id
      AND p.supervisor_id = public.personal_id_from_auth()
    )
  )
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = envios.proyecto_id
      AND p.supervisor_id = public.personal_id_from_auth()
    )
  );

DROP POLICY IF EXISTS envios_delete ON envios;
CREATE POLICY envios_delete ON envios
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
-- jornadas
-- ============================================================
ALTER TABLE jornadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jornadas_select ON jornadas;
CREATE POLICY jornadas_select ON jornadas
  FOR SELECT TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id));

-- INSERT/UPDATE jornadas: el maestro/supervisor asignado al proyecto + admin.
DROP POLICY IF EXISTS jornadas_insert ON jornadas;
CREATE POLICY jornadas_insert ON jornadas
  FOR INSERT TO authenticated
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));

DROP POLICY IF EXISTS jornadas_update ON jornadas;
CREATE POLICY jornadas_update ON jornadas
  FOR UPDATE TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id))
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));

DROP POLICY IF EXISTS jornadas_delete ON jornadas;
CREATE POLICY jornadas_delete ON jornadas
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
-- ajustes_nomina (info financiera, NO accede maestro/ayudante)
-- ============================================================
ALTER TABLE ajustes_nomina ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ajustes_nomina_select ON ajustes_nomina;
CREATE POLICY ajustes_nomina_select ON ajustes_nomina
  FOR SELECT TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = ajustes_nomina.proyecto_id
      AND p.supervisor_id = public.personal_id_from_auth()
    )
  );

DROP POLICY IF EXISTS ajustes_nomina_insert ON ajustes_nomina;
CREATE POLICY ajustes_nomina_insert ON ajustes_nomina
  FOR INSERT TO authenticated
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = ajustes_nomina.proyecto_id
      AND p.supervisor_id = public.personal_id_from_auth()
    )
  );

DROP POLICY IF EXISTS ajustes_nomina_update ON ajustes_nomina;
CREATE POLICY ajustes_nomina_update ON ajustes_nomina
  FOR UPDATE TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = ajustes_nomina.proyecto_id
      AND p.supervisor_id = public.personal_id_from_auth()
    )
  )
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = ajustes_nomina.proyecto_id
      AND p.supervisor_id = public.personal_id_from_auth()
    )
  );

DROP POLICY IF EXISTS ajustes_nomina_delete ON ajustes_nomina;
CREATE POLICY ajustes_nomina_delete ON ajustes_nomina
  FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

-- ============================================================
-- detalle_nomina (si existe)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'detalle_nomina'
  ) THEN
    EXECUTE 'ALTER TABLE detalle_nomina ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DROP POLICY IF EXISTS detalle_nomina_select ON detalle_nomina;
CREATE POLICY detalle_nomina_select ON detalle_nomina
  FOR SELECT TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR EXISTS (
      SELECT 1 FROM proyectos p
      WHERE p.id = detalle_nomina.proyecto_id
      AND p.supervisor_id = public.personal_id_from_auth()
    )
  );

DROP POLICY IF EXISTS detalle_nomina_modify ON detalle_nomina;
CREATE POLICY detalle_nomina_modify ON detalle_nomina
  FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

NOTIFY pgrst, 'reload schema';
