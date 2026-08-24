-- v8.35.3: Inspecciones mensuales de vehículos (fotos estandarizadas por ángulo)
-- + autorización para inspección remota (Jhonathan autoriza al chofer si el
-- vehículo no puede ir a la oficina).

create table if not exists public.vehiculo_inspecciones (
  id text primary key,
  vehiculo_id text not null references public.vehiculos(id) on delete cascade,
  fecha date not null default current_date,
  realizada_por_id text,
  realizada_por_nombre text,
  tipo text not null default 'oficina',        -- 'oficina' | 'remota_autorizada'
  autorizada_por_id text,
  autorizada_por_nombre text,
  odometro_km numeric,
  estado_general text,                          -- 'bueno' | 'regular' | 'malo'
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists public.vehiculo_inspeccion_fotos (
  id text primary key,
  inspeccion_id text not null references public.vehiculo_inspecciones(id) on delete cascade,
  angulo text not null,                         -- alante|lados|atras|bonete|odometro|interior
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vehiculo_inspeccion_autorizaciones (
  id text primary key,
  vehiculo_id text not null references public.vehiculos(id) on delete cascade,
  autorizado_a_id text,
  autorizado_a_nombre text,
  autorizada_por_id text,
  autorizada_por_nombre text,
  creada_at timestamptz not null default now(),
  vence date,
  usada_inspeccion_id text,
  activa boolean not null default true
);

create index if not exists idx_veh_insp_vehiculo on public.vehiculo_inspecciones(vehiculo_id, fecha desc);
create index if not exists idx_veh_insp_fotos on public.vehiculo_inspeccion_fotos(inspeccion_id);
create index if not exists idx_veh_insp_auth on public.vehiculo_inspeccion_autorizaciones(vehiculo_id) where activa;

-- Convención del repo: RLS off.
alter table public.vehiculo_inspecciones disable row level security;
alter table public.vehiculo_inspeccion_fotos disable row level security;
alter table public.vehiculo_inspeccion_autorizaciones disable row level security;

notify pgrst, 'reload schema';
