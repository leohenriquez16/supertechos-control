-- v8.22.0: Settings de notificaciones por módulo + etapa.
-- (1) Plantillas de correo reutilizables. (2) Config por (módulo, etapa):
-- qué etapas envían correo al CLIENTE y cuáles correo INTERNO (a roles y/o lista
-- de correos fija), con la plantilla a usar. RLS off (convención). Idempotente.

CREATE TABLE IF NOT EXISTS public.email_templates (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  asunto      TEXT NOT NULL DEFAULT '',
  html        TEXT NOT NULL DEFAULT '',
  descripcion TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stage_notif_configs (
  id                  TEXT PRIMARY KEY,           -- 'modulo:etapa'
  modulo              TEXT NOT NULL,              -- 'proyecto'|'levantamiento'|'reclamacion'|'garantia'
  etapa               TEXT NOT NULL,
  cliente_activo      BOOLEAN NOT NULL DEFAULT FALSE,
  cliente_template_id TEXT,
  interno_activo      BOOLEAN NOT NULL DEFAULT FALSE,
  interno_template_id TEXT,
  interno_roles       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ['admin','owner','supervisor']
  interno_emails      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ['ops@...','gerencia@...']
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stage_notif_modulo ON public.stage_notif_configs(modulo);

NOTIFY pgrst, 'reload schema';
