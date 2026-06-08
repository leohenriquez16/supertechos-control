-- v8.25.38: columna odoo_stage en surveys.projects (etapa del pipeline de
-- "Levantamientos" de Odoo). Existía en local pero faltaba en PRODUCCIÓN, por lo que
-- cambiar la etapa (setEtapaSurvey) y finalizar/reabrir el levantamiento fallaban con:
--   "Could not find the 'odoo_stage' column of 'projects' in the schema cache".
-- El Kanban se veía bien porque para mostrar usa `status` como respaldo; solo fallaba
-- al ESCRIBIR la etapa. Aplicada a prod el 2026-06-08. Idempotente.

ALTER TABLE surveys.projects ADD COLUMN IF NOT EXISTS odoo_stage TEXT;

NOTIFY pgrst, 'reload schema';
