-- Rutas + GPS: cruce de las paradas del viaje con el historial del GPS (Pressto/GPSWOX).
-- Cada parada guarda cuándo llegó y se fue el camión según el GPS, cuánto tiempo
-- estuvo y a qué distancia quedó del punto. completada_por dice quién la cerró:
-- 'chofer' | 'oficina' | 'gps'. completada_lat/lng = dónde estaba al cerrarla.
-- RLS se queda OFF (no se activa aquí).
ALTER TABLE viaje_paradas
  ADD COLUMN IF NOT EXISTS llegada_gps_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS salida_gps_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS permanencia_gps_s INT,
  ADD COLUMN IF NOT EXISTS distancia_gps_m INT,
  ADD COLUMN IF NOT EXISTS completada_por TEXT,
  ADD COLUMN IF NOT EXISTS completada_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS completada_lng NUMERIC;

-- Última vez que se cruzó el viaje con el GPS.
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS gps_revisado_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
