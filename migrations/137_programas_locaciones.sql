-- 137_programas_locaciones.sql — v8.58.0
-- PROGRAMAS: campañas multi-sitio con un mismo cliente (Towers and Sites: 60 antenas
-- antes de fin de año). Amarra cada locación con su levantamiento, su cotización y su
-- obra, y guarda lo que hoy vive en el correo: la luz verde del propietario y el
-- supervisor que el cliente asigna.
create table if not exists programas (
  id text primary key,
  nombre text not null,
  cliente_id text references clientes(id),
  codigo_publico text unique,          -- para el portal del cliente (Fase 2)
  clave_portal text,                   -- clave compartida del programa
  fecha_meta date,
  notas text,
  archivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists programa_locaciones (
  id text primary key,
  programa_id text not null references programas(id) on delete cascade,
  ubicacion_id text references cliente_ubicaciones(id),
  codigo_ut text,                      -- código del sitio en el cliente (DO-01-SD-00157-10)
  nombre text not null,
  direccion text,
  sector text,
  lat numeric,
  lng numeric,
  tipo_trabajo text not null default 'techo',   -- techo | pintura | ambos
  orden integer,
  -- lo que depende del cliente
  luz_verde boolean not null default false,
  luz_verde_at timestamptz,
  luz_verde_por text,
  supervisor_cliente_nombre text,
  supervisor_cliente_telefono text,
  supervisor_cliente_email text,
  cotizacion_ref text,                 -- ST-C#### en Odoo
  cotizacion_monto numeric,
  cotizacion_aprobada boolean not null default false,
  cotizacion_aprobada_at timestamptz,
  -- amarre con los módulos que ya existen
  levantamiento_id text,               -- proyectos.id (etapa levantamiento)
  levantado_at timestamptz,
  proyecto_id text,                    -- proyectos.id (la obra)
  etapa_desde timestamptz default now(),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prog_loc_programa on programa_locaciones(programa_id);
create index if not exists idx_prog_loc_proyecto on programa_locaciones(proyecto_id);
create index if not exists idx_prog_loc_ubicacion on programa_locaciones(ubicacion_id);

notify pgrst, 'reload schema';
