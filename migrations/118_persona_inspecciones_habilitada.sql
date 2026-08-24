-- v8.35.3: capacidad dedicada para inspecciones de vehículos. Solo la persona con
-- inspecciones_habilitada = true (Jhonathan) hace inspecciones de oficina y autoriza
-- las remotas. El resto solo puede hacer una inspección remota si está autorizado.
alter table public.personal add column if not exists inspecciones_habilitada boolean not null default false;

notify pgrst, 'reload schema';
