-- v8.27.0: bucket público para adjuntos de tickets Gotera (screenshots + notas de voz).
insert into storage.buckets (id, name, public)
values ('soporte-adjuntos', 'soporte-adjuntos', true)
on conflict (id) do update set public = true;

-- Políticas (mismo patrón que los demás buckets del proyecto)
drop policy if exists soporte_adjuntos_insert on storage.objects;
create policy soporte_adjuntos_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'soporte-adjuntos');

drop policy if exists soporte_adjuntos_select on storage.objects;
create policy soporte_adjuntos_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'soporte-adjuntos');

drop policy if exists soporte_adjuntos_delete on storage.objects;
create policy soporte_adjuntos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'soporte-adjuntos');
