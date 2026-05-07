-- ============================================================
-- Migración: Módulo Caja Chica + Dieta v1
-- ============================================================
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Es idempotente: se puede correr múltiples veces sin efectos secundarios.

-- 1. Tabla principal de movimientos de caja chica.
--    Cada fila es una entrega, gasto, dieta o ajuste manual.
CREATE TABLE IF NOT EXISTS caja_chica_movimientos (
  id text PRIMARY KEY,
  -- Titular de la caja chica (maestro/supervisor que recibe efectivo)
  persona_id text NOT NULL,
  -- Proyecto asociado (opcional para entregas/ajustes generales; obligatorio en dieta)
  proyecto_id text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  -- Tipo de movimiento
  tipo text NOT NULL CHECK (tipo IN ('entrega', 'gasto_factura', 'dieta', 'ajuste')),
  -- Monto: positivo siempre. El "signo" lo determina el tipo:
  --   entrega = entrada (+ al saldo)
  --   gasto_factura, dieta = salida (- al saldo, si está aprobado)
  --   ajuste = entrada o salida según signo_ajuste
  monto numeric(14, 2) NOT NULL,
  signo_ajuste smallint DEFAULT 1, -- solo aplica a 'ajuste'; +1 entra, -1 sale
  -- Detalles del gasto (factura)
  -- foto_data: dataURL base64 de la foto comprimida (mismo patrón que proyecto_fotos)
  foto_data text,
  proveedor text,
  rnc text,
  concepto text,
  -- Datos extraídos por la IA al subir foto. JSON con campos como
  -- { monto, rnc, fecha, proveedor, lineas: [...], confianza, modelo }
  datos_ia jsonb DEFAULT '{}'::jsonb,
  -- Aprobación admin
  status text NOT NULL DEFAULT 'pendiente_revision'
    CHECK (status IN ('pendiente_revision', 'aprobado', 'rechazado')),
  motivo_rechazo text,
  aprobado_por_id text,
  aprobado_at timestamptz,
  -- Auditoría
  creado_por_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes para queries comunes:
--   - balance / movimientos por titular
--   - reporte por proyecto
--   - bandeja de pendientes
CREATE INDEX IF NOT EXISTS idx_caja_chica_persona     ON caja_chica_movimientos(persona_id);
CREATE INDEX IF NOT EXISTS idx_caja_chica_proyecto    ON caja_chica_movimientos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_caja_chica_status      ON caja_chica_movimientos(status);
CREATE INDEX IF NOT EXISTS idx_caja_chica_tipo_fecha  ON caja_chica_movimientos(tipo, fecha DESC);

-- 2. Configuración de dieta a nivel proyecto.
--    Reemplaza el modelo viejo proyecto.dieta (que era tarifa × días-hombre presupuestados)
--    por un esquema más simple: monto fijo diario + modo de aplicación.
--    No borramos `dieta` (jsonb) para no romper nada — queda legacy hasta migrar reportes.
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS dieta_diaria_rd numeric(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dieta_modo text DEFAULT 'manual'
    CHECK (dieta_modo IN ('auto', 'manual', 'desactivada'));

-- Vista de saldos por persona — útil para el dashboard del módulo.
-- Suma entregas + ajustes positivos, resta gastos aprobados + dietas + ajustes negativos.
-- Pendientes (no aprobados) NO afectan el saldo.
CREATE OR REPLACE VIEW caja_chica_saldos AS
SELECT
  persona_id,
  SUM(
    CASE
      WHEN tipo = 'entrega' THEN monto
      WHEN tipo = 'ajuste' THEN monto * COALESCE(signo_ajuste, 1)
      WHEN tipo IN ('gasto_factura', 'dieta') AND status = 'aprobado' THEN -monto
      ELSE 0
    END
  ) AS saldo,
  -- saldo "potencial" si todos los pendientes se aprobaran
  SUM(
    CASE
      WHEN tipo = 'entrega' THEN monto
      WHEN tipo = 'ajuste' THEN monto * COALESCE(signo_ajuste, 1)
      WHEN tipo IN ('gasto_factura', 'dieta') AND status IN ('aprobado', 'pendiente_revision') THEN -monto
      ELSE 0
    END
  ) AS saldo_proyectado,
  COUNT(*) FILTER (WHERE status = 'pendiente_revision') AS pendientes,
  MAX(fecha) AS ultimo_movimiento_fecha
FROM caja_chica_movimientos
GROUP BY persona_id;
