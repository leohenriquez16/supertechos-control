-- v8.25.0: orden custom de las columnas del Kanban de Levantamientos (admin).
ALTER TABLE public.config ADD COLUMN IF NOT EXISTS kanban_lev_orden JSONB;
NOTIFY pgrst, 'reload schema';
