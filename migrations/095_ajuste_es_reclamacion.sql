-- v8.27.4: marcar un ajuste de nómina como "reclamación genérica" sin requerir
-- una reclamación real (la tabla reclamaciones del ERP aún está vacía). Cuando se
-- desarrolle el módulo, reclamacion_id apuntará a la reclamación específica.
ALTER TABLE public.ajustes_nomina
  ADD COLUMN IF NOT EXISTS es_reclamacion BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
