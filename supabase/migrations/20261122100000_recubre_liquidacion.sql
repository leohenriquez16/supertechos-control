-- v8.100.0: liquidación con Recubre (pintura). Venta − materiales − MDO = beneficio bruto, 50/50
-- (también la pérdida). Recubre factura MDO + su 50%. Corte mensual. Solo servidor (RLS sin políticas).
create table if not exists recubre_liquidacion (
  ref text primary key,               -- cotización de pintura en Odoo (ST-C####)
  proyecto_id text, locacion_id text, nombre text,
  mdo_rd numeric, mdo_nota text, mdo_reportado_at timestamptz,
  materiales_extra_rd numeric default 0, materiales_extra_nota text,
  corte text,                         -- 'YYYY-MM'
  factura_recubre text, facturada_at timestamptz,
  updated_at timestamptz default now(), updated_by text
);
alter table recubre_liquidacion enable row level security;
notify pgrst, 'reload schema';
-- Reporte de Recubre (Vladimir): metros, MDO y logística/material gastable por techo.
alter table recubre_liquidacion add column if not exists m2_recubre numeric, add column if not exists logistica_rd numeric;
notify pgrst, 'reload schema';
