-- v8.93.0 — Candados y accesos de las locaciones del programa (Sites).
-- candado_tipo: best | teleporte | iloq | nfc | multilock | yale_bluetooth | privado
-- acceso_pedido_at / acceso_asignado_at: pedido de acceso a Sites y «llave asignada».
-- programa_llaves: quién tiene usuario Teleporte / iLoq (se pide una vez por persona).
-- RLS sigue OFF (regla del repo).
alter table programa_locaciones add column if not exists candado_tipo text;
alter table programa_locaciones add column if not exists candado_nota text;
alter table programa_locaciones add column if not exists acceso_pedido_at timestamptz;
alter table programa_locaciones add column if not exists acceso_asignado_at timestamptz;
alter table programa_locaciones add column if not exists acceso_nota text;
create table if not exists programa_llaves (
  id text primary key,
  programa_id text not null,
  persona_id text not null,
  tipo text not null check (tipo in ('teleporte', 'iloq')),
  nota text,
  created_at timestamptz not null default now(),
  unique (programa_id, persona_id, tipo)
);
alter table programa_llaves disable row level security;
grant select, insert, update, delete on programa_llaves to anon, authenticated;
notify pgrst, 'reload schema';
