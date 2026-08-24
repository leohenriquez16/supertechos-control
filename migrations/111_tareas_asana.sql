-- v8.33.2: Tareas nivel task manager — prioridad y comentarios.
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'normal',   -- alta | normal | baja
  ADD COLUMN IF NOT EXISTS comentarios JSONB NOT NULL DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';
