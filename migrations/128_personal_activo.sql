-- v8.49.0: flag `activo` en personal — para enfocar la actualización de fichas en la
-- gente que trabaja hoy y sacar de las listas la mano de obra histórica.
-- Conservador: solo se marca INACTIVO al ayudante puro, SIN PIN y SIN jornada en los
-- últimos 60 días. Maestros/supervisores/admin/almacén/chofer/facturas quedan activos.

ALTER TABLE public.personal
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

UPDATE public.personal p
SET activo = false
WHERE p.roles = ARRAY['ayudante']::text[]
  AND (p.pin IS NULL OR p.pin = '')
  AND p.id NOT IN (
    SELECT DISTINCT unnest(personas_presentes_ids)
    FROM public.jornadas
    WHERE fecha >= (current_date - 60)
  );

CREATE INDEX IF NOT EXISTS idx_personal_activo ON public.personal (activo);

NOTIFY pgrst, 'reload schema';
