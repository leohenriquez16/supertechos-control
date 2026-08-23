-- v8.28.2: Configuración de bonos trimestrales por KPIs ("Mi bono").
-- Una fila por persona con bono variable (supervisores y gerente de operaciones).
-- El cálculo del puntaje NO se guarda: se computa en vivo desde jornadas, reportes,
-- producción y reclamaciones. Aquí solo viven el monto objetivo y las metas.

CREATE TABLE IF NOT EXISTS public.bonos_config (
  id TEXT PRIMARY KEY DEFAULT ('bc_' || substr(md5(random()::text), 1, 12)),
  persona_id TEXT NOT NULL UNIQUE,
  rol_bono TEXT NOT NULL DEFAULT 'supervisor',       -- 'supervisor' | 'gerente'
  monto_objetivo_rd NUMERIC NOT NULL DEFAULT 0,      -- bono trimestral al 100% de puntaje
  meta_produccion_rd NUMERIC NOT NULL DEFAULT 0,     -- meta de producción RD$ del trimestre
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  -- Ajustes manuales del owner por KPI: { "<key>": { "peso": 30, "score": 85, "nota": "..." } }
  -- peso reemplaza el peso por defecto; score (si viene) reemplaza el cálculo automático.
  kpi_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonos_config_persona ON public.bonos_config (persona_id);

NOTIFY pgrst, 'reload schema';
