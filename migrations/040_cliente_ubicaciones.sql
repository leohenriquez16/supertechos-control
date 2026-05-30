-- v8.19.54: Ubicaciones/localidades por cliente (base del "Cliente 360").
-- Un cliente puede tener muchas localidades; proyectos, levantamientos, garantías,
-- mantenimientos y reclamaciones cuelgan de una ubicación.
-- Unificación: los "sites" de levantamientos se ligan a una ubicación de cliente.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.cliente_ubicaciones (
  id                TEXT PRIMARY KEY,
  cliente_id        TEXT NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,                 -- ej. "Sucursal Naco", "Torre principal"
  direccion         TEXT,
  sector            TEXT,
  ciudad            TEXT,
  provincia         TEXT,
  latitud           NUMERIC(10,6),
  longitud          NUMERIC(10,6),
  contacto_nombre   TEXT,
  contacto_telefono TEXT,
  notas             TEXT,
  archivado         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cliente_ubicaciones_cliente ON public.cliente_ubicaciones(cliente_id);

-- Ligar proyectos a una ubicación del cliente (nullable, retro-compatible).
ALTER TABLE public.proyectos
  ADD COLUMN IF NOT EXISTS ubicacion_id TEXT REFERENCES public.cliente_ubicaciones(id) ON DELETE SET NULL;

-- Unificación con levantamientos: cada site puede pertenecer a un cliente + ubicación.
ALTER TABLE surveys.sites
  ADD COLUMN IF NOT EXISTS cliente_id   TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_id TEXT;

NOTIFY pgrst, 'reload schema';
