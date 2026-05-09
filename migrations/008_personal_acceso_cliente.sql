-- ============================================================
-- Migración: Accesos por persona-cliente (Opción C híbrida)
-- ============================================================
-- v8.17.0 — gestión de accesos a clientes desde la ficha de cada persona.
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Es idempotente.
--
-- Modelo:
--   - Sin row → acceso DERIVADO de credenciales+cliente_requisitos
--   - Row con activo=true  → acceso forzado activo (manual override)
--   - Row con activo=false → acceso forzado denegado (manual override)

CREATE TABLE IF NOT EXISTS personal_acceso_cliente (
  persona_id text NOT NULL,
  cliente_id text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  fuente text NOT NULL DEFAULT 'manual',  -- 'manual' | 'credencial'
  notas text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por_id text,
  PRIMARY KEY (persona_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_pac_persona ON personal_acceso_cliente(persona_id);
CREATE INDEX IF NOT EXISTS idx_pac_cliente ON personal_acceso_cliente(cliente_id);

ALTER TABLE personal_acceso_cliente DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
