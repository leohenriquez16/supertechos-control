-- v8.39.0: FLUJO DE COMPRAS en las requisiciones.
-- Renglón sin stock → "solicitado a compras" → cotizado → esperando aprobación → comprado.
-- La requisición puede nacer como COMPRA con su cotización adjunta; la IA la lee
-- y genera la OC en borrador en Odoo (se guarda id/nombre de la OC).
ALTER TABLE public.requisicion_items
  ADD COLUMN IF NOT EXISTS estado_compra TEXT;  -- null (en stock) | solicitado | cotizado | esperando_aprobacion | comprado

ALTER TABLE public.requisiciones
  ADD COLUMN IF NOT EXISTS es_compra BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cotizacion_url TEXT,
  ADD COLUMN IF NOT EXISTS oc_odoo_id INT,
  ADD COLUMN IF NOT EXISTS oc_odoo_name TEXT;

NOTIFY pgrst, 'reload schema';
