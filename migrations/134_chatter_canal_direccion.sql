-- 134_chatter_canal_direccion.sql
-- v8.54.0 (Comunicación · C1 — Bitácora unificada): el chatter (chatter_mensajes) pasa a ser la
-- BITÁCORA DE COMUNICACIÓN con el cliente además de la de eventos/notas internas. Agregamos:
--   - canal: whatsapp | correo | llamada | presencial | formulario | sistema
--   - direccion: saliente (le escribimos al cliente) | entrante (el cliente nos escribió) | interno
-- Las notas/eventos existentes quedan con canal/direccion NULL (se tratan como 'interno').
-- chatter_mensajes es tabla pública (RLS off) → solo ALTER + NOTIFY.

ALTER TABLE public.chatter_mensajes
  ADD COLUMN IF NOT EXISTS canal     TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT;

NOTIFY pgrst, 'reload schema';
