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

-- (137) cliente_nombre: con qué nombre aparece el cliente en levantamientos, para el amarre automático
alter table programas add column if not exists cliente_nombre text;

-- El proyecto tiene un event trigger que ACTIVA RLS en toda tabla nueva del esquema public.
-- El ERP trabaja con RLS apagado (reglas de arquitectura), así que sin esto el ERP no lee
-- nada y la pantalla dice "Todavía no hay programas" (pasó al desplegar v8.58.0).
alter table programas disable row level security;
alter table programa_locaciones disable row level security;
grant select, insert, update, delete on programas, programa_locaciones to anon, authenticated;
notify pgrst, 'reload schema';

-- (137) Fecha y hora coordinadas con el propietario para la visita de levantamiento
alter table programa_locaciones add column if not exists fecha_visita date;
alter table programa_locaciones add column if not exists hora_visita text;

-- (137) Fecha en que se envió la cotización (para "desde cuándo está en cada etapa")
alter table programa_locaciones add column if not exists cotizado_at timestamptz;

-- (137) Documentos por locación: OC del cliente, cotización, informe, garantía, etc.
-- Archivos en el bucket privado proyecto-archivos, carpeta programas/<locacion>/.
create table if not exists programa_documentos (
  id text primary key,
  programa_id text not null references programas(id) on delete cascade,
  locacion_id text not null references programa_locaciones(id) on delete cascade,
  tipo text not null default 'otro',          -- oc | cotizacion | informe | garantia | autorizacion | otro
  nombre text not null,
  path text not null,
  mime text,
  tamano_bytes bigint,
  origen text not null default 'erp',          -- erp | cliente
  subido_por text,
  visible_cliente boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_prog_docs_loc on programa_documentos(locacion_id);
alter table programa_documentos disable row level security;
grant select, insert, update, delete on programa_documentos to anon, authenticated;
notify pgrst, 'reload schema';
