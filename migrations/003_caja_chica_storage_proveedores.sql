-- ============================================================
-- Migración: Caja Chica v2 — Storage + Proveedores + Toggle por usuario
-- ============================================================
-- Aplicar en Supabase: SQL Editor → New Query → pegar todo → Run.
-- Es idempotente.
--
-- IMPORTANTE: Antes de aplicar, crear el bucket en Supabase Storage:
--   - Nombre: caja-chica-facturas
--   - Privado (NO marcar "Public bucket")
--
-- También revisar policies del bucket para que solo authenticated users puedan
-- leer/escribir (configuración por defecto suele estar bien).

-- 1. Cambiar foto_data (base64 en DB) → foto_path (path en Storage)
--    Si ya hay datos en foto_data, los preservamos como respaldo en una columna
--    nueva (foto_data_legacy) por si se necesitan recuperar.
ALTER TABLE caja_chica_movimientos
  ADD COLUMN IF NOT EXISTS foto_path text,
  ADD COLUMN IF NOT EXISTS foto_data_legacy text;

-- Mover datos existentes de foto_data a foto_data_legacy (si existen)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'caja_chica_movimientos' AND column_name = 'foto_data'
  ) THEN
    UPDATE caja_chica_movimientos
       SET foto_data_legacy = foto_data
     WHERE foto_data IS NOT NULL AND foto_data_legacy IS NULL;
    ALTER TABLE caja_chica_movimientos DROP COLUMN foto_data;
  END IF;
END $$;

-- 2. Tabla de proveedores: memoria viva de los emisores que ya hemos visto.
--    Cada vez que se aprueba un gasto_factura, se hace upsert por RNC para
--    mejorar el contexto que damos a la AI en futuras facturas del mismo proveedor.
CREATE TABLE IF NOT EXISTS caja_chica_proveedores (
  id text PRIMARY KEY,
  -- RNC normalizado (solo dígitos, sin guiones). Único.
  rnc text UNIQUE,
  -- Nombre canónico (admin puede editarlo cuando la AI escribe variantes)
  nombre text NOT NULL,
  categoria text,                 -- ferreteria | combustible | comida | peaje | transporte | herramientas | otros
  notas text,                     -- notas internas del admin
  -- Estadísticas (mantenidas por triggers / actualizadas al aprobar)
  total_facturas integer NOT NULL DEFAULT 0,
  total_monto numeric(14, 2) NOT NULL DEFAULT 0,
  primera_factura_at timestamptz,
  ultima_factura_at timestamptz,
  -- Auditoría
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_chica_proveedores_rnc       ON caja_chica_proveedores(rnc);
CREATE INDEX IF NOT EXISTS idx_caja_chica_proveedores_nombre    ON caja_chica_proveedores(nombre);
CREATE INDEX IF NOT EXISTS idx_caja_chica_proveedores_categoria ON caja_chica_proveedores(categoria);

-- Consistente con resto del schema (sin Supabase Auth)
ALTER TABLE caja_chica_proveedores DISABLE ROW LEVEL SECURITY;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION caja_chica_proveedores_updated_at_fn() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS caja_chica_proveedores_updated_at ON caja_chica_proveedores;
CREATE TRIGGER caja_chica_proveedores_updated_at
  BEFORE UPDATE ON caja_chica_proveedores
  FOR EACH ROW EXECUTE FUNCTION caja_chica_proveedores_updated_at_fn();

-- 3. Toggle por usuario: solo personal con `caja_chica_habilitada = true`
--    puede usar el módulo "Mi Caja Chica" desde el sidebar.
--    Default false: el admin habilita explícitamente quién recibe caja chica.
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS caja_chica_habilitada boolean NOT NULL DEFAULT false;

-- 4. Policies del bucket de Storage 'caja-chica-facturas'.
--    Como el sistema usa la anon key sin Supabase Auth (consistente con el resto
--    de la app), permitimos a anon hacer SELECT/INSERT/DELETE en este bucket
--    específico. La autorización real (quién puede subir/borrar) se controla a
--    nivel de aplicación (toggle caja_chica_habilitada + permisos admin).
DO $$
BEGIN
  -- Drop existentes para idempotencia
  DROP POLICY IF EXISTS "caja_chica_facturas_select" ON storage.objects;
  DROP POLICY IF EXISTS "caja_chica_facturas_insert" ON storage.objects;
  DROP POLICY IF EXISTS "caja_chica_facturas_delete" ON storage.objects;
  DROP POLICY IF EXISTS "caja_chica_facturas_update" ON storage.objects;
END $$;

CREATE POLICY "caja_chica_facturas_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'caja-chica-facturas');

CREATE POLICY "caja_chica_facturas_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'caja-chica-facturas');

CREATE POLICY "caja_chica_facturas_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'caja-chica-facturas');

CREATE POLICY "caja_chica_facturas_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'caja-chica-facturas');
