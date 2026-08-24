-- v8.40.0: DILIGENCIAS de logística + LUGARES FRECUENTES.
-- 1) Material SOBRANTE en obra: el maestro lo reporta con foto y listado → queda
--    como diligencia "sin planificar" en Rutas (recordatorio) hasta montarla en
--    un viaje; al completar la parada, la diligencia se cierra sola.
-- 2) Lugares frecuentes (suplidores, puertos, almacenes fiscales/propios) con
--    coordenadas: la parada libre se autollena y el mapa los ubica.

CREATE TABLE IF NOT EXISTS public.diligencias (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'retiro_sobrante',   -- retiro_sobrante | recogida | otro
  proyecto_id TEXT,
  descripcion TEXT,                               -- listado de lo que hay que retirar
  foto_url TEXT,
  estado TEXT NOT NULL DEFAULT 'sin_planificar',  -- sin_planificar | asignada | completada | cancelada
  viaje_id TEXT,
  creado_por_id TEXT, creado_por_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  asignada_at TIMESTAMPTZ, completada_at TIMESTAMPTZ
);
ALTER TABLE public.diligencias DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lugares_logisticos (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'suplidor',          -- suplidor | puerto | almacen_fiscal | almacen | otro
  nombre TEXT NOT NULL,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  nota TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lugares_logisticos DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.viaje_paradas
  ADD COLUMN IF NOT EXISTS diligencia_id TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Puertos principales precargados (coordenadas aproximadas — editables en Rutas → 📍 Lugares)
INSERT INTO public.lugares_logisticos (id, tipo, nombre, lat, lng) VALUES
  ('lug_haina',   'puerto', 'Puerto Río Haina',            18.4242, -70.0064),
  ('lug_caucedo', 'puerto', 'Puerto Multimodal Caucedo',   18.4264, -69.6289),
  ('lug_sansouci','puerto', 'Puerto Sans Soucí (SD Este)', 18.4642, -69.8764)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
