-- ============================================================
-- Migración: valor de cotización del proyecto
-- ============================================================
-- v8.17.63 — Antes el "valor" del proyecto era derivado en runtime
-- (m² total × precio_m2 del sistema). Si el sistema no tenía precio bien
-- cargado, el valor salía 0. Y no había trazabilidad cotizado vs cubicado.
--
-- Ahora se guardan 2 campos explícitos:
--   1. `valor_cotizacion` (este PR) — total que el cliente firmó al aprobar.
--      Se autollena al importar Odoo. Inmutable salvo edición admin.
--   2. `monto_final_cubicado` (ya existe) — lo que se cobra después de cubicar
--      en obra. Suele cargarse al cerrar el proyecto.
--
-- En UI se prioriza `valor_cotizacion` sobre el cálculo derivado. Si está
-- cargado `monto_final_cubicado` y difiere, se muestran ambos.
--
-- Idempotente.

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS valor_cotizacion numeric(14, 2);

NOTIFY pgrst, 'reload schema';
