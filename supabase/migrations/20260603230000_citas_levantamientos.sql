-- v8.25.24: Citas de levantamiento — hora, tipo/modalidad y confirmación.
-- Edwin confirma las citas desde la oficina; el supervisor las ve en su Home.
--
-- tipo_cita:
--   hora_fija    → a una hora específica (usa hora_visita)
--   manana       → en la mañana (franja)
--   tarde        → en la tarde (franja)
--   dia_completo → cualquier hora del día
--   restringida  → solo días/horas específicas, agendada con antelación (detalle en cita_restriccion)

alter table surveys.projects
  add column if not exists hora_visita text,
  add column if not exists tipo_cita text,
  add column if not exists cita_restriccion text,
  add column if not exists cita_confirmada boolean not null default false,
  add column if not exists cita_confirmada_por text,
  add column if not exists cita_confirmada_at timestamptz;

-- Recargar el cache de esquema de PostgREST tras el DDL.
notify pgrst, 'reload schema';
