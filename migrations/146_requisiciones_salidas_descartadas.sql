-- v8.84.0: amarre pedido ↔ salida de Odoo por cotización (sin depender del REQ en el origen).
-- odoo_pickings_fijos: salidas de Odoo (stock.picking id) elegidas para el pedido ("Es de este"
--   o la salida automática, que fija todas las que el amarre le dio).
-- odoo_pickings_descartados: las que la oficina dijo que NO son de este pedido (o deshizo).
ALTER TABLE public.requisiciones
  ADD COLUMN IF NOT EXISTS odoo_pickings_fijos BIGINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS odoo_pickings_descartados BIGINT[] NOT NULL DEFAULT '{}';
NOTIFY pgrst, 'reload schema';
