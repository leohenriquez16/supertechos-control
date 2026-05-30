-- v8.19.19: toggle global "Mostrar 'Mi Producción' del corte actual en el
-- dashboard de maestros y admins". Lo prende el admin desde el módulo de
-- nómina. Persiste en config.mostrar_mi_produccion_nomina.
-- Idempotente.

ALTER TABLE config
  ADD COLUMN IF NOT EXISTS mostrar_mi_produccion_nomina BOOLEAN DEFAULT FALSE NOT NULL;

NOTIFY pgrst, 'reload schema';
