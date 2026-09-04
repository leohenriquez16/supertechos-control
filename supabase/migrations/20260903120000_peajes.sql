-- v8.50.0 — Módulo de Peajes (Paso Rápido) dentro de Vehículos.
--
-- Flujo: Yamel sube el export .xlsx del portal de Paso Rápido → se guarda el
-- detalle de cada pase → el consumo aparece en la ficha de cada vehículo.
--
-- Reglas de identificación acordadas con Leonardo (2026-09-03):
--   1. El import NUNCA rechaza un pase. Todo tag entra, tenga o no vehículo.
--   2. El tag que cruza por placa con un vehículo del ERP se engancha solo.
--   3. El tag que no cruza queda PENDIENTE y se muestra en rojo hasta que
--      alguien lo resuelva: asignar a vehículo, crear el vehículo, o marcarlo
--      fuera de flota (con nota). No existe la opción "lo veré después".
--   4. Si la placa del portal difiere de la del ERP para el mismo vehículo,
--      es un CONFLICTO y obliga a unificar: se elige la placa correcta y se
--      corrige de un solo lado.

-- ============================================================
-- 1) El vehículo guarda su tag de peaje
-- ============================================================
-- La columna ya existe desde el módulo de Vehículos (se edita en la ficha).
-- Lo que agrega esta migración es el índice único: un tag no puede estar en
-- dos vehículos, o el consumo se contaría dos veces.
alter table public.vehiculos add column if not exists tag_peaje text;

create unique index if not exists idx_vehiculos_tag_peaje
  on public.vehiculos (tag_peaje) where tag_peaje is not null;

-- ============================================================
-- 2) Catálogo de tags — la memoria de qué es cada tag
-- ============================================================
-- Sobrevive a los imports: se llena en el primer archivo y se corrige a mano.
create table if not exists public.peaje_tags (
  tag             text primary key,
  nombre_portal   text,            -- marca/modelo como viene del portal
  placa_portal    text,            -- placa como viene del portal
  vehiculo_id     text references public.vehiculos(id) on delete set null,
  estado          text not null default 'pendiente',
                  -- pendiente | asignado | fuera_flota
  nota            text,            -- obligatoria al marcar fuera_flota
  fusionar_con    text,            -- tag que releva a este (cambio de tag)
  resuelto_por_id text,
  resuelto_at     timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_peaje_tags_estado on public.peaje_tags (estado);
create index if not exists idx_peaje_tags_vehiculo on public.peaje_tags (vehiculo_id);

-- ============================================================
-- 3) Periodos — un renglón por archivo subido
-- ============================================================
create table if not exists public.peaje_periodos (
  id            text primary key,
  mes           text not null,          -- 'YYYY-MM'
  archivo       text,                   -- nombre del .xlsx subido
  filas         int not null default 0, -- pases importados de ese mes
  total         numeric not null default 0,
  subido_por_id text,
  subido_por    text,
  created_at    timestamptz default now(),
  unique (mes)
);

-- ============================================================
-- 4) Transacciones — el detalle de cada pase
-- ============================================================
create table if not exists public.peaje_transacciones (
  id          bigint primary key,        -- ID del portal: evita duplicados
  fecha       timestamptz not null,
  mes         text not null,             -- 'YYYY-MM', para filtrar rápido
  tag         text not null,
  vehiculo_id text references public.vehiculos(id) on delete set null,
  caseta      text,
  monto       numeric not null default 0, -- positivo = gasto
  tipo        text not null default 'PASE', -- PASE | CARGA
  created_at  timestamptz default now()
);

create index if not exists idx_peaje_tx_mes on public.peaje_transacciones (mes);
create index if not exists idx_peaje_tx_tag on public.peaje_transacciones (tag);
create index if not exists idx_peaje_tx_vehiculo on public.peaje_transacciones (vehiculo_id, mes);
create index if not exists idx_peaje_tx_fecha on public.peaje_transacciones (fecha);

-- ============================================================
-- 5) Consumo por vehículo y mes — lo que lee la ficha
-- ============================================================
create or replace view public.peaje_consumo_vehiculo as
select
  t.vehiculo_id,
  t.mes,
  count(*)                                          as pases,
  sum(t.monto)                                      as monto,
  count(*) filter (where extract(dow from t.fecha) in (0, 6))   as pases_finde,
  count(*) filter (where extract(hour from t.fecha) < 6
                      or extract(hour from t.fecha) >= 20)      as pases_noche
from public.peaje_transacciones t
where t.tipo = 'PASE' and t.vehiculo_id is not null
group by t.vehiculo_id, t.mes;

-- Cuadre del mes: cuánto está asignado a vehículos y cuánto no.
-- El total de la cuenta siempre es mayor o igual a la suma de las fichas.
create or replace view public.peaje_resumen_mes as
select
  t.mes,
  sum(t.monto)                                              as total,
  sum(t.monto) filter (where t.vehiculo_id is not null)     as asignado,
  sum(t.monto) filter (where t.vehiculo_id is null)         as sin_asignar,
  count(distinct t.tag)                                     as tags,
  count(distinct t.tag) filter (where t.vehiculo_id is null) as tags_sin_vehiculo,
  count(*)                                                  as pases
from public.peaje_transacciones t
where t.tipo = 'PASE'
group by t.mes;

grant all on public.peaje_tags, public.peaje_periodos, public.peaje_transacciones
  to anon, authenticated, service_role;
grant select on public.peaje_consumo_vehiculo, public.peaje_resumen_mes
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Ajustes tras la primera carga real (2026-09-04)
-- ------------------------------------------------------------
-- Consumo por tag: hace falta para saber QUÉ pendiente urge. Un tag sin un
-- solo pase no es un problema; uno con RD$28,000 al año sí.
create or replace view public.peaje_consumo_tag as
select
  t.tag,
  count(*)      as pases,
  sum(t.monto)  as total,
  min(t.mes)    as primer_mes,
  max(t.mes)    as ultimo_mes
from public.peaje_transacciones t
where t.tipo = 'PASE'
group by t.tag;

grant select on public.peaje_consumo_tag to anon, authenticated, service_role;

-- El resto del ERP corre con RLS desactivada (regla del proyecto). Si estas
-- tablas quedan con RLS activa, el import falla con "violates row-level
-- security policy".
alter table public.peaje_tags          disable row level security;
alter table public.peaje_periodos      disable row level security;
alter table public.peaje_transacciones disable row level security;

notify pgrst, 'reload schema';
