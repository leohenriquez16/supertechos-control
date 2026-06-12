-- v8.26.2: [Contabilidad · Conciliación bancaria v1] Cuentas bancarias y
-- movimientos del estado de cuenta (importados por IA desde PDF/foto/CSV).
-- Cada línea se concilia contra caja chica (v1) o manualmente; el hash único
-- por banco evita duplicar al re-importar el mismo estado. RLS off. Idempotente.

CREATE TABLE IF NOT EXISTS public.cont_bancos (
  id            TEXT PRIMARY KEY,
  empresa       TEXT NOT NULL CHECK (empresa IN ('super_techos','prouco')),
  nombre        TEXT NOT NULL,            -- ej. "Banreservas"
  numero_cuenta TEXT,
  moneda        TEXT NOT NULL DEFAULT 'DOP',
  activa        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cont_bancos_empresa ON public.cont_bancos(empresa);

CREATE TABLE IF NOT EXISTS public.cont_banco_movimientos (
  id               TEXT PRIMARY KEY,
  banco_id         TEXT NOT NULL REFERENCES public.cont_bancos(id) ON DELETE CASCADE,
  fecha            DATE NOT NULL,
  descripcion      TEXT,
  referencia       TEXT,
  monto            NUMERIC(14,2) NOT NULL,  -- positivo = entrada (crédito) · negativo = salida (débito)
  balance          NUMERIC(14,2),           -- balance del estado si viene
  hash             TEXT NOT NULL,           -- fecha|monto|descripcion normalizada (anti-duplicado)
  conciliado_tipo  TEXT,                    -- 'caja_chica' | 'manual' | NULL (pendiente)
  conciliado_id    TEXT,                    -- id del registro emparejado (si aplica)
  conciliado_nota  TEXT,
  conciliado_at    TIMESTAMPTZ,
  conciliado_por_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (banco_id, hash)
);
CREATE INDEX IF NOT EXISTS idx_cont_bmov_banco ON public.cont_banco_movimientos(banco_id, fecha);
CREATE INDEX IF NOT EXISTS idx_cont_bmov_pendientes ON public.cont_banco_movimientos(banco_id) WHERE conciliado_tipo IS NULL;

NOTIFY pgrst, 'reload schema';
