-- v8.19.93: permitir subir/ver fotos de levantamientos con la anon key (patrón
-- RLS-off de dev). Recrea las políticas del bucket surveys-photos incluyendo el
-- rol anon, manteniendo el scope SOLO a ese bucket. Idempotente.
-- NOTA: en PRODUCCIÓN, si se reactiva Auth, conviene volver a 'authenticated'.

DROP POLICY IF EXISTS surveys_photos_select ON storage.objects;
CREATE POLICY surveys_photos_select ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'surveys-photos');

DROP POLICY IF EXISTS surveys_photos_insert ON storage.objects;
CREATE POLICY surveys_photos_insert ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id = 'surveys-photos');

DROP POLICY IF EXISTS surveys_photos_update_admin ON storage.objects;
CREATE POLICY surveys_photos_update_admin ON storage.objects
  FOR UPDATE TO authenticated, anon
  USING (bucket_id = 'surveys-photos');

DROP POLICY IF EXISTS surveys_photos_delete_admin ON storage.objects;
CREATE POLICY surveys_photos_delete_admin ON storage.objects
  FOR DELETE TO authenticated, anon
  USING (bucket_id = 'surveys-photos');
