-- ============================================================
-- Migración: Onboarding obligatorio para maestros + log de accesos
-- ============================================================
-- v8.14.0 — los maestros entran al ERP por primera vez.
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Es idempotente.
--
-- IMPORTANTE: Antes de aplicar, crear el bucket en Supabase Storage:
--   - Nombre: personal-fotos
--   - Privado (NO marcar "Public bucket")

-- ============================================================
-- 1. Columnas de control de onboarding en personal
-- ============================================================
ALTER TABLE personal
  -- PIN temporal: si true, al login obliga a cambiar PIN antes de continuar.
  -- Se setea true al invitar; pasa a false cuando el maestro lo cambia.
  ADD COLUMN IF NOT EXISTS pin_temporal boolean NOT NULL DEFAULT false,
  -- Bandera de onboarding completado. Mientras false, el wizard es bloqueante.
  ADD COLUMN IF NOT EXISTS onboarding_completado boolean NOT NULL DEFAULT true,
  -- Timestamp de la invitación (para reportes y caducidad eventual).
  ADD COLUMN IF NOT EXISTS invitado_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitado_por_id text;

-- ============================================================
-- 2. Datos personales adicionales (recopilados en onboarding)
-- ============================================================
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS tipo_sangre text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_relacion text;

-- ============================================================
-- 3. Datos bancarios (para nómina por transferencia y caja chica bancaria)
-- ============================================================
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS banco_tipo_cuenta text,        -- 'corriente' | 'ahorros'
  ADD COLUMN IF NOT EXISTS banco_numero_cuenta text,
  ADD COLUMN IF NOT EXISTS banco_titular_nombre text,     -- vacío = el mismo maestro
  ADD COLUMN IF NOT EXISTS banco_titular_cedula text;

-- ============================================================
-- 4. Tabla de log de accesos y acciones georreferenciadas
-- ============================================================
-- Cada login y cada acción relevante (reporte, caja chica, asistencia)
-- queda registrada con lat/lng/timestamp/user-agent.
-- Si el navegador deniega permiso, se registra igualmente con geo_denegada=true.
CREATE TABLE IF NOT EXISTS personal_accesos_log (
  id text PRIMARY KEY,
  persona_id text NOT NULL,
  -- Tipo de evento. login.exitoso | login.fallido | reporte_avance |
  -- reporte_caja_chica | asistencia.entrada | asistencia.salida | onboarding.completado
  tipo text NOT NULL,
  lat numeric(9, 6),
  lng numeric(9, 6),
  precision_m integer,
  geo_denegada boolean NOT NULL DEFAULT false,
  geo_error text,                           -- mensaje si falló (timeout, no soportado, etc.)
  user_agent text,
  ip text,
  metadata jsonb,                           -- info extra del evento (proyecto_id, etc.)
  fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_accesos_log_persona ON personal_accesos_log(persona_id);
CREATE INDEX IF NOT EXISTS idx_personal_accesos_log_fecha   ON personal_accesos_log(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_personal_accesos_log_tipo    ON personal_accesos_log(tipo);

ALTER TABLE personal_accesos_log DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Policies del bucket Storage 'personal-fotos'
-- ============================================================
-- Bucket privado para selfies + fotos de cédula migradas desde base64.
-- Mismo patrón que caja-chica-facturas: anon con SELECT/INSERT/UPDATE/DELETE,
-- la autorización real ocurre a nivel de aplicación.
DO $$
BEGIN
  DROP POLICY IF EXISTS "personal_fotos_select" ON storage.objects;
  DROP POLICY IF EXISTS "personal_fotos_insert" ON storage.objects;
  DROP POLICY IF EXISTS "personal_fotos_update" ON storage.objects;
  DROP POLICY IF EXISTS "personal_fotos_delete" ON storage.objects;
END $$;

CREATE POLICY "personal_fotos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'personal-fotos');

CREATE POLICY "personal_fotos_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'personal-fotos');

CREATE POLICY "personal_fotos_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'personal-fotos');

CREATE POLICY "personal_fotos_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'personal-fotos');

-- ============================================================
-- 6. Reload schema cache de PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';
