-- v8.19.69: referencias a Odoo para importar clientes con sus contactos y
-- direcciones de entrega de forma idempotente (sin duplicar en re-sync).
-- clientes.odoo_partner_id ya lo usa el código (lib/db.js) pero faltaba en LOCAL.
-- Idempotente.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS odoo_partner_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_clientes_odoo ON public.clientes(odoo_partner_id);

ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS odoo_partner_id INTEGER;

ALTER TABLE public.cliente_ubicaciones
  ADD COLUMN IF NOT EXISTS odoo_address_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_ubic_odoo ON public.cliente_ubicaciones(odoo_address_id);

NOTIFY pgrst, 'reload schema';
