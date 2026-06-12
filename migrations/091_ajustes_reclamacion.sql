-- v8.26.8: pagos de mano de obra por RECLAMACIÓN.
-- Un ajuste de nómina puede quedar vinculado a una reclamación: se registra
-- desde la ficha de la reclamación (días × tarifa) y cae al corte abierto por
-- su fecha como cualquier ajuste. Permite además sumar el costo MDO por reclamación.
ALTER TABLE public.ajustes_nomina
  ADD COLUMN IF NOT EXISTS reclamacion_id TEXT REFERENCES public.reclamaciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ajustes_nomina_reclamacion ON public.ajustes_nomina(reclamacion_id) WHERE reclamacion_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
