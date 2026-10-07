-- v8.61.0 — Reportes atrasados y avance de arranque.
-- • arranque = avance que la obra ya traía al entrar al ERP: suma al % de avance, NO a producción
--   ni a nómina (ese trabajo se hizo y pagó fuera del ERP).
-- • Un reporte con fecha de más de 3 días atrás queda 'pendiente' de aprobación (Miguel/Erisdania):
--   fuera de nómina y producción hasta que lo aprueben. Cada aprobación avisa a Leo por correo.
-- • No se reporta con fecha anterior a la creación de la obra en el ERP: eso va como arranque.
-- • fecha_produccion: mes en que cuenta en producción. Si se aprueba con el mes ya cerrado
--   (después del día 5 del mes siguiente), cuenta en el mes de la aprobación.

alter table reportes add column if not exists arranque boolean not null default false;
alter table reportes add column if not exists atraso_estado text;       -- null | pendiente | aprobado | rechazado
alter table reportes add column if not exists atraso_dias integer;
alter table reportes add column if not exists atraso_motivo text;
alter table reportes add column if not exists atraso_resuelto_por text;
alter table reportes add column if not exists atraso_resuelto_at timestamptz;
alter table reportes add column if not exists fecha_produccion date;

create or replace function reportes_controla_atraso() returns trigger
language plpgsql as $$
declare
  v_hoy date := (now() at time zone 'America/Santo_Domingo')::date;
  v_inicio date;
begin
  if new.arranque then
    new.excluir_nomina := true;
    new.excluir_nomina_motivo := coalesce(new.excluir_nomina_motivo, 'Avance de arranque (traído al entrar al ERP)');
    return new;
  end if;
  select (created_at at time zone 'America/Santo_Domingo')::date into v_inicio from proyectos where id = new.proyecto_id;
  if v_inicio is not null and new.fecha < v_inicio - 3 then  -- 3 días de margen: obras que se crean un poco después de empezar
    raise exception 'La fecha % es anterior a la entrada de la obra al ERP (%). Lo que ya traía la obra se registra como avance de arranque.',
      to_char(new.fecha, 'DD/MM/YYYY'), to_char(v_inicio, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if new.fecha < v_hoy - 3 then
    new.atraso_estado := 'pendiente';
    new.atraso_dias := v_hoy - new.fecha;
    new.excluir_nomina := true;
    new.excluir_nomina_motivo := 'Reporte atrasado pendiente de aprobación';
  end if;
  return new;
end $$;

drop trigger if exists trg_reportes_controla_atraso on reportes;
create trigger trg_reportes_controla_atraso before insert on reportes
  for each row execute function reportes_controla_atraso();
notify pgrst, 'reload schema';
