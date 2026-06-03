-- v8.21.0: Chatter tipo Odoo — bitácora de eventos + notas manuales para
-- levantamientos, reclamaciones, contactos, proyectos y locaciones.
-- Registra quién creó y quién cambió estados, más comentarios manuales.
-- RLS off (convención del proyecto). Idempotente.

CREATE TABLE IF NOT EXISTS public.chatter_mensajes (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,                 -- 'levantamiento'|'reclamacion'|'contacto'|'proyecto'|'locacion'
  entity_id    TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'evento', -- 'evento' (auto) | 'nota' (manual)
  evento       TEXT,                          -- 'creado'|'estado'|'nota'|... (clave del evento auto)
  cuerpo       TEXT,                          -- texto legible del mensaje/nota
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb, -- { from, to, ... }
  autor_id     TEXT,
  autor_nombre TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatter_entity
  ON public.chatter_mensajes(entity_type, entity_id, created_at);

NOTIFY pgrst, 'reload schema';
