-- v8.20.3: Áreas dentro de la locación del cliente.
-- Una locación (cliente_ubicaciones) puede tener varias áreas tipo proyecto
-- ({ id, nombre, m2, sistemaId, precioVentaM2 }). Reutilizables por
-- levantamientos y proyectos que cuelguen de esa locación.
-- Idempotente.

ALTER TABLE public.cliente_ubicaciones
  ADD COLUMN IF NOT EXISTS areas JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
