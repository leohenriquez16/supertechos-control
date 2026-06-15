-- v8.27.0: Módulo "Gotera" — tickets de feedback / reporte de errores del ERP.
-- Cualquier usuario abre un ticket (error o idea); el owner los gestiona en un
-- kanban. Adjuntos (screenshots/audio) se guardan en Storage; aquí solo las URLs.
CREATE TABLE IF NOT EXISTS public.tickets_soporte (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL DEFAULT 'error',   -- 'error' | 'idea'
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  modulo        TEXT,                             -- módulo del ERP donde ocurre
  pantalla      TEXT,                             -- modal / pantalla específica (texto libre)
  impacto       TEXT NOT NULL DEFAULT 'media',    -- 'bloqueante' | 'alta' | 'media' | 'baja'
  estado        TEXT NOT NULL DEFAULT 'abierto',  -- 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado'
  reportado_por_id     TEXT,
  reportado_por_nombre TEXT,
  reportado_por_rol    TEXT,
  screenshots   JSONB DEFAULT '[]'::jsonb,        -- array de URLs públicas
  audio_url     TEXT,                             -- nota de voz (URL pública)
  respuesta     TEXT,                             -- nota de resolución del owner
  resuelto_por_id      TEXT,
  notificar_solicitante BOOLEAN DEFAULT false,    -- true al resolver, hasta que el solicitante lo confirma
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  resuelto_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_soporte_estado ON public.tickets_soporte(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_soporte_reportado_por ON public.tickets_soporte(reportado_por_id);

-- Convención del proyecto: RLS desactivada.
ALTER TABLE public.tickets_soporte DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
