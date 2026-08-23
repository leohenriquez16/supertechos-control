-- v8.29.0: Módulo de Logística — requisiciones de materiales desde obra + rutas/viajes
-- de camiones + jornada del chofer (para horas extras).
--
-- Flujo de una requisición: la obra la pide (adiós WhatsApp) → almacén la prepara y la
-- marca LISTA → logística la monta en un viaje (camión propio o envío pagado) → el chofer
-- la marca entregada en su ruta. Estados:
--   pendiente → preparando → lista → en_ruta → entregada   (o cancelada)

CREATE TABLE IF NOT EXISTS public.requisiciones (
  id TEXT PRIMARY KEY,
  proyecto_id TEXT NOT NULL,
  solicitado_por_id TEXT,
  solicitado_por_nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  urgente BOOLEAN NOT NULL DEFAULT FALSE,
  notas TEXT,
  lista_at TIMESTAMPTZ,
  entregada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requisiciones_proyecto ON public.requisiciones (proyecto_id);
CREATE INDEX IF NOT EXISTS idx_requisiciones_estado ON public.requisiciones (estado);

CREATE TABLE IF NOT EXISTS public.requisicion_items (
  id TEXT PRIMARY KEY,
  requisicion_id TEXT NOT NULL REFERENCES public.requisiciones(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC,
  unidad TEXT,
  despachado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requisicion_items_req ON public.requisicion_items (requisicion_id);

-- Viajes: un viaje = un chofer (o envío pagado) en una fecha, con paradas ordenadas.
-- hora_inicio / hora_fin del viaje son la JORNADA del chofer ese día → horas extras.
CREATE TABLE IF NOT EXISTS public.viajes (
  id TEXT PRIMARY KEY,
  fecha DATE NOT NULL,
  chofer_id TEXT,                        -- NULL cuando es envío pagado
  chofer_nombre TEXT,
  vehiculo TEXT,                         -- descripción libre (camión, envío pagado, etc.)
  tipo_envio TEXT NOT NULL DEFAULT 'camion',  -- 'camion' | 'pagado'
  estado TEXT NOT NULL DEFAULT 'planificado', -- planificado | en_curso | completado
  hora_inicio TIMESTAMPTZ,
  hora_fin TIMESTAMPTZ,
  notas TEXT,
  creado_por_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_viajes_fecha ON public.viajes (fecha);
CREATE INDEX IF NOT EXISTS idx_viajes_chofer ON public.viajes (chofer_id, fecha);

CREATE TABLE IF NOT EXISTS public.viaje_paradas (
  id TEXT PRIMARY KEY,
  viaje_id TEXT NOT NULL REFERENCES public.viajes(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'entrega',  -- 'recogida' | 'entrega'
  lugar TEXT,                            -- texto libre: puerto, almacén fiscal, suplidor…
  proyecto_id TEXT,                      -- cuando la parada es una obra
  requisicion_id TEXT,                   -- cuando la parada entrega una requisición
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | completada
  completada_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_viaje_paradas_viaje ON public.viaje_paradas (viaje_id, orden);
CREATE INDEX IF NOT EXISTS idx_viaje_paradas_req ON public.viaje_paradas (requisicion_id);

NOTIFY pgrst, 'reload schema';
