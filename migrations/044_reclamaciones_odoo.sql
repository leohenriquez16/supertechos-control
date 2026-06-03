-- v8.19.66: campos para sincronizar reclamaciones desde Odoo Helpdesk.
-- odoo_stage: etapa real del ticket (para el Kanban). odoo_ticket_id: llave de
-- sync/anti-duplicado. cliente_nombre: nombre del partner cuando aún no hay match
-- con un cliente local. Idempotente.

ALTER TABLE public.reclamaciones
  ADD COLUMN IF NOT EXISTS odoo_stage     TEXT,
  ADD COLUMN IF NOT EXISTS odoo_ticket_id INTEGER,
  ADD COLUMN IF NOT EXISTS cliente_nombre TEXT;

CREATE INDEX IF NOT EXISTS idx_reclamaciones_odoo ON public.reclamaciones(odoo_ticket_id);

NOTIFY pgrst, 'reload schema';
