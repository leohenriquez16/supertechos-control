-- v8.31.0: Timestamps para el bono de Edwin (Comercial / Levantamientos).
-- realizado_at: cuándo se completó el levantamiento en campo.
-- cotizado_at: cuándo pasó a "Cotización Realizada" (o se detectó ENVIADA en Odoo).
-- La confirmación de recepción del cliente (≤24h) se mide con la tarea
-- tipo 'confirmar_recepcion_cotizacion' (created_at → completada_at).
ALTER TABLE surveys.projects
  ADD COLUMN IF NOT EXISTS realizado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cotizado_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
