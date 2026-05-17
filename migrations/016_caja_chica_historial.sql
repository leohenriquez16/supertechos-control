-- ============================================================
-- Migración: Historial de cambios en movimientos de caja chica
-- ============================================================
-- v8.17.56 — Audit log embebido por movimiento. Cada vez que se edita un
-- campo del movimiento (monto, fecha, rnc, proveedor, categoría, proyecto,
-- concepto, empresa_receptora, etc), se agrega una entrada al array.
--
-- Estructura del array:
--   [
--     {
--       fecha: timestamptz,    -- cuándo ocurrió el cambio
--       usuarioId: text,        -- quién lo hizo
--       usuarioNombre: text,    -- snapshot del nombre (por si el usuario se renombra)
--       campo: text,            -- 'monto', 'fecha', 'rnc', ...
--       antes: any,             -- valor previo (puede ser null)
--       despues: any            -- valor nuevo
--     },
--     ...
--   ]
--
-- Se prefiere columna jsonb sobre tabla separada porque:
--   - El historial es small (decenas de entradas máximo).
--   - Siempre se consulta junto al movimiento.
--   - Evita un JOIN extra en cada lectura del detalle.
--
-- Idempotente.

ALTER TABLE caja_chica_movimientos
  ADD COLUMN IF NOT EXISTS historial_cambios jsonb DEFAULT '[]'::jsonb;

-- Para movimientos existentes, asegurar default '[]'
UPDATE caja_chica_movimientos
  SET historial_cambios = '[]'::jsonb
  WHERE historial_cambios IS NULL;

-- Reload schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
