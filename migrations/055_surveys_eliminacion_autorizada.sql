-- v8.19.90: borrado de levantamientos con autorización del owner.
-- El owner (asignado_a_id) puede borrar. Si un admin quiere borrar, deja una
-- solicitud y el owner autoriza. Aditivo. Idempotente.
ALTER TABLE surveys.projects
  ADD COLUMN IF NOT EXISTS eliminacion_solicitada_por        TEXT,
  ADD COLUMN IF NOT EXISTS eliminacion_solicitada_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS eliminacion_solicitada_at         TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';
