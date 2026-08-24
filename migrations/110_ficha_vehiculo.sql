-- v8.33.0: Ficha COMPLETA del vehículo + log de eventos (mantenimientos, fallas,
-- choques, daños) + responsable con su vista "Mi vehículo".
ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS responsable_id TEXT,           -- persona a cargo del vehículo
  ADD COLUMN IF NOT EXISTS tipo TEXT,                     -- camion | camioneta | carro | motor | equipo
  ADD COLUMN IF NOT EXISTS capacidad_carga_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS combustible TEXT,              -- diesel | gasolina | glp
  ADD COLUMN IF NOT EXISTS odometro_km INTEGER,
  ADD COLUMN IF NOT EXISTS odometro_fecha DATE,
  ADD COLUMN IF NOT EXISTS matricula_vence DATE,          -- renovación de placa/marbete
  ADD COLUMN IF NOT EXISTS revision_vence DATE,           -- revisión técnica / inspección
  ADD COLUMN IF NOT EXISTS tag_peaje TEXT,                -- Paso Rápido
  ADD COLUMN IF NOT EXISTS estado_operativo TEXT DEFAULT 'activo',  -- activo | en_taller | fuera_servicio
  ADD COLUMN IF NOT EXISTS proximo_mant_km INTEGER,
  ADD COLUMN IF NOT EXISTS proximo_mant_fecha DATE;

CREATE TABLE IF NOT EXISTS public.vehiculo_eventos (
  id TEXT PRIMARY KEY,
  vehiculo_id TEXT NOT NULL,
  tipo TEXT NOT NULL,               -- mantenimiento | falla_mecanica | choque | dano | gomas | inspeccion | otro
  fecha DATE NOT NULL,
  km INTEGER,
  descripcion TEXT NOT NULL,
  costo_rd NUMERIC,
  taller TEXT,
  reportado_por_id TEXT, reportado_por_nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'abierto',  -- abierto | en_taller | resuelto
  resuelto_at TIMESTAMPTZ, resuelto_nota TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehiculo_eventos_veh ON public.vehiculo_eventos (vehiculo_id, fecha);
ALTER TABLE public.vehiculo_eventos DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- v8.33.0 (2): Tareas con SUPERVISOR además del responsable — para delegar y
-- que cada quien vea "las que me tocan" y "las que superviso".
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS supervisor_id TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_nombre TEXT;

NOTIFY pgrst, 'reload schema';
