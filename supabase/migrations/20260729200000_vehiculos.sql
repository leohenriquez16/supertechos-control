-- v8.27.38 — Módulo Vehículos (flota de la empresa).
-- Datos del vehículo + documentos (matrícula, seguro). Se pueden elegir al
-- generar cartas de acceso.

create table if not exists public.vehiculos (
  id                text primary key,
  marca             text,
  modelo            text,
  anio              int,
  color             text,
  chasis            text,
  placa             text,
  matricula_path    text,           -- doc en bucket vehiculos-docs (PDF o imagen)
  seguro_path       text,
  seguro_aseguradora text,
  seguro_vence      date,
  empresa           text,           -- 'super_techos' | 'prouco' | null (opcional)
  notas             text,
  activo            boolean not null default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_vehiculos_activo on public.vehiculos (activo);

grant all on public.vehiculos to anon, authenticated, service_role;

-- Bucket privado para matrícula y seguro (se ven por URL firmada).
insert into storage.buckets (id, name, public)
values ('vehiculos-docs', 'vehiculos-docs', false)
on conflict (id) do nothing;

drop policy if exists vehiculos_docs_select on storage.objects;
create policy vehiculos_docs_select on storage.objects for select
  to anon, authenticated using (bucket_id = 'vehiculos-docs');

drop policy if exists vehiculos_docs_insert on storage.objects;
create policy vehiculos_docs_insert on storage.objects for insert
  to anon, authenticated with check (bucket_id = 'vehiculos-docs');

drop policy if exists vehiculos_docs_update on storage.objects;
create policy vehiculos_docs_update on storage.objects for update
  to authenticated using (bucket_id = 'vehiculos-docs' and (persona_tiene_rol('admin') or persona_tiene_rol('supervisor')));

drop policy if exists vehiculos_docs_delete on storage.objects;
create policy vehiculos_docs_delete on storage.objects for delete
  to authenticated using (bucket_id = 'vehiculos-docs' and persona_tiene_rol('admin'));

notify pgrst, 'reload schema';
