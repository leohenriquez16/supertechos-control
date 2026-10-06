-- v8.59.5 — Caja chica: no cargar gastos a obras ya cerradas.
-- Una obra 'facturado' o 'finalizado_recibido_conforme' no admite gastos con fecha posterior
-- a su cierre + 7 días de gracia (compras de última hora, retoques). El cierre es la primera
-- vez que la obra pasó a finalizado_* o facturado en historial_estados.
-- Solo se evalúa al crear el gasto o al cambiarle la obra o la fecha: los gastos viejos no se tocan.
-- Si de verdad es de esa obra (garantía, reparación), se carga a la reclamación/garantía, no a la obra.

create or replace function caja_chica_valida_obra_abierta() returns trigger
language plpgsql as $$
declare
  v_estado text;
  v_ref text;
  v_cierre date;
begin
  if new.proyecto_id is null or new.tipo = 'entrega' or coalesce(new.status, '') = 'rechazado' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.proyecto_id is not distinct from old.proyecto_id
     and new.fecha is not distinct from old.fecha then
    return new;
  end if;

  select estado, coalesce(referencia_odoo, nombre) into v_estado, v_ref
    from proyectos where id = new.proyecto_id;
  if v_estado is null or v_estado not in ('facturado', 'finalizado_recibido_conforme') then
    return new;
  end if;

  select (min(created_at) at time zone 'America/Santo_Domingo')::date into v_cierre
    from historial_estados
   where proyecto_id = new.proyecto_id
     and estado_nuevo in ('finalizado_no_entregado', 'finalizado_recibido_conforme', 'facturado');

  if v_cierre is null or new.fecha > v_cierre + 7 then
    raise exception 'La obra % ya está cerrada (%). Este gasto es de otra obra: elige la obra donde se usó.', v_ref,
      case when v_cierre is null then v_estado else 'cerrada el ' || to_char(v_cierre, 'DD/MM/YYYY') end
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_caja_chica_obra_abierta on caja_chica_movimientos;
create trigger trg_caja_chica_obra_abierta
  before insert or update on caja_chica_movimientos
  for each row execute function caja_chica_valida_obra_abierta();
