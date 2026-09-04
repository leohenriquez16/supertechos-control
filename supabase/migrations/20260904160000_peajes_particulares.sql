-- v8.50.1 — Vehículos particulares del personal en el módulo de Peajes.
--
-- Hay tags de peaje de carros personales de empleados: el peaje lo paga la
-- empresa, así que ES gasto de la empresa, pero NO es gasto de flota. Marcarlos
-- "fuera de flota" los sacaba del control; ahora se asignan a una persona.
--
-- El vehículo se crea igual en la tabla vehiculos (para reusar placa, ficha y
-- responsable), pero con es_particular = true, que lo mantiene fuera de los
-- reportes de flota operativa.

alter table public.vehiculos add column if not exists es_particular boolean not null default false;

create index if not exists idx_vehiculos_particular on public.vehiculos (es_particular);

-- El cuadre del mes pasa de dos líneas a tres: flota / particulares / sin asignar.
-- Cambian las columnas, así que hay que soltar la vista: 'create or replace'
-- falla con "cannot change name of view column".
drop view if exists public.peaje_resumen_mes;
create view public.peaje_resumen_mes as
select
  t.mes,
  sum(t.monto)                                                        as total,
  sum(t.monto) filter (where t.vehiculo_id is not null)               as asignado,
  sum(t.monto) filter (where v.id is not null and not v.es_particular) as flota,
  sum(t.monto) filter (where v.es_particular)                         as particular,
  sum(t.monto) filter (where t.vehiculo_id is null)                   as sin_asignar,
  count(distinct t.tag)                                               as tags,
  count(distinct t.tag) filter (where t.vehiculo_id is null)          as tags_sin_vehiculo,
  count(*)                                                            as pases
from public.peaje_transacciones t
left join public.vehiculos v on v.id = t.vehiculo_id
where t.tipo = 'PASE'
group by t.mes;

-- Gasto de peaje por persona: lo que la empresa paga en peajes de carros
-- personales, por empleado. Es la vista que sustenta el beneficio.
create or replace view public.peaje_consumo_persona as
select
  v.responsable_id            as persona_id,
  t.mes,
  count(*)                    as pases,
  sum(t.monto)                as monto,
  count(distinct v.id)        as vehiculos
from public.peaje_transacciones t
join public.vehiculos v on v.id = t.vehiculo_id
where t.tipo = 'PASE' and v.es_particular and v.responsable_id is not null
group by v.responsable_id, t.mes;

grant select on public.peaje_resumen_mes, public.peaje_consumo_persona
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
