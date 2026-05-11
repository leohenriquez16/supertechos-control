-- ============================================================
-- Migración: Rotación persistente de fotos de facturas
-- ============================================================
-- v8.17.15 — cuando el admin gira la foto de una factura en el modal,
-- la rotación se guarda en la fila del movimiento y se aplica al cargar
-- la próxima vez. Así no hay que girar la foto cada vez que se abre.
--
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Idempotente.

ALTER TABLE caja_chica_movimientos
  ADD COLUMN IF NOT EXISTS rotacion_grados integer NOT NULL DEFAULT 0;

-- Validar que solo se guarden múltiplos de 90 grados (0, 90, 180, 270)
-- Si ya existe el check, lo ignoramos.
DO $$
BEGIN
  ALTER TABLE caja_chica_movimientos
    ADD CONSTRAINT caja_chica_rotacion_chk CHECK (rotacion_grados IN (0, 90, 180, 270));
EXCEPTION WHEN duplicate_object THEN
  -- ya existe, OK
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
