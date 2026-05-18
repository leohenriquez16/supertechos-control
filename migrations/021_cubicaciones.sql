-- ============================================================
-- Migración: cubicaciones mensuales (proyectos largos)
-- ============================================================
-- v8.17.68 — Proyectos largos se cubican mensualmente: cada mes se mide
-- cuánto m² real se ejecutó por área, se calcula el monto, el cliente
-- retiene un % como garantía, y se factura ese período.
--
-- Modelo:
--   - `proyectos.facturacion_por_cubicaciones bool` — toggle para activar.
--   - `proyectos.retencion_pct numeric` — % retención del cliente (5/10).
--     Se setea en la PRIMERA cubicación y queda fijo (decisión del usuario).
--   - `proyectos.proxima_cubicacion_fecha date` — fecha tentativa de la
--     próxima cubicación. Sirve para la alerta visual.
--
--   - Tabla `cubicaciones`:
--       - id, proyecto_id, numero (1, 2, 3, ...), fecha_cubicacion,
--       - areas_cubicadas: jsonb [{ areaId, areaNombre, m2_acumulado,
--           m2_esta_cubicacion, precio_m2, subtotal }],
--       - subtotal_general, retencion_pct, retencion_monto, total,
--       - factura_odoo_id, factura_odoo_numero, fecha_factura,
--       - creado_por_id, creado_por_nombre, created_at, updated_at.
--
-- Idempotente.

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS facturacion_por_cubicaciones boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS retencion_pct numeric(5, 2),
  ADD COLUMN IF NOT EXISTS proxima_cubicacion_fecha date;

CREATE TABLE IF NOT EXISTS cubicaciones (
  id text PRIMARY KEY,
  proyecto_id text NOT NULL,
  numero integer NOT NULL,
  fecha_cubicacion date NOT NULL,
  areas_cubicadas jsonb DEFAULT '[]'::jsonb,
  subtotal_general numeric(14, 2) DEFAULT 0,
  retencion_pct numeric(5, 2) DEFAULT 0,
  retencion_monto numeric(14, 2) DEFAULT 0,
  total numeric(14, 2) DEFAULT 0,
  factura_odoo_id bigint,
  factura_odoo_numero text,
  fecha_factura date,
  notas text,
  creado_por_id text,
  creado_por_nombre text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE cubicaciones DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cubicaciones_proyecto
  ON cubicaciones(proyecto_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cubicaciones_proyecto_numero_unique
  ON cubicaciones(proyecto_id, numero);

NOTIFY pgrst, 'reload schema';
