-- v8.17.98: Storage policies endurecidas (PR 2D de Fase 2).
--
-- Estrategia conservadora: mantener SELECT e INSERT abiertos (anon +
-- authenticated) para no romper uploads de la cámara durante la transición,
-- pero restringir UPDATE/DELETE a admin/supervisor. La validación real de
-- quién puede ver qué archivo viene de:
--   1. La policy RLS sobre la tabla (caja_chica_movimientos) que apunta al
--      foto_path — si el user no puede ver el movimiento, no obtiene el path.
--   2. El frontend que genera signed URLs scoped al user.
--
-- Esto es defensa en profundidad, no la barrera principal — la barrera está
-- en RLS de las tablas (PR 2C.4 caja chica, PR 2C.3 personal, PR 2C.5
-- proyectos). Un endurecimiento posterior puede:
--   - Migrar paths a tener auth.uid()::text en primer segmento
--   - Restringir SELECT a "primer segmento = auth.uid() OR admin"
--   - Eso requiere coordinación con lib/db.js para cambiar path generation
--
-- Por ahora, el objetivo de este PR es bloquear DELETE/UPDATE no autorizados,
-- que es donde está el riesgo real (corrupción/pérdida de evidencia).
--
-- Pre-requisitos: 023-029 + backfill + PR 2B desplegado.
-- Idempotente.

-- ============================================================
-- caja-chica-facturas
-- ============================================================
DROP POLICY IF EXISTS "Permitir todo en caja-chica-facturas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir SELECT en caja-chica-facturas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir INSERT en caja-chica-facturas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir UPDATE en caja-chica-facturas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir DELETE en caja-chica-facturas" ON storage.objects;
DROP POLICY IF EXISTS caja_chica_facturas_select ON storage.objects;
DROP POLICY IF EXISTS caja_chica_facturas_insert ON storage.objects;
DROP POLICY IF EXISTS caja_chica_facturas_update ON storage.objects;
DROP POLICY IF EXISTS caja_chica_facturas_delete ON storage.objects;

CREATE POLICY caja_chica_facturas_select ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'caja-chica-facturas');

CREATE POLICY caja_chica_facturas_insert ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'caja-chica-facturas');

-- UPDATE/DELETE: solo admin o supervisor (evita borrado accidental de
-- evidencia por maestros o por bots).
CREATE POLICY caja_chica_facturas_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'caja-chica-facturas'
    AND (public.persona_tiene_rol('admin') OR public.persona_tiene_rol('supervisor'))
  );

CREATE POLICY caja_chica_facturas_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'caja-chica-facturas'
    AND public.persona_tiene_rol('admin')
  );

-- ============================================================
-- personal-fotos
-- ============================================================
DROP POLICY IF EXISTS "Permitir todo en personal-fotos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir SELECT en personal-fotos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir INSERT en personal-fotos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir UPDATE en personal-fotos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir DELETE en personal-fotos" ON storage.objects;
DROP POLICY IF EXISTS personal_fotos_select ON storage.objects;
DROP POLICY IF EXISTS personal_fotos_insert ON storage.objects;
DROP POLICY IF EXISTS personal_fotos_update ON storage.objects;
DROP POLICY IF EXISTS personal_fotos_delete ON storage.objects;

CREATE POLICY personal_fotos_select ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'personal-fotos');

CREATE POLICY personal_fotos_insert ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'personal-fotos');

CREATE POLICY personal_fotos_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'personal-fotos'
    AND (public.persona_tiene_rol('admin') OR public.persona_tiene_rol('supervisor'))
  );

CREATE POLICY personal_fotos_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'personal-fotos'
    AND public.persona_tiene_rol('admin')
  );

-- ============================================================
-- proyecto-archivos
-- ============================================================
DROP POLICY IF EXISTS "Permitir todo en proyecto-archivos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir SELECT en proyecto-archivos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir INSERT en proyecto-archivos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir UPDATE en proyecto-archivos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir DELETE en proyecto-archivos" ON storage.objects;
DROP POLICY IF EXISTS proyecto_archivos_select ON storage.objects;
DROP POLICY IF EXISTS proyecto_archivos_insert ON storage.objects;
DROP POLICY IF EXISTS proyecto_archivos_update ON storage.objects;
DROP POLICY IF EXISTS proyecto_archivos_delete ON storage.objects;

CREATE POLICY proyecto_archivos_select ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'proyecto-archivos');

CREATE POLICY proyecto_archivos_insert ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'proyecto-archivos');

CREATE POLICY proyecto_archivos_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proyecto-archivos'
    AND (public.persona_tiene_rol('admin') OR public.persona_tiene_rol('supervisor'))
  );

CREATE POLICY proyecto_archivos_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'proyecto-archivos'
    AND public.persona_tiene_rol('admin')
  );

-- Nota: storage.objects RLS está ENABLED por default en proyectos Supabase.
-- No hay ALTER TABLE ... ENABLE ROW LEVEL SECURITY explícito aquí.

-- (No NOTIFY pgrst — storage no se sirve por PostgREST.)
