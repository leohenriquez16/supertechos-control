-- ============================================================
-- Migración: Propiedades de la empresa (apartamentos, casas)
-- ============================================================
-- v8.17.49 — La empresa tiene propiedades para alojar al equipo cuando
-- trabajan fuera de la ciudad (ej: apartamento en Punta Cana). Esto
-- evita pagar hotel y permite control de uso.
--
-- Dos tablas:
--   1. propiedades_empresa: maestro de propiedades (nombre, capacidad,
--      llave de acceso, etc).
--   2. estadias_empresa: registro de una persona × noche × propiedad,
--      vinculado opcionalmente a un proyecto.
--
-- Idempotente.

-- ============================================================
-- 1. Propiedades de la empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS propiedades_empresa (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  -- Ubicación
  direccion text,
  ubicacion_lat numeric,
  ubicacion_lng numeric,
  ubicacion_direccion_texto text,
  google_maps_link text,
  -- Operación
  capacidad integer DEFAULT 0,          -- cuántas personas caben
  llave_codigo text,                    -- código de acceso / instrucciones de llave
  notas text,                           -- reglas, contactos, advertencias
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE propiedades_empresa DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Estadías (una fila por persona × noche × propiedad)
-- ============================================================
CREATE TABLE IF NOT EXISTS estadias_empresa (
  id text PRIMARY KEY,
  propiedad_id text NOT NULL REFERENCES propiedades_empresa(id) ON DELETE CASCADE,
  persona_id text NOT NULL,             -- quién durmió esa noche
  proyecto_id text,                     -- opcional: a qué proyecto va asociada la estadía
  fecha date NOT NULL,                  -- la noche (yyyy-mm-dd)
  nota text,
  creado_por_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE estadias_empresa DISABLE ROW LEVEL SECURITY;

-- Índices útiles para queries de calendario y listado
CREATE INDEX IF NOT EXISTS idx_estadias_propiedad_fecha
  ON estadias_empresa(propiedad_id, fecha);
CREATE INDEX IF NOT EXISTS idx_estadias_persona_fecha
  ON estadias_empresa(persona_id, fecha);
CREATE INDEX IF NOT EXISTS idx_estadias_proyecto
  ON estadias_empresa(proyecto_id) WHERE proyecto_id IS NOT NULL;

-- Evitar duplicados accidentales (la misma persona en la misma propiedad
-- la misma noche es una sola estadía)
CREATE UNIQUE INDEX IF NOT EXISTS uq_estadia_persona_propiedad_fecha
  ON estadias_empresa(persona_id, propiedad_id, fecha);

-- ============================================================
-- 3. Seed: insertar el apartamento de Punta Cana si no existe
-- ============================================================
INSERT INTO propiedades_empresa (id, nombre, direccion, capacidad, activo, notas)
VALUES ('apt_punta_cana', 'Apartamento Punta Cana', 'Punta Cana, La Altagracia', 4, true,
        'Propiedad principal de la empresa. Para personal trabajando en obras del este.')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. Reload schema cache de PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';
