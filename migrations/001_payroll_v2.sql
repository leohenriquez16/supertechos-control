-- ============================================================
-- Migración: Payroll v2 (estado de pago por proyecto + avances dirigidos)
-- ============================================================
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Es idempotente: se puede correr múltiples veces sin efectos secundarios.

-- 1. Vincular cada recibo de detalle_nomina al proyecto específico.
--    Permite calcular cuánto se ha pagado en cada proyecto.
ALTER TABLE detalle_nomina
  ADD COLUMN IF NOT EXISTS proyecto_id text;

CREATE INDEX IF NOT EXISTS idx_detalle_nomina_proyecto_id
  ON detalle_nomina(proyecto_id);

-- 2. Vincular un avance/ajuste opcionalmente a un proyecto.
--    Cuando se cierra el siguiente corte, los avances con proyecto_id
--    se descuentan automáticamente al maestro en ese corte.
ALTER TABLE ajustes_nomina
  ADD COLUMN IF NOT EXISTS proyecto_id text;

CREATE INDEX IF NOT EXISTS idx_ajustes_nomina_proyecto_id
  ON ajustes_nomina(proyecto_id);
