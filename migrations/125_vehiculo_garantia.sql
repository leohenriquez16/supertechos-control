-- v8.44.0: GARANTÍA del vehículo — si está vigente, el mantenimiento se hace en
-- la casa (dealer) para no perderla.
ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS garantia_vence DATE,
  ADD COLUMN IF NOT EXISTS garantia_km INT,          -- límite de km de la garantía
  ADD COLUMN IF NOT EXISTS garantia_casa TEXT,       -- dealer (ej. Santo Domingo Motors)
  ADD COLUMN IF NOT EXISTS garantia_notas TEXT;
NOTIFY pgrst, 'reload schema';
