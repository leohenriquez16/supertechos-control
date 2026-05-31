-- v8.19.65: habilitar personal para hacer levantamientos + asignar personal a un levantamiento.
-- - personal.levantamiento_habilitado: el admin lo activa por persona (como caja chica).
-- - surveys.projects.asignado_a_id / asignado_a_nombre: persona asignada al levantamiento.
-- Idempotente.

ALTER TABLE public.personal
  ADD COLUMN IF NOT EXISTS levantamiento_habilitado BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE surveys.projects
  ADD COLUMN IF NOT EXISTS asignado_a_id     TEXT,
  ADD COLUMN IF NOT EXISTS asignado_a_nombre TEXT;

NOTIFY pgrst, 'reload schema';
