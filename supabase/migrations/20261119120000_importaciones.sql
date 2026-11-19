-- v8.77.0: control de importaciones (una fila por carga / OC de Odoo).
-- Los campos de Odoo los llena ~/erp-agente/importaciones/sync_importaciones.py;
-- el tracking de la naviera también. bl/contenedor/naviera/notas se pueden editar a mano.
create table if not exists importaciones (
  id uuid primary key default gen_random_uuid(),
  empresa text default 'ST',
  proveedor text,
  proveedor_codigo text,
  odoo_po_id int unique,
  oc text,
  proforma text,
  fecha_orden date,
  moneda text default 'USD',
  monto_fob numeric,
  flete numeric,
  monto_total numeric,
  anticipo numeric default 0,
  anticipo_fecha date,
  pagado numeric default 0,
  saldo numeric,
  factura_odoo text,
  factura_comercial text,
  vence date,
  recepcion_odoo text,
  recepcion_estado text,
  recepcion_fecha date,
  productos jsonb default '[]'::jsonb,
  bl text,
  contenedor text,
  naviera text,
  buque text,
  puerto_origen text,
  puerto_transbordo text,
  puerto_destino text,
  etd date,
  eta date,
  eta_original date,
  estado text default 'produccion',
  tracking jsonb,
  tracking_ultimo_evento text,
  tracking_actualizado timestamptz,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table importaciones disable row level security;
grant all on importaciones to anon, authenticated;
notify pgrst, 'reload schema';

-- documentos archivados del correo y carpeta Dropbox de la carga; checklist manual
alter table importaciones add column if not exists carpeta text, add column if not exists documentos jsonb default '[]'::jsonb,
  add column if not exists checklist jsonb default '{}'::jsonb;

-- Cola de correos que se mandan desde la ficha de la carga. Los envía la Mac
-- (~/erp-agente/importaciones/enviar_cola.py) por SMTP desde el buzón de quien lo ejecutó,
-- con los adjuntos de la carpeta Dropbox de la carga, y guarda copia en su carpeta Enviados.
create table if not exists importaciones_envios (
  id uuid primary key default gen_random_uuid(), importacion_id uuid references importaciones(id) on delete cascade,
  tipo text, de_email text, de_nombre text, para text[] default '{}', cc text[] default '{}', asunto text, cuerpo text,
  adjuntos text[] default '{}', estado text default 'pendiente', error text, creado_por text,
  created_at timestamptz default now(), enviado_at timestamptz);
alter table importaciones_envios disable row level security;
grant select, insert, update, delete on importaciones_envios to anon, authenticated;
notify pgrst, 'reload schema';
alter table importaciones add column if not exists archivos text[] default '{}'; -- archivos de la carpeta Dropbox (los lista la Mac)
notify pgrst, 'reload schema';
