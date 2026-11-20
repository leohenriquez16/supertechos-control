-- v8.92.0 — «Fuera del programa»: locaciones que salen del programa (Sites no las dio o no
-- van). Salen del tablero, de los totales y del portal del cliente; se pueden devolver.
-- RLS sigue OFF (regla del repo).
alter table programa_locaciones add column if not exists fuera_programa boolean not null default false;
alter table programa_locaciones add column if not exists fuera_motivo text;
alter table programa_locaciones add column if not exists fuera_at timestamptz;
notify pgrst, 'reload schema';
