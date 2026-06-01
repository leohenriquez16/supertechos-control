-- v8.19.91: borrado de reclamaciones con autorización del owner del app.
-- Aditivo. Idempotente.
ALTER TABLE public.reclamaciones
  ADD COLUMN IF NOT EXISTS eliminacion_solicitada_por        TEXT,
  ADD COLUMN IF NOT EXISTS eliminacion_solicitada_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS eliminacion_solicitada_at         TIMESTAMPTZ;
NOTIFY pgrst, 'reload schema';
