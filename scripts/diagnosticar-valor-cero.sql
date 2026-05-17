-- ============================================================
-- Diagnóstico: proyectos con VALOR calculado = RD$ 0
-- ============================================================
-- Uso: pegar en el SQL editor de Supabase. Devuelve los proyectos
-- cuyo `m2_total × precio_m2_sistema` da 0, indicando la causa
-- (sin m², sistema sin precio, sistema borrado, etc).
--
-- El "valor" del proyecto no se guarda en DB — se computa en la UI.
-- Este query reproduce la fórmula para detectar los casos rotos
-- sin tener que abrirlos uno por uno.
--
-- Después de revisar la lista:
--   - Si la causa es "precio_cero" → revisar el sistema en el módulo
--     Sistemas y cargar el precio_m2 desde la cotización.
--   - Si la causa es "sin_m2" → revisar las áreas del proyecto.
--   - Si la causa es "sin_sistema" → reasignar un sistema válido.
-- ============================================================

WITH proyecto_m2 AS (
  SELECT
    p.id,
    p.referencia_odoo,
    p.cliente,
    p.estado,
    p.sistema_id,
    COALESCE(SUM((a->>'m2')::numeric), 0) AS m2_total
  FROM proyectos p
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(p.areas, '[]'::jsonb)) AS a ON true
  WHERE COALESCE(p.archivado, false) = false
  GROUP BY p.id
)
SELECT
  pm.id,
  pm.referencia_odoo,
  pm.cliente,
  pm.estado,
  pm.m2_total,
  (s.data->>'precio_m2')::numeric AS precio_m2_sistema,
  CASE
    WHEN pm.m2_total = 0 THEN 'sin_m2'
    WHEN s.data IS NULL THEN 'sin_sistema'
    WHEN COALESCE((s.data->>'precio_m2')::numeric, 0) = 0 THEN 'precio_cero'
    ELSE 'ok'
  END AS causa
FROM proyecto_m2 pm
LEFT JOIN sistemas s ON s.id = pm.sistema_id
WHERE
  pm.m2_total = 0
  OR s.data IS NULL
  OR COALESCE((s.data->>'precio_m2')::numeric, 0) = 0
ORDER BY pm.estado, pm.cliente;
