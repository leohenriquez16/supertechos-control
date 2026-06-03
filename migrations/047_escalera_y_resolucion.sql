-- v8.19.72: datos para la vista del maestro.
-- surveys.projects.requiere_escalera: si el levantamiento necesita escalera y de
--   qué tipo. Valores: 'no' (no hace falta) | 'normal' | 'larga' (larga para subir).
--   NULL = sin especificar.
-- reclamaciones.trabajo_realizado: qué se hizo al resolver (fecha_resuelta = cuándo).
-- Idempotente.

ALTER TABLE surveys.projects
  ADD COLUMN IF NOT EXISTS requiere_escalera TEXT;

ALTER TABLE public.reclamaciones
  ADD COLUMN IF NOT EXISTS trabajo_realizado TEXT;

NOTIFY pgrst, 'reload schema';
