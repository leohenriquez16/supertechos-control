-- ============================================================
-- Migración: tabla M:N de contactos por proyecto
-- ============================================================
-- v8.17.58 — Antes un proyecto tenía UN solo contacto (proyecto.contacto_principal_id).
-- Ahora puede tener varios. El "principal" sigue siendo el de la columna existente
-- (compat con el código que ya lo usa para carta de acceso, etc), pero además se
-- pueden agregar contactos adicionales en `proyecto_contactos`.
--
-- Decisiones:
--   - Tabla M:N en vez de array jsonb para permitir metadata por vínculo
--     (rol, notas) en el futuro sin migración adicional.
--   - UNIQUE(proyecto_id, contacto_id) para evitar duplicados.
--   - Backfill: para cada proyecto con contacto_principal_id NOT NULL, se
--     inserta una fila en proyecto_contactos (idempotente con ON CONFLICT).
--   - El `rol` opcional queda para un futuro PR si lo necesitamos.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS proyecto_contactos (
  id text PRIMARY KEY,
  proyecto_id text NOT NULL,
  contacto_id text NOT NULL,
  rol text,                          -- 'comprador' | 'tecnico' | ... — libre por ahora
  notas text,
  creado_por_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (proyecto_id, contacto_id)
);

ALTER TABLE proyecto_contactos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_proyecto_contactos_proyecto
  ON proyecto_contactos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_proyecto_contactos_contacto
  ON proyecto_contactos(contacto_id);

-- Backfill: cada proyecto con contacto_principal_id NOT NULL pasa a tener
-- ese contacto en la M:N. Usa ON CONFLICT para que la migración sea re-ejecutable.
INSERT INTO proyecto_contactos (id, proyecto_id, contacto_id, created_at)
SELECT
  'pc_' || p.id || '_' || p.contacto_principal_id,
  p.id,
  p.contacto_principal_id,
  COALESCE(p.created_at, now())
FROM proyectos p
WHERE p.contacto_principal_id IS NOT NULL
ON CONFLICT (proyecto_id, contacto_id) DO NOTHING;

-- Reload schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
