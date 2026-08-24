-- v8.42.0: documento adjunto en la parada (OC / cotización / factura) — el chofer
-- lo muestra al retirar donde el suplidor.
ALTER TABLE public.viaje_paradas
  ADD COLUMN IF NOT EXISTS doc_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_nombre TEXT;
NOTIFY pgrst, 'reload schema';
