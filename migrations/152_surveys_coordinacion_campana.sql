-- v8.95.0: Coordinación de levantamientos por campaña (ej. pintura de las oficinas de Banreservas).
-- Aditiva e idempotente: el código anterior la ignora, así que se puede aplicar antes del despliegue.
-- La campaña es un proyecto aparte (es_campana) que NO entra en el Kanban, la Torre, el correo diario,
-- los KPIs ni el bono de los levantamientos normales. Técnico, día y revisión van por OFICINA (surveys.sites).
-- personal.id es TEXT: por eso no se usan sites.assigned_to ni visits.validated_by (UUID → auth.users).

ALTER TABLE surveys.projects ADD COLUMN IF NOT EXISTS es_campana boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_projects_es_campana ON surveys.projects(es_campana) WHERE es_campana;

ALTER TABLE surveys.sites
  ADD COLUMN IF NOT EXISTS zona                text,
  ADD COLUMN IF NOT EXISTS metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS asignado_a_id       text,
  ADD COLUMN IF NOT EXISTS asignado_a_nombre   text,
  ADD COLUMN IF NOT EXISTS asignado_por        text,
  ADD COLUMN IF NOT EXISTS asignado_at         timestamptz,
  ADD COLUMN IF NOT EXISTS visita_fecha        date,
  ADD COLUMN IF NOT EXISTS visita_franja       text,
  ADD COLUMN IF NOT EXISTS cita_confirmada     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cita_confirmada_por text,
  ADD COLUMN IF NOT EXISTS cita_confirmada_at  timestamptz,
  ADD COLUMN IF NOT EXISTS no_pudo_motivo      text,
  ADD COLUMN IF NOT EXISTS no_pudo_nota        text,
  ADD COLUMN IF NOT EXISTS no_pudo_at          timestamptz,
  ADD COLUMN IF NOT EXISTS validado_por        text,
  ADD COLUMN IF NOT EXISTS validado_at         timestamptz,
  ADD COLUMN IF NOT EXISTS devuelto_nota       text,
  ADD COLUMN IF NOT EXISTS devuelto_por        text,
  ADD COLUMN IF NOT EXISTS devuelto_at         timestamptz;

DO $$ BEGIN
  ALTER TABLE surveys.sites ADD CONSTRAINT sites_visita_franja_chk
    CHECK (visita_franja IS NULL OR visita_franja IN ('manana', 'tarde'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sites_asignado_fecha ON surveys.sites(asignado_a_id, visita_fecha);
CREATE INDEX IF NOT EXISTS idx_sites_project_zona   ON surveys.sites(project_id, zona);

-- Reglas del ERP: RLS apagado (sin tablas nuevas, sin grants nuevos).
ALTER TABLE surveys.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.sites    DISABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
