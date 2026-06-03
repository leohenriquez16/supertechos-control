-- v8.19.85: agendar visitas de reclamaciones en el calendario de Levantamientos.
-- Aditivo. Idempotente.
ALTER TABLE public.reclamaciones
  ADD COLUMN IF NOT EXISTS fecha_visita_programada DATE;
NOTIFY pgrst, 'reload schema';
