-- v8.19.55: Módulo de Garantías + Mantenimientos.
-- Una garantía arranca al cerrar un proyecto/área. Cuelga de cliente + ubicación,
-- referencia la cotización (llave universal) y opcionalmente el proyecto en ERP
-- (nullable, para poder importar de Odoo sin reconstruir el proyecto).
-- Cada garantía genera un calendario de mantenimientos/inspecciones.
-- Idempotente.

-- Términos de garantía por sistema.
ALTER TABLE public.sistemas
  ADD COLUMN IF NOT EXISTS garantia_meses INTEGER,           -- duración de la garantía (ej. 60)
  ADD COLUMN IF NOT EXISTS mantenimiento_cada_meses INTEGER; -- frecuencia de inspección (ej. 12)

CREATE TABLE IF NOT EXISTS public.garantias (
  id                     TEXT PRIMARY KEY,
  codigo                 TEXT,                               -- GAR-2026-0001
  cliente_id             TEXT REFERENCES public.clientes(id) ON DELETE SET NULL,
  ubicacion_id           TEXT REFERENCES public.cliente_ubicaciones(id) ON DELETE SET NULL,
  proyecto_id            TEXT REFERENCES public.proyectos(id) ON DELETE SET NULL,
  referencia_cotizacion  TEXT,                               -- # SO de Odoo (llave universal)
  sistema_id             TEXT,
  sistema_nombre         TEXT,
  fecha_inicio           DATE,
  duracion_meses         INTEGER,
  fecha_vencimiento      DATE,
  estado                 TEXT NOT NULL DEFAULT 'vigente',    -- vigente|por_vencer|vencida|anulada
  cobertura              TEXT,
  m2                     NUMERIC(12,2),
  monto                  NUMERIC(14,2),
  notas                  TEXT,
  origen                 TEXT NOT NULL DEFAULT 'erp',        -- erp|odoo|manual
  archivado              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_garantias_cliente ON public.garantias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_garantias_proyecto ON public.garantias(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_garantias_cotizacion ON public.garantias(referencia_cotizacion);

CREATE TABLE IF NOT EXISTS public.mantenimientos (
  id                TEXT PRIMARY KEY,
  garantia_id       TEXT NOT NULL REFERENCES public.garantias(id) ON DELETE CASCADE,
  cliente_id        TEXT,
  ubicacion_id      TEXT,
  tipo              TEXT NOT NULL DEFAULT 'inspeccion',      -- inspeccion|preventivo
  fecha_programada  DATE,
  estado            TEXT NOT NULL DEFAULT 'pendiente',       -- pendiente|agendado|realizado|vencido|omitido
  responsable_id    TEXT,
  resultado         TEXT,
  notas             TEXT,
  realizado_at      TIMESTAMPTZ,
  alertado_at       TIMESTAMPTZ,                             -- última vez que se alertó (para el cron)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mantenimientos_garantia ON public.mantenimientos(garantia_id);
CREATE INDEX IF NOT EXISTS idx_mantenimientos_fecha ON public.mantenimientos(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_mantenimientos_estado ON public.mantenimientos(estado);

NOTIFY pgrst, 'reload schema';
