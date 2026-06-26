-- v8.27.18: Actas de proyecto firmadas vía DocuSeal Cloud.
-- Cubicaciones, entregas por área y entrega final del proyecto/edificio,
-- firmadas por el cliente desde su celular/email (link de DocuSeal).
-- Idempotente. Convención actual: RLS off (autorización a nivel app), NOTIFY pgrst.
-- (Portado de migrations/008_actas_proyecto.sql v8.16.0; se agrega creación de bucket.)

create table if not exists public.actas_proyecto (
  id text primary key,
  proyecto_id text not null,
  -- area_id NULL = acta del proyecto entero (entrega final o cubicación multi-área)
  area_id text,

  tipo text not null check (tipo in ('cubicacion', 'entrega_area', 'entrega_proyecto', 'carta_garantia')),

  -- Garantía de origen (cuando tipo = 'carta_garantia'); enlaza con public.garantias.
  garantia_id text,
  -- Empresa emisora ('super_techos' | 'prouco') — define membrete de la carta.
  empresa text,

  -- Snapshot congelado de lo que se firmó (áreas, m², fotos, total, observaciones).
  snapshot_datos jsonb not null default '{}'::jsonb,

  -- Firmante (cliente)
  cliente_nombre text,
  cliente_email text,
  cliente_telefono text,
  cliente_via_envio text check (cliente_via_envio in ('email', 'whatsapp')),

  -- Integración DocuSeal
  docuseal_submission_id text,
  docuseal_url_firmante text,
  docuseal_payload jsonb,

  status text not null default 'borrador' check (
    status in ('borrador', 'enviada', 'vista', 'firmada', 'rechazada', 'expirada')
  ),

  enviada_at timestamptz,
  vista_por_cliente_at timestamptz,
  firmada_at timestamptz,
  rechazada_at timestamptz,

  pdf_firmado_path text,

  -- Facturación (solo aplica a cubicaciones)
  status_facturacion text check (status_facturacion in ('pendiente', 'facturada', 'no_aplica')),
  facturada_at timestamptz,
  facturada_por_id text,
  factura_referencia text,

  -- Garantía (entregas)
  garantia_inicio_at timestamptz,
  garantia_fin_at timestamptz,
  garantia_anios integer,

  generada_por_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_actas_proyecto_proyecto    on public.actas_proyecto(proyecto_id);
create index if not exists idx_actas_proyecto_status      on public.actas_proyecto(status);
create index if not exists idx_actas_proyecto_tipo        on public.actas_proyecto(tipo);
create index if not exists idx_actas_proyecto_facturacion on public.actas_proyecto(status_facturacion) where status_facturacion = 'pendiente';
create index if not exists idx_actas_proyecto_docuseal    on public.actas_proyecto(docuseal_submission_id);
create index if not exists idx_actas_proyecto_garantia    on public.actas_proyecto(garantia_id) where garantia_id is not null;
create index if not exists idx_actas_proyecto_created     on public.actas_proyecto(created_at desc);

alter table public.actas_proyecto disable row level security;

create or replace function public.actas_proyecto_updated_at_fn() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists actas_proyecto_updated_at on public.actas_proyecto;
create trigger actas_proyecto_updated_at
  before update on public.actas_proyecto
  for each row execute function public.actas_proyecto_updated_at_fn();

-- Bucket privado para los PDFs firmados (se crea por SQL, antes era manual).
insert into storage.buckets (id, name, public)
values ('actas-firmadas', 'actas-firmadas', false)
on conflict (id) do nothing;

do $$
begin
  drop policy if exists "actas_firmadas_select" on storage.objects;
  drop policy if exists "actas_firmadas_insert" on storage.objects;
  drop policy if exists "actas_firmadas_update" on storage.objects;
  drop policy if exists "actas_firmadas_delete" on storage.objects;
end $$;

create policy "actas_firmadas_select" on storage.objects for select using (bucket_id = 'actas-firmadas');
create policy "actas_firmadas_insert" on storage.objects for insert with check (bucket_id = 'actas-firmadas');
create policy "actas_firmadas_update" on storage.objects for update using (bucket_id = 'actas-firmadas');
create policy "actas_firmadas_delete" on storage.objects for delete using (bucket_id = 'actas-firmadas');

notify pgrst, 'reload schema';
