-- v8.89.0: datos personales sensibles y familia del empleado. RLS ON sin políticas:
-- solo el servidor (service role) lee/escribe vía /api/personal/familia.
create table if not exists personal_rrhh (
  persona_id text primary key references personal(id) on delete cascade,
  estado_civil text, sexo text, nacionalidad text, nivel_estudios text, profesion text,
  updated_at timestamptz default now(), updated_by text
);
create table if not exists personal_familia (
  id text primary key,
  persona_id text not null references personal(id) on delete cascade,
  parentesco text not null, nombre text not null, fecha_nacimiento date, cedula text, telefono text,
  dependiente boolean default false, nota text,
  created_at timestamptz default now(), updated_at timestamptz default now(), updated_by text
);
create index if not exists personal_familia_persona_idx on personal_familia(persona_id);
alter table personal_rrhh enable row level security;
alter table personal_familia enable row level security;
notify pgrst, 'reload schema';
