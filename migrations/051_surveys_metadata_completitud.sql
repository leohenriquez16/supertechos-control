-- v8.19.81: [Levantamientos · Fase 2] metadata del brief + completitud.
-- Columnas nuevas en surveys.projects (aditivo, no toca nada existente):
--   porcentaje_completitud, codigo (LEV-2026-xxxx), canal_origen,
--   monto_estimado_min / monto_estimado_max.
-- Idempotente.

ALTER TABLE surveys.projects
  ADD COLUMN IF NOT EXISTS porcentaje_completitud INTEGER,
  ADD COLUMN IF NOT EXISTS codigo                 TEXT,
  ADD COLUMN IF NOT EXISTS canal_origen           TEXT,
  ADD COLUMN IF NOT EXISTS monto_estimado_min     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS monto_estimado_max     NUMERIC(14,2);

NOTIFY pgrst, 'reload schema';
