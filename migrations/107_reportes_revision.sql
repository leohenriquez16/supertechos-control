-- v8.30.4: Revisión de reportes por el supervisor ("reportar premia").
-- El maestro reporta y gana (racha, producción); el supervisor REVISA y valida:
-- visto bueno o observación. Queda quién revisó y cuándo.
ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS revisado_por_id TEXT,
  ADD COLUMN IF NOT EXISTS revisado_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS revisado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observacion_supervisor TEXT;

NOTIFY pgrst, 'reload schema';
