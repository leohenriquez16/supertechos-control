-- v8.26.10: el upsert parcial de overrides de pago (guardarPagoPersonaProyecto)
-- puede INSERTAR una fila nueva solo con modo_pago/precio_m2; costo_dia era
-- NOT NULL sin default y el insert fallaba para personas sin fila previa.
ALTER TABLE public.costos_dia_proyecto ALTER COLUMN costo_dia SET DEFAULT 0;

NOTIFY pgrst, 'reload schema';
