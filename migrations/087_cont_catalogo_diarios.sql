-- v8.26.1: [Contabilidad · Fase 2 arranque] Catálogo de cuentas + diarios por
-- empresa, importados de Odoo (réplica de la estructura que ya usa el contador).
-- Serán la base del libro mayor (asientos) en la Fase 2 completa.
-- RLS off (convención). Idempotente.

CREATE TABLE IF NOT EXISTS public.cont_cuentas (
  id          TEXT PRIMARY KEY,
  empresa     TEXT NOT NULL CHECK (empresa IN ('super_techos','prouco')),
  codigo      TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  tipo        TEXT,                -- account_type de Odoo (asset_current, expense, income, ...)
  odoo_id     INTEGER,             -- id en Odoo (para re-sincronizar sin duplicar)
  activa      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa, codigo)
);
CREATE INDEX IF NOT EXISTS idx_cont_cuentas_empresa ON public.cont_cuentas(empresa, codigo);

CREATE TABLE IF NOT EXISTS public.cont_diarios (
  id          TEXT PRIMARY KEY,
  empresa     TEXT NOT NULL CHECK (empresa IN ('super_techos','prouco')),
  codigo      TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  tipo        TEXT,                -- sale | purchase | bank | cash | general
  odoo_id     INTEGER,
  activa      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cont_diarios_empresa ON public.cont_diarios(empresa);

NOTIFY pgrst, 'reload schema';
