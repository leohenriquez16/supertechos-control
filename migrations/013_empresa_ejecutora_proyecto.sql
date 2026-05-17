-- ============================================================
-- Migración: empresa_ejecutora en proyectos
-- ============================================================
-- v8.17.41 — Cada proyecto pertenece contractualmente a una de nuestras
-- dos empresas (Super Techos o Prouco). Se usa en cartas de acceso al
-- cliente, facturación, y para diferenciar quién ejecuta el trabajo.
--
-- Compatible con la existente empresa_receptora de caja_chica_movimientos:
-- - empresa_receptora = quién compra suministros para el proyecto
-- - empresa_ejecutora = quién factura el proyecto al cliente final
-- Usualmente coinciden, pero no siempre.
--
-- Idempotente. Default: null (los proyectos viejos quedan sin empresa
-- asignada; el admin las completa con el dropdown del modal de edición).

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS empresa_ejecutora text;

-- CHECK constraint: solo permite los 2 valores válidos o null.
DO $$
BEGIN
  ALTER TABLE proyectos
    ADD CONSTRAINT proy_empresa_ejecutora_chk
    CHECK (empresa_ejecutora IS NULL OR empresa_ejecutora IN ('super_techos', 'prouco'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Índice para queries de "proyectos de Super Techos" / "de Prouco"
CREATE INDEX IF NOT EXISTS idx_proyectos_empresa_ejecutora
  ON proyectos(empresa_ejecutora);

-- Reload schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
