-- ============================================================
-- Migración: Caja Chica — Límite por persona
-- ============================================================
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Idempotente.

-- Límite máximo de caja chica que la oficina puede entregar a esta persona
-- antes de que reporte/cuadre. NULL = sin límite explícito (no recomendado).
-- La advertencia visual aparece cuando el saldo cae a < 20% del límite,
-- y cambia a "consumido" cuando llega a 0 o negativo.
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS limite_caja_chica numeric(14, 2);
