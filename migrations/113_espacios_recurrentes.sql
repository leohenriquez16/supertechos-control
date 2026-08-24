-- v8.34.0: ESPACIOS administrativos (proyectos internos, separados de las obras)
-- + TAREAS RECURRENTES (calendario de obligaciones: pagos, impuestos, cierres).
-- Los espacios NO tocan producción, bonos, analíticas ni Plan de Obras.

CREATE TABLE IF NOT EXISTS public.proyectos_internos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  area TEXT,                          -- Finanzas, Gerencia, Comercial, RRHH, Logística…
  descripcion TEXT,
  responsable_id TEXT,
  responsable_nombre TEXT,
  fecha_meta DATE,
  estado TEXT NOT NULL DEFAULT 'activo',  -- activo | completado | archivado
  creado_por_id TEXT,
  creado_por_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.proyectos_internos DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS proyecto_interno_id TEXT;

CREATE TABLE IF NOT EXISTS public.tareas_recurrentes (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  area TEXT,
  proyecto_interno_id TEXT,
  responsable_id TEXT,
  responsable_nombre TEXT,
  supervisor_id TEXT,
  supervisor_nombre TEXT,
  prioridad TEXT NOT NULL DEFAULT 'normal',
  frecuencia TEXT NOT NULL,           -- mensual | quincenal | semanal
  dia_mes INT,                        -- mensual/quincenal: día del mes (1-31, se ajusta al último día)
  dia_mes_2 INT,                      -- quincenal: segundo día del mes
  dia_semana INT,                     -- semanal: 0=domingo … 6=sábado
  dias_aviso INT NOT NULL DEFAULT 3,  -- la tarea nace N días antes de la fecha
  activo BOOLEAN NOT NULL DEFAULT true,
  ultima_generada DATE,               -- última ocurrencia ya convertida en tarea
  creado_por_id TEXT,
  creado_por_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tareas_recurrentes DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
