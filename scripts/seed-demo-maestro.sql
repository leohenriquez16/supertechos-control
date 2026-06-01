-- Demo (solo LOCAL): asigna levantamientos y reclamaciones al maestro Onix
-- (p_1776797701576) para poder ver la vista "Mis asignaciones".
-- Idempotente-ish: reasigna siempre los mismos N más recientes.

-- 1) 6 levantamientos -> Onix, con escalera variada (no/normal/larga).
WITH sel AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rn
  FROM (SELECT id, created_at FROM surveys.projects WHERE id LIKE 'proj-odoo-%' ORDER BY created_at DESC LIMIT 6) t
)
UPDATE surveys.projects p SET
  asignado_a_id = 'p_1776797701576',
  asignado_a_nombre = 'Debreus Fesnel (Onix)',
  requiere_escalera = (ARRAY['larga','normal','no','larga','normal','no'])[sel.rn]
FROM sel WHERE p.id = sel.id;

-- 2) Coordenadas (Santo Domingo) a los sites de esos levantamientos -> aparecen en el mapa.
WITH sel AS (SELECT id FROM surveys.projects WHERE asignado_a_id = 'p_1776797701576'),
pts AS (
  SELECT s.id, row_number() OVER (ORDER BY s.id) AS rn
  FROM surveys.sites s WHERE s.project_id IN (SELECT id FROM sel)
)
UPDATE surveys.sites s SET
  latitude  = 18.470 + (pts.rn * 0.012),
  longitude = -69.960 + (pts.rn * 0.012)
FROM pts WHERE s.id = pts.id;

-- 3) 5 reclamaciones -> Onix.
WITH sel AS (
  SELECT id FROM (SELECT id, created_at FROM reclamaciones WHERE id LIKE 'rec-odoo-%' ORDER BY created_at DESC LIMIT 5) t
)
UPDATE reclamaciones r SET asignado_a = 'p_1776797701576' FROM sel WHERE r.id = sel.id;

-- 4) Coordenadas a 5 ubicaciones y enlazarlas a esas reclamaciones -> aparecen en el mapa.
WITH ub AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM (SELECT id FROM cliente_ubicaciones WHERE id LIKE 'ub-odoo-%' ORDER BY id LIMIT 5) t
)
UPDATE cliente_ubicaciones c SET
  latitud  = 18.455 + (ub.rn * 0.013),
  longitud = -69.985 + (ub.rn * 0.013)
FROM ub WHERE c.id = ub.id;

WITH r AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rn
  FROM (SELECT id, created_at FROM reclamaciones WHERE asignado_a = 'p_1776797701576' ORDER BY created_at DESC LIMIT 5) t
),
ub AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM (SELECT id FROM cliente_ubicaciones WHERE id LIKE 'ub-odoo-%' ORDER BY id LIMIT 5) t
)
UPDATE reclamaciones rc SET ubicacion_id = ub.id
FROM r JOIN ub ON ub.rn = r.rn WHERE rc.id = r.id;

-- 5) 2 reclamaciones resueltas con "qué y cuándo se hizo".
WITH sel AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rn
  FROM (SELECT id, created_at FROM reclamaciones WHERE asignado_a = 'p_1776797701576' ORDER BY created_at DESC LIMIT 2) t
)
UPDATE reclamaciones r SET
  estado = 'resuelta',
  fecha_resuelta = CURRENT_DATE - (r.id IS NOT NULL)::int * 6,
  trabajo_realizado = CASE sel.rn
    WHEN 1 THEN 'Se reselló el perímetro de tragantes y se aplicó mano de refresco acrílico en ~40 m². Prueba de inundación sin filtración.'
    ELSE 'Reparación de 3 ampollas en lona asfáltica y reactivación de traslapes. Se recomendó limpieza de drenajes anual.'
  END
FROM sel WHERE r.id = sel.id;

SELECT 'levantamientos Onix' k, count(*) v FROM surveys.projects WHERE asignado_a_id='p_1776797701576'
UNION ALL SELECT 'reclamaciones Onix', count(*) FROM reclamaciones WHERE asignado_a='p_1776797701576'
UNION ALL SELECT 'reclamaciones resueltas Onix', count(*) FROM reclamaciones WHERE asignado_a='p_1776797701576' AND trabajo_realizado IS NOT NULL;
