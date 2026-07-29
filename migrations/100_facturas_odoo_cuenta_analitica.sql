-- v8.27.40: [Facturas → Odoo] cuenta analítica manual (el "número en lapicero azul"
-- que se escribe en la factura física = el proyecto/centro de costo al que se carga).
-- Odoo usa la cuenta analítica (no la ref del ERP); por eso se captura aparte y sale
-- tal cual en el CSV de importación.
ALTER TABLE public.facturas_odoo
  ADD COLUMN IF NOT EXISTS cuenta_analitica TEXT;

NOTIFY pgrst, 'reload schema';
