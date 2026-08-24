-- v8.32.0: Vínculo proyecto ERP ↔ cuenta ANALÍTICA de Odoo + sub-cotizaciones.
-- Convención de nombre (para que el match sea buscable): el nombre de la cuenta
-- analítica en Odoo SIEMPRE comienza con la referencia de la COTIZACIÓN ORIGINAL
-- del proyecto (ej. "ST-C1234 - Grupo Ramos Techo Nave"). Las cotizaciones
-- adicionales del mismo proyecto (ampliaciones, etapas, órdenes de cambio) tienen
-- su propio número (ej. ST-C1300) pero en Odoo se les elige LA MISMA analítica —
-- son SUB-COTIZACIONES del proyecto original.
ALTER TABLE public.proyectos
  ADD COLUMN IF NOT EXISTS analitica_odoo_id INTEGER,
  ADD COLUMN IF NOT EXISTS analitica_odoo_nombre TEXT,
  -- [{ ref: 'ST-C1300', monto: 123456.78, estado: 'sale', detectada_at: '...' }]
  ADD COLUMN IF NOT EXISTS sub_cotizaciones JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
