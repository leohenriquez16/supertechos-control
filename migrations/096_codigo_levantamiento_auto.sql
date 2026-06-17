-- v8.27.10: código automático secuencial para levantamientos.
-- Formato LEV-AAAA-MM-### (correlativo por mes, en hora de RD).
create table if not exists public.levantamiento_codigo_contador (
  periodo text primary key,            -- 'AAAA-MM' en hora América/Santo_Domingo
  ultimo  integer not null default 0
);
alter table public.levantamiento_codigo_contador disable row level security;

create or replace function public.siguiente_codigo_levantamiento()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo text := to_char(now() at time zone 'America/Santo_Domingo', 'YYYY-MM');
  v_n integer;
begin
  insert into public.levantamiento_codigo_contador (periodo, ultimo)
  values (v_periodo, 1)
  on conflict (periodo) do update set ultimo = public.levantamiento_codigo_contador.ultimo + 1
  returning ultimo into v_n;
  return 'LEV-' || v_periodo || '-' || lpad(v_n::text, 3, '0');
end;
$$;

grant execute on function public.siguiente_codigo_levantamiento() to anon, authenticated;

notify pgrst, 'reload schema';
