-- v8.27.45+: facturas_odoo quedó con RLS ACTIVADA y SIN políticas → bloqueaba todo
-- insert/select ("new row violates row-level security policy"), por eso nadie podía
-- guardar facturas. La app usa RLS OFF en todas las tablas (auth por PIN + llave anon).
-- Se desactiva para igualarla al resto. (Ya aplicado a prod vía MCP.)
ALTER TABLE public.facturas_odoo DISABLE ROW LEVEL SECURITY;
