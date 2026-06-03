-- v8.19.82: [Levantamientos · Fase 3] puntos singulares marcados sobre la foto.
-- x_relativa / y_relativa: posición del pin en la foto (0..1). Aditivo. Idempotente.

CREATE TABLE IF NOT EXISTS surveys.puntos_singulares (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id  uuid REFERENCES surveys.visits(id) ON DELETE CASCADE,
  area_id   uuid REFERENCES surveys.areas(id)  ON DELETE SET NULL,
  photo_id  uuid REFERENCES surveys.photos(id) ON DELETE SET NULL,
  tipo      text NOT NULL,
  x_relativa numeric(6,4),
  y_relativa numeric(6,4),
  cantidad  integer NOT NULL DEFAULT 1,
  dimension text,
  severidad text,
  requiere_tratamiento_especial boolean NOT NULL DEFAULT false,
  notas     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_puntos_visit ON surveys.puntos_singulares(visit_id);
CREATE INDEX IF NOT EXISTS idx_puntos_photo ON surveys.puntos_singulares(photo_id);

ALTER TABLE surveys.puntos_singulares DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
