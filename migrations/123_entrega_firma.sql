-- v8.42.0: PRUEBA DE ENTREGA en la parada — al entregar en la obra, el maestro
-- firma en el celular del chofer y el chofer tira la foto del material entregado.
ALTER TABLE public.viaje_paradas
  ADD COLUMN IF NOT EXISTS entrega_foto_url TEXT,
  ADD COLUMN IF NOT EXISTS entrega_firma_url TEXT,
  ADD COLUMN IF NOT EXISTS recibido_por_nombre TEXT;
NOTIFY pgrst, 'reload schema';
