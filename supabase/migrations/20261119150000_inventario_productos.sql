-- v8.79.0: inventario de productos importados para el pronóstico (lo llena
-- ~/erp-agente/importaciones/sync_importaciones.py desde Odoo cada 15 min).
create table if not exists inventario_productos (
  odoo_product_id int primary key, producto text, proveedor text, proveedor_codigo text, uom text,
  stock numeric default 0, stock_ubicaciones jsonb default '{}'::jsonb, comprometido numeric default 0,
  costo_unitario numeric, mensual jsonb default '{}'::jsonb, minimo numeric, notas text, updated_at timestamptz default now());
alter table inventario_productos disable row level security;
grant select, insert, update, delete on inventario_productos to anon, authenticated;
notify pgrst, 'reload schema';
