-- v8.28.0: Flujo de Caja (Contabilidad) — proyección semanal de efectivo por empresa.
--
-- cont_compromisos_fijos: salidas recurrentes (nómina, tarjetas, servicios, brigadas)
--   que no viven como facturas de proveedor en Odoo. Semanal o mensual (día del mes).
-- cont_flujo_manual: celdas editables del flujo — saldo inicial bancario REAL
--   (los libros de Odoo no cuadran mientras los bancos sigan sin conciliar),
--   cobros proyectados por semana y abonos planificados a CxP ya vencida.
--   `semana` = lunes de la semana proyectada; NULL solo en saldo_inicial.

create table if not exists cont_compromisos_fijos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null check (empresa in ('super_techos', 'prouco')),
  concepto text not null,
  monto numeric not null default 0,
  moneda text not null default 'DOP' check (moneda in ('DOP', 'USD')),
  frecuencia text not null default 'mensual' check (frecuencia in ('semanal', 'mensual')),
  dia_mes int check (dia_mes between 1 and 31),
  activo boolean not null default true,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists cont_flujo_manual (
  id uuid primary key default gen_random_uuid(),
  empresa text not null check (empresa in ('super_techos', 'prouco')),
  tipo text not null check (tipo in ('saldo_inicial', 'cobro', 'abono_vencido')),
  semana date,
  monto numeric not null default 0,      -- RD$
  monto_usd numeric not null default 0,  -- US$ (se convierte con la tasa del día)
  nota text,
  actualizado_en timestamptz not null default now()
);

-- Una sola fila por empresa+tipo+semana (saldo_inicial usa semana NULL).
create unique index if not exists cont_flujo_manual_unico
  on cont_flujo_manual (empresa, tipo, coalesce(semana, date '1900-01-01'));

-- cont_flujo_entradas: dinero que "pensamos va a entrar" pero aún no es factura
-- en Odoo — avances de contrato, cubicaciones por facturar, cobros comprometidos.
-- Itemizado con fecha esperada; al cobrarse se marca y sale de la proyección
-- (ya vive en el saldo bancario).
create table if not exists cont_flujo_entradas (
  id uuid primary key default gen_random_uuid(),
  empresa text not null check (empresa in ('super_techos', 'prouco')),
  concepto text not null,
  categoria text not null default 'otro' check (categoria in ('avance', 'cubicacion', 'cobro', 'otro')),
  monto numeric not null default 0,
  moneda text not null default 'DOP' check (moneda in ('DOP', 'USD')),
  fecha_esperada date not null,
  cobrado boolean not null default false,
  notas text,
  creado_en timestamptz not null default now()
);

-- ── Seed: compromisos fijos (promedio mar–ago 2026, del Excel "Flujo_de_caja para pagos" del 20/8/2026) ──
insert into cont_compromisos_fijos (empresa, concepto, monto, moneda, frecuencia, dia_mes, notas) values
  ('super_techos', 'Claro - telefonía e internet',        47716.27, 'DOP', 'mensual', 28, 'Promedio mar–ago 2026'),
  ('super_techos', 'CAPW soporte TI + Octágono GPS',      11057.37, 'DOP', 'mensual',  1, 'Promedio mar–ago 2026'),
  ('super_techos', 'CAASD agua potable',                    518.01, 'DOP', 'mensual',  1, 'Promedio mar–ago 2026'),
  ('super_techos', 'Seguro médico Mapfre',                86446.09, 'DOP', 'mensual',  8, 'Promedio mar–ago 2026'),
  ('super_techos', 'Útiles de aseo y limpieza',           13606.25, 'DOP', 'mensual',  8, 'Promedio mar–ago 2026'),
  ('super_techos', 'Alquileres / montacargas',            60860.00, 'DOP', 'mensual', 10, 'Promedio mar–ago 2026'),
  ('super_techos', 'Mantenimiento de vehículos',          44046.81, 'DOP', 'mensual', 11, 'Promedio mar–ago 2026'),
  ('super_techos', 'Tarjeta 5327 + Tarjeta 6098',        184488.88, 'DOP', 'mensual', 13, 'Promedio mar–ago 2026'),
  ('super_techos', 'Tarjeta 6120',                       233748.50, 'DOP', 'mensual', 15, 'Promedio mar–ago 2026'),
  ('super_techos', 'Nómina',                             595153.62, 'DOP', 'mensual', 15, 'Si se paga quincenal, divide en dos compromisos (día 15 y 30)'),
  ('prouco',       'Mano de obra de brigadas',           432324.31, 'DOP', 'semanal', null, 'Promedio semanal mar–ago 2026'),
  ('prouco',       'Dietas y refrigerios en obra',        29311.33, 'DOP', 'semanal', null, 'Promedio semanal mar–ago 2026'),
  ('prouco',       'Leasing vehículo Banco Popular',      82576.38, 'DOP', 'mensual', 30, 'Promedio mar–ago 2026'),
  ('prouco',       'Agua y basura',                       23116.81, 'DOP', 'mensual', 12, 'Promedio mar–ago 2026'),
  ('prouco',       'Reparación y mantenimiento',          33164.67, 'DOP', 'mensual', 13, 'Promedio mar–ago 2026'),
  ('prouco',       'Tarjeta 2879',                       157168.73, 'DOP', 'mensual', 14, 'Promedio mar–ago 2026');

-- ── Seed: disponibilidad bancaria real al 20/8/2026 (hoja "Efectivo" del mismo Excel) ──
insert into cont_flujo_manual (empresa, tipo, semana, monto, monto_usd, nota) values
  ('super_techos', 'saldo_inicial', null, 2792705.53, 14830.95, 'Saldo bancario real al 20/8/2026 (excluye tarjetas, intercompañía y cajas chicas)'),
  ('prouco',       'saldo_inicial', null,   28168.98,   343.51, 'Saldo bancario real al 20/8/2026 (excluye tarjetas, intercompañía y cajas chicas)');

-- Sin Supabase Auth: RLS deshabilitada como en el resto del schema.
alter table cont_compromisos_fijos disable row level security;
alter table cont_flujo_manual disable row level security;
alter table cont_flujo_entradas disable row level security;

notify pgrst, 'reload schema';
