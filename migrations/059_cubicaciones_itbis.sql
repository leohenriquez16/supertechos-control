-- v8.19.99: ITBIS en cubicaciones (modelo real Super Techos: subtotal + ITBIS 18%,
-- retención y amortización del anticipo sobre el TOTAL CON ITBIS). Aditivo.
ALTER TABLE cubicaciones
  ADD COLUMN IF NOT EXISTS itbis_pct numeric(5,2) DEFAULT 18,
  ADD COLUMN IF NOT EXISTS itbis_monto numeric(14,2) DEFAULT 0;
NOTIFY pgrst, 'reload schema';
