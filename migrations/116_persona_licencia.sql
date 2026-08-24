-- v8.35.2: licencia de conducir del chofer (persona). Se guarda en la persona y se
-- muestra desde la ficha del vehículo al que está asignada como responsable/chofer.
alter table public.personal
  add column if not exists licencia_path text,
  add column if not exists licencia_categoria text,
  add column if not exists licencia_vence date;

notify pgrst, 'reload schema';
