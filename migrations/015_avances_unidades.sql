-- ============================================================
-- Migración: Log diario de avance por espacio (unidades)
-- ============================================================
-- v8.17.52 — Para proyectos con tipoAvance='unidades' (edificios con torres
-- → niveles → espacios tipo baño/balcón/cocina), permitir reportar cuántas
-- unidades de cada tipo se completaron CADA DÍA. Esto da:
--   - Historial cronológico de avance ("se hicieron 5 baños el lunes").
--   - PDF de reporte con avance acumulado por día.
--   - Reportabilidad por maestro/supervisor o admin.
--
-- Convive con el campo `espacio.completadas` (jsonb dentro de estructuraUnidades)
-- que sigue funcionando como contador acumulado. La idea:
--   - Cada INSERT aquí suma al `completadas` del espacio correspondiente
--     (lo hace la app, no triggers — para mantenerlo simple).
--   - Si alguien edita `completadas` manualmente, sigue funcionando.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS avances_unidades (
  id text PRIMARY KEY,
  proyecto_id text NOT NULL,
  torre_id text NOT NULL,
  nivel_id text NOT NULL,
  espacio_id text NOT NULL,
  -- Snapshot del nombre del tipo de espacio al momento del reporte (ej: 'baño',
  -- 'balcón'). Si el admin renombra el espacio, el histórico mantiene el original.
  tipo text,
  fecha date NOT NULL,
  cantidad integer NOT NULL CHECK (cantidad > 0),
  nota text,
  creado_por_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avances_unidades DISABLE ROW LEVEL SECURITY;

-- Índices para consultas típicas
CREATE INDEX IF NOT EXISTS idx_avances_proyecto_fecha
  ON avances_unidades(proyecto_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_avances_espacio
  ON avances_unidades(espacio_id);
CREATE INDEX IF NOT EXISTS idx_avances_proyecto_torre_nivel
  ON avances_unidades(proyecto_id, torre_id, nivel_id);

-- Reload schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
