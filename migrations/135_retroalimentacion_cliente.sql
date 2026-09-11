-- 135_retroalimentacion_cliente.sql
-- v8.54.1 (Comunicación · C3 — CSAT): retroalimentación del cliente por ticket. Al enviar la
-- cotización (levantamiento) o entregar el informe (reclamación) se genera un link de calificación
-- (token) que el cliente abre para dar 1-5 estrellas + comentario. Se guarda aquí y alimenta el
-- CSAT de la Torre de Control. Se llena desde una página PÚBLICA (sin login) vía API service_role.

CREATE TABLE IF NOT EXISTS public.retroalimentacion_cliente (
  id                TEXT PRIMARY KEY,
  entity_type       TEXT NOT NULL,           -- 'reclamacion' | 'levantamiento'
  entity_id         TEXT NOT NULL,
  token             TEXT NOT NULL UNIQUE,     -- clave del link público
  cliente_nombre    TEXT,
  contexto          TEXT,                     -- p.ej. 'informe de solución' | 'cotización'
  calificacion      INT,                      -- 1..5 (NULL hasta que responde)
  comentario        TEXT,
  respondido_at     TIMESTAMPTZ,
  creado_por_id     TEXT,
  creado_por_nombre TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retro_entity ON public.retroalimentacion_cliente (entity_type, entity_id);

ALTER TABLE public.retroalimentacion_cliente DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.retroalimentacion_cliente TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
