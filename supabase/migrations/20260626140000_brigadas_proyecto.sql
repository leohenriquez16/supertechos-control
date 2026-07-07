-- v8.27.22: Brigadas por proyecto (ticket Miguel tk_1782411961144c4ch)
-- Un proyecto puede tener 2-3 brigadas (cuadrillas), cada una con su maestro y sus
-- ayudantes, para tomar la asistencia agrupada por brigada.
-- Idempotente: se puede correr varias veces.

-- Definición de las brigadas del proyecto.
--   brigadas = [{ id, nombre, maestroId, ayudantesIds: [] }, ...]
ALTER TABLE public.proyectos
  ADD COLUMN IF NOT EXISTS brigadas JSONB DEFAULT '[]'::jsonb;

-- Qué brigadas estuvieron presentes en una jornada (para reportes de asistencia).
--   brigadas_presentes = ['<brigadaId>', ...]
ALTER TABLE public.jornadas
  ADD COLUMN IF NOT EXISTS brigadas_presentes TEXT[] DEFAULT '{}'::text[];

NOTIFY pgrst, 'reload schema';
