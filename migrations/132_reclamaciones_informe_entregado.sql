-- 132_reclamaciones_informe_entregado.sql
-- v8.53.1 (Torre de Control · Fase 3B): hito "Informe de solución entregado al cliente".
-- El flujo de reclamaciones terminaba en "Resuelta" (trabajo hecho internamente). El cierre
-- REAL del ciclo es cuando el CLIENTE recibe el informe de solución. Agregamos ese hito:
--   - informe_entregado_at: fecha/hora en que se entregó el informe al cliente (cierra el SLA).
--   - informe_url / informe_nombre: PDF del informe de solución (respaldo ante el cliente).
-- reclamaciones ya es tabla pública (RLS off, GRANTs existentes) → solo ALTER + NOTIFY.

ALTER TABLE public.reclamaciones
  ADD COLUMN IF NOT EXISTS informe_entregado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS informe_url          TEXT,
  ADD COLUMN IF NOT EXISTS informe_nombre       TEXT;

NOTIFY pgrst, 'reload schema';
