-- v8.52.0: Torre de Control de Levantamientos.
-- (1) Historial de cada cambio de etapa (antes solo se guardaba el último
--     stage_changed_at) → permite medir el tiempo en CADA etapa y el SLA.
-- (2) Campos para el motor SLA: si la fecha de visita la puso el CLIENTE
--     (stop-the-clock) y si el sistema es COMPLEJO (ruta de consulta técnica, 24h).

CREATE TABLE IF NOT EXISTS surveys.stage_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES surveys.projects(id) ON DELETE CASCADE,
  etapa_anterior TEXT,
  etapa_nueva TEXT NOT NULL,
  cambiado_por_id TEXT,
  cambiado_por_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_history_project ON surveys.stage_history (project_id, created_at);
ALTER TABLE surveys.stage_history DISABLE ROW LEVEL SECURITY;
GRANT ALL ON surveys.stage_history TO anon, authenticated, service_role;

ALTER TABLE surveys.projects
  ADD COLUMN IF NOT EXISTS visita_por_cliente BOOLEAN NOT NULL DEFAULT false,  -- la fecha la impuso el cliente → pausa el SLA
  ADD COLUMN IF NOT EXISTS requiere_consulta_tecnica BOOLEAN NOT NULL DEFAULT false, -- sistema complejo → ruta técnica 24h
  ADD COLUMN IF NOT EXISTS consulta_tecnica_motivo TEXT,
  ADD COLUMN IF NOT EXISTS consulta_tecnica_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
