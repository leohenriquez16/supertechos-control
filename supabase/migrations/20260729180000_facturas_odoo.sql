-- v8.27.36 — Módulo "Facturas" (carga de facturas de gasto para exportar a Odoo).
-- Lily captura facturas físicas: foto + IA (reusa /api/caja-chica/parse-factura) →
-- revisa RNC/NCF/fecha/monto/producto → guarda. Admin exporta a Odoo (CSV + fotos).

create table if not exists public.facturas_odoo (
  id            text primary key,
  empresa       text,                         -- 'super_techos' | 'prouco'
  proveedor     text,
  rnc           text,                          -- RNC/cédula del proveedor (emisor)
  tipo_ncf      text,                          -- 'B01','B02','B11','B13','B14','E31','E32','E43'
  ncf           text,
  fecha         date,
  concepto      text,                          -- producto / descripción
  monto         numeric not null default 0,    -- monto total de la factura
  itbis         numeric,
  itbis_modo    text default 'aparte',         -- 'aparte' | 'incluido' | 'exento'
  reembolsable  boolean not null default false, -- true = la persona pagó y pide reembolso; false = solo registrar el gasto
  subtotal      numeric,
  cuenta_gasto  text,                           -- código de cuenta Odoo (opcional; se puede fijar al exportar)
  foto_path     text,
  datos_ia      jsonb,
  estado        text not null default 'borrador', -- 'borrador' | 'lista' | 'exportada'
  exportada_at  timestamptz,
  creado_por_id text,
  creado_por_nombre text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_facturas_odoo_estado on public.facturas_odoo (estado);
create index if not exists idx_facturas_odoo_fecha  on public.facturas_odoo (fecha);

-- Acceso vía anon key como el resto del ERP (RLS off por convención del proyecto).
grant all on public.facturas_odoo to anon, authenticated, service_role;

-- Flag por persona: quién puede usar el módulo de Facturas (igual patrón que caja_chica_habilitada).
alter table public.personal add column if not exists facturas_habilitada boolean not null default false;

-- Bucket privado para las fotos de estas facturas (se ven por URL firmada).
insert into storage.buckets (id, name, public)
values ('facturas-odoo', 'facturas-odoo', false)
on conflict (id) do nothing;

-- Políticas de Storage (mismo criterio que caja-chica-facturas):
drop policy if exists facturas_odoo_select on storage.objects;
create policy facturas_odoo_select on storage.objects for select
  to anon, authenticated using (bucket_id = 'facturas-odoo');

drop policy if exists facturas_odoo_insert on storage.objects;
create policy facturas_odoo_insert on storage.objects for insert
  to anon, authenticated with check (bucket_id = 'facturas-odoo');

drop policy if exists facturas_odoo_update on storage.objects;
create policy facturas_odoo_update on storage.objects for update
  to authenticated using (bucket_id = 'facturas-odoo' and (persona_tiene_rol('admin') or persona_tiene_rol('supervisor')));

drop policy if exists facturas_odoo_delete on storage.objects;
create policy facturas_odoo_delete on storage.objects for delete
  to authenticated using (bucket_id = 'facturas-odoo' and persona_tiene_rol('admin'));

notify pgrst, 'reload schema';
