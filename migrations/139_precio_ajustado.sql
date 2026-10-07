-- v8.59.8 — Precio ajustado: el maestro cobra un monto total acordado, por avance.
-- El avance lo pone la oficina a mano en % (decisión de Leo, oct-2026). Cada registro queda
-- con quién y cuándo; el % solo sube y no pasa de 100. En cada corte se paga:
--   monto_ajustado × (avance al cierre del corte − avance antes del corte) / 100.

alter table costos_dia_proyecto add column if not exists monto_ajustado numeric;

create table if not exists avances_ajustados (
  id text primary key,
  proyecto_id text not null,
  persona_id text not null,
  fecha date not null,
  pct numeric not null check (pct >= 0 and pct <= 100),
  nota text,
  registrado_por_id text,
  registrado_por_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists avances_ajustados_obra_persona on avances_ajustados (proyecto_id, persona_id, fecha);

-- RLS off por diseño del ERP (el event trigger la activa sola en tablas nuevas).
alter table avances_ajustados disable row level security;
grant select, insert, update, delete on avances_ajustados to anon, authenticated;
notify pgrst, 'reload schema';
