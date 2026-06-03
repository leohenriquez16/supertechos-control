-- v8.20.9: país en las locaciones del cliente (sugerido por geocodificación inversa
-- al fijar las coordenadas). sector/ciudad/provincia ya existían. Idempotente.

ALTER TABLE public.cliente_ubicaciones
  ADD COLUMN IF NOT EXISTS pais TEXT;

NOTIFY pgrst, 'reload schema';
