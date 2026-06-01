-- v8.19.84: [Levantamientos · Fase 5] fecha programada de la visita (para el
-- calendario). Aditivo. El check-in real sigue en visits.checkin_at. Idempotente.
ALTER TABLE surveys.projects
  ADD COLUMN IF NOT EXISTS fecha_visita_programada DATE;
NOTIFY pgrst, 'reload schema';
