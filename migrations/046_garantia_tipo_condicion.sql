-- v8.19.70: tipificar garantías y marcar el mantenimiento obligatorio.
-- garantias.tipo: key del catálogo (lib/garantiasCatalogo.js). condicion: texto de
-- la condición de la garantía. mantenimientos.obligatorio: si su incumplimiento
-- suspende la garantía (true) o es solo recomendado/vendible (false).
-- Estado 'suspendida' se computa en lectura (no requiere columna nueva).
-- Idempotente.

ALTER TABLE public.garantias
  ADD COLUMN IF NOT EXISTS tipo      TEXT,
  ADD COLUMN IF NOT EXISTS condicion TEXT;

ALTER TABLE public.mantenimientos
  ADD COLUMN IF NOT EXISTS obligatorio BOOLEAN NOT NULL DEFAULT TRUE;

NOTIFY pgrst, 'reload schema';
