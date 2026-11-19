-- v8.80.0: demanda pendiente de obras aprobadas por producto importado (la llena
-- ~/erp-agente/importaciones/sync_importaciones.py → sync_demanda, cada 15 min).
create table if not exists inventario_demanda (
  id text primary key, odoo_product_id int, proyecto_id text, proyecto text, referencia text, estado_obra text, fuente text,
  m2 numeric, requerido numeric, salido numeric, pendiente numeric, desde date, hasta date, updated_at timestamptz default now());
alter table inventario_demanda disable row level security;
grant select, insert, update, delete on inventario_demanda to anon, authenticated;
notify pgrst, 'reload schema';
