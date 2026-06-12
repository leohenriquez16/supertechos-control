-- v8.26.7: pago por PERSONA dentro del proyecto (2 maestros con sistemas/precios
-- distintos en la misma obra). costos_dia_proyecto pasa a ser el override general
-- de pago por (proyecto, persona): tarifa por día (ya existía), precio m² fijo y
-- modo de pago propio (hereda el del proyecto si es NULL). Aplicada a prod. Idempotente.

ALTER TABLE public.costos_dia_proyecto ADD COLUMN IF NOT EXISTS precio_m2 NUMERIC(14,2);
ALTER TABLE public.costos_dia_proyecto ADD COLUMN IF NOT EXISTS modo_pago TEXT;

NOTIFY pgrst, 'reload schema';
