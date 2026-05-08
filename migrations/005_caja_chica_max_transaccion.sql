-- ============================================================
-- Migración: Máximo por transacción de caja chica
-- ============================================================
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Idempotente.

-- Monto máximo permitido por gasto individual desde la caja chica.
-- Cuando el maestro reporta un gasto, si el monto excede este valor el sistema
-- BLOQUEA el envío con un mensaje aclarando que pida reembolso especial al admin.
-- NULL = sin máximo (compatibilidad con personas sin la regla activada).
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS max_transaccion_caja_chica numeric(14, 2);

NOTIFY pgrst, 'reload schema';
