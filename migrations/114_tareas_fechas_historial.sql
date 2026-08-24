-- v8.37.0: Tareas — hora límite, fecha planificada (cuándo pienso ejecutarla)
-- e historial de creación/asignaciones.
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS hora_limite TEXT,                              -- "HH:MM" opcional
  ADD COLUMN IF NOT EXISTS fecha_planificada DATE,
  ADD COLUMN IF NOT EXISTS historial JSONB NOT NULL DEFAULT '[]'::jsonb;  -- [{tipo, por, a?, at}]
NOTIFY pgrst, 'reload schema';
