-- v8.19.12: surveys quedó como "isla con RLS" — sus 6 tablas tienen RLS ON con
-- policies que dependen de auth.uid()/persona_tiene_rol('admin'), pero los
-- usuarios del ERP aún NO tienen sesión de Supabase Auth (usan la anon key).
-- Resultado: el rol `anon` veía 0 filas (RLS filtra todo) → el módulo aparecía
-- VACÍO en producción ("Aún no hay proyectos de levantamiento") aunque la data
-- (proyecto Banreservas + 19 sucursales) sí existe.
--
-- Esto es el MISMO escenario que nos obligó a desactivar RLS en las 53 tablas de
-- public.* (Fase 2 desplegada con RLS off de emergencia). Surveys se construyó
-- asumiendo Fase 2 viva, pero esa infraestructura no está activa todavía.
--
-- Fix: alinear surveys.* con la misma postura que public.* (RLS off + grants a
-- anon). IMPORTANTE: usamos DISABLE (no DROP) en las policies — quedan definidas
-- pero inactivas, así re-activar RLS en el futuro (cuando todos re-logueen y
-- Fase 2 esté viva) restaura la seguridad sin reescribir nada.
--
-- Idempotente.

-- 1. Desactivar RLS en las 6 tablas de surveys (conserva las policies).
ALTER TABLE surveys.projects  DISABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.sites     DISABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.visits    DISABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.areas     DISABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.photos    DISABLE ROW LEVEL SECURITY;
ALTER TABLE surveys.templates DISABLE ROW LEVEL SECURITY;

-- 2. anon necesita CRUD completo (antes solo tenía SELECT) porque el cliente
--    browser escribe directo (crearProyecto/crearVisita/crearArea/subirFoto).
--    Esto iguala a authenticated y replica la postura de public.*.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA surveys TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA surveys TO anon;

-- Por si en el futuro se crean tablas nuevas en surveys.
ALTER DEFAULT PRIVILEGES IN SCHEMA surveys
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA surveys
  GRANT USAGE, SELECT ON SEQUENCES TO anon;

-- 3. Storage: el bucket surveys-photos solo tenía policies para authenticated.
--    storage.objects siempre tiene RLS forzado (Supabase), así que NO se puede
--    desactivar — hay que AGREGAR policies para anon. Espejo de las de
--    authenticated: anon puede subir (INSERT) y leer/firmar URLs (SELECT).
DROP POLICY IF EXISTS surveys_photos_insert_anon ON storage.objects;
CREATE POLICY surveys_photos_insert_anon ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'surveys-photos');

DROP POLICY IF EXISTS surveys_photos_select_anon ON storage.objects;
CREATE POLICY surveys_photos_select_anon ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'surveys-photos');

-- 4. Recargar el schema de PostgREST para que vea los nuevos grants.
NOTIFY pgrst, 'reload schema';
