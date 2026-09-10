-- v8.51.6 (ticket Edwin Parra, Gotera 8-sep-2026): "Error subiendo fotos: Bucket not found".
-- El código usa el bucket `documentos-fotos` desde hace tiempo (fotos de documentos de
-- proyecto, audio de fotos, cotización adjunta de requisiciones v8.39 y fotos de
-- reclamaciones v8.49.11), pero el bucket NUNCA se creó en producción.
-- Bucket público (las URLs se guardan en tablas como public URL, igual que soporte-adjuntos).

insert into storage.buckets (id, name, public)
values ('documentos-fotos', 'documentos-fotos', true)
on conflict (id) do update set public = true;

drop policy if exists documentos_fotos_select on storage.objects;
create policy documentos_fotos_select on storage.objects
  for select to anon, authenticated using (bucket_id = 'documentos-fotos');

drop policy if exists documentos_fotos_insert on storage.objects;
create policy documentos_fotos_insert on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'documentos-fotos');

drop policy if exists documentos_fotos_update on storage.objects;
create policy documentos_fotos_update on storage.objects
  for update to anon, authenticated using (bucket_id = 'documentos-fotos');

drop policy if exists documentos_fotos_delete on storage.objects;
create policy documentos_fotos_delete on storage.objects
  for delete to anon, authenticated using (bucket_id = 'documentos-fotos');
