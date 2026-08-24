-- v8.41.0: SUPLIDORES como entidad del ERP (espejo de Odoo por odoo_partner_id)
-- con UNA O VARIAS locaciones (sucursales), y VIAJES amarrados al VEHÍCULO real
-- de la flota (historial de rutas futuras/pasadas por vehículo).

CREATE TABLE IF NOT EXISTS public.suplidores (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,               -- como vive en Odoo (al vincular se alinea)
  rnc TEXT,
  odoo_partner_id INT,                -- res.partner en Odoo (supplier)
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suplidores DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.suplidor_locaciones (
  id TEXT PRIMARY KEY,
  suplidor_id TEXT NOT NULL REFERENCES public.suplidores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,               -- "Principal", "Suc. 27 de Febrero", …
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  nota TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suplidor_locaciones DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_suplidor_locaciones_sup ON public.suplidor_locaciones(suplidor_id);

ALTER TABLE public.viajes
  ADD COLUMN IF NOT EXISTS vehiculo_id TEXT;   -- vehículo real de la flota
CREATE INDEX IF NOT EXISTS idx_viajes_vehiculo ON public.viajes(vehiculo_id);

NOTIFY pgrst, 'reload schema';
