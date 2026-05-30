-- v8.19.60: Reclamaciones (claims). Cuelgan de cliente + ubicación, referencian
-- la garantía/proyecto/cotización cuando existen. El cliente las puede abrir por
-- WhatsApp/Email/web (canal). proyecto_id/garantia_id nullable para importadas.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.reclamaciones (
  id                    TEXT PRIMARY KEY,
  codigo                TEXT,                               -- REC-2026-0001
  cliente_id            TEXT REFERENCES public.clientes(id) ON DELETE SET NULL,
  ubicacion_id          TEXT REFERENCES public.cliente_ubicaciones(id) ON DELETE SET NULL,
  garantia_id           TEXT REFERENCES public.garantias(id) ON DELETE SET NULL,
  proyecto_id           TEXT REFERENCES public.proyectos(id) ON DELETE SET NULL,
  referencia_cotizacion TEXT,
  canal                 TEXT NOT NULL DEFAULT 'interno',    -- whatsapp|email|web|interno
  descripcion           TEXT,
  estado                TEXT NOT NULL DEFAULT 'abierta',    -- abierta|en_proceso|resuelta|cerrada|rechazada
  severidad             TEXT DEFAULT 'media',               -- baja|media|alta
  cubierta_por_garantia BOOLEAN,
  asignado_a            TEXT,
  fecha_apertura        DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_resuelta        DATE,
  notas                 TEXT,
  archivado             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reclamaciones_cliente ON public.reclamaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_reclamaciones_ubicacion ON public.reclamaciones(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_reclamaciones_proyecto ON public.reclamaciones(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_reclamaciones_estado ON public.reclamaciones(estado);

NOTIFY pgrst, 'reload schema';
