-- v8.17.97: RLS gradual paso 6 — resto de tablas (PR 2C.6 de Fase 2).
--
-- Cierra el ciclo de RLS activando policies en TODAS las tablas restantes:
--
--   Cascada de proyecto (vía puede_ver_proyecto):
--     - cubicaciones
--     - proyecto_archivos
--     - proyecto_contactos
--     - avances_unidades
--
--   Específicas:
--     - estadias_empresa  — admin / dueño / supervisor del proyecto
--     - propiedades_empresa — catálogo: SELECT todos, mods solo admin
--     - odoo_cotizaciones_ocultas — admin only (info Odoo sensible)
--     - personal_acceso_cliente — admin + el propio user (sus accesos)
--     - personal_accesos_log — admin + el propio user (su log de actividad)
--     - audit_logs — INSERT anon+authenticated (no perder logs durante
--       transición), SELECT solo admin
--
--   Catálogos compartidos:
--     - sistemas — SELECT todos, mods solo admin
--     - categorias_sistemas — SELECT todos, mods solo admin
--     - config — admin only (configuración global del ERP)
--     - config_dieta — admin only
--
-- Pre-requisitos: 023-028 aplicadas + backfill + PR 2B desplegado.
-- Idempotente.

-- ============================================================
-- Cascada de proyecto
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cubicaciones') THEN
    EXECUTE 'ALTER TABLE cubicaciones ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS cubicaciones_select ON cubicaciones;
CREATE POLICY cubicaciones_select ON cubicaciones FOR SELECT TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS cubicaciones_insert ON cubicaciones;
CREATE POLICY cubicaciones_insert ON cubicaciones FOR INSERT TO authenticated
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS cubicaciones_update ON cubicaciones;
CREATE POLICY cubicaciones_update ON cubicaciones FOR UPDATE TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id))
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS cubicaciones_delete ON cubicaciones;
CREATE POLICY cubicaciones_delete ON cubicaciones FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin'));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='proyecto_archivos') THEN
    EXECUTE 'ALTER TABLE proyecto_archivos ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS proyecto_archivos_select ON proyecto_archivos;
CREATE POLICY proyecto_archivos_select ON proyecto_archivos FOR SELECT TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS proyecto_archivos_insert ON proyecto_archivos;
CREATE POLICY proyecto_archivos_insert ON proyecto_archivos FOR INSERT TO authenticated
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS proyecto_archivos_update ON proyecto_archivos;
CREATE POLICY proyecto_archivos_update ON proyecto_archivos FOR UPDATE TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id))
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS proyecto_archivos_delete ON proyecto_archivos;
CREATE POLICY proyecto_archivos_delete ON proyecto_archivos FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin')
         OR EXISTS (SELECT 1 FROM proyectos p WHERE p.id = proyecto_archivos.proyecto_id
                    AND p.supervisor_id = public.personal_id_from_auth()));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='proyecto_contactos') THEN
    EXECUTE 'ALTER TABLE proyecto_contactos ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS proyecto_contactos_select ON proyecto_contactos;
CREATE POLICY proyecto_contactos_select ON proyecto_contactos FOR SELECT TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS proyecto_contactos_modify ON proyecto_contactos;
CREATE POLICY proyecto_contactos_modify ON proyecto_contactos FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin')
         OR EXISTS (SELECT 1 FROM proyectos p WHERE p.id = proyecto_contactos.proyecto_id
                    AND p.supervisor_id = public.personal_id_from_auth()))
  WITH CHECK (public.persona_tiene_rol('admin')
              OR EXISTS (SELECT 1 FROM proyectos p WHERE p.id = proyecto_contactos.proyecto_id
                         AND p.supervisor_id = public.personal_id_from_auth()));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='avances_unidades') THEN
    EXECUTE 'ALTER TABLE avances_unidades ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS avances_unidades_select ON avances_unidades;
CREATE POLICY avances_unidades_select ON avances_unidades FOR SELECT TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS avances_unidades_insert ON avances_unidades;
CREATE POLICY avances_unidades_insert ON avances_unidades FOR INSERT TO authenticated
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS avances_unidades_update ON avances_unidades;
CREATE POLICY avances_unidades_update ON avances_unidades FOR UPDATE TO authenticated
  USING (public.puede_ver_proyecto(proyecto_id))
  WITH CHECK (public.puede_ver_proyecto(proyecto_id));
DROP POLICY IF EXISTS avances_unidades_delete ON avances_unidades;
CREATE POLICY avances_unidades_delete ON avances_unidades FOR DELETE TO authenticated
  USING (public.persona_tiene_rol('admin')
         OR EXISTS (SELECT 1 FROM proyectos p WHERE p.id = avances_unidades.proyecto_id
                    AND p.supervisor_id = public.personal_id_from_auth()));

-- ============================================================
-- estadias_empresa
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estadias_empresa') THEN
    EXECUTE 'ALTER TABLE estadias_empresa ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS estadias_empresa_select ON estadias_empresa;
CREATE POLICY estadias_empresa_select ON estadias_empresa FOR SELECT TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR persona_id = public.personal_id_from_auth()
    OR (proyecto_id IS NOT NULL AND public.puede_ver_proyecto(proyecto_id))
  );
DROP POLICY IF EXISTS estadias_empresa_modify ON estadias_empresa;
CREATE POLICY estadias_empresa_modify ON estadias_empresa FOR ALL TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR public.persona_tiene_rol('supervisor')
  )
  WITH CHECK (
    public.persona_tiene_rol('admin')
    OR public.persona_tiene_rol('supervisor')
  );

-- ============================================================
-- propiedades_empresa (catálogo)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='propiedades_empresa') THEN
    EXECUTE 'ALTER TABLE propiedades_empresa ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS propiedades_select ON propiedades_empresa;
CREATE POLICY propiedades_select ON propiedades_empresa FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS propiedades_modify ON propiedades_empresa;
CREATE POLICY propiedades_modify ON propiedades_empresa FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

-- ============================================================
-- odoo_cotizaciones_ocultas (admin only)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='odoo_cotizaciones_ocultas') THEN
    EXECUTE 'ALTER TABLE odoo_cotizaciones_ocultas ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS odoo_ocultas_admin ON odoo_cotizaciones_ocultas;
CREATE POLICY odoo_ocultas_admin ON odoo_cotizaciones_ocultas FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

-- ============================================================
-- personal_acceso_cliente y personal_accesos_log
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='personal_acceso_cliente') THEN
    EXECUTE 'ALTER TABLE personal_acceso_cliente ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS pac_select ON personal_acceso_cliente;
CREATE POLICY pac_select ON personal_acceso_cliente FOR SELECT TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR persona_id = public.personal_id_from_auth()
  );
DROP POLICY IF EXISTS pac_modify ON personal_acceso_cliente;
CREATE POLICY pac_modify ON personal_acceso_cliente FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='personal_accesos_log') THEN
    EXECUTE 'ALTER TABLE personal_accesos_log ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS pal_select ON personal_accesos_log;
CREATE POLICY pal_select ON personal_accesos_log FOR SELECT TO authenticated
  USING (
    public.persona_tiene_rol('admin')
    OR persona_id = public.personal_id_from_auth()
  );
-- INSERT permissive porque el endpoint registra accesos sin sesión activa
-- a veces (e.g. inicio de login).
DROP POLICY IF EXISTS pal_insert ON personal_accesos_log;
CREATE POLICY pal_insert ON personal_accesos_log FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ============================================================
-- audit_logs
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs') THEN
    EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
-- INSERT abierto (anon + authenticated) — los logs no se deben perder por
-- ausencia de sesión. La integridad es contra UPDATE/DELETE, no INSERT.
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO anon, authenticated
  WITH CHECK (true);
-- SELECT solo admin (los logs son sensibles).
DROP POLICY IF EXISTS audit_logs_select_admin ON audit_logs;
CREATE POLICY audit_logs_select_admin ON audit_logs FOR SELECT TO authenticated
  USING (public.persona_tiene_rol('admin'));
-- Sin policies UPDATE/DELETE → inmutabilidad por default.

-- ============================================================
-- Catálogos compartidos
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sistemas') THEN
    EXECUTE 'ALTER TABLE sistemas ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS sistemas_select ON sistemas;
CREATE POLICY sistemas_select ON sistemas FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS sistemas_modify ON sistemas;
CREATE POLICY sistemas_modify ON sistemas FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='categorias_sistemas') THEN
    EXECUTE 'ALTER TABLE categorias_sistemas ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS cat_sis_select ON categorias_sistemas;
CREATE POLICY cat_sis_select ON categorias_sistemas FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS cat_sis_modify ON categorias_sistemas;
CREATE POLICY cat_sis_modify ON categorias_sistemas FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

-- config y config_dieta — admin only.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='config') THEN
    EXECUTE 'ALTER TABLE config ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
-- config sin policy admin causaría que loadAllData (que lee config) falle.
-- Necesitamos SELECT abierto (config tiene metadata global no sensible).
DROP POLICY IF EXISTS config_select ON config;
CREATE POLICY config_select ON config FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS config_modify ON config;
CREATE POLICY config_modify ON config FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='config_dieta') THEN
    EXECUTE 'ALTER TABLE config_dieta ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
DROP POLICY IF EXISTS config_dieta_select ON config_dieta;
CREATE POLICY config_dieta_select ON config_dieta FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS config_dieta_modify ON config_dieta;
CREATE POLICY config_dieta_modify ON config_dieta FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

NOTIFY pgrst, 'reload schema';
