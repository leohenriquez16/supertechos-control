-- ============================================================
-- Migración: Dieta + Hospedaje con sub-tipos (desayuno/comida/cena/hotel)
-- ============================================================
-- v8.17.29 — La empresa puede dar a maestros/supervisores un presupuesto
-- diario fijo de comida (dieta) y hospedaje (hotel) cuando trabajan en el
-- interior. Las facturas de esas categorías ya no se reembolsan
-- (consumen el presupuesto, no la caja).
--
-- Modelo opt-in en 2 niveles:
--   1. Persona habilitada para dieta y/o hospedaje
--   2. Proyecto aplica dieta y/o hospedaje
-- Solo cuando AMBOS están en true se aplica.
--
-- Idempotente.

-- ============================================================
-- 1. Personal: toggles de dieta y hospedaje
-- ============================================================
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS dieta_habilitada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hospedaje_habilitado boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Proyectos: toggles si aplican dieta y hospedaje
-- ============================================================
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS aplica_dieta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aplica_hospedaje boolean NOT NULL DEFAULT false;

-- ============================================================
-- 3. Categorías: a qué partida cuenta cada categoría
-- ============================================================
ALTER TABLE caja_chica_categorias
  ADD COLUMN IF NOT EXISTS aplica_a text;

DO $$
BEGIN
  ALTER TABLE caja_chica_categorias
    ADD CONSTRAINT cc_cat_aplica_a_chk
    CHECK (aplica_a IS NULL OR aplica_a IN ('dieta', 'hospedaje'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 4. Movimientos: si aplican a una partida, y sub-tipo de dieta
-- ============================================================
ALTER TABLE caja_chica_movimientos
  ADD COLUMN IF NOT EXISTS aplica_a text,
  ADD COLUMN IF NOT EXISTS sub_tipo text;

DO $$
BEGIN
  ALTER TABLE caja_chica_movimientos
    ADD CONSTRAINT cc_mov_aplica_a_chk
    CHECK (aplica_a IS NULL OR aplica_a IN ('dieta', 'hospedaje'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE caja_chica_movimientos
    ADD CONSTRAINT cc_mov_sub_tipo_chk
    CHECK (sub_tipo IS NULL OR sub_tipo IN ('desayuno', 'comida', 'cena', 'hotel'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Índice para queries de presupuesto por persona/fecha
CREATE INDEX IF NOT EXISTS idx_caja_chica_aplica_a ON caja_chica_movimientos(aplica_a);
CREATE INDEX IF NOT EXISTS idx_caja_chica_sub_tipo ON caja_chica_movimientos(sub_tipo);

-- ============================================================
-- 5. Tabla de configuración global de montos
-- ============================================================
CREATE TABLE IF NOT EXISTS config_dieta (
  id text PRIMARY KEY DEFAULT 'default',
  desayuno_rd integer NOT NULL DEFAULT 200,
  comida_rd integer NOT NULL DEFAULT 350,
  cena_rd integer NOT NULL DEFAULT 350,
  hotel_rd integer NOT NULL DEFAULT 900,
  updated_at timestamptz DEFAULT now(),
  updated_por_id text
);

INSERT INTO config_dieta (id) VALUES ('default') ON CONFLICT DO NOTHING;

ALTER TABLE config_dieta DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. Vista caja_chica_saldos: incluir hospedaje como debit y NO
--    contar las facturas con aplica_a (esas ya están cubiertas por
--    el crédito de dieta/hospedaje que se marcó al cerrar jornada).
-- ============================================================
CREATE OR REPLACE VIEW caja_chica_saldos AS
SELECT
  persona_id,
  SUM(
    CASE
      WHEN tipo = 'entrega' THEN monto
      WHEN tipo = 'ajuste' THEN monto * COALESCE(signo_ajuste, 1)
      -- Gasto_factura con aplica_a (dieta/hospedaje) NO descuenta: ya descontó
      -- la marca de dieta/hospedaje al cerrar jornada. Solo es tracking.
      WHEN tipo = 'gasto_factura' AND status = 'aprobado' AND aplica_a IS NULL THEN -monto
      WHEN tipo IN ('dieta', 'hospedaje') AND status = 'aprobado' THEN -monto
      ELSE 0
    END
  ) AS saldo,
  -- saldo "potencial" si todos los pendientes se aprobaran
  SUM(
    CASE
      WHEN tipo = 'entrega' THEN monto
      WHEN tipo = 'ajuste' THEN monto * COALESCE(signo_ajuste, 1)
      WHEN tipo = 'gasto_factura' AND status IN ('aprobado', 'pendiente_revision') AND aplica_a IS NULL THEN -monto
      WHEN tipo IN ('dieta', 'hospedaje') AND status IN ('aprobado', 'pendiente_revision') THEN -monto
      ELSE 0
    END
  ) AS saldo_proyectado,
  COUNT(*) FILTER (WHERE status = 'pendiente_revision') AS pendientes,
  MAX(fecha) AS ultimo_movimiento_fecha
FROM caja_chica_movimientos
GROUP BY persona_id;

-- ============================================================
-- 7. Permitir tipo='hospedaje' en movimientos (si la tabla tenía un CHECK)
-- ============================================================
DO $$
BEGIN
  -- Si el CHECK constraint de tipo existe y no incluye 'hospedaje', recrearlo.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'caja_chica_movimientos'::regclass
      AND conname = 'caja_chica_movimientos_tipo_check'
  ) THEN
    ALTER TABLE caja_chica_movimientos DROP CONSTRAINT caja_chica_movimientos_tipo_check;
  END IF;
  ALTER TABLE caja_chica_movimientos
    ADD CONSTRAINT caja_chica_movimientos_tipo_check
    CHECK (tipo IN ('entrega', 'gasto_factura', 'dieta', 'hospedaje', 'ajuste'));
EXCEPTION WHEN OTHERS THEN
  -- Si el constraint tenía otro nombre, lo dejamos pasar; la app validará en código.
  NULL;
END $$;

-- ============================================================
-- 8. Reload schema cache de PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';
