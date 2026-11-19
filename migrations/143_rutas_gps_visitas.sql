-- 143: Rutas — visitas detectadas por GPS y quién completó cada parada.
-- llegada/salida/permanencia/distancia las llena /api/rutas/revisar-gps cruzando
-- el historial del GPS (GPSWOX) con las paradas del viaje.
-- completada_por: 'chofer' | 'oficina' | 'gps'; completada_lat/lng = dónde se marcó.
-- RLS se queda OFF (igual que el resto de logística).
ALTER TABLE public.viaje_paradas
  ADD COLUMN IF NOT EXISTS llegada_gps_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS salida_gps_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS permanencia_gps_s INT,
  ADD COLUMN IF NOT EXISTS distancia_gps_m INT,
  ADD COLUMN IF NOT EXISTS completada_por TEXT,
  ADD COLUMN IF NOT EXISTS completada_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS completada_lng NUMERIC;

ALTER TABLE public.viajes
  ADD COLUMN IF NOT EXISTS gps_revisado_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
