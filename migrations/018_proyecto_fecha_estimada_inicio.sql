-- ============================================================
-- Migración: fecha estimada de inicio del proyecto
-- ============================================================
-- v8.17.59 — Requerida para entrar a la nueva etapa "Planificado".
-- Distinta de `fecha_inicio` (que es la fecha real cuando arranca la ejecución):
-- ésta es la fecha tentativa que el admin promete al cliente.
--
-- Idempotente.

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS fecha_estimada_inicio date;

NOTIFY pgrst, 'reload schema';
