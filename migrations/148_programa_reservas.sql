-- v8.91.0 — «Con reservas» (término de Sites): correcciones pendientes después de la visita
-- de recepción y antes de la aceptación. RLS sigue OFF (regla del repo).
alter table programa_locaciones add column if not exists reservas_abiertas boolean not null default false;
alter table programa_locaciones add column if not exists reservas_nota text;
alter table programa_locaciones add column if not exists reservas_desde timestamptz;
notify pgrst, 'reload schema';
