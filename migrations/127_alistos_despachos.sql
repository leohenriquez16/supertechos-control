-- v8.48.0: ALISTOS — el almacén no solo prepara pedidos de OBRA; también alista
-- DESPACHOS/VENTAS de material (a un cliente, sin obra). Cada alisto tiene un MODO
-- DE ENTREGA:
--   envio  → sale en vehículo → cae a Rutas como parada (flujo actual)
--   retiro → el cliente/tercero pasa a buscarlo → se firma en el almacén (no va a Rutas)
--
-- Se extiende la tabla `requisiciones` (que ya es la cola del almacén) en vez de crear
-- una tabla paralela: así reusa el Kanban, el feed de Rutas y la firma de entrega.
-- El ERP NO escribe a Odoo: la salida real se valida en Odoo aparte (regla read-only).

ALTER TABLE public.requisiciones
  ALTER COLUMN proyecto_id DROP NOT NULL;  -- los despachos/ventas no tienen obra

ALTER TABLE public.requisiciones
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'obra',           -- obra | despacho
  ADD COLUMN IF NOT EXISTS modo_entrega TEXT NOT NULL DEFAULT 'envio',  -- envio | retiro
  ADD COLUMN IF NOT EXISTS cliente_nombre TEXT,                          -- para despachos sin obra
  ADD COLUMN IF NOT EXISTS referencia TEXT,                              -- cotización/venta (ST-####, PG-####)
  -- sign-off del RETIRO (cuando el cliente/tercero pasa a buscar el material)
  ADD COLUMN IF NOT EXISTS retiro_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS retiro_cedula TEXT,
  ADD COLUMN IF NOT EXISTS retiro_firma_url TEXT,
  ADD COLUMN IF NOT EXISTS retiro_foto_url TEXT,
  ADD COLUMN IF NOT EXISTS retirada_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_requisiciones_modo_entrega ON public.requisiciones (modo_entrega);
CREATE INDEX IF NOT EXISTS idx_requisiciones_tipo ON public.requisiciones (tipo);

NOTIFY pgrst, 'reload schema';
