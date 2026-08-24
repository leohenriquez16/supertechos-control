-- v8.33.4: Subtareas (checklist) y likes 👍 en las tareas.
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS subtareas JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{texto, hecha}]
  ADD COLUMN IF NOT EXISTS likes JSONB NOT NULL DEFAULT '[]'::jsonb;      -- [{porId, porNombre}]
NOTIFY pgrst, 'reload schema';
