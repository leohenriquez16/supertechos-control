-- ============================================================
-- Migración: Empresa receptora en movimientos de caja chica
-- ============================================================
-- v8.17.25 — Las facturas se reciben dirigidas a Super Techos
-- (RNC 130774331) o a Prouco Group Dominicana (RNC 131515541). El
-- contador necesita separar las compras por empresa receptora para
-- la declaración 606 y la deducción de ITBIS. Las facturas sin
-- comprobante fiscal (informal) no aplican y quedan en NULL.
--
-- Idempotente.

ALTER TABLE caja_chica_movimientos
  ADD COLUMN IF NOT EXISTS empresa_receptora text;

-- Validar: solo valores conocidos o NULL (sin factura)
DO $$
BEGIN
  ALTER TABLE caja_chica_movimientos
    ADD CONSTRAINT caja_chica_empresa_receptora_chk
    CHECK (empresa_receptora IS NULL OR empresa_receptora IN ('super_techos', 'prouco'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Índice para queries de export (filtros por empresa)
CREATE INDEX IF NOT EXISTS idx_caja_chica_empresa_receptora
  ON caja_chica_movimientos(empresa_receptora);

NOTIFY pgrst, 'reload schema';
