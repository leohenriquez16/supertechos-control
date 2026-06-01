-- v8.19.95+: cubicaciones mensuales con amortización de avances (anticipo).
--   proyectos.anticipo_monto: avance/anticipo recibido del cliente.
--   proyectos.amortizacion_pct: % de cada cubicación que amortiza el anticipo.
--   cubicaciones.amortizacion_monto: monto amortizado en esa cubicación.
-- Aditivo. Idempotente.
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS anticipo_monto numeric(14,2),
  ADD COLUMN IF NOT EXISTS amortizacion_pct numeric(5,2);
ALTER TABLE cubicaciones
  ADD COLUMN IF NOT EXISTS amortizacion_monto numeric(14,2) DEFAULT 0;
NOTIFY pgrst, 'reload schema';
