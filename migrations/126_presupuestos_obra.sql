-- v8.46.0: PRESUPUESTO DE COSTOS POR OBRA (por partida) + versionado.
-- Una fila = una versión del presupuesto de una obra. Solo UNA versión 'aprobado'
-- vigente por proyecto (aprobar supersede la anterior). Partidas y gastos viven
-- en jsonb: son un snapshot editable, independiente de cambios posteriores al
-- sistema o al proyecto (ajustar = nueva versión).
--
-- venta jsonb: { valorCotizacionRd, incluyeItbis, itbisPct, ventaSinItbisRd,
--               monedaOrigen, tasaUsd, fuente: 'cotizacion'|'derivado'|'manual' }
-- partidas jsonb: [{ id, tipo: 'sistema'|'adicional', sistemaId?, productoId?,
--   sistemaVinculadoId?, nombre, m2, unidad,
--   venta: { modo, precioM2Rd, totalRd },
--   costos: [{ id, tipo: 'material'|'mdo_tarea'|'pct_venta'|'monto_fijo',
--              nombre, ... , costoUnidad|precioM2|pct|monto (null = por definir) }] }]
-- gastos jsonb: [{ id, categoria: 'dieta'|'hospedaje'|'transporte'|'materiales_extra'|'otros',
--                  nombre, modo: 'monto'|'por_dia'|'pct_costo', totalRd, dias?, montoDia?, pct? }]
--
-- Aplicar en Supabase: SQL Editor -> New Query -> pegar todo -> Run. Es idempotente.

CREATE TABLE IF NOT EXISTS public.presupuestos_obra (
  id TEXT PRIMARY KEY,                          -- 'ppto_' + Date.now()
  proyecto_id TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','aprobado','superseded')),
  venta JSONB NOT NULL DEFAULT '{}'::jsonb,
  partidas JSONB NOT NULL DEFAULT '[]'::jsonb,
  gastos JSONB NOT NULL DEFAULT '[]'::jsonb,
  notas TEXT,
  creado_por_id TEXT,
  aprobado_por_id TEXT,
  aprobado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.presupuestos_obra DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ppto_obra_proyecto ON public.presupuestos_obra(proyecto_id);
-- Garantía dura: solo un presupuesto aprobado vigente por proyecto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppto_obra_aprobado
  ON public.presupuestos_obra(proyecto_id) WHERE estado = 'aprobado';

NOTIFY pgrst, 'reload schema';
