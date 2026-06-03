-- v8.25.0: marca de tiempo de la última vez que el levantamiento cambió de etapa,
-- para mostrar "tiempo en etapa" en el Kanban. Backfill con updated_at/created_at.
ALTER TABLE surveys.projects ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;
UPDATE surveys.projects SET stage_changed_at = COALESCE(stage_changed_at, updated_at, created_at) WHERE stage_changed_at IS NULL;
NOTIFY pgrst, 'reload schema';
