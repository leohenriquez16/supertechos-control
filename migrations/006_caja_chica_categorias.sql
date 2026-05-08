-- ============================================================
-- Migración: Tabla de categorías editables para Caja Chica
-- ============================================================
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Es idempotente.

CREATE TABLE IF NOT EXISTS caja_chica_categorias (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  color text NOT NULL DEFAULT '#71717a',
  icono text,
  descripcion text,
  orden integer NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE caja_chica_categorias DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION caja_chica_categorias_updated_at_fn() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS caja_chica_categorias_updated_at ON caja_chica_categorias;
CREATE TRIGGER caja_chica_categorias_updated_at
  BEFORE UPDATE ON caja_chica_categorias
  FOR EACH ROW EXECUTE FUNCTION caja_chica_categorias_updated_at_fn();

INSERT INTO caja_chica_categorias (id, nombre, color, icono, descripcion, orden, is_default) VALUES
  ('ferreteria',   'Ferretería',   '#3b82f6', '🔧', 'Tornillos, cinta, pintura, materiales de obra menores', 10, true),
  ('combustible',  'Combustible',  '#ef4444', '⛽', 'Gasolina, gasoil, peajes de combustible',                20, true),
  ('comida',       'Comida',       '#f97316', '🍽️', 'Almuerzo del equipo, refrigerios, agua',                 30, true),
  ('peaje',        'Peaje',        '#eab308', '🛣️', 'Peajes de carreteras y puentes',                          40, true),
  ('transporte',   'Transporte',   '#06b6d4', '🚐', 'Taxis, fletes, traslados de personal o material',         50, true),
  ('herramientas', 'Herramientas', '#a855f7', '🔨', 'Compra o reparación de herramientas',                     60, true),
  ('otros',        'Otros',        '#71717a', '📦', 'Gastos que no encajan en otras categorías',               99, true)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
