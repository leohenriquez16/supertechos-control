-- v8.26.9: maestro responsable POR TAREA (caso Ayac Mercedes: Luis Segura hace
-- demolición y Osman hace grietas/pulido DENTRO de la misma área). La nómina
-- atribuye los m² de cada tarea a su responsable: maestros_tareas[tareaId] >
-- maestro del área > maestro principal.
ALTER TABLE public.proyectos
  ADD COLUMN IF NOT EXISTS maestros_tareas JSONB DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
