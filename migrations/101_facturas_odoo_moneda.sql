-- v8.27.42: [Facturas → Odoo] moneda de la factura. Hay facturas en US$ (y algunas EUR)
-- además de RD$; Odoo necesita la moneda (currency_id) o mete el monto como pesos.
-- Se guarda el código Odoo: DOP | USD | EUR. Default DOP (la mayoría, no cambia nada).
ALTER TABLE public.facturas_odoo
  ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'DOP';

NOTIFY pgrst, 'reload schema';
