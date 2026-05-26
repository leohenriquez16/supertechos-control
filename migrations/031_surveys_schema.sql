-- v8.18.2: Módulo de Levantamientos en sitio (Surveys) — schema aislado.
--
-- Origen: paquete `super-techos-surveys-module` adaptado al ERP actual.
--
-- Decisiones de adaptación vs paquete original:
--   - Mantiene `auth.users(id)` UUID en `surveyor_id`, `created_by`, `assigned_to`
--     porque el bridge `personal.auth_user_id` ya existe (migration 023).
--     El frontend usa `personal_id_from_auth()` para traducir cuando hace falta.
--   - RLS HABILITADA bajo `surveys.*` desde el inicio. Es un schema aislado,
--     no afecta el estado de RLS en `public.*` (que está off temporalmente).
--   - Las policies reusan los helpers de migration 023: `personal_id_from_auth`,
--     `persona_tiene_rol`.
--   - Sirve como "piloto" de RLS antes de reactivar RLS en `public.*`.
--
-- IDEMPOTENTE: el schema y tablas se crean con IF NOT EXISTS. Las policies
-- usan DROP IF EXISTS + CREATE.

CREATE SCHEMA IF NOT EXISTS surveys;

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE surveys.service_line AS ENUM (
    'paint',                    -- Pintura
    'waterproofing',            -- Impermeabilización (Super Techos)
    'thermal_insulation',       -- Aislamiento térmico (Super Techos)
    'epoxy_floor',              -- Pisos epóxicos (Prouco)
    'urethane_cement',          -- Uretano cemento (Prouco)
    'concrete_polishing',       -- Pulido de concreto (Prouco)
    'concrete_repair',          -- Reparación estructural concreto (Prouco)
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE surveys.company AS ENUM (
    'super_techos',
    'prouco',
    'shared'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE surveys.project_status AS ENUM (
    'planning',
    'survey_in_progress',
    'survey_completed',
    'quoted',
    'awarded',
    'in_execution',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE surveys.site_status AS ENUM (
    'pending',
    'coordinated',
    'confirmed',
    'in_route',
    'in_progress',
    'completed',
    'validated',
    'missing_info'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLAS
-- ============================================================

-- Catálogo de templates JSONB. Cada template define las secciones,
-- bloques repetibles y campos que el frontend renderiza dinámicamente.
-- Agregar un nuevo tipo de levantamiento es solo INSERT — sin migración.
CREATE TABLE IF NOT EXISTS surveys.templates (
  id              TEXT PRIMARY KEY,                -- 'paint-v1'
  name            TEXT NOT NULL,
  service_line    surveys.service_line NOT NULL,
  company         surveys.company NOT NULL DEFAULT 'shared',
  version         TEXT NOT NULL DEFAULT '1.0',
  description     TEXT,
  schema          JSONB NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_templates_service ON surveys.templates(service_line);
CREATE INDEX IF NOT EXISTS idx_templates_active ON surveys.templates(is_active);

-- Proyectos
CREATE TABLE IF NOT EXISTS surveys.projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  client_name     TEXT NOT NULL,
  service_line    surveys.service_line NOT NULL,
  company         surveys.company NOT NULL,
  template_id     TEXT NOT NULL REFERENCES surveys.templates(id),
  description     TEXT,
  status          surveys.project_status NOT NULL DEFAULT 'planning',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id),
  metadata        JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_projects_service ON surveys.projects(service_line);
CREATE INDEX IF NOT EXISTS idx_projects_company ON surveys.projects(company);

-- Sites: sucursal / nave / edificio / terraza / etc.
CREATE TABLE IF NOT EXISTS surveys.sites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        TEXT NOT NULL REFERENCES surveys.projects(id) ON DELETE CASCADE,
  external_code     TEXT,
  name              TEXT NOT NULL,
  address           TEXT,
  province          TEXT,
  city              TEXT,
  site_subtype      TEXT,
  latitude          NUMERIC(10, 6),
  longitude         NUMERIC(10, 6),
  contact_name      TEXT,
  contact_role      TEXT,
  office_phone      TEXT,
  mobile_phone      TEXT,
  weekday_hours     TEXT,
  saturday_hours    TEXT,
  survey_status     surveys.site_status NOT NULL DEFAULT 'pending',
  assigned_to       UUID REFERENCES auth.users(id),
  scheduled_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sites_project ON surveys.sites(project_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON surveys.sites(survey_status);
CREATE INDEX IF NOT EXISTS idx_sites_assigned ON surveys.sites(assigned_to);

-- Visitas
CREATE TABLE IF NOT EXISTS surveys.visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             UUID NOT NULL REFERENCES surveys.sites(id) ON DELETE CASCADE,
  surveyor_id         UUID NOT NULL REFERENCES auth.users(id),
  checkin_at          TIMESTAMPTZ,
  checkin_latitude    NUMERIC(10, 6),
  checkin_longitude   NUMERIC(10, 6),
  checkin_accuracy_m  NUMERIC(6, 1),
  weather             TEXT,
  site_contact_name   TEXT,
  site_contact_role   TEXT,
  access_authorized   BOOLEAN,
  access_notes        TEXT,
  general_data        JSONB DEFAULT '{}'::jsonb,
  total_measured_m2   NUMERIC(10, 2) DEFAULT 0,
  estimated_days      INTEGER,
  cross_sell_notes    TEXT,
  execution_risks     TEXT,
  general_notes       TEXT,
  recommended_system  TEXT,
  checkout_at         TIMESTAMPTZ,
  duration_minutes    INTEGER,
  surveyor_signature  TEXT,
  is_completed        BOOLEAN DEFAULT FALSE,
  validated_at        TIMESTAMPTZ,
  validated_by        UUID REFERENCES auth.users(id),
  quote_number        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visits_site ON surveys.visits(site_id);
CREATE INDEX IF NOT EXISTS idx_visits_surveyor ON surveys.visits(surveyor_id);
CREATE INDEX IF NOT EXISTS idx_visits_completed ON surveys.visits(is_completed);

-- Áreas levantadas
CREATE TABLE IF NOT EXISTS surveys.areas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id            UUID NOT NULL REFERENCES surveys.visits(id) ON DELETE CASCADE,
  block_id            TEXT NOT NULL,
  area_number         INTEGER NOT NULL,
  name                TEXT NOT NULL,
  similar_to_area_id  UUID REFERENCES surveys.areas(id),
  measurements        JSONB DEFAULT '[]'::jsonb,
  openings            JSONB DEFAULT '[]'::jsonb,
  gross_area_m2       NUMERIC(10, 2),
  openings_area_m2    NUMERIC(10, 2),
  net_area_m2         NUMERIC(10, 2),
  secondary_area_m2   NUMERIC(10, 2),
  data                JSONB DEFAULT '{}'::jsonb,
  to_be_treated       BOOLEAN DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_areas_visit ON surveys.areas(visit_id);
CREATE INDEX IF NOT EXISTS idx_areas_block ON surveys.areas(block_id);

-- Fotos
CREATE TABLE IF NOT EXISTS surveys.photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        UUID NOT NULL REFERENCES surveys.visits(id) ON DELETE CASCADE,
  area_id         UUID REFERENCES surveys.areas(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  photo_type      TEXT,
  is_critical     BOOLEAN DEFAULT FALSE,
  caption         TEXT,
  taken_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude        NUMERIC(10, 6),
  longitude       NUMERIC(10, 6)
);
CREATE INDEX IF NOT EXISTS idx_photos_visit ON surveys.photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_photos_area ON surveys.photos(area_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION surveys.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_templates_updated ON surveys.templates;
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON surveys.templates
  FOR EACH ROW EXECUTE FUNCTION surveys.set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated ON surveys.projects;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON surveys.projects
  FOR EACH ROW EXECUTE FUNCTION surveys.set_updated_at();

DROP TRIGGER IF EXISTS trg_sites_updated ON surveys.sites;
CREATE TRIGGER trg_sites_updated BEFORE UPDATE ON surveys.sites
  FOR EACH ROW EXECUTE FUNCTION surveys.set_updated_at();

DROP TRIGGER IF EXISTS trg_visits_updated ON surveys.visits;
CREATE TRIGGER trg_visits_updated BEFORE UPDATE ON surveys.visits
  FOR EACH ROW EXECUTE FUNCTION surveys.set_updated_at();

CREATE OR REPLACE FUNCTION surveys.calculate_visit_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.checkout_at IS NOT NULL AND NEW.checkin_at IS NOT NULL THEN
    NEW.duration_minutes = EXTRACT(EPOCH FROM (NEW.checkout_at - NEW.checkin_at))::INTEGER / 60;
    NEW.is_completed = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visits_duration ON surveys.visits;
CREATE TRIGGER trg_visits_duration BEFORE INSERT OR UPDATE ON surveys.visits
  FOR EACH ROW EXECUTE FUNCTION surveys.calculate_visit_duration();

-- ============================================================
-- ROW LEVEL SECURITY (HABILITADA en surveys.* desde inicio)
-- ============================================================
ALTER TABLE surveys.templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.sites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.visits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.areas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.photos     ENABLE ROW LEVEL SECURITY;

-- Templates: cualquier autenticado lee. Solo admin escribe.
DROP POLICY IF EXISTS templates_read_all ON surveys.templates;
CREATE POLICY templates_read_all ON surveys.templates
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS templates_write_admin ON surveys.templates;
CREATE POLICY templates_write_admin ON surveys.templates
  FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));

-- Projects: admin todo. Surveyor lee proyectos que tengan sites asignados a él.
DROP POLICY IF EXISTS projects_admin_all ON surveys.projects;
CREATE POLICY projects_admin_all ON surveys.projects
  FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));
DROP POLICY IF EXISTS projects_surveyor_read ON surveys.projects;
CREATE POLICY projects_surveyor_read ON surveys.projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM surveys.sites s
      WHERE s.project_id = projects.id
      AND s.assigned_to = auth.uid()
    )
  );

-- Sites: admin todo. Surveyor lee y edita sus sites asignados.
DROP POLICY IF EXISTS sites_admin_all ON surveys.sites;
CREATE POLICY sites_admin_all ON surveys.sites
  FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));
DROP POLICY IF EXISTS sites_surveyor_own ON surveys.sites;
CREATE POLICY sites_surveyor_own ON surveys.sites
  FOR SELECT TO authenticated USING (assigned_to = auth.uid());
DROP POLICY IF EXISTS sites_surveyor_update ON surveys.sites;
CREATE POLICY sites_surveyor_update ON surveys.sites
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Visits: admin todo. Surveyor lee y edita sus propias visits.
DROP POLICY IF EXISTS visits_admin_all ON surveys.visits;
CREATE POLICY visits_admin_all ON surveys.visits
  FOR ALL TO authenticated
  USING (public.persona_tiene_rol('admin'))
  WITH CHECK (public.persona_tiene_rol('admin'));
DROP POLICY IF EXISTS visits_surveyor_own ON surveys.visits;
CREATE POLICY visits_surveyor_own ON surveys.visits
  FOR ALL TO authenticated
  USING (surveyor_id = auth.uid())
  WITH CHECK (surveyor_id = auth.uid());

-- Areas y photos: cascada via visit.
DROP POLICY IF EXISTS areas_via_visit ON surveys.areas;
CREATE POLICY areas_via_visit ON surveys.areas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM surveys.visits v
      WHERE v.id = areas.visit_id
      AND (v.surveyor_id = auth.uid() OR public.persona_tiene_rol('admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys.visits v
      WHERE v.id = areas.visit_id
      AND (v.surveyor_id = auth.uid() OR public.persona_tiene_rol('admin'))
    )
  );

DROP POLICY IF EXISTS photos_via_visit ON surveys.photos;
CREATE POLICY photos_via_visit ON surveys.photos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM surveys.visits v
      WHERE v.id = photos.visit_id
      AND (v.surveyor_id = auth.uid() OR public.persona_tiene_rol('admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys.visits v
      WHERE v.id = photos.visit_id
      AND (v.surveyor_id = auth.uid() OR public.persona_tiene_rol('admin'))
    )
  );

-- ============================================================
-- GRANTS — exponer schema y tablas a los roles de Supabase REST.
-- Sin esto la API devuelve "permission denied for schema surveys"
-- aunque las RLS policies estén en su lugar.
-- ============================================================
GRANT USAGE ON SCHEMA surveys TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA surveys TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA surveys TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA surveys TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA surveys GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA surveys GRANT SELECT ON TABLES TO anon;

-- ============================================================
-- STORAGE BUCKET surveys-photos (privado)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('surveys-photos', 'surveys-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Policies del bucket: SELECT/INSERT abiertos a authenticated (la barrera
-- real está en la RLS de la tabla surveys.photos que controla qué
-- storage_path se devuelve). UPDATE/DELETE solo admin para inmutabilidad.
DROP POLICY IF EXISTS surveys_photos_select ON storage.objects;
CREATE POLICY surveys_photos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'surveys-photos');

DROP POLICY IF EXISTS surveys_photos_insert ON storage.objects;
CREATE POLICY surveys_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'surveys-photos');

DROP POLICY IF EXISTS surveys_photos_update_admin ON storage.objects;
CREATE POLICY surveys_photos_update_admin ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'surveys-photos' AND public.persona_tiene_rol('admin'));

DROP POLICY IF EXISTS surveys_photos_delete_admin ON storage.objects;
CREATE POLICY surveys_photos_delete_admin ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'surveys-photos' AND public.persona_tiene_rol('admin'));

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON SCHEMA surveys IS 'Módulo polivalente de levantamientos pre-cotización. Aislado del ERP. Sirve a Super Techos (impermeabilización, aislamiento) y Prouco (pisos epóxicos, pulido).';
COMMENT ON TABLE surveys.templates IS 'Catálogo de formularios. Cada template define el schema JSON que el frontend renderiza dinámicamente.';
COMMENT ON TABLE surveys.projects IS 'Proyectos por cliente. Tienen service_line y company. Un proyecto usa un template.';
COMMENT ON TABLE surveys.sites IS 'Sitios físicos a levantar: 1 sucursal, 1 nave, 1 terraza. Un proyecto tiene 1+N sites.';
COMMENT ON TABLE surveys.visits IS 'Cada visita en sitio. La data del formulario va en general_data (jsonb) y en surveys.areas.';
COMMENT ON TABLE surveys.areas IS 'Áreas físicas evaluadas. Los campos específicos del servicio van en "data" (jsonb), todo lo común en columnas.';
COMMENT ON TABLE surveys.photos IS 'Fotos. is_critical marca las que van al informe fotográfico de hallazgos.';

NOTIFY pgrst, 'reload schema';
